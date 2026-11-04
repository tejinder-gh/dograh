import { describe, expect, it } from 'bun:test';
import {
  assertSafeDatabaseTarget,
  isProductionDatabaseTarget,
  ProductionDatabaseTargetError,
  UnsafeDatabaseTargetError,
  MigrationInTestEnvironmentError,
} from '../../config/database-guard';

describe('Exhaustive Database Target Rejection & Anti-Bypass Suite', () => {
  const PRODUCTION_TARGETS = [
    // Standard Neon pooled and direct endpoints
    'postgresql://neondb_owner:secret@ep-wispy-truth-b5kkygdq-pooler.c-2.us-east-1.aws.neon.tech/ai_calling_os?sslmode=require',
    'postgresql://ai_calling_owner:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os?sslmode=require',
    'postgresql://business_app_user:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os?sslmode=require',
    // Default branch references
    'postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/br-twilight-base-b51aowww',
    // Case sensitivity evasion attempts
    'POSTGRESQL://USER:PASS@EP-WISPY-TRUTH-B5KKYGDQ-POOLER.C-2.US-EAST-1.AWS.NEON.TECH/AI_CALLING_OS',
    'postgresql://user:pass@ep-Wispy-Truth-b5kkygdq.aws.neon.tech/ai_calling_os',
    // URL-encoded evasion attempts
    'postgresql://user:pass@ep%2Dwispy%2Dtruth%2Db5kkygdq.aws.neon.tech/ai_calling_os',
    'postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/%61%69%5F%63%61%6C%6C%69%6E%67%5F%6F%73',
    // Path or query parameter smuggling attempts
    'postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os?dummy=test',
    'postgresql://test_user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os_test',
    // Bare hostnames
    'ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech',
    'br-twilight-base-b51aowww',
  ];

  describe('isProductionDatabaseTarget Detection', () => {
    for (const target of PRODUCTION_TARGETS) {
      it(`reliably detects production signature in: ${target.slice(0, 50)}...`, () => {
        expect(isProductionDatabaseTarget(target)).toBe(true);
      });
    }
  });

  describe('Strict Rejection in Test Mode (Negative Tests)', () => {
    for (const target of PRODUCTION_TARGETS) {
      it(`strictly denies test connection to: ${target.slice(0, 50)}...`, () => {
        expect(() => assertSafeDatabaseTarget(target, 'test')).toThrow(
          ProductionDatabaseTargetError
        );
      });
    }
  });

  describe('Bypass Immunity: Flag Overrides Rejected for Production', () => {
    it('rejects production target even when ALLOW_ISOLATED_TEST_DB=true is set', () => {
      const prev = process.env.ALLOW_ISOLATED_TEST_DB;
      try {
        process.env.ALLOW_ISOLATED_TEST_DB = 'true';
        const prodWithTestInQuery =
          'postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os?db=test';
        
        expect(() =>
          assertSafeDatabaseTarget(prodWithTestInQuery, 'test')
        ).toThrow(ProductionDatabaseTargetError);
      } finally {
        process.env.ALLOW_ISOLATED_TEST_DB = prev;
      }
    });

    it('rejects production target when test database name is spoofed on production host', () => {
      const prev = process.env.ALLOW_ISOLATED_TEST_DB;
      try {
        process.env.ALLOW_ISOLATED_TEST_DB = 'true';
        const spoofedProdUrl =
          'postgresql://neondb_owner:secret@ep-wispy-truth-b5kkygdq.aws.neon.tech/test_database';

        expect(() => assertSafeDatabaseTarget(spoofedProdUrl, 'test')).toThrow(
          ProductionDatabaseTargetError
        );
      } finally {
        process.env.ALLOW_ISOLATED_TEST_DB = prev;
      }
    });
  });

  describe('Migration Safety Denial', () => {
    it('unconditionally rejects migrations in test environment', () => {
      expect(() =>
        assertSafeDatabaseTarget(
          'postgresql://postgres:postgres@localhost:5432/acuity_test_isolated',
          'migration'
        )
      ).toThrow(MigrationInTestEnvironmentError);
    });

    it('rejects migrations on production target when operator approval flag is missing', () => {
      const prevNodeEnv = process.env.NODE_ENV;
      const prevTest = process.env.TEST;
      const prevBun = process.env.BUN_ENV;
      try {
        delete process.env.NODE_ENV;
        delete process.env.TEST;
        delete process.env.BUN_ENV;

        const prodUrl =
          'postgresql://ai_calling_owner:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os';
        
        expect(() => assertSafeDatabaseTarget(prodUrl, 'migration')).toThrow(
          ProductionDatabaseTargetError
        );
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        process.env.TEST = prevTest;
        process.env.BUN_ENV = prevBun;
      }
    });
  });

  describe('Unapproved Remote & Empty Target Fail-Closed Checks', () => {
    it('rejects unapproved third-party cloud database in test mode', () => {
      const prev = process.env.ALLOW_ISOLATED_TEST_DB;
      delete process.env.ALLOW_ISOLATED_TEST_DB;
      try {
        const remoteUrl = 'postgresql://user:pass@some-random-cloud-rds.amazonaws.com:5432/test_db';
        expect(() => assertSafeDatabaseTarget(remoteUrl, 'test')).toThrow(
          UnsafeDatabaseTargetError
        );
      } finally {
        if (prev !== undefined) process.env.ALLOW_ISOLATED_TEST_DB = prev;
      }
    });

    it('rejects empty target in test mode', () => {
      expect(() => assertSafeDatabaseTarget('', 'test')).toThrow(
        UnsafeDatabaseTargetError
      );
    });
  });

  describe('Legitimate Isolated Targets Allowed', () => {
    it('allows localhost target', () => {
      expect(() =>
        assertSafeDatabaseTarget(
          'postgresql://business_app_user:pass@localhost:5432/acuity_test_isolated',
          'test'
        )
      ).not.toThrow();
    });

    it('allows 127.0.0.1 target', () => {
      expect(() =>
        assertSafeDatabaseTarget(
          'postgresql://business_app_user:pass@127.0.0.1:5432/acuity_test_isolated',
          'test'
        )
      ).not.toThrow();
    });

    it('allows explicit ephemeral branch when ALLOW_ISOLATED_TEST_DB=true and not production', () => {
      const prev = process.env.ALLOW_ISOLATED_TEST_DB;
      try {
        process.env.ALLOW_ISOLATED_TEST_DB = 'true';
        const ephemeralBranchUrl =
          'postgresql://test_user:pass@ep-ephemeral-branch-test-1234.us-east-1.aws.neon.tech/ai_calling_os_test';

        expect(() =>
          assertSafeDatabaseTarget(ephemeralBranchUrl, 'test')
        ).not.toThrow();
      } finally {
        process.env.ALLOW_ISOLATED_TEST_DB = prev;
      }
    });
  });
});
