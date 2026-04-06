/**
 * Script to drop the legacy chartId_1 index from the charts collection
 * Run with: node config/drop-chart-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function dropIndex() {
  try {
    const mongoUrl = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(mongoUrl, {
      bufferCommands: false,
    });
    
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('charts');
    
    // List existing indexes
    const indexes = await collection.indexes();
    console.log('Current indexes on charts collection:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    // Check if chartId_1 index exists
    const hasChartIdIndex = indexes.some(idx => idx.name === 'chartId_1');
    
    if (hasChartIdIndex) {
      console.log('\nDropping chartId_1 index...');
      await collection.dropIndex('chartId_1');
      console.log('✅ Successfully dropped chartId_1 index');
    } else {
      console.log('\n✅ chartId_1 index does not exist (already removed or never created)');
    }
    
    // Show updated indexes
    const updatedIndexes = await collection.indexes();
    console.log('\nUpdated indexes:');
    updatedIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

dropIndex();

