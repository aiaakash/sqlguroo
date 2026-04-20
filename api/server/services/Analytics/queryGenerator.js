const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');
const { formatSchemaForPrompt } = require('./connectionService');
const { findRelevantSkills, formatSkillsForPrompt } = require('./skillMatching');
const { filterSchemaWithRAG, filterSchemaWithLLM } = require('./schemaFilter');
const { querySchemaDocumentation } = require('./schemaDocumentationRAG');
const { initializeSampleDbSchemaDocs, SAMPLE_DB_SYSTEM_USER_ID } = require('./sampleDbService');
const { filterSchemaWithHybridRAG } = require('./tableRAGService');
const { generateEmbedding } = require('./embeddingService');
const { findRelevantGitHubQueries, formatGitHubQueriesForPrompt } = require('./githubQueryRAG');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize xAI client (uses OpenAI-compatible API)
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

// Initialize OpenRouter client (uses OpenAI-compatible API)
const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

/**
 * Base system prompt - common rules for all databases
 */
const BASE_SYSTEM_PROMPT = `You are an expert SQL analyst. Your task is to convert natural language questions into accurate SQL queries.

CRITICAL RULES - NEVER VIOLATE:
1. Output ONLY raw SQL query text - no markdown code blocks, no backticks, no explanations
2. Generate a SINGLE query - no semicolons separating multiple statements
3. Exception: If the query is impossible or dangerous, output a plain text explanation (no SQL)
4. ALWAYS use the correct syntax for the target database - see DATABASE-SPECIFIC SYNTAX section below

OUTPUT FORMAT:
- Return the SQL query as plain text
- No sql wrappers or markdown formatting
- No explanatory text before or after the query
- No comments within the query unless absolutely necessary for clarity
- Exception only: Plain text explanation if query cannot be safely generated

QUERY REQUIREMENTS:
1. Use table and column names EXACTLY as provided in the schema
2. Verify all referenced tables and columns exist in the provided schema
3. Use appropriate JOINs when questions involve multiple tables
4. Always specify JOIN type explicitly (INNER, LEFT, RIGHT, FULL)
5. Include JOIN conditions to prevent cartesian products
6. Use aggregations (COUNT, SUM, AVG, MAX, MIN, etc.) when appropriate
7. Add ORDER BY clauses when results would benefit from sorting
8. Handle NULL values appropriately (IS NULL, IS NOT NULL, COALESCE, etc.)
9. Use meaningful column aliases to make results readable
10. Apply result limiting to prevent excessive rows (see database-specific syntax below)

SAFETY CHECKS - Generate explanation instead of SQL for:
- DROP, TRUNCATE, ALTER statements
- DELETE or UPDATE without WHERE clause
- Queries requesting all data from very large tables without filters
- Questions that cannot be answered with the provided schema
- Ambiguous questions where multiple interpretations are equally valid

CONVERSATION CONTEXT:
You may receive 2-3 recent messages for context. Use conversation history ONLY when:
- The current question explicitly references previous results ("based on that", "from those results", "for the same period")
- The question uses clear pronouns referring to previous data ("those users", "that table")
- It's an obvious refinement ("now group by region", "add a filter for active users")

DO NOT assume context if:
- The question is self-contained and complete
- The connection to previous queries is unclear or ambiguous
- More than 2-3 exchanges have passed since the referenced query

When in doubt, treat the question as standalone.

BEST PRACTICES:
- Prefer explicit joins over implicit (comma-separated) joins
- Use EXISTS instead of IN for large subqueries when checking existence
- Use CTEs (WITH clause) for complex queries to improve readability
- Consider using CASE WHEN for conditional logic
- Use appropriate data type casting when necessary
- Group by all non-aggregated columns in SELECT when using aggregations
- Use HAVING for filtering aggregated results, WHERE for filtering rows before aggregation

ERROR PREVENTION:
- Ensure GROUP BY includes all non-aggregated columns in SELECT
- Check for proper parentheses in complex conditions
- Verify date/time formats match database expectations
- Confirm proper quoting for string literals (single quotes)
- Avoid SQL injection patterns (this shouldn't be an issue with parameterized questions)

FINAL REMINDER:
Generate clean, executable SQL or a clear explanation why you cannot. Nothing else.`;

/**
 * Database-specific syntax instructions
 */
