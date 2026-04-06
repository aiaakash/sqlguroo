/**
 * Standalone script to initialize table_name_embeddings schema
 * Usage: node api/server/services/Analytics/initTableNameEmbeddings.js
 */

const { Pool } = require('pg');

async function main() {
  console.log('Initializing table_name_embeddings schema...');
  
  const config = {
    host: process.env.VECTORDB_HOST || 'vectordb',
    port: parseInt(process.env.VECTORDB_PORT || '5432', 10),
    database: process.env.VECTORDB_DB || 'mydatabase',
    user: process.env.VECTORDB_USER || 'myuser',
    password: process.env.VECTORDB_PASSWORD || 'mypassword',
  };
  
  console.log('Connecting to vectordb:', {
    host: config.host,
    port: config.port,
    database: config.database,
  });
  
  const pool = new Pool(config);
  
  try {
    // Test connection
    const testResult = await pool.query('SELECT 1 as test;');
    console.log('✅ Vectordb connection successful');
    
    // Enable pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled');
    
    // Get embedding dimension
    const embeddingDimension = parseInt(
      process.env.ANALYTICS_EMBEDDING_DIMENSION || '1536',
      10,
    );
    console.log(`Using embedding dimension: ${embeddingDimension}`);
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'table_name_embeddings'
      );
    `);
    
    if (tableCheck.rows[0]?.exists) {
      console.log('Table table_name_embeddings already exists');
    } else {
      console.log('Creating table_name_embeddings table...');
    }
    
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
    console.log('✅ table_name_embeddings table created');
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_table_name_embeddings_connection 
      ON table_name_embeddings(connection_id);
    `);
    console.log('✅ Connection index created');
    
    // Create HNSW index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_table_name_embeddings_hnsw 
      ON table_name_embeddings 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);
    console.log('✅ HNSW index created for similarity search');
    
    // Verify table exists
    const verifyResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'table_name_embeddings';
    `);
    
    console.log('\n✅ Table schema verified:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n✅ All done! table_name_embeddings is ready to use.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
