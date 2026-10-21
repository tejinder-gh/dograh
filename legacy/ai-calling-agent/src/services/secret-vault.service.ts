import crypto from 'crypto';

/**
 * Secret Vault Service
 * Enforces AES-256-GCM encryption for all sensitive provider credentials (API keys, OAuth tokens, Webhook secrets).
 * Supports explicit Key IDs and cryptographic key rotation.
 * Prevents plaintext secrets from ever reaching PostgreSQL or client-facing responses.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

export class SecretVaultConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretVaultConfigurationError';
  }
}

let runtimeMasterKey: Buffer | null = null;
const keyRegistry = new Map<string, Buffer>();

export function setMasterKeyForTesting(key: string | null): void {
  runtimeMasterKey = key
    ? (key.length === 64 ? Buffer.from(key, 'hex') : crypto.createHash('sha256').update(key, 'utf-8').digest())
    : null;
}

export function registerKey(keyRefId: string, rawKey: string | Buffer): void {
  const buf = typeof rawKey === 'string'
    ? (rawKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(rawKey)
        ? Buffer.from(rawKey, 'hex')
        : crypto.createHash('sha256').update(rawKey, 'utf-8').digest())
    : rawKey;
  keyRegistry.set(keyRefId, buf);
}

export function clearKeyRegistry(): void {
  keyRegistry.clear();
  runtimeMasterKey = null;
}

function resolveKey(keyRefId?: string): Buffer {
  if (keyRefId && keyRegistry.has(keyRefId)) {
    return keyRegistry.get(keyRefId)!;
  }

  if (runtimeMasterKey) return runtimeMasterKey;

  const envKey = process.env.ENCRYPTION_MASTER_KEY;
  if (envKey && envKey.trim().length >= 32) {
    runtimeMasterKey = envKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(envKey)
      ? Buffer.from(envKey, 'hex')
      : crypto.createHash('sha256').update(envKey.trim(), 'utf-8').digest();
    return runtimeMasterKey;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new SecretVaultConfigurationError(
      '[FATAL SECURITY] ENCRYPTION_MASTER_KEY is missing or shorter than 32 characters in production. ' +
      'A dedicated high-entropy 256-bit encryption key must be configured in environment variables to protect credentials.'
    );
  }

  // Generate ephemeral 256-bit random key for local process lifecycle (never committed or predictable)
  runtimeMasterKey = crypto.randomBytes(32);
  return runtimeMasterKey;
}

export interface EncryptedSecretPayload {
  cipherText: string;
  keyRef: string;
}

export class SecretVault {
  /**
   * Encrypts plaintext credentials into an authenticated ciphertext string:
   * Format: "aes256gcm:<key_ref>:<hex_iv>:<hex_auth_tag>:<hex_ciphertext>"
   */
  static encrypt(plainText: string, keyRefId: string = 'master-v1'): EncryptedSecretPayload {
    if (!plainText) {
      throw new Error('[SECRET VAULT] Cannot encrypt empty credential payload.');
    }

    const key = resolveKey(keyRefId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const cipherText = `aes256gcm:${keyRefId}:${iv.toString('hex')}:${authTag}:${encrypted}`;

    return {
      cipherText,
      keyRef: keyRefId,
    };
  }

  /**
   * Decrypts an authenticated ciphertext string back into plaintext.
   * Supports both 5-part versioned ciphertexts and legacy 4-part ciphertexts.
   */
  static decrypt(cipherText: string): string {
    if (!cipherText || !cipherText.startsWith('aes256gcm:')) {
      throw new Error('[SECRET VAULT] Invalid ciphertext format or unrecognized cipher algorithm.');
    }

    const parts = cipherText.split(':');
    let keyRefId: string | undefined;
    let ivHex: string;
    let authTagHex: string;
    let encryptedHex: string;

    if (parts.length === 5) {
      // Versioned format: "aes256gcm:<key_ref>:<iv>:<auth_tag>:<ciphertext>"
      [, keyRefId, ivHex, authTagHex, encryptedHex] = parts;
    } else if (parts.length === 4) {
      // Legacy format: "aes256gcm:<iv>:<auth_tag>:<ciphertext>"
      [, ivHex, authTagHex, encryptedHex] = parts;
    } else {
      throw new Error('[SECRET VAULT] Corrupted ciphertext payload structure.');
    }

    const key = resolveKey(keyRefId);
    const iv = Buffer.from(ivHex!, 'hex');
    const authTag = Buffer.from(authTagHex!, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex!, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  /**
   * Cryptographically rotates an existing ciphertext to a new key identifier.
   */
  static rotate(cipherText: string, newKeyRefId: string): EncryptedSecretPayload {
    const plain = SecretVault.decrypt(cipherText);
    return SecretVault.encrypt(plain, newKeyRefId);
  }

  /**
   * Masks a credential for secure UI display and logging.
   * Example: "sk_live_51M..." -> "sk_live_...9f2b" or "••••••••••••1234"
   */
  static maskCredential(credential: string): string {
    if (!credential) return '••••••••';
    const trimmed = credential.trim();
    if (trimmed.length <= 8) {
      return '••••••••';
    }

    const prefix = trimmed.substring(0, Math.min(6, Math.floor(trimmed.length / 4)));
    const suffix = trimmed.substring(trimmed.length - 4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Recursively scrubs any keys matching secret names from an object before logging.
   */
  static sanitizeForLogging(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => SecretVault.sanitizeForLogging(item));
    }

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'api_key',
      'apikey',
      'authorization',
      'auth',
      'credential',
      'private_key',
      'encryptedcredentials',
      'cardnumber',
      'cvv',
    ];

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((s) => lowerKey.includes(s));

      if (isSensitive && typeof value === 'string') {
        sanitized[key] = SecretVault.maskCredential(value);
      } else if (typeof value === 'object') {
        sanitized[key] = SecretVault.sanitizeForLogging(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