const DB_SPECIFIC_SYNTAX = {
  clickhouse: `DATABASE-SPECIFIC SYNTAX for ClickHouse:

- Functions: toDate(), toDateTime(), formatDateTime(), arrayJoin()
- Case-sensitive identifiers
- Use appropriate table engines considerations
- DO NOT add FORMAT JSON or other format specifiers (handled automatically)
- Date arithmetic: date + INTERVAL 1 DAY
- Result limiting: LIMIT 1000

🚨🚨🚨 ABSOLUTE RULE - WINDOW FUNCTIONS MUST BE ALL LOWERCASE IN CLICKHOUSE 🚨🚨🚨
This is the #1 most common mistake. ClickHouse will REJECT uppercase window functions.
You MUST use lowercase for ALL of these: lag, lead, row_number, rank, dense_rank, first_value, last_value, ntile, cume_dist, percent_rank

EXAMPLE — THIS IS HOW YOUR OUTPUT MUST LOOK:
  SELECT month, lag(transaction_count) OVER (ORDER BY month) AS prev_count
  FROM monthly_data

DO NOT WRITE:
  SELECT month, LAG(transaction_count) OVER (ORDER BY month) AS prev_count
  FROM monthly_data

Even though SQL conventions typically use UPPERCASE for these functions, ClickHouse REQUIRES lowercase.
This applies everywhere: in SELECT, WHERE, CASE expressions, subqueries, CTEs.

METADATA QUERIES for ClickHouse:
- Tables: SELECT name FROM system.tables WHERE database = currentDatabase()
- Columns: SELECT name, type FROM system.columns WHERE database = currentDatabase() AND table = 'table_name'`,

  mysql: `DATABASE-SPECIFIC SYNTAX for MySQL:

- Functions: DATE_FORMAT(), NOW(), CURDATE(), STR_TO_DATE()
- Use backticks for reserved words: \`order\`, \`table\`
- LIMIT offset, count syntax available
- Date arithmetic: DATE_ADD(), DATE_SUB(), INTERVAL
- Result limiting: LIMIT 1000

METADATA QUERIES for MySQL:
- Tables: SHOW TABLES or SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
- Columns: SHOW COLUMNS FROM table_name or SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table_name'`,

  postgresql: `DATABASE-SPECIFIC SYNTAX for PostgreSQL:

- Functions: TO_CHAR(), CURRENT_TIMESTAMP, DATE_TRUNC(), EXTRACT()
- Double quotes for case-sensitive identifiers (otherwise lowercase)
- Interval arithmetic: date + INTERVAL '1 day'
- ARRAY functions: array_agg(), unnest(), ANY()
- Window functions: OVER (PARTITION BY ... ORDER BY ...)
- Generate series: generate_series()
- Advanced: LATERAL joins, CTEs (WITH), DISTINCT ON
- Result limiting: LIMIT 1000

METADATA QUERIES for PostgreSQL:
- Tables: SELECT tablename FROM pg_tables WHERE schemaname = 'public'
- Columns: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table_name'`,

  bigquery: `DATABASE-SPECIFIC SYNTAX for BigQuery:

- Functions: FORMAT_TIMESTAMP(), CURRENT_TIMESTAMP(), DATE_TRUNC(), TIMESTAMP_DIFF()
- Backticks for identifiers: \`project.dataset.table\`
- STRUCT and ARRAY types for nested data
- UNNEST() for flattening arrays
- Standard SQL compliance preferred
- Date arithmetic: DATE_ADD(), DATE_SUB()
- Result limiting: LIMIT 1000

METADATA QUERIES for BigQuery:
- Tables: SELECT table_name FROM \`project.dataset.INFORMATION_SCHEMA.TABLES\`
- Columns: SELECT column_name, data_type FROM \`project.dataset.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = 'table_name'`,

  redshift: `DATABASE-SPECIFIC SYNTAX for Redshift:

- Functions: DATEADD(), DATEDIFF(), GETDATE(), CONVERT_TIMEZONE()
- Double quotes for case-sensitive identifiers
- LISTAGG() for string aggregation
- Window functions with ROWS BETWEEN
- Be mindful of DIST/SORT keys for large tables
- Date arithmetic: DATEADD(), DATEDIFF()
- Result limiting: LIMIT 1000

METADATA QUERIES for Redshift:
- Tables: SELECT tablename FROM pg_tables WHERE schemaname = 'public'
- Columns: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table_name'`,

  snowflake: `DATABASE-SPECIFIC SYNTAX for Snowflake:

- Functions: DATE_TRUNC(), DATEADD(), CURRENT_TIMESTAMP(), TO_DATE()
- Double quotes for case-sensitive identifiers
- VARIANT type for semi-structured data (JSON)
- QUALIFY clause for filtering window function results
- FLATTEN() for nested data
- Date arithmetic: DATEADD(), DATEDIFF()
- Result limiting: LIMIT 1000

METADATA QUERIES for Snowflake:
- Tables: SHOW TABLES or SELECT table_name FROM information_schema.tables WHERE table_schema = 'PUBLIC'
- Columns: SHOW COLUMNS IN table_name or SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'TABLE_NAME'`,

  oracle: `DATABASE-SPECIFIC SYNTAX for Oracle:

- Functions: TO_CHAR(), TO_DATE(), SYSDATE, TRUNC(), NVL()
- Double quotes for case-sensitive identifiers (otherwise UPPERCASE)
- ROWNUM or ROW_NUMBER() OVER() for pagination
- CONNECT BY for hierarchical queries
- LISTAGG() for string aggregation
- Date arithmetic: date + 1 (adds 1 day), or INTERVAL '1' DAY
- Result limiting: FETCH FIRST 1000 ROWS ONLY (12c+) or WHERE ROWNUM <= 1000

METADATA QUERIES for Oracle:
- Tables: SELECT table_name FROM user_tables
- Columns: SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'TABLE_NAME'`,

  mssql: `DATABASE-SPECIFIC SYNTAX for MSSQL (SQL Server):

- Functions: FORMAT(), GETDATE(), DATEDIFF(), DATEADD(), CONVERT()
- Square brackets for special characters: [Order Date], [User]
- TOP n instead of LIMIT: SELECT TOP 100 * FROM table
- STRING_AGG() for string aggregation (2017+)
- Window functions: ROW_NUMBER() OVER (ORDER BY ...)
- Date arithmetic: DATEADD(day, 1, date)
- IIF() for simple conditionals
- Result limiting: TOP 1000

METADATA QUERIES for MSSQL:
- Tables: SELECT name FROM sys.tables
- Columns: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'table_name'`,
};

/**
 * Build system prompt for a specific database type
 * @param {string} databaseType - Type of database (clickhouse, mysql, postgresql, etc.)
 * @returns {string} - Complete system prompt with relevant database instructions
 */
function buildSystemPrompt(databaseType) {
  const dbType = (databaseType || '').toLowerCase();
  const dbSyntax = DB_SPECIFIC_SYNTAX[dbType];

  if (!dbSyntax) {
    // Fallback for unknown database types - include common syntax
    return `${BASE_SYSTEM_PROMPT}

DATABASE-SPECIFIC SYNTAX:
- Use standard SQL syntax
- Result limiting: LIMIT 1000 (or equivalent for your database)
- Use proper quoting for identifiers and string literals`;
  }

  return `${BASE_SYSTEM_PROMPT}

${dbSyntax}`;
}

