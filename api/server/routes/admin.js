/**
 * Admin Routes - Edition-aware loader
 *
 * In Enterprise mode: full admin panel with subscription/usage management
 * In Community mode: returns 404 (admin panel is enterprise-only)
 */
const express = require('express');
const { isEnterprise } = require('~/server/config/edition');

let router;

if (isEnterprise) {
  router = require('../../../enterprise/backend/src/routes/admin');
} else {
  // Community mode: admin routes return 404
  router = express.Router();
  router.all('/{*path}', (req, res) => {
    res.status(404).json({ error: 'Admin panel is not available in community edition' });
  });
}

module.exports = router;
