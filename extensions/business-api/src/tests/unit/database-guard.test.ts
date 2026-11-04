import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  assertSafeDatabaseTarget,
  isProductionDatabaseTarget,
  isLocalSafeTarget,
  ProductionDatabaseTargetError,
  UnsafeDatabaseTargetError,
  MigrationInTestEnvironmentError,
} from '../../config/database-guard';

describe('Unit: Database Target Safety Guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.ALLOW_ISOLATED_TEST_DB;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_ISOLATED_TEST_DB;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllow !== undefined) {
      process.env.ALLOW_ISOLATED_TEST_DB = originalAllow;
    } else {
      delete process.env.ALLOW_ISOLATED_TEST_DB;
    }
  });

  it('correctly identifies production Neon endpoint and branch', () => {
    expect(isProductionDatabaseTarget('postgresql://user:pass@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os')).toBe(true);
    expect(isProductionDatabaseTarget('postgresql://user:pass@some-host/ai_calling_os?branch=br-twilight-base-b51aowww')).toBe(true);
    expect(isProductionDatabaseTarget('postgresql://ai_calling_owner:pass@some-host/ai_calling_os')).toBe(true);
    expect(isProductionDatabaseTarget('postgresql://postgres:postgres@localhost:5432/test_db')).toBe(false);
  });

  it('correctly identifies local safe hosts', () => {
    expect(isLocalSafeTarget('postgresql://postgres:postgres@localhost:5432/test_db')).toBe(true);
    expect(isLocalSafeTarget('postgresql://postgres:postgres@127.0.0.1:5432/test_db')).toBe(true);
    expect(isLocalSafeTarget('postgresql://postgres:postgres@postgres:5432/test_db')).toBe(true);
    expect(isLocalSafeTarget('postgresql://user:pass@remote-cloud.com/test_db')).toBe(false);
  });

  it('throws ProductionDatabaseTargetError when test targets Neon production endpoint', () => {
    const prodUrl = 'postgresql://ai_calling_owner:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os?sslmode=require';
    expect(() => {
      assertSafeDatabaseTarget(prodUrl, 'test');
    }).toThrow(ProductionDatabaseTargetError);
  });

  it('throws UnsafeDatabaseTargetError when test targets unapproved remote host without explicit approval', () => {
    const remoteUrl = 'postgresql://test_user:secret@ep-random-remote.c-7.us-east-2.aws.neon.tech/test_db?sslmode=require';
    expect(() => {
      assertSafeDatabaseTarget(remoteUrl, 'test');
    }).toThrow(UnsafeDatabaseTargetError);
  });

  it('permits authorized isolated test branch when ALLOW_ISOLATED_TEST_DB=true and target includes test', () => {
    process.env.ALLOW_ISOLATED_TEST_DB = 'true';
    const isolatedTestUrl = 'postgresql://test_user:secret@ep-isolated-test-branch.c-7.us-east-2.aws.neon.tech/test_db';
    expect(() => {
      assertSafeDatabaseTarget(isolatedTestUrl, 'test');
    }).not.toThrow();
  });

  it('permits localhost test database during tests', () => {
    const localUrl = 'postgresql://postgres:postgres@localhost:5432/test_db';
    expect(() => {
      assertSafeDatabaseTarget(localUrl, 'test');
    }).not.toThrow();
  });

  it('throws MigrationInTestEnvironmentError when context is migration in test environment', () => {
    expect(() => {
      assertSafeDatabaseTarget('postgresql://postgres:postgres@localhost:5432/test_db', 'migration');
    }).toThrow(MigrationInTestEnvironmentError);
  });
});