/**
 * Extract the actual user question from conversation context
 * @param {string} question - Full question text that may include conversation context
 * @returns {string} - Extracted user question
 */
function extractUserQuestion(question) {
  if (!question) {
    return '';
  }

  // If question contains conversation context markers, try to extract the actual question
  // Look for patterns like "User: ..." or the last meaningful user input
  if (question.includes('User:') || question.includes('Assistant:')) {
    // Try to find the last "User:" message (most recent user input)
    const userMatches = question.match(/User:\s*([^\n]+(?:\n(?!User:|Assistant:)[^\n]+)*)/gi);
    if (userMatches && userMatches.length > 0) {
      // Get the last user message (most recent)
      const lastUserMessage = userMatches[userMatches.length - 1];
      // Remove "User:" prefix and clean up
      let cleaned = lastUserMessage.replace(/^User:\s*/i, '').trim();
      // Remove any tool call markers that might be in the message
      cleaned = cleaned
        .replace(/►[^\n]*\n/g, '')
        .replace(/✓[^\n]*\n/g, '')
        .trim();
      if (cleaned.length > 5) {
        return cleaned;
      }
    }
  }

  // If question contains tool call markers (►, ✓, etc.), try to extract text before them
  // These markers indicate the question has been formatted with tool call status
  if (question.includes('►') || question.includes('✓') || question.includes('Assistant:')) {
    // Split by lines and find the first substantial line that's not a tool call
    const lines = question.split('\n');
    const meaningfulLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip tool call status lines and empty lines
      if (
        trimmed.startsWith('►') ||
        trimmed.startsWith('✓') ||
        trimmed.startsWith('Assistant:') ||
        trimmed.startsWith('User:') ||
        trimmed.length === 0 ||
        trimmed.match(/^(Getting|Checking|Using|Generating|Executing|Formatting|Updating)/i)
      ) {
        continue;
      }
      // Collect meaningful lines
      if (trimmed.length > 5) {
        meaningfulLines.push(trimmed);
      }
    }

    // If we found meaningful lines, join them (likely the user's question)
    if (meaningfulLines.length > 0) {
      const extracted = meaningfulLines.join(' ').trim();
      if (extracted.length > 10) {
        return extracted;
      }
    }
  }

  // If question is very long (likely contains tool calls), try to get first meaningful part
  // and remove all tool call markers
  if (question.length > 500) {
    // Remove all tool call markers and status messages
    let cleaned = question
      .replace(/►[^\n]*\n/g, '')
      .replace(/✓[^\n]*\n/g, '')
      .replace(/Assistant:[^\n]*\n/gi, '')
      .replace(/User:[^\n]*\n/gi, '')
      .replace(/(Getting|Checking|Using|Generating|Executing|Formatting|Updating)[^\n]*\n/gi, '')
      .trim();

    // Take first 300 chars of cleaned text
    if (cleaned.length > 10) {
      return cleaned.substring(0, 300).trim();
    }
  }

  // Fallback: return original question (first 500 chars if too long)
  return question.length > 500 ? question.substring(0, 500) : question;
}

/**
 * Build the user prompt with schema and question
 * @param {Object} params
 * @param {string} params.question - User's natural language question
 * @param {Object} params.schema - Database schema
 * @param {string} params.databaseType - Type of database (mysql, clickhouse)
 * @param {string} params.queryMode - Query mode (read_only, read_write)
 * @param {string} [params.skillsContext] - Formatted skills context to inject
 * @param {string} [params.schemaDocContext] - Schema documentation context from RAG API
 * @returns {string} - Formatted user prompt
 */
