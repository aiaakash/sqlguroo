/**
 * Migration script to drop the old unique index on databaseconnections
 * and let Mongoose recreate it as a partial index (only for active connections)
 * 
 * Run this once: node api/db/migrations/drop-old-connection-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Please define the MONGO_URI environment variable');
  process.exit(1);
}

async function dropOldIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('databaseconnections');

    // Check current indexes
    const indexes = await collection.indexes();
    console.log('\nCurrent indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: unique=${idx.unique}, partial=${JSON.stringify(idx.partialFilterExpression)}`);
    });

    // Find the old index (without partial filter)
    const oldIndex = indexes.find(
      (idx) => idx.name === 'organizationId_1_name_1' && !idx.partialFilterExpression
    );

    // Find the new partial index
    const partialIndex = indexes.find(
      (idx) => idx.name === 'organizationId_1_name_1' && idx.partialFilterExpression
    );

    // Drop old index if it exists
    if (oldIndex) {
      console.log('\nDropping old unique index: organizationId_1_name_1');
      try {
        await collection.dropIndex('organizationId_1_name_1');
        console.log('✅ Old index dropped successfully');
      } catch (error) {
        if (error.code === 27 || error.message.includes('index not found')) {
          console.log('⚠️  Index already dropped or does not exist');
        } else {
          throw error;
        }
      }
    } else {
      console.log('\n✅ Old index not found (already dropped or never existed)');
    }

    // Create new partial index if it doesn't exist
    if (!partialIndex) {
      console.log('\nCreating new partial unique index...');
      try {
        await collection.createIndex(
          { organizationId: 1, name: 1 },
          {
            unique: true,
            partialFilterExpression: { isActive: true },
            name: 'organizationId_1_name_1',
          }
        );
        console.log('✅ Partial index created successfully');
        console.log('   This index only enforces uniqueness for active connections (isActive: true)');
      } catch (error) {
        if (error.code === 85 || error.message.includes('already exists')) {
          console.log('⚠️  Index already exists (may have been created by another process)');
        } else {
          throw error;
        }
      }
    } else {
      console.log('\n✅ Partial index already exists');
      console.log(`   Partial filter: ${JSON.stringify(partialIndex.partialFilterExpression)}`);
    }

    // Verify the final state
    console.log('\nVerifying final index state...');
    const finalIndexes = await collection.indexes();
    const finalPartialIndex = finalIndexes.find(
      (idx) => idx.name === 'organizationId_1_name_1' && idx.partialFilterExpression
    );
    const finalOldIndex = finalIndexes.find(
      (idx) => idx.name === 'organizationId_1_name_1' && !idx.partialFilterExpression
    );
    
    if (finalPartialIndex && !finalOldIndex) {
      console.log('✅ Migration completed successfully!');
      console.log('   You can now create connections with names from deleted connections.');
    } else {
      if (finalOldIndex) {
        console.log('❌ Error: Old index still exists!');
        console.log('   Try dropping it manually: db.databaseconnections.dropIndex("organizationId_1_name_1")');
      }
      if (!finalPartialIndex) {
        console.log('❌ Warning: Partial index not found after migration');
        console.log('   Please check the error messages above and try again.');
      }
    }

    // Check for any active connections with the problematic name (for debugging)
    console.log('\nChecking for active connections...');
    const activeConnections = await collection.find({ isActive: true }).toArray();
    console.log(`Found ${activeConnections.length} active connection(s)`);
    if (activeConnections.length > 0) {
      const namesByOrg = {};
      activeConnections.forEach(conn => {
        if (!namesByOrg[conn.organizationId]) {
          namesByOrg[conn.organizationId] = [];
        }
        namesByOrg[conn.organizationId].push(conn.name);
      });
      console.log('Active connection names by organization:', JSON.stringify(namesByOrg, null, 2));
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

dropOldIndex();

