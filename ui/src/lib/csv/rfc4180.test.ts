import { describe, it, expect } from 'vitest';
import { parseRfc4180Csv } from './rfc4180';

describe('RFC 4180 CSV Parser Suite (CRM-03)', () => {
  it('parses standard comma-separated lines', () => {
    const csv = 'name,email,phone\nAlice,alice@example.com,123456\nBob,bob@example.com,789012';
    const parsed = parseRfc4180Csv(csv);
    expect(parsed.headers).toEqual(['name', 'email', 'phone']);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0]).toEqual(['Alice', 'alice@example.com', '123456']);
    expect(parsed.rows[1]).toEqual(['Bob', 'bob@example.com', '789012']);
  });

  it('correctly handles quoted fields with internal commas (CRM-03 core bug)', () => {
    const csv = 'name,company,title\nAlice Smith,"Skill Corner, Inc.","VP, Head of Calling"';
    const parsed = parseRfc4180Csv(csv);
    expect(parsed.headers).toEqual(['name', 'company', 'title']);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0]).toEqual(['Alice Smith', 'Skill Corner, Inc.', 'VP, Head of Calling']);
  });

  it('correctly handles escaped quotes within quoted fields', () => {
    const csv = 'name,notes\nJohn,"Spoke about ""AI Voice Engine"" and pricing"';
    const parsed = parseRfc4180Csv(csv);
    expect(parsed.headers).toEqual(['name', 'notes']);
    expect(parsed.rows[0]).toEqual(['John', 'Spoke about "AI Voice Engine" and pricing']);
  });

  it('handles multi-line quoted fields with embedded newlines', () => {
    const csv = 'name,notes\nSarah,"Line 1 of notes\nLine 2 of notes"';
    const parsed = parseRfc4180Csv(csv);
    expect(parsed.headers).toEqual(['name', 'notes']);
    expect(parsed.rows[0]).toEqual(['Sarah', 'Line 1 of notes\nLine 2 of notes']);
  });

  it('handles CRLF line endings gracefully', () => {
    const csv = 'name,email\r\nAlice,alice@example.com\r\nBob,bob@example.com\r\n';
    const parsed = parseRfc4180Csv(csv);
    expect(parsed.headers).toEqual(['name', 'email']);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0]).toEqual(['Alice', 'alice@example.com']);
  });

  it('returns empty result for blank or empty CSV', () => {
    expect(parseRfc4180Csv('')).toEqual({ headers: [], rows: [] });
    expect(parseRfc4180Csv('   \n\r\n  ')).toEqual({ headers: [], rows: [] });
  });
});
