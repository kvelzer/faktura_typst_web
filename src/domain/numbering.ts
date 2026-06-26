/**
 * Invoice numbering in the format YYMMDDNNN:
 *   YY = year (2 digits), MM = month, DD = day, NNN = zero-padded sequence within the day.
 * The counter is held in storage; the user may still overwrite the number.
 */

export interface Counter {
  /** Date key in YYMMDD format – sequence resets when day changes */
  dateKey: string;
  seq: number; // last used sequence number for `dateKey`
  /** @deprecated kept so old persisted counters can be loaded without error */
  year?: number;
}

/** Return the YYMMDD string for a given Date. */
function dateKey(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export function formatNumber(key: string, seq: number): string {
  return `${key}${String(seq).padStart(3, '0')}`;
}

/**
 * Suggest the next invoice number given the current persisted counter.
 * Resets the sequence when the day rolls over.
 */
export function nextNumber(counter: Counter | null, now = new Date()): { number: string; counter: Counter } {
  const key = dateKey(now);
  let seq: number;
  if (!counter || counter.dateKey !== key) {
    seq = 1;
  } else {
    seq = counter.seq + 1;
  }
  return { number: formatNumber(key, seq), counter: { dateKey: key, seq } };
}