function buildUserPrompt({
  question,
  schema,
  databaseType,
  queryMode,
  skillsContext,
  schemaDocContext,
  githubQueriesContext,
}) {
  const schemaText = formatSchemaForPrompt(schema);
  const modeText =
    queryMode === 'read_only'
      ? 'IMPORTANT: Only SELECT queries are allowed. Do not generate INSERT, UPDATE, DELETE, DROP, or any data modification queries.'
      : 'Data modification queries (INSERT, UPDATE, DELETE) are allowed if appropriate for the question.';

  // Check if question contains conversation context (indicated by "User:" and "Assistant:" prefixes)
  const hasContext = question.includes('User:') || question.includes('Assistant:');
  const contextSection = hasContext
    ? `\nRecent Conversation Context:\n${question}\n\nCURRENT QUESTION: Please focus on the most recent user message above.`
    : `\nUser Question: ${question}`;

  // Add skills context if available
  const skillsSection = skillsContext ? `\n\n${skillsContext}\n` : '';

  // Add schema documentation context if available
  const schemaDocSection = schemaDocContext ? `\n\n${schemaDocContext}\n` : '';

  // Add GitHub queries context if available
  const githubQueriesSection = githubQueriesContext ? `\n\n${githubQueriesContext}\n` : '';

  // Check if schema was filtered
  const isFiltered = schema?._filtered === true;
  const schemaNote = isFiltered
    ? `\nNote: This schema shows ${schema.tables?.length || 0} tables (of ${schema._originalTableCount || 'unknown'} total) selected as most relevant to your question. Focus on these tables for your query.`
    : '';

  if (skillsContext) {
    console.log('[SQL Generator] Building prompt with skills context:', {
      hasSkillsContext: !!skillsContext,
      skillsContextLength: skillsContext.length,
      skillsContextPreview: skillsContext.substring(0, 300),
      isFilteredSchema: isFiltered,
    });
    logger.debug('[SQL Generator] Adding skills context to prompt', {
      skillsContextLength: skillsContext.length,
    });
  } else {
    console.log('[SQL Generator] Building prompt without skills context');
  }

  if (schemaDocContext) {
    console.log('[SQL Generator] Building prompt with schema documentation context:', {
      hasSchemaDocContext: !!schemaDocContext,
      schemaDocContextLength: schemaDocContext.length,
      schemaDocContextPreview: schemaDocContext.substring(0, 300),
    });
    logger.debug('[SQL Generator] Adding schema documentation context to prompt', {
      schemaDocContextLength: schemaDocContext.length,
    });
  }

  return `Database Type: ${databaseType.toUpperCase()}
Query Mode: ${queryMode}
${modeText}

Database Schema:${schemaNote}
${schemaText}${schemaDocSection}${skillsSection}${githubQueriesSection}${contextSection}

IMPORTANT CONTEXT: The schema above shows a filtered subset of tables and columns 
that are likely relevant to your question based on semantic analysis. This is NOT 
an exhaustive list of all available tables in the database.

INSTRUCTIONS:
- When answering specific data queries: Use ONLY the tables and columns shown above. 
  Do not reference or assume the existence of tables/columns not listed here.

- When answering metadata questions (e.g., "what tables exist?", "show all tables", 
  "list available data"): Use database metadata queries (e.g., INFORMATION_SCHEMA, 
  system catalogs) that query the complete database schema directly. Do NOT limit 
  your response to only the filtered tables shown above. Clearly indicate that 
  you're showing the full database inventory, not just the contextually filtered 
  subset.

- If the filtered schema seems insufficient for the user's question: Inform the 
  user that the current filtered view may not contain all relevant tables, and 
  suggest they rephrase their question to help retrieve additional relevant schema 
  information.

${databaseType.toLowerCase() === 'clickhouse' ? `⚠️ CLICKHOUSE REMINDER: ALL window functions MUST be lowercase: lag(), lead(), row_number(), rank(), dense_rank(). Using UPPERCASE (LAG, LEAD, etc.) WILL FAIL. Write: lag(col) OVER (...), NOT: LAG(col) OVER (...).

` : ''}Please generate a SQL query to answer this question. After the query, provide a brief explanation of what the query does.

IMPORTANT: Your response must be in this exact format:
SQL: YOUR_SQL_QUERY_HERE
EXPLANATION: Brief explanation of what the query does
ERROR: (leave empty if query was generated successfully, otherwise explain why you cannot generate the query)

RULES FOR ERROR FIELD:
- If you successfully generated a SQL query, leave ERROR empty (just "ERROR: ")
- If you CANNOT generate a SQL query (e.g., question is unclear, required tables/columns don't exist in schema, question is ambiguous, or violates safety rules), explain the reason in the ERROR field
- When ERROR is provided, you may still include an EXPLANATION of what you understood from the question

Do not use markdown code blocks. Output the SQL as plain text.`;
}

/**
 * Parse the OpenAI response to extract SQL, explanation, and error
 * @param {string} content - Response content from OpenAI
 * @returns {Object} - { sql, explanation, error }
 */
function parseResponse(content) {
  if (!content) return { sql: null, explanation: '', error: 'Empty response from LLM' };

  const upperContent = content.toUpperCase();

  // 1. Try to find SQL: prefix format (new format with ERROR field)
  const sqlPrefixMatch = content.match(/SQL:\s*([\s\S]*?)(?=\n\s*EXPLANATION:|$)/i);
  if (sqlPrefixMatch) {
    let sql = sqlPrefixMatch[1].trim();
    // Extract explanation after EXPLANATION:
    const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)(?=\n\s*ERROR:|$)/i);
    let explanation = explanationMatch ? explanationMatch[1].trim() : '';
    // Extract error after ERROR:
    const errorMatch = content.match(/ERROR:\s*([\s\S]*?)$/i);
    let error = errorMatch ? errorMatch[1].trim() : '';

    // If error is provided, set sql to null
    if (error && error.length > 0) {
      return { sql: null, explanation: error || explanation, error };
    }

    // Clean up SQL - if it's something like "N/A" or "None", treat as no SQL
    if (sql && ['N/A', 'NONE', 'NULL', 'NOT APPLICABLE', '-'].includes(sql.toUpperCase())) {
      sql = null;
    }

    return { sql, explanation, error: error || null };
  }

  // 2. Try to find SQL in ```sql blocks (backward compatibility)
  let sqlMatch = content.match(/```sql\s*([\s\S]*?)(?:```|$)/i);

  // 3. Try to find SQL in any code block
  if (!sqlMatch) {
    sqlMatch = content.match(/```\s*([\s\S]*?)(?:```|$)/i);
  }

  // 4. Try to extract everything between SELECT and explanation/end
  if (!sqlMatch) {
    const selectIdx = upperContent.indexOf('SELECT');
    if (selectIdx !== -1) {
      // Find where explanation might start
      const explanationIdx = upperContent.indexOf('EXPLANATION:', selectIdx);
      const endIdx = explanationIdx !== -1 ? explanationIdx : content.length;
      const potentialSql = content.substring(selectIdx, endIdx).trim();
      if (potentialSql && potentialSql.length > 10) {
        // Clean up the SQL - remove any trailing newlines or explanation markers
        const cleanedSql = potentialSql.replace(/\n\s*Explanation:.*$/i, '').trim();
        return {
          sql: cleanedSql,
          explanation:
            explanationIdx !== -1
              ? content
                  .substring(explanationIdx)
                  .replace(/^EXPLANATION:/i, '')
                  .trim()
              : '',
        };
      }
    }
  }

  const sql = sqlMatch ? sqlMatch[1].trim() : null;

  // Extract explanation - look for "Explanation:" or text after the code block
  let explanation = '';
  const explanationMatch = content.match(/Explanation:\s*([\s\S]*?)$/i);
  if (explanationMatch) {
    explanation = explanationMatch[1].trim();
  } else if (sqlMatch) {
    // Take everything after the code block as explanation if not explicitly labeled
    const parts = content.split('```');
    if (parts.length >= 3) {
      explanation = parts.slice(2).join(' ').trim();
    }
  }

  return { sql, explanation };
}

