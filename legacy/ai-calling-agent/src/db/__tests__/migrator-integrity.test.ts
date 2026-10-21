import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeChecksum,
  MigrationIntegrityError,
  runMigrations,
  ensureMigrationsTable
} from '../migrator';

test('computeChecksum generates deterministic sha256 checksum of content', () => {
  const contentA = 'CREATE TABLE test (id INT);';
  const contentB = 'CREATE TABLE test (id INT);';
  const contentC = 'CREATE TABLE test (id BIGINT);';

  const hashA = computeChecksum(contentA);
  const hashB = computeChecksum(contentB);
  const hashC = computeChecksum(contentC);

  assert.equal(hashA, hashB, 'Identical content must yield identical hash');
  assert.notEqual(hashA, hashC, 'Altered content must yield different hash');
  assert.equal(hashA.length, 64, 'SHA-256 hex string must be 64 characters');
});

test('MigrationIntegrityError has proper inheritance and naming', () => {
  const error = new MigrationIntegrityError('Checksum mismatch detected');
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'MigrationIntegrityError');
  assert.match(error.message, /Checksum mismatch/);
});
