/**
 * Simple script to initialize vectordb schema
 * Can be run standalone without MongoDB dependencies
 * Usage: node api/server/services/Analytics/initVectordbSchema.js
 */

const vectordbService = require('./vectordbService');
const { initializeTableNameEmbeddingsSchema } = require('./tableRAGService');

async function main() {
  try {
    console.log('Initializing vectordb schema...');
    
    // Check if vectordb is available
    const isAvailable = await vectordbService.checkAvailability();
    if (!isAvailable) {
      console.error('❌ Vectordb is not available. Please check your connection settings.');
      process.exit(1);
    }
    
    console.log('✅ Vectordb connection successful');
    
    // Initialize skill_embeddings schema
    await vectordbService.initializeSchema();
    console.log('✅ Skill embeddings schema initialized');
    
    // Initialize table_name_embeddings schema
    console.log('Initializing table_name_embeddings schema...');
    try {
      await initializeTableNameEmbeddingsSchema();
      console.log('✅ Table name embeddings schema initialized');
    } catch (tableError) {
      console.error('❌ Error initializing table_name_embeddings:', tableError.message);
      throw tableError;
    }
    
    console.log('✅ All schema initialization completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run the full migration to sync existing skills:');
    console.log('   node api/server/services/Analytics/migrateSkillsToVectordb.js');
    console.log('2. Or create/update skills via API - they will sync automatically');
    
    await vectordbService.closePool();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing schema:', error.message);
    console.error(error);
    await vectordbService.closePool();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };

