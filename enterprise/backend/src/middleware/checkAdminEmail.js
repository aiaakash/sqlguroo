const { logger } = require('@librechat/data-schemas');

function getAdminEmails() {
  const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
  return adminEmailsEnv
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

function isAdminEmail(email) {
  if (!email) return false;
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email.toLowerCase());
}

function checkAdminEmail(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userEmail = req.user.email;

    if (!isAdminEmail(userEmail)) {
      logger.warn(`[checkAdminEmail] Access denied for user: ${userEmail}`);
      return res.status(403).json({ error: 'Admin access required' });
    }

    logger.debug(`[checkAdminEmail] Admin access granted for: ${userEmail}`);
    next();
  } catch (error) {
    logger.error('[checkAdminEmail] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  checkAdminEmail,
  isAdminEmail,
  getAdminEmails,
};
