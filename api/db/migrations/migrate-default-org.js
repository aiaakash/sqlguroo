/**
 * Migration: Migrate hardcoded 'default-org' data to real organization
 * 
 * This script:
 * 1. Finds the first admin user
 * 2. Creates an organization if one doesn't exist
 * 3. Updates all resources with organizationId: 'default-org' to the real org ObjectId
 * 4. Links the admin user to the organization
 */

const mongoose = require('mongoose');
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { User, DatabaseConnection, SavedQuery, Chart, Skill, GitHubRepoConnection, Dashboard, Organization, OrganizationMembership } = require('~/db/models');
const connect = require('./config/connect');

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Date.now().toString(36);
  return `${base}-${suffix}`;
}

(async () => {
  await connect();

  console.log('=== Organization Migration Script ===');
  console.log('Migrating hardcoded "default-org" data to real organization...\n');

  const adminUser = await User.findOne({ role: 'ADMIN' }).sort({ createdAt: 1 });
  if (!adminUser) {
    console.log('No admin user found. Nothing to migrate.');
    process.exit(0);
  }
  console.log(`Found admin user: ${adminUser.email} (${adminUser._id})`);

  let org = await Organization.findOne({ createdBy: adminUser._id });
  
  if (!org) {
    console.log('No organization found for admin user. Creating one...');
    
    const orgName = process.env.DEFAULT_ORG_NAME || `${adminUser.name || adminUser.email.split('@')[0]}'s Organization`;
    
    org = new Organization({
      name: orgName,
      slug: generateSlug(orgName),
      inviteCode: generateInviteCode(),
      createdBy: adminUser._id,
    });
    
    await org.save();
    console.log(`Created organization: ${org.name} (${org._id})`);
  } else {
    console.log(`Organization already exists: ${org.name} (${org._id})`);
  }

  const existingMembership = await OrganizationMembership.findOne({ userId: adminUser._id });
  if (!existingMembership) {
    await new OrganizationMembership({
      organizationId: org._id,
      userId: adminUser._id,
      role: 'admin',
      joinedAt: new Date(),
    }).save();
    console.log('Created admin membership for user');
  }

  await User.findByIdAndUpdate(adminUser._id, { $set: { organizationId: org._id } });
  console.log('Linked admin user to organization');

  const resources = [
    { model: DatabaseConnection, name: 'Database Connections' },
    { model: SavedQuery, name: 'Saved Queries' },
    { model: Chart, name: 'Charts' },
    { model: Skill, name: 'Skills' },
    { model: GitHubRepoConnection, name: 'GitHub Repo Connections' },
    { model: Dashboard, name: 'Dashboards' },
  ];

  for (const { model, name } of resources) {
    const result = await model.updateMany(
      { organizationId: 'default-org' },
      { $set: { organizationId: org._id } }
    );
    console.log(`Migrated ${result.modifiedCount} ${name} from 'default-org' to real org`);
  }

  const allAdmins = await User.find({ role: 'ADMIN' });
  for (const admin of allAdmins) {
    if (admin._id.toString() !== adminUser._id.toString()) {
      const adminMembership = await OrganizationMembership.findOne({ userId: admin._id });
      if (!adminMembership) {
        await new OrganizationMembership({
          organizationId: org._id,
          userId: admin._id,
          role: 'admin',
          joinedAt: new Date(),
        }).save();
        await User.findByIdAndUpdate(admin._id, { $set: { organizationId: org._id } });
        console.log(`Added admin ${admin.email} to organization`);
      }
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Organization: ${org.name}`);
  console.log(`Invite Code: ${org.inviteCode}`);
  console.log('Share this code with team members to join the organization.');
  
  process.exit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