/**
 * Validate the generated SQL for safety
 * @param {string} sql - SQL query to validate
 * @param {string} queryMode - Query mode (read_only, read_write)
 * @returns {Object} - { valid, reason }
 */
function validateSql(sql, queryMode) {
  if (!sql) {
    return { valid: false, reason: 'No SQL query generated' };
  }

  const upperSql = sql.toUpperCase().trim();

  // Always block dangerous operations
  const dangerousPatterns = [
    /DROP\s+DATABASE/i,
    /DROP\s+SCHEMA/i,
    /TRUNCATE/i,
    /DELETE\s+FROM\s+\w+\s*;?\s*$/i, // DELETE without WHERE
    /GRANT\s+/i,
    /REVOKE\s+/i,
    /CREATE\s+USER/i,
    /ALTER\s+USER/i,
    /DROP\s+USER/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      return { valid: false, reason: 'Query contains potentially dangerous operation' };
    }
  }

  // In read-only mode, only allow SELECT statements and CTEs (WITH clauses)
  if (queryMode === 'read_only') {
    // Check for data-modifying operations (DML)
    const modifyingStatements = ['INSERT', 'UPDATE', 'DELETE'];
    for (const keyword of modifyingStatements) {
      if (upperSql.startsWith(keyword) || new RegExp(`\\b${keyword}\\s+`).test(sql)) {
        return {
          valid: false,
          reason: `${keyword} statements are not allowed in read-only mode`,
        };
      }
    }

    // Check for DDL operations that change schema
    const ddlPatterns = [
      { pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)/i, name: 'DROP' },
      { pattern: /\bCREATE\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)/i, name: 'CREATE' },
      { pattern: /\bALTER\s+(TABLE|DATABASE|SCHEMA)/i, name: 'ALTER' },
      { pattern: /\bTRUNCATE\s+TABLE/i, name: 'TRUNCATE' },
    ];
    for (const { pattern, name } of ddlPatterns) {
      if (pattern.test(sql)) {
        return {
          valid: false,
          reason: `${name} statements are not allowed in read-only mode`,
        };
      }
    }

    // Allow SELECT, WITH (CTEs), SHOW, DESCRIBE, EXPLAIN
    if (
      !upperSql.startsWith('SELECT') &&
      !upperSql.startsWith('WITH') &&
      !upperSql.startsWith('SHOW') &&
      !upperSql.startsWith('DESCRIBE') &&
      !upperSql.startsWith('EXPLAIN')
    ) {
      return { valid: false, reason: 'Only SELECT queries are allowed in read-only mode' };
    }
  }

  return { valid: true };
}

/**
 * Generate SQL query from natural language using OpenAI
 * @param {Object} params
 * @param {string} params.question - User's natural language question (may include recent conversation context)
 * @param {Object} params.schema - Database schema
 * @param {string} params.databaseType - Type of database (mysql, clickhouse)
 * @param {string} params.queryMode - Query mode (read_only, read_write)
 * @param {string} params.model - OpenAI model to use (defaults to ANALYTICS_OPENAI_MODEL or 'gpt-5-mini')
 * @param {string} [params.userId] - User ID for skills retrieval
 * @param {string} [params.originalQuestion] - Original user question for skill matching (without tool call context)
 * @param {string} [params.connectionId] - Connection ID for schema documentation retrieval
 * @returns {Promise<Object>} - { sql, explanation, tokensUsed }
 */
