/**
 * Script to list all chat questions asked by users with timestamps
 * Run with: node config/list-chat-questions.js
 * 
 * Options:
 *   --user=<email>     Filter by specific user email
 *   --limit=<number>   Limit number of results (default: 100)
 *   --days=<number>    Show questions from last N days
 *   --json             Output as JSON
 *   --csv              Output as CSV
 */

const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const mongoose = require('mongoose');
const { User, Message } = require('@librechat/data-schemas').createModels(mongoose);
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
  gray: '\x1b[90m',
};

const args = process.argv.slice(2);
const userFilter = args.find((arg) => arg.startsWith('--user='))?.split('=')[1];
const limitArg = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const daysArg = args.find((arg) => arg.startsWith('--days='))?.split('=')[1];
const jsonOutput = args.includes('--json');
const csvOutput = args.includes('--csv');

const limit = parseInt(limitArg, 10) || 100;
const daysFilter = daysArg ? parseInt(daysArg, 10) : null;

const listChatQuestions = async () => {
  try {
    await connect();

    // Build query for user messages (questions)
    const messageQuery = {
      isCreatedByUser: true,
      text: { $exists: true, $ne: '', $ne: null },
    };

    // Add date filter if specified
    if (daysFilter) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
      messageQuery.createdAt = { $gte: cutoffDate };
    }

    // If user filter specified, find that user first
    let targetUserId = null;
    if (userFilter) {
      const targetUser = await User.findOne({ email: userFilter.toLowerCase() });
      if (!targetUser) {
        console.error(`${colors.red}Error: User with email "${userFilter}" not found${colors.reset}`);
        process.exit(1);
      }
      targetUserId = targetUser._id.toString();
      messageQuery.user = targetUserId;
    }

    // Fetch messages with user details
    const messages = await Message.find(messageQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get unique user IDs from messages
    const userIds = [...new Set(messages.map((m) => m.user))];
    
    // Fetch user details
    const users = await User.find(
      { _id: { $in: userIds } },
      'name email username'
    ).lean();
    
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    // Enrich messages with user details
    const enrichedMessages = messages.map((msg) => {
      const user = userMap.get(msg.user) || {};
      return {
        timestamp: msg.createdAt,
        userEmail: user.email || 'Unknown',
        userName: user.name || user.username || 'Unknown',
        userId: msg.user,
        question: msg.text,
        conversationId: msg.conversationId,
        messageId: msg.messageId,
        endpoint: msg.endpoint || 'N/A',
        model: msg.model || 'N/A',
      };
    });

    if (jsonOutput) {
      console.log(JSON.stringify(enrichedMessages, null, 2));
      process.exit(0);
      return;
    }

    if (csvOutput) {
      console.log('Timestamp,User Email,User Name,Question,Conversation ID,Endpoint,Model');
      enrichedMessages.forEach((m) => {
        const escapedQuestion = m.question.replace(/"/g, '""').replace(/\n/g, ' ');
        console.log(`"${formatDate(m.timestamp)}","${m.userEmail}","${m.userName}","${escapedQuestion}","${m.conversationId}","${m.endpoint}","${m.model}"`);
      });
      process.exit(0);
      return;
    }

    // Terminal output
    console.log('\n' + '='.repeat(100));
    console.log(`${colors.bright}${colors.cyan}                      CHAT QUESTIONS LOG${colors.reset}`);
    console.log('='.repeat(100));

    // Summary
    console.log(`\n${colors.bright}Summary:${colors.reset}`);
    console.log(`  Total Questions: ${colors.cyan}${enrichedMessages.length}${colors.reset}`);
    console.log(`  Unique Users: ${colors.yellow}${userMap.size}${colors.reset}`);
    if (userFilter) {
      console.log(`  Filtered by User: ${colors.green}${userFilter}${colors.reset}`);
    }
    if (daysFilter) {
      console.log(`  Time Range: Last ${colors.green}${daysFilter} days${colors.reset}`);
    }
    console.log(`  Showing: Last ${colors.cyan}${limit}${colors.reset} questions`);

    if (enrichedMessages.length === 0) {
      console.log(`\n${colors.yellow}No questions found matching the criteria.${colors.reset}`);
      process.exit(0);
      return;
    }

    console.log('\n' + '='.repeat(100));
    console.log(`${colors.bright}QUESTIONS (sorted by timestamp - newest first):${colors.reset}`);
    console.log('='.repeat(100));

    enrichedMessages.forEach((msg, index) => {
      printQuestion(msg, index + 1);
    });

    // Statistics by user
    console.log('\n' + '-'.repeat(100));
    console.log(`${colors.bright}Questions by User:${colors.reset}`);
    const userStats = {};
    enrichedMessages.forEach((m) => {
      const key = `${m.userName} (${m.userEmail})`;
      userStats[key] = (userStats[key] || 0) + 1;
    });
    Object.entries(userStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([user, count]) => {
        console.log(`  ${colors.cyan}${count}${colors.reset} questions - ${user}`);
      });

    // Statistics by endpoint
    console.log('\n' + '-'.repeat(100));
    console.log(`${colors.bright}Questions by Endpoint:${colors.reset}`);
    const endpointStats = {};
    enrichedMessages.forEach((m) => {
      const ep = m.endpoint || 'unknown';
      endpointStats[ep] = (endpointStats[ep] || 0) + 1;
    });
    Object.entries(endpointStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ep, count]) => {
        console.log(`  ${colors.cyan}${count}${colors.reset} - ${ep}`);
      });

    console.log('\n' + '='.repeat(100));
    console.log(`${colors.gray}Use --json for JSON output, --csv for CSV export${colors.reset}`);
    console.log(`${colors.gray}Use --limit=N to show more/fewer results${colors.reset}`);
    console.log(`${colors.gray}Use --days=N to filter by recent days${colors.reset}`);
    console.log(`${colors.gray}Use --user=email@example.com to filter by specific user${colors.reset}`);
    console.log('='.repeat(100) + '\n');

    process.exit(0);
  } catch (err) {
    console.error(`${colors.red}Error listing chat questions:${colors.reset}`, err);
    process.exit(1);
  }
};

function printQuestion(msg, index) {
  const questionText = msg.question.length > 80 
    ? msg.question.substring(0, 80) + '...' 
    : msg.question;
  
  console.log(`\n${colors.bright}#${index}${colors.reset} ${colors.gray}${formatDate(msg.timestamp)}${colors.reset}`);
  console.log(`  ${colors.bright}User:${colors.reset}      ${colors.green}${msg.userName}${colors.reset} (${colors.yellow}${msg.userEmail}${colors.reset})`);
  console.log(`  ${colors.bright}Question:${colors.reset}  ${colors.white}${questionText}${colors.reset}`);
  console.log(`  ${colors.bright}Endpoint:${colors.reset}  ${colors.magenta}${msg.endpoint}${colors.reset} ${colors.gray}|${colors.reset} ${colors.bright}Model:${colors.reset} ${colors.cyan}${msg.model}${colors.reset}`);
  console.log(`  ${colors.gray}Conv ID:   ${msg.conversationId}${colors.reset}`);
  console.log('-'.repeat(100));
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

listChatQuestions();
