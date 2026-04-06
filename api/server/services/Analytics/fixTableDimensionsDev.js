/**
 * Fix table_name_embeddings dimensions - DEVELOPMENT VERSION
 * For use when running backend outside Docker (npm run backend:dev)
 * Usage: node api/server/services/Analytics/fixTableDimensionsDev.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Try to load .env file
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) continue;
      
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove inline comments (anything after #)
        const commentIndex = value.indexOf('#');
        if (commentIndex !== -1) {
          value = value.substring(0, commentIndex).trim();
        }
        
        // Remove surrounding quotes
        value = value.replace(/^["']|["']$/g, '');
        
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    console.log('✅ Loaded .env file\n');
  }
}

// Load .env
loadEnv();

// For development - connect to localhost where Docker exposes PostgreSQL
const config = {
  host: process.env.VECTORDB_HOST || 'localhost',
  port: parseInt(process.env.VECTORDB_PORT || '5432', 10),
  database: process.env.VECTORDB_DB || 'mydatabase',
  user: process.env.VECTORDB_USER || 'myuser',
  password: process.env.VECTORDB_PASSWORD || 'mypassword',
};

async function main() {
  console.log('Fixing table_name_embeddings dimensions (DEV MODE)...\n');
  console.log('Connecting to:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password ? '***' : 'NOT SET',
  });
  
  if (!config.password || config.password === 'mypassword') {
    console.log('\n⚠️  Warning: Using default password. If this fails, check your .env file for VECTORDB_PASSWORD');
  }
  
  const pool = new Pool(config);
  
  try {
    // Test connection
    await pool.query('SELECT 1;');
    console.log('✅ Database connection successful\n');
    
    // Drop existing table
    console.log('Dropping existing table_name_embeddings...');
    await pool.query('DROP TABLE IF EXISTS table_name_embeddings;');
    console.log('  ✅ Table dropped');
    
    // Create table with correct dimensions (1536 for openai/text-embedding-3-small)
    console.log('\nCreating table_name_embeddings with 1536 dimensions...');
    await pool.query(`
      CREATE TABLE table_name_embeddings (
        id SERIAL PRIMARY KEY,
        connection_id VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_connection_table UNIQUE (connection_id, table_name)
      );
    `);
    console.log('  ✅ Table created with 1536 dimensions');
    
    // Create indexes
    await pool.query(`
      CREATE INDEX idx_table_name_embeddings_connection 
      ON table_name_embeddings(connection_id);
    `);
    console.log('  ✅ Connection index created');
    
    // Create HNSW index for fast similarity search (supports up to 16,000 dimensions)
    // HNSW is available in pgvector 0.5.0+ and supports our 1536-dim embeddings
    try {
      await pool.query(`
        CREATE INDEX idx_table_name_embeddings_hnsw 
        ON table_name_embeddings 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);
      console.log('  ✅ HNSW vector index created');
    } catch (indexError) {
      console.log('  ⚠️  HNSW index creation failed (pgvector may be <0.5.0), using brute-force scan');
      console.log(`     Error: ${indexError.message}`);
    }
    
    // Verify
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'table_name_embeddings' AND column_name = 'embedding';
    `);
    
    console.log('\n✅ Table schema:');
    console.log(`  embedding column: ${result.rows[0].data_type}`);
    
    console.log('\n✅ Fix complete! You need to refresh schema for your connections to store embeddings.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('password')) {
      console.error('\n💡 Check your .env file for these variables:');
      console.error('  VECTORDB_USER=your_username');
      console.error('  VECTORDB_PASSWORD=your_password');
      console.error('  VECTORDB_DB=your_database');
    }
    console.error('\nMake sure your Docker containers are running:');
    console.error('  docker-compose up -d vectordb');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
