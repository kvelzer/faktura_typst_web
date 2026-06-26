/**
 * Escape an arbitrary user string so it can be embedded inside a Typst
 * double-quoted string literal. Minimum: backslash and double-quote.
 * We keep newlines as the two-character sequence `\n` so the template can
 * split on it (address is multiline).
 */
export function escapeTypstString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n');
}

/** Quote a string value as a Typst string literal, or `none` when empty/undefined. */
export function typstStringOrNone(value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return 'none';
  return `"${escapeTypstString(value)}"`;
}

/** Quote a string value as a Typst string literal (always a string, empty allowed). */
export function typstString(value: string | undefined | null): string {
  return `"${escapeTypstString(value ?? '')}"`;
}
