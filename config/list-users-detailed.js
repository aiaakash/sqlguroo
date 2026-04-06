/**
 * Script to list all users with their roles and key fields
 * Run with: node config/list-users-detailed.js
 * 
 * Options:
 *   --admins-only    Show only admin users
 *   --json           Output as JSON
 */

const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const connect = require('./connect');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

const args = process.argv.slice(2);
const adminsOnly = args.includes('--admins-only');
const jsonOutput = args.includes('--json');

const listUsersDetailed = async () => {
  try {
    await connect();

    // Build query
    const query = adminsOnly ? { role: 'ADMIN' } : {};

    // Fetch users with all relevant fields
    const users = await User.find(
      query,
      'email username name role provider avatar emailVerified twoFactorEnabled termsAccepted plugins favorites createdAt updatedAt'
    ).sort({ createdAt: -1 });

    if (jsonOutput) {
      // Output as JSON for programmatic use
      const usersData = users.map((user) => ({
        id: user._id.toString(),
        email: user.email,
        username: user.username || null,
        name: user.name || null,
        role: user.role || 'USER',
        provider: user.provider || 'local',
        emailVerified: user.emailVerified || false,
        twoFactorEnabled: user.twoFactorEnabled || false,
        termsAccepted: user.termsAccepted || false,
        hasAvatar: !!user.avatar,
        pluginsCount: user.plugins?.length || 0,
        favoritesCount: user.favorites?.length || 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));

      console.log(JSON.stringify(usersData, null, 2));
      process.exit(0);
      return;
    }

    // Separate admins and regular users
    const adminUsers = users.filter((u) => u.role === 'ADMIN');
    const regularUsers = users.filter((u) => u.role !== 'ADMIN');

    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}${colors.cyan}                        USER DIRECTORY${colors.reset}`);
    console.log('='.repeat(80));

    // Summary
    console.log(`\n${colors.bright}Summary:${colors.reset}`);
    console.log(`  Total Users: ${colors.cyan}${users.length}${colors.reset}`);
    console.log(`  Admin Users: ${colors.red}${adminUsers.length}${colors.reset}`);
    console.log(`  Regular Users: ${colors.green}${regularUsers.length}${colors.reset}`);

    // Show admins first with highlight
    if (adminUsers.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log(`${colors.bgRed}${colors.white}${colors.bright}  🔐 ADMIN USERS (${adminUsers.length})  ${colors.reset}`);
      console.log('='.repeat(80));

      adminUsers.forEach((user, index) => {
        printUserDetails(user, index + 1, true);
      });
    }

    // Show regular users
    if (!adminsOnly && regularUsers.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log(`${colors.bgGreen}${colors.white}${colors.bright}  👤 REGULAR USERS (${regularUsers.length})  ${colors.reset}`);
      console.log('='.repeat(80));

      regularUsers.forEach((user, index) => {
        printUserDetails(user, index + 1, false);
      });
    }

    // Provider statistics
    console.log('\n' + '-'.repeat(80));
    console.log(`${colors.bright}Provider Statistics:${colors.reset}`);
    const providerCounts = {};
    users.forEach((user) => {
      const provider = user.provider || 'local';
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    });
    Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([provider, count]) => {
        console.log(`  ${provider}: ${colors.yellow}${count}${colors.reset} users`);
      });

    // Security statistics
    console.log('\n' + '-'.repeat(80));
    console.log(`${colors.bright}Security Statistics:${colors.reset}`);
    const verifiedCount = users.filter((u) => u.emailVerified).length;
    const twoFactorCount = users.filter((u) => u.twoFactorEnabled).length;
    const termsAcceptedCount = users.filter((u) => u.termsAccepted).length;

    console.log(`  Email Verified: ${colors.green}${verifiedCount}${colors.reset} / ${users.length}`);
    console.log(`  2FA Enabled: ${colors.cyan}${twoFactorCount}${colors.reset} / ${users.length}`);
    console.log(`  Terms Accepted: ${colors.yellow}${termsAcceptedCount}${colors.reset} / ${users.length}`);

    console.log('\n' + '='.repeat(80) + '\n');

    process.exit(0);
  } catch (err) {
    console.error('Error listing users:', err);
    process.exit(1);
  }
};

function printUserDetails(user, index, isAdmin) {
  const roleColor = isAdmin ? colors.red : colors.green;
  const roleLabel = user.role || 'USER';

  console.log(`\n${colors.bright}#${index}${colors.reset} ─────────────────────────────────────────────────────────`);
  console.log(`  ${colors.bright}ID:${colors.reset}              ${colors.cyan}${user._id}${colors.reset}`);
  console.log(`  ${colors.bright}Email:${colors.reset}           ${user.email}`);
  console.log(`  ${colors.bright}Username:${colors.reset}        ${user.username || colors.yellow + 'N/A' + colors.reset}`);
  console.log(`  ${colors.bright}Name:${colors.reset}            ${user.name || colors.yellow + 'N/A' + colors.reset}`);
  console.log(`  ${colors.bright}Role:${colors.reset}            ${roleColor}${colors.bright}${roleLabel}${colors.reset}`);
  console.log(`  ${colors.bright}Provider:${colors.reset}        ${user.provider || 'local'}`);
  console.log(`  ${colors.bright}Email Verified:${colors.reset}  ${user.emailVerified ? colors.green + '✓ Yes' : colors.red + '✗ No'}${colors.reset}`);
  console.log(`  ${colors.bright}2FA Enabled:${colors.reset}     ${user.twoFactorEnabled ? colors.green + '✓ Yes' : colors.yellow + '✗ No'}${colors.reset}`);
  console.log(`  ${colors.bright}Terms Accepted:${colors.reset}  ${user.termsAccepted ? colors.green + '✓ Yes' : colors.yellow + '✗ No'}${colors.reset}`);
  console.log(`  ${colors.bright}Has Avatar:${colors.reset}      ${user.avatar ? colors.green + '✓ Yes' : colors.yellow + '✗ No'}${colors.reset}`);
  console.log(`  ${colors.bright}Plugins:${colors.reset}         ${user.plugins?.length || 0}`);
  console.log(`  ${colors.bright}Favorites:${colors.reset}       ${user.favorites?.length || 0}`);
  console.log(`  ${colors.bright}Created:${colors.reset}         ${formatDate(user.createdAt)}`);
  console.log(`  ${colors.bright}Last Updated:${colors.reset}    ${formatDate(user.updatedAt)}`);
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

listUsersDetailed();

