/**
 * Admin Routes - Edition-aware loader
 *
 * In Enterprise mode: full admin panel with subscription/usage management
 * In Community mode: basic admin endpoints (questions, etc.)
 */
const express = require('express');
const { isEnterprise } = require('~/server/config/edition');
const { Message } = require('~/db/models');

const router = express.Router();

// Community-available questions endpoint (always available)
router.get('/questions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 100);
    const search = req.query.search?.trim() || '';
    const userFilter = req.query.user?.trim() || '';
    const endpointFilter = req.query.endpoint?.trim() || '';
    const timeFilter = req.query.time || 'all';
    const sortField = req.query.sort || 'createdAt';
    const sortDir = req.query.dir === 'asc' ? 1 : -1;

    const skip = (page - 1) * pageSize;

    const matchFilter = { isCreatedByUser: true };

    if (search) {
      matchFilter.$or = [
        { text: { $regex: search, $options: 'i' } },
      ];
    }
    if (endpointFilter) {
      matchFilter.endpoint = { $regex: endpointFilter, $options: 'i' };
    }

    // Time filter
    const now = new Date();
    if (timeFilter === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      matchFilter.createdAt = { $gte: startOfDay };
    } else if (timeFilter === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      matchFilter.createdAt = { $gte: startOfWeek };
    } else if (timeFilter === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      matchFilter.createdAt = { $gte: startOfMonth };
    } else if (timeFilter === 'quarter') {
      const startOfQuarter = new Date(now);
      startOfQuarter.setMonth(now.getMonth() - 3);
      matchFilter.createdAt = { $gte: startOfQuarter };
    }

    const sortObj = {};
    const validSortFields = ['createdAt', 'userEmail', 'model', 'endpoint'];
    sortObj[validSortFields.includes(sortField) ? sortField : 'createdAt'] = sortDir;

    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: 'conversations',
          localField: 'conversationId',
          foreignField: 'conversationId',
          as: 'conversation',
        },
      },
      { $unwind: { path: '$conversation', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          userIdObj: {
            $cond: {
              if: { $regexMatch: { input: '$user', regex: /^[0-9a-fA-F]{24}$/ } },
              then: { $toObjectId: '$user' },
              else: null,
            },
          },
          convoModelObj: {
            $cond: {
              if: {
                $and: [
                  { $ifNull: ['$conversation.model', false] },
                  { $regexMatch: { input: '$conversation.model', regex: /^[0-9a-fA-F]{24}$/ } },
                ],
              },
              then: { $toObjectId: '$conversation.model' },
              else: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userIdObj',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'databaseconnections',
          localField: 'convoModelObj',
          foreignField: '_id',
          as: 'dbConnection',
        },
      },
      {
        $project: {
          _id: 1,
          messageId: 1,
          conversationId: 1,
          text: 1,
          sender: 1,
          model: 1,
          endpoint: 1,
          user: 1,
          isCreatedByUser: 1,
          createdAt: 1,
          updatedAt: 1,
          'conversation.title': 1,
          'conversation.model': 1,
          'conversation.endpoint': 1,
          'userInfo.name': 1,
          'userInfo.email': 1,
          dbConnectionName: { $arrayElemAt: ['$dbConnection.name', 0] },
        },
      },
      { $sort: sortObj },
      { $skip: skip },
      { $limit: pageSize },
    ];

    if (userFilter) {
      const insertPos = pipeline.findIndex(s => s.$sort);
      if (insertPos > 0) {
        pipeline.splice(insertPos, 0, {
          $match: {
            $or: [
              { 'userInfo.email': { $regex: userFilter, $options: 'i' } },
              { 'userInfo.name': { $regex: userFilter, $options: 'i' } },
            ],
          },
        });
      }
    }

    const countPipeline = [...pipeline];
    countPipeline.splice(-2, 2);
    countPipeline.push({ $count: 'total' });

    const [questions, countResult] = await Promise.all([
      Message.aggregate(pipeline),
      Message.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    const formatted = questions.map(q => ({
      id: q._id.toString(),
      messageId: q.messageId,
      conversationId: q.conversationId,
      text: q.text?.substring(0, 500) || '',
      sender: q.sender,
      llmModel: q.model || '',
      dbConnection: q.dbConnectionName || q.conversation?.model || '',
      endpoint: q.endpoint || q.conversation?.endpoint || '',
      user: q.user,
      userName: q.userInfo?.name || '',
      userEmail: q.userInfo?.email || '',
      conversationTitle: q.conversation?.title || 'Untitled',
      createdAt: q.createdAt,
    }));

    res.json({
      questions: formatted,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user questions', error: error.message });
  }
});

if (isEnterprise) {
  const enterpriseRouter = require('../../../enterprise/backend/src/routes/admin');
  router.use('/', enterpriseRouter);
} else {
  const communityRouter = require('../../../community/backend/src/routes/admin');
  router.use('/', communityRouter);
}

module.exports = router;
