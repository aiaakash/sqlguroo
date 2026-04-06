const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');

// Use environment variable for encryption key, or generate a default for development
// Note: If not set, a new key is generated each time which will prevent decryption of existing data
let ENCRYPTION_KEY = process.env.ANALYTICS_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  logger.warn('ANALYTICS_ENCRYPTION_KEY not set. Generating a temporary key. This will prevent decryption of existing data on server restart.');
  ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
} else if (ENCRYPTION_KEY.length !== 64) {
  throw new Error('ANALYTICS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param {string} text - The text to encrypt
 * @returns {string} - Encrypted text in format: iv:authTag:encryptedData (all base64)
 */
function encryptCredentials(text) {
  try {
    if (!text) {
      return text;
    }

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine iv, authTag, and encrypted data
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    logger.error('Error encrypting credentials:', error);
    throw new Error('Failed to encrypt credentials');
  }
}

/**
 * Decrypts sensitive data using AES-256-GCM
 * @param {string} encryptedText - The encrypted text in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted text
 */
function decryptCredentials(encryptedText) {
  try {
    if (!encryptedText) {
      return encryptedText;
    }

    const [ivBase64, authTagBase64, encryptedData] = encryptedText.split(':');

    if (!ivBase64 || !authTagBase64 || !encryptedData) {
      throw new Error('Invalid encrypted data format');
    }

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Error decrypting credentials:', error);
    throw new Error('Failed to decrypt credentials');
  }
}

/**
 * Generates a new encryption key (for setup/rotation)
 * @returns {string} - A new 32-byte hex-encoded key
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
  generateEncryptionKey,
};

