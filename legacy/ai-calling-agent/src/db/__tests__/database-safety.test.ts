import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatabaseTarget,
  DatabaseConfigurationError,
  getDatabaseUrl
} from '../connection';

test('validateDatabaseTarget extracts host and database from valid connection URL', () => {
  const url = 'postgresql://user:pass@ep-cool-river-1234.us-east-2.aws.neon.tech/ai_calling_agent_os?sslmode=require';
  const result = validateDatabaseTarget(url);

  assert.equal(result.host, 'ep-cool-river-1234.us-east-2.aws.neon.tech');
  assert.equal(result.database, 'ai_calling_agent_os');
});

test('validateDatabaseTarget strictly prohibits targeting second-brain, second_brain, or neondb', () => {
  const prohibitedUrls = [
    'postgresql://user:pass@ep-cool-river-1234.us-east-2.aws.neon.tech/second-brain?sslmode=require',
    'postgresql://user:pass@ep-cool-river-1234.us-east-2.aws.neon.tech/second_brain?sslmode=require',
    'postgresql://user:pass@ep-cool-river-1234.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ];

  for (const url of prohibitedUrls) {
    assert.throws(
      () => validateDatabaseTarget(url),
      (err: unknown) => {
        return (
          err instanceof DatabaseConfigurationError &&
          err.message.includes('[DATABASE COLLISION PROHIBITED]')
        );
      }
    );
  }
});

test('validateDatabaseTarget throws actionable error on invalid URL format', () => {
  assert.throws(
    () => validateDatabaseTarget('not-a-valid-url'),
    (err: unknown) => {
      return (
        err instanceof DatabaseConfigurationError &&
        err.message.includes('DATABASE_URL format is invalid')
      );
    }
  );
});

test('getDatabaseUrl throws actionable diagnostic when env var is absent', () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    assert.throws(
      () => getDatabaseUrl(),
      (err: unknown) => {
        return (
          err instanceof DatabaseConfigurationError &&
          err.message.includes('DATABASE_URL is not set') &&
          err.message.includes('AI Calling Agent OS strictly requires a dedicated PostgreSQL / Neon database')
        );
      }
    );
  } finally {
    process.env.DATABASE_URL = original || 'postgresql://test_user:test_pass@ep-isolated.us-east-2.aws.neon.tech/ai_calling_agent_os_test?sslmode=require';
  }
});
