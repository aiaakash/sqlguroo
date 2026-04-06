/**
 * Check if table_name_embeddings table exists
 * Usage: node api/server/services/Analytics/checkTableExists.js
 */

const { getPool } = require('./vectordbService');

async function main() {
  console.log('Checking if table_name_embeddings exists...\n');
  
  try {
    const pool = getPool();
    
    // Check if table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'table_name_embeddings'
      );
    `);
    
    const exists = result.rows[0].exists;
    console.log(`table_name_embeddings exists: ${exists}`);
    
    if (exists) {
      // Show table structure
      const columnsResult = await pool.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'table_name_embeddings'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nTable structure:');
      columnsResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''}`);
      });
      
      // Show indexes
      const indexResult = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'table_name_embeddings';
      `);
      
      console.log('\nIndexes:');
      indexResult.rows.forEach(row => {
        console.log(`  - ${row.indexname}`);
      });
      
      // Count rows
      const countResult = await pool.query('SELECT COUNT(*) FROM table_name_embeddings;');
      console.log(`\nTotal rows: ${countResult.rows[0].count}`);
      
    } else {
      console.log('\n❌ table_name_embeddings table does NOT exist!');
      console.log('Run: node api/server/services/Analytics/initVectordbSchema.js');
    }
    
    await pool.end();
    process.exit(exists ? 0 : 1);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