async function generateSqlQuery({
  question,
  schema,
  databaseType,
  queryMode = 'read_only',
  model,
  userId,
  originalQuestion,
  connectionId,
}) {
  try {
    // Use original question if provided, otherwise extract from conversation context
    const userQuestion = originalQuestion || extractUserQuestion(question);

    // Generate query embedding once for reuse across skill matching, GitHub RAG, and table RAG
    // This avoids making 3 separate embedding API calls for the same text
    let queryEmbedding = null;
    let embeddingGenerated = false;
    if (userId) {
      try {
        console.log('[SQL Generator] Generating single embedding for query reuse');
        queryEmbedding = await generateEmbedding(userQuestion);
        embeddingGenerated = true;
        console.log('[SQL Generator] Query embedding generated:', {
          embeddingLength: queryEmbedding.length,
        });
      } catch (error) {
        console.error('[SQL Generator] Error generating embedding:', error.message);
        // Continue without embedding - functions will generate their own if needed
      }
    }

    // Retrieve relevant skills if userId is provided
    let skillsContext = '';
    let relevantSkills = [];

    if (userId) {
      console.log('[SQL Generator] Starting skills retrieval:', {
        userId: userId?.toString ? userId.toString() : userId,
        originalQuestionLength: question?.length || 0,
        extractedUserQuestion: userQuestion,
        extractedQuestionLength: userQuestion?.length || 0,
        originalQuestionPreview: question?.substring(0, 100) || '',
      });
      logger.info('[SQL Generator] Retrieving relevant skills for user', {
        userId: userId?.toString ? userId.toString() : userId,
        originalQuestionLength: question?.length || 0,
        extractedUserQuestion: userQuestion,
        extractedQuestionLength: userQuestion?.length || 0,
      });

      try {
        // Use extracted user question for skill matching, with configurable threshold
        // Lower threshold (0.4) helps match skills even when exact wording differs
        // This is important because embeddings may not always match perfectly
        const skillThreshold = parseFloat(process.env.ANALYTICS_SKILL_THRESHOLD || '0.4');
        relevantSkills = await findRelevantSkills(
          userId,
          userQuestion,
          3,
          skillThreshold,
          queryEmbedding,
        );

        console.log('[SQL Generator] Skills retrieval completed:', {
          userId: userId?.toString ? userId.toString() : userId,
          totalSkillsFound: relevantSkills.length,
          skills: relevantSkills.map((s) => ({
            skillId: s.skillId,
            title: s.title,
            relevanceScore: s.relevanceScore?.toFixed(3),
          })),
        });

        if (relevantSkills.length > 0) {
          skillsContext = formatSkillsForPrompt(relevantSkills);
          logger.info(
            `[SQL Generator] Found ${relevantSkills.length} relevant skills for user ${userId}`,
            {
              skills: relevantSkills.map((s) => ({
                skillId: s.skillId,
                title: s.title,
                relevanceScore: s.relevanceScore,
              })),
            },
          );

          console.log('[SQL Generator] Skills context formatted:', {
            skillsContextLength: skillsContext.length,
            skillsContextPreview: skillsContext.substring(0, 200),
            skillsCount: relevantSkills.length,
          });
        } else {
          console.log('[SQL Generator] No relevant skills found above threshold');
          logger.debug('[SQL Generator] No relevant skills found above threshold');
        }
      } catch (error) {
        // Log error but don't fail the query generation
        console.error('[SQL Generator] Error retrieving skills:', error.message);
        logger.warn(
          '[SQL Generator] Error retrieving skills, continuing without skills context:',
          error,
        );
      }
    } else {
      console.log('[SQL Generator] No userId provided, skipping skills retrieval');
      logger.debug('[SQL Generator] No userId provided, skipping skills retrieval');
    }

    // Retrieve relevant GitHub queries if userId and connectionId are provided
    // Only searches GitHub repos linked to this specific database connection
    let githubQueriesContext = '';
    let relevantGitHubQueries = [];

    if (userId && connectionId) {
      try {
        const githubThreshold = parseFloat(process.env.ANALYTICS_GITHUB_QUERY_THRESHOLD || '0.3');
        relevantGitHubQueries = await findRelevantGitHubQueries(
          userId,
          userQuestion,
          3,
          githubThreshold,
          queryEmbedding,
          connectionId,
        );

        if (relevantGitHubQueries.length > 0) {
          githubQueriesContext = formatGitHubQueriesForPrompt(relevantGitHubQueries);
          logger.info(
            `[SQL Generator] Found ${relevantGitHubQueries.length} relevant GitHub queries for user ${userId} and connection ${connectionId}`,
            {
              question: userQuestion?.substring(0, 100),
              connectionId,
              queries: relevantGitHubQueries.map((q) => ({
                name: q.name,
                relevanceScore: q.relevanceScore?.toFixed(4),
                path: q.path,
              })),
            },
          );

          console.log('[SQL Generator] GitHub queries context formatted:', {
            githubQueriesContextLength: githubQueriesContext.length,
            githubQueriesCount: relevantGitHubQueries.length,
            firstQueryName: relevantGitHubQueries[0]?.name,
            firstQueryPreview: relevantGitHubQueries[0]?.sqlContent?.substring(0, 100),
          });
        } else {
          console.log('[SQL Generator] No relevant GitHub queries found above threshold');
          console.log('[SQL Generator] Question was:', userQuestion?.substring(0, 100));
        }
      } catch (error) {
        console.error('[SQL Generator] Error retrieving GitHub queries:', error.message);
        logger.warn('[SQL Generator] Error retrieving GitHub queries, continuing:', error);
      }
    } else {
      console.log(
        '[SQL Generator] No userId or connectionId provided, skipping GitHub queries retrieval',
      );
    }

    // Filter schema to only include relevant tables
    // Uses Hybrid RAG (Semantic + LLM) for table selection when enabled
    // Falls back to schema documentation RAG or LLM-based filtering
    let filteredSchema = schema;
    let schemaDocContext = '';
    const tableCount = schema?.tables?.length || 0;
    const maxTables = parseInt(process.env.ANALYTICS_MAX_SCHEMA_TABLES || '15', 10);
    const useHybridRAG = process.env.ANALYTICS_USE_HYBRID_TABLE_RAG === 'true';

    if (tableCount > maxTables && connectionId && userId) {
      console.log('[SQL Generator] Schema has many tables, selecting table filtering method:', {
        totalTables: tableCount,
        maxTables,
        useHybridRAG,
        userQuestion: userQuestion?.substring(0, 100),
        skillsCount: relevantSkills.length,
        connectionId,
        allTables: schema.tables.map((t) => t.name), // Log all available tables
      });

      // Try Hybrid RAG first if enabled
      if (useHybridRAG) {
        try {
          console.log('[SQL Generator] Using Hybrid RAG for table selection (Semantic + LLM)');

          // Reuse pre-generated embedding or generate new one if not available
          let tableRAGEmbedding = queryEmbedding;
          if (!tableRAGEmbedding) {
            console.log(
              '[SQL Generator] Generating embedding for table RAG (was not generated earlier)',
            );
            tableRAGEmbedding = await generateEmbedding(userQuestion);
          } else {
            console.log('[SQL Generator] Reusing pre-generated embedding for table RAG');
          }

          // Use hybrid approach: Semantic search on table names + LLM filtering
          filteredSchema = await filterSchemaWithHybridRAG(
            schema,
            connectionId,
            tableRAGEmbedding,
            userQuestion,
            { maxTables },
          );

          console.log('[SQL Generator] Schema filtered using Hybrid RAG:', {
            originalTables: tableCount,
            filteredTables: filteredSchema?.tables?.length || 0,
            filterMethod: filteredSchema._filterMethod,
            candidateTables: filteredSchema._candidateTables?.length || 0,
            selectedTables: filteredSchema.tables?.map((t) => t.name) || [],
            candidateTableNames: filteredSchema._candidateTables?.map((t) => t.name) || [],
            reduction: `${Math.round((1 - (filteredSchema?.tables?.length || 0) / tableCount) * 100)}%`,
          });
        } catch (hybridError) {
          console.error(
            '[SQL Generator] Hybrid RAG failed, falling back to schema doc RAG:',
            hybridError.message,
          );
          logger.warn(
            '[SQL Generator] Hybrid RAG failed, falling back to schema doc RAG:',
            hybridError,
          );
          // Continue to fallback
        }
      }

      // If hybrid didn't run or failed, try schema documentation RAG
      if (!useHybridRAG || !filteredSchema._filterMethod) {
        try {
          // Use RAG API to both filter tables AND get schema documentation context in one call
          const ragResult = await filterSchemaWithRAG(
            schema,
            userQuestion,
            connectionId,
            userId,
            relevantSkills,
            {
              maxTables,
              k: 20, // Reduced to avoid token limit issues (was 1000)
            },
          );

          filteredSchema = ragResult.filteredSchema;

          // Limit schema documentation context size to avoid token limits
          // Max ~100k tokens = ~400k chars (rough estimate)
          const MAX_CONTEXT_LENGTH = 150000;
          schemaDocContext = ragResult.schemaDocContext || '';
          if (schemaDocContext.length > MAX_CONTEXT_LENGTH) {
            console.log('[SQL Generator] Truncating schema documentation context:', {
              originalLength: schemaDocContext.length,
              maxLength: MAX_CONTEXT_LENGTH,
            });
            schemaDocContext =
              schemaDocContext.substring(0, MAX_CONTEXT_LENGTH) +
              '\n\n[Note: Schema documentation truncated due to length. Focus on the tables listed above.]\n';
          }

          console.log('[SQL Generator] Schema filtered using Schema Doc RAG:', {
            originalTables: tableCount,
            filteredTables: filteredSchema?.tables?.length || 0,
            reduction: `${Math.round((1 - (filteredSchema?.tables?.length || 0) / tableCount) * 100)}%`,
            hasSchemaDocContext: !!schemaDocContext,
            schemaDocContextLength: schemaDocContext.length,
          });

          if (schemaDocContext) {
            console.log('[SQL Generator] ✅ Schema documentation retrieved successfully:', {
              connectionId,
              contextLength: schemaDocContext.length,
              preview: schemaDocContext.substring(0, 300),
              hasContext: true,
            });
            logger.debug('[SQL Generator] Retrieved schema documentation context', {
              contextLength: schemaDocContext.length,
            });
          }
        } catch (filterError) {
          console.error(
            '[SQL Generator] RAG-based schema filter failed, falling back to LLM:',
            filterError.message,
          );
          logger.warn(
            '[SQL Generator] RAG-based schema filter failed, falling back to LLM:',
            filterError,
          );

          // Fallback to LLM-based filtering
          try {
            filteredSchema = await filterSchemaWithLLM(schema, userQuestion, relevantSkills, {
              maxTables,
            });

            console.log('[SQL Generator] Schema filtered using LLM fallback:', {
              originalTables: tableCount,
              filteredTables: filteredSchema?.tables?.length || 0,
              reduction: `${Math.round((1 - (filteredSchema?.tables?.length || 0) / tableCount) * 100)}%`,
            });
          } catch (llmFilterError) {
            console.error(
              '[SQL Generator] LLM schema filter also failed, using full schema:',
              llmFilterError.message,
            );
            logger.warn(
              '[SQL Generator] LLM schema filter also failed, using full schema:',
              llmFilterError,
            );
            filteredSchema = schema;
          }
        }
      }
    } else if (tableCount > maxTables) {
      // Schema is large but missing connectionId/userId - use LLM fallback
      console.log(
        '[SQL Generator] Schema has many tables, using LLM-based filtering (missing connectionId/userId):',
        {
          totalTables: tableCount,
          maxTables,
          hasConnectionId: !!connectionId,
          hasUserId: !!userId,
        },
      );

      try {
        filteredSchema = await filterSchemaWithLLM(schema, userQuestion, relevantSkills, {
          maxTables,
        });

        console.log('[SQL Generator] Schema filtered using LLM:', {
          originalTables: tableCount,
          filteredTables: filteredSchema?.tables?.length || 0,
          reduction: `${Math.round((1 - (filteredSchema?.tables?.length || 0) / tableCount) * 100)}%`,
        });
      } catch (filterError) {
        console.error(
          '[SQL Generator] Schema filter failed, using full schema:',
          filterError.message,
        );
        logger.warn('[SQL Generator] Schema filter failed, using full schema:', filterError);
        filteredSchema = schema;
      }
    } else {
      console.log('[SQL Generator] Schema is small enough, using full schema:', {
        tableCount,
        maxTables,
      });

      // Even for small schemas, try to get schema documentation if available
      if (connectionId && userId) {
        try {
          // Use fixed system user ID for sample DB (shared embeddings), regular userId for personal connections
          const schemaQueryUserId =
            connectionId === 'sample-db' ? SAMPLE_DB_SYSTEM_USER_ID : userId;

          const queryStartTime = Date.now();
          schemaDocContext = await querySchemaDocumentation(
            userQuestion,
            connectionId,
            schemaQueryUserId,
            { k: 5 },
          );
          const queryDuration = Date.now() - queryStartTime;

          // For sample database, try to initialize schema docs if not found
          if (
            (!schemaDocContext || schemaDocContext.length === 0) &&
            connectionId === 'sample-db'
          ) {
            console.log(
              '[SQL Generator] Sample DB schema docs not found, attempting to initialize...',
            );
            try {
              const initialized = await initializeSampleDbSchemaDocs();
              if (initialized) {
                // Retry query after initialization (using fixed system user ID)
                schemaDocContext = await querySchemaDocumentation(
                  userQuestion,
                  connectionId,
                  SAMPLE_DB_SYSTEM_USER_ID,
                  { k: 5 },
                );
                console.log(
                  '[SQL Generator] Sample DB schema docs initialized and queried successfully',
                );
              }
            } catch (initError) {
              logger.warn(
                '[SQL Generator] Failed to initialize sample DB schema docs:',
                initError.message,
              );
            }
          }

          if (schemaDocContext) {
            console.log('[SQL Generator] ✅ Schema documentation retrieved for small schema:', {
              contextLength: schemaDocContext.length,
              durationMs: queryDuration,
            });
          }
        } catch (docError) {
          // Non-blocking, continue without schema docs
          logger.debug('[SQL Generator] Could not retrieve schema documentation:', docError);
        }
      }
    }

    const userPrompt = buildUserPrompt({
      question,
      schema: filteredSchema,
      databaseType,
      queryMode,
      skillsContext,
      schemaDocContext,
      githubQueriesContext,
    });
    const selectedModel = model || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free';

    // Determine which API client to use based on the model
    const isXaiModel = selectedModel.startsWith('grok-');
    const isOpenRouterModel = selectedModel.includes('/');
    const client = isXaiModel ? xai : isOpenRouterModel ? openRouter : openai;
    const providerName = isXaiModel ? 'xAI' : isOpenRouterModel ? 'OpenRouter' : 'OpenAI';

    logger.info(`[SQL Generator] Sending request to ${providerName} with model:`, {
      modelParameter: model || 'NOT PROVIDED',
      envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
      selectedModel: selectedModel, // ⭐ Debug: Log the model that will be used in API call
    });
    // ⭐ Debug: Console log for easier debugging
    console.log(`[SQL Generator] About to call ${providerName} API:`, {
      modelParameter: model || 'NOT PROVIDED',
      envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
      selectedModel: selectedModel,
      databaseType,
    });
    logger.debug(`[SQL Generator] Sending request to ${providerName}...`);

    // Build database-specific system prompt
    const systemPrompt = buildSystemPrompt(databaseType);

    // Prepare request parameters based on provider
    const requestParams = {
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    // Different providers have different parameter requirements
    if (isXaiModel) {
      // xAI models support temperature and other parameters
      requestParams.temperature = 0.7;
      requestParams.max_tokens = 10000;
    } else if (isOpenRouterModel) {
      // OpenRouter models support standard OpenAI parameters
      requestParams.temperature = 0.7;
      requestParams.max_tokens = 10000;
    } else {
      // GPT-5+ models only support default temperature (1), so we don't set it
      requestParams.max_completion_tokens = 10000; // Use max_completion_tokens for GPT-5+ models
    }

    const response = await client.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || 0;

    // Simple console log for model + token usage (log ONLY what the API returns for model)
    console.log(
      `[Analytics LLM] Provider: ${providerName} | Model: ${response.model} | Tokens used - Prompt: ${promptTokens}, Completion: ${completionTokens}, Total: ${totalTokens}`,
    );

    logger.debug('[SQL Generator] OpenAI response received:', {
      contentLength: content.length,
      contentPreview: content.substring(0, 200),
      promptTokens,
      completionTokens,
      totalTokens,
    });

    const { sql, explanation, error } = parseResponse(content);
    logger.debug('[SQL Generator] Parsed response:', {
      hasSql: !!sql,
      sqlPreview: sql?.substring(0, 100),
      hasExplanation: !!explanation,
      hasError: !!error,
    });

    // If LLM provided an error, return it to the user
    if (error) {
      logger.warn(`[SQL Generator] LLM reported error: ${error}`);
      return {
        sql: null,
        explanation: error,
        tokensUsed: totalTokens,
        promptTokens,
        completionTokens,
      };
    }

    // Validate the generated SQL
    const validation = validateSql(sql, queryMode);
    if (!validation.valid) {
      logger.warn(`[SQL Generator] SQL validation failed: ${validation.reason}`);
      logger.warn(`[SQL Generator] Full OpenAI response: ${content}`);
      return {
        sql: null,
        explanation: `Could not generate a valid query: ${validation.reason}. ${explanation}`,
        tokensUsed: totalTokens,
        promptTokens,
        completionTokens,
      };
    }

    logger.debug(`[SQL Generator] Generated SQL for question: "${question.substring(0, 50)}..."`);
    logger.debug(`[SQL Generator] SQL: ${sql}`);

    return {
      sql,
      explanation,
      tokensUsed: totalTokens,
      promptTokens,
      completionTokens,
    };
  } catch (error) {
    logger.error('[SQL Generator] Error generating SQL query:', error);
    throw new Error(`Failed to generate SQL: ${error.message}`);
  }
}

/**
 * Suggest chart type based on the query and column types
 * @param {Array} columns - Column definitions from query results
 * @param {number} rowCount - Number of rows returned
 * @returns {string} - Suggested chart type
 */
function suggestChartType(columns, rowCount) {
  if (!columns || columns.length === 0) {
    return 'table';
  }

  // Single row with single column - number/metric
  if (rowCount === 1 && columns.length === 1) {
    return 'number';
  }

  // Check column types
  const hasNumericColumn = columns.some((col) =>
    /int|float|double|decimal|number|bigint/i.test(col.type),
  );
  const hasDateColumn = columns.some((col) => /date|time|timestamp/i.test(col.type));
  const hasStringColumn = columns.some((col) => /char|text|string|varchar/i.test(col.type));

  // Time series data - line chart
  if (hasDateColumn && hasNumericColumn) {
    return 'line';
  }

  // Categorical with numeric - bar chart
  if (hasStringColumn && hasNumericColumn && rowCount <= 20) {
    return 'bar';
  }

  // Small dataset with one string and one numeric - pie chart
  if (hasStringColumn && hasNumericColumn && rowCount <= 10 && columns.length === 2) {
    return 'pie';
  }

  // Default to table for complex data
  return 'table';
}

module.exports = {
  generateSqlQuery,
  suggestChartType,
  validateSql,
};
