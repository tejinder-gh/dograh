/**
 * RFC 4180 compliant CSV parser for robust lead and contact import.
 * 
 * Handles:
 * - Quoted fields containing commas: "Skill Corner, Inc."
 * - Quoted fields containing newlines
 * - Escaped double quotes: "He said ""Hello"""
 * - Mixed line endings (\r\n and \n)
 * - Trailing empty lines
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseRfc4180Csv(input: string): ParsedCsv {
  if (!input || !input.trim()) {
    return { headers: [], rows: [] };
  }

  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped double quote ("")
        if (i + 1 < len && input[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        // Character inside quotes (including comma, newline, carriage return)
        currentField += char;
        i++;
        continue;
      }
    } else {
      // Outside quotes
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRecord.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        // Check CRLF
        if (i + 1 < len && input[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField.trim());
        currentField = '';
        if (currentRecord.some((f) => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRecord.push(currentField.trim());
        currentField = '';
        if (currentRecord.some((f) => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field/record if present
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some((f) => f.length > 0)) {
      records.push(currentRecord);
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0]!.map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows = records.slice(1);

  return { headers, rows };
}
