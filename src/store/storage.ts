import type { Supplier, Invoice } from '../domain/model';
import type { Counter } from '../domain/numbering';

const K_SUPPLIER = 'faktura.supplier.v1';
const K_COUNTER = 'faktura.counter.v1';
const K_DRAFT = 'faktura.draft.v1';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export const loadSupplier = () => readJSON<Supplier>(K_SUPPLIER);
export const saveSupplier = (s: Supplier) => writeJSON(K_SUPPLIER, s);

export const loadCounter = () => readJSON<Counter>(K_COUNTER);
export const saveCounter = (c: Counter) => writeJSON(K_COUNTER, c);

export const loadDraft = () => readJSON<Invoice>(K_DRAFT);
export const saveDraft = (i: Invoice) => writeJSON(K_DRAFT, i);
