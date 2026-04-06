const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth, checkBan, configMiddleware } = require('~/server/middleware');
const connections = require('./connections');
const chat = require('./chat');
const skills = require('./skills');

const router = express.Router();

// Test endpoint to verify route mounting (before auth middleware)
router.get('/test', (req, res) => {
  res.json({ message: 'Analytics route is working', timestamp: new Date().toISOString() });
});

// Log chat requests (not connection fetches) to analytics routes (before auth)
router.use((req, res, next) => {
  // Only log chat requests, not routine connection fetches
  if (req.path.includes('/chat') && req.method === 'POST') {
    logger.info('[Analytics Router] Chat request received:', {
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
  }
  next();
});

// Apply authentication middleware to all analytics routes
router.use(requireJwtAuth);

// router.use(checkBan);
router.use(configMiddleware);

// Mount sub-routes
router.use('/connections', connections);
router.use('/chat', chat);
router.use('/skills', skills);

module.exports = router;

