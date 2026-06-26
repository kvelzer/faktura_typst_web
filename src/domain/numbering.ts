/**
 * Invoice numbering in the format RRRRNNN:
 *   RRRR = year (4 digits), NNN = zero-padded sequence within the year.
 * The counter is held in storage; the user may still overwrite the number.
 */

export interface Counter {
  year: number;
  seq: number; // last used sequence number for `year`
}

export function formatNumber(year: number, seq: number): string {
  return `${year}${String(seq).padStart(3, '0')}`;
}

/**
 * Suggest the next invoice number given the current persisted counter.
 * Resets the sequence when the year rolls over.
 */
export function nextNumber(counter: Counter | null, now = new Date()): { number: string; counter: Counter } {
  const year = now.getFullYear();
  let seq: number;
  if (!counter || counter.year !== year) {
    seq = 1;
  } else {
    seq = counter.seq + 1;
  }
  return { number: formatNumber(year, seq), counter: { year, seq } };
}
