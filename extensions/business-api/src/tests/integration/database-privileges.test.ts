import { describe, it, expect, beforeAll } from 'bun:test';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { runMigrations } from '../../config/migrator';

describe('Database Least-Privilege & Migration Safety Verification (P1-4)', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  describe('1. Role Privilege & Isolation Verification', () => {
    it('verifies business_app_user is not a superuser and cannot create roles or databases', async () => {
      const res = await adminQuery<{
        rolsuper: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
      }>(`
        SELECT rolsuper, rolcreaterole, rolcreatedb
        FROM pg_roles
        WHERE rolname = 'business_app_user';
      `);

      expect(res.rows.length).toBe(1);
      const role = res.rows[0]!;
      expect(role.rolsuper).toBe(false);
      expect(role.rolcreaterole).toBe(false);
      expect(role.rolcreatedb).toBe(false);
    });

    it('verifies business_app_user has NO CREATE privilege on public or business_ext schemas', async () => {
      const res = await adminQuery<{
        nspname: string;
        has_create: boolean;
        has_usage: boolean;
      }>(`
        SELECT nspname,
               has_schema_privilege('business_app_user', nspname, 'CREATE') AS has_create,
               has_schema_privilege('business_app_user', nspname, 'USAGE') AS has_usage
        FROM pg_namespace
        WHERE nspname IN ('public', 'business_ext')
        ORDER BY nspname;
      `);

      const publicSchema = res.rows.find((r) => r.nspname === 'public');
      const businessExtSchema = res.rows.find((r) => r.nspname === 'business_ext');

      expect(publicSchema?.has_create).toBe(false);
      expect(businessExtSchema?.has_create).toBe(false);
      expect(businessExtSchema?.has_usage).toBe(true);
    });

    it('verifies business_app_user has strictly SELECT only on Acuity public tables', async () => {
      const coreTables = ['organizations', 'workflows', 'workflow_definitions', 'workflow_runs', 'users', 'organization_users'];

      for (const table of coreTables) {
        const privRes = await adminQuery<{
          has_select: boolean;
          has_insert: boolean;
          has_update: boolean;
          has_delete: boolean;
          has_truncate: boolean;
        }>(`
          SELECT
            has_table_privilege('business_app_user', 'public.' || $1, 'SELECT') AS has_select,
            has_table_privilege('business_app_user', 'public.' || $1, 'INSERT') AS has_insert,
            has_table_privilege('business_app_user', 'public.' || $1, 'UPDATE') AS has_update,
            has_table_privilege('business_app_user', 'public.' || $1, 'DELETE') AS has_delete,
            has_table_privilege('business_app_user', 'public.' || $1, 'TRUNCATE') AS has_truncate;
        `, [table]);

        const priv = privRes.rows[0]!;
        expect(priv.has_select).toBe(true);
        expect(priv.has_insert).toBe(false);
        expect(priv.has_update).toBe(false);
        expect(priv.has_delete).toBe(false);
        expect(priv.has_truncate).toBe(false);
      }
    });

    it('verifies 0 rows of non-SELECT grants on public schema exist in information_schema', async () => {
      const res = await adminQuery<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM information_schema.role_table_grants
        WHERE grantee = 'business_app_user'
          AND table_schema = 'public'
          AND privilege_type != 'SELECT';
      `);

      expect(parseInt(res.rows[0]!.count, 10)).toBe(0);
    });
  });

  describe('2. Runtime Mutation Denial (Enforced 42501 Errors)', () => {
    it('rejects INSERT into public.workflows from runtime app user with 42501 permission denied', async () => {
      let threw = false;
      let errorCode = '';

      try {
        await query(`
          INSERT INTO public.workflows (
            organization_id, name, workflow_definition, template_context_variables,
            call_disposition_codes, workflow_configurations, workflow_uuid
          ) VALUES (
            999, 'Unauthorized Workflow', '{}', '{}',
            '[]', '{}', gen_random_uuid()::text
          );
        `);
      } catch (err: any) {
        threw = true;
        errorCode = err.code;
      }

      expect(threw).toBe(true);
      expect(errorCode).toBe('42501'); // PostgreSQL insufficient_privilege
    });

    it('rejects UPDATE on public.organizations from runtime app user with 42501 permission denied', async () => {
      let threw = false;
      let errorCode = '';

      try {
        await query(`UPDATE public.organizations SET provider_id = 'hacked' WHERE id = 1;`);
      } catch (err: any) {
        threw = true;
        errorCode = err.code;
      }

      expect(threw).toBe(true);
      expect(errorCode).toBe('42501');
    });

    it('rejects DELETE on public.users from runtime app user with 42501 permission denied', async () => {
      let threw = false;
      let errorCode = '';

      try {
        await query(`DELETE FROM public.users WHERE id = 1;`);
      } catch (err: any) {
        threw = true;
        errorCode = err.code;
      }

      expect(threw).toBe(true);
      expect(errorCode).toBe('42501');
    });
  });

  describe('3. Transactional Migrations & Concurrency Safety', () => {
    it('rolls back atomically and does not record migration ID if a statement fails', async () => {
      const testMigrationId = '999_failing_migration_test';

      // Ensure test migration record is clean
      await adminQuery('DELETE FROM business_ext.schema_migrations WHERE id = $1', [testMigrationId]);

      // Execute a transactional migration simulation that fails midway
      let threw = false;
      try {
        await adminQuery(`
          BEGIN;
          CREATE TABLE business_ext.__test_rollback_table (id INT PRIMARY KEY);
          -- This deliberate invalid statement causes an ERROR
          INSERT INTO business_ext.__test_rollback_table (id) VALUES ('NOT_AN_INTEGER');
          INSERT INTO business_ext.schema_migrations (id) VALUES ('${testMigrationId}');
          COMMIT;
        `);
      } catch {
        threw = true;
        try {
          await adminQuery('ROLLBACK');
        } catch {
          // ignore
        }
      }

      expect(threw).toBe(true);

      // Verify that neither the table nor the migration record were committed
      const checkTable = await adminQuery(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'business_ext'
            AND table_name = '__test_rollback_table'
        ) AS exists;
      `);
      expect(checkTable.rows[0]!.exists).toBe(false);

      const checkRecord = await adminQuery(
        'SELECT id FROM business_ext.schema_migrations WHERE id = $1',
        [testMigrationId]
      );
      expect(checkRecord.rows.length).toBe(0);
    });

    it('two concurrent migration executions do not race or conflict', async () => {
      // Run two migration runs concurrently
      const [res1, res2] = await Promise.allSettled([
        runMigrations(),
        runMigrations(),
      ]);

      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('fulfilled');

      const countRes = await adminQuery(
        "SELECT COUNT(*) as count FROM business_ext.schema_migrations WHERE id = '001_business_ext_init'"
      );
      expect(parseInt(countRes.rows[0]!.count, 10)).toBe(1);
    });
  });
});
