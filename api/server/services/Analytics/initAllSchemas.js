/**
 * Initialize all vectordb schemas (skill_embeddings + table_name_embeddings)
 * Usage: node api/server/services/Analytics/initAllSchemas.js
 */

const { Pool } = require('pg');
const { logger } = require('@librechat/data-schemas');

const config = {
  host: process.env.VECTORDB_HOST || 'vectordb',
  port: parseInt(process.env.VECTORDB_PORT || '5432', 10),
  database: process.env.VECTORDB_DB || 'mydatabase',
  user: process.env.VECTORDB_USER || 'myuser',
  password: process.env.VECTORDB_PASSWORD || 'mypassword',
};

const embeddingDimension = parseInt(process.env.ANALYTICS_EMBEDDING_DIMENSION || '1536', 10);

async function initializeSkillEmbeddings(pool) {
  console.log('\n📋 Initializing skill_embeddings schema...');
  
  // Enable pgvector extension
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('  ✅ pgvector extension enabled');

  // Create skill_embeddings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS skill_embeddings (
      id SERIAL PRIMARY KEY,
      skill_id VARCHAR(255) NOT NULL UNIQUE,
      user_id VARCHAR(255) NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      content TEXT,
      embedding vector(${embeddingDimension}),
      is_active BOOLEAN DEFAULT true,
      embedding_updated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('  ✅ skill_embeddings table created');

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_user_active 
    ON skill_embeddings(user_id, is_active) WHERE is_active = true;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_user_id 
    ON skill_embeddings(user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_embedding_hnsw 
    ON skill_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);
  console.log('  ✅ skill_embeddings indexes created');
}

async function initializeTableNameEmbeddings(pool) {
  console.log('\n📋 Initializing table_name_embeddings schema...');
  
  // Create table_name_embeddings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_name_embeddings (
      id SERIAL PRIMARY KEY,
      connection_id VARCHAR(255) NOT NULL,
      table_name VARCHAR(255) NOT NULL,
      embedding vector(${embeddingDimension}),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_connection_table UNIQUE (connection_id, table_name)
    );
  `);
  console.log('  ✅ table_name_embeddings table created');

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_table_name_embeddings_connection 
    ON table_name_embeddings(connection_id);
  `);
  console.log('  ✅ Connection index created');
  
  // Create HNSW index for fast similarity search (supports up to 16,000 dimensions)
  // HNSW is available in pgvector 0.5.0+ and supports our 1536-dim embeddings
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_table_name_embeddings_hnsw 
      ON table_name_embeddings 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);
    console.log('  ✅ HNSW vector index created');
  } catch (indexError) {
    console.log('  ⚠️  HNSW index creation failed, using brute-force scan');
    console.log(`     Error: ${indexError.message}`);
  }
}

async function verifyTables(pool) {
  console.log('\n🔍 Verifying tables...');
  
  const tables = ['skill_embeddings', 'table_name_embeddings'];
  
  for (const table of tables) {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      );
    `, [table]);
    
    const exists = result.rows[0].exists;
    console.log(`  ${exists ? '✅' : '❌'} ${table}: ${exists ? 'EXISTS' : 'MISSING'}`);
    
    if (exists) {
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${table};`);
      console.log(`      Rows: ${countResult.rows[0].count}`);
    }
  }
}

async function main() {
  console.log('🚀 Initializing all vectordb schemas...');
  console.log(`Connecting to: ${config.host}:${config.port}/${config.database}`);
  
  const pool = new Pool(config);
  
  try {
    // Test connection
    await pool.query('SELECT 1;');
    console.log('✅ Database connection successful\n');
    
    // Initialize schemas
    await initializeSkillEmbeddings(pool);
    await initializeTableNameEmbeddings(pool);
    
    // Verify
    await verifyTables(pool);
    
    console.log('\n✅ All schemas initialized successfully!');
    console.log('\nNext steps:');
    console.log('1. Refresh schema for your connections (via UI or API)');
    console.log('2. Table embeddings will be stored automatically');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
