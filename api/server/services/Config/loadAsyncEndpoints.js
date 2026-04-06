const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { loadServiceKey, isUserProvided } = require('@librechat/api');
const { config } = require('./EndpointService');

async function loadAsyncEndpoints() {
  let serviceKey, googleUserProvides;
  const { googleKey } = config;

  /** Check if GOOGLE_KEY is provided at all(including 'user_provided') */
  const isGoogleKeyProvided = googleKey && googleKey.trim() !== '';

  if (isGoogleKeyProvided) {
    /** If GOOGLE_KEY is provided, check if it's user_provided */
    googleUserProvides = isUserProvided(googleKey);
  } else {
    /** Only attempt to load service key if GOOGLE_KEY is not provided */
    const serviceKeyPath =
      process.env.GOOGLE_SERVICE_KEY_FILE || path.join(__dirname, '../../..', 'data', 'auth.json');

    try {
      serviceKey = await loadServiceKey(serviceKeyPath);
    } catch (error) {
      // File not found is expected if Google service account is not configured
      // Only log as error if it's a different type of error
      const isFileNotFound = error?.code === 'ENOENT';
      if (isFileNotFound) {
        logger.debug('Google service key file not found (optional, only needed for service account auth)');
      } else {
        logger.error('Error loading service key', error);
      }
      serviceKey = null;
    }
  }

  const google = serviceKey || isGoogleKeyProvided ? { userProvide: googleUserProvides } : false;

  return { google };
}

module.exports = loadAsyncEndpoints;
