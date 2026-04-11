const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');

// Use environment variable for encryption key, or generate a default for development
// Note: If not set, a new key is generated each time which will prevent decryption of existing data
let ENCRYPTION_KEY = process.env.ANALYTICS_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  logger.warn(
    'ANALYTICS_ENCRYPTION_KEY not set. Generating a temporary key. This will prevent decryption of existing data on server restart.',
  );
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

    logger.debug('[Encryption] Encrypting credentials', {
      textLength: text.length,
      keyLength: ENCRYPTION_KEY?.length,
    });

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine iv, authTag, and encrypted data
    const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    logger.debug('[Encryption] Encryption complete', {
      resultLength: result.length,
      ivLength: iv.toString('base64').length,
      authTagLength: authTag.toString('base64').length,
      encryptedLength: encrypted.length,
    });
    return result;
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

    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      logger.error(
        '[Encryption] Invalid encrypted data format - expected 3 parts separated by colons',
        {
          partsCount: parts.length,
          partsPreview: parts.map((p, i) => (i === 2 ? `${p.substring(0, 20)}...` : p)),
        },
      );
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, encryptedData] = parts;

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
    logger.error('[Encryption] Error decrypting credentials:', {
      error: error.message,
      encryptionKeyLength: ENCRYPTION_KEY?.length,
      keyPrefix: ENCRYPTION_KEY?.substring(0, 8),
    });
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
