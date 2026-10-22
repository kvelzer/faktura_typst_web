import type { Supplier, Customer, Invoice, NamedRecord } from '../domain/model';
import type { Counter } from '../domain/numbering';

const K_SUPPLIER = 'faktura.supplier.v1';
const K_COUNTER = 'faktura.counter.v1';
const K_DRAFT = 'faktura.draft.v1';
const K_SUPPLIERS = 'faktura.suppliers.v1';
const K_CUSTOMERS = 'faktura.customers.v1';
const K_PRESETS = 'faktura.presets.v1';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const failedKeys = new Set<string>();

function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    failedKeys.delete(key);
  } catch {
    failedKeys.add(key);
    window.dispatchEvent(new CustomEvent('faktura:storage-status', { detail: true }));
    return false;
  }
  window.dispatchEvent(new CustomEvent('faktura:storage-status', { detail: failedKeys.size > 0 }));
  return true;
}

export const loadSupplier = () => readJSON<Supplier>(K_SUPPLIER);
export const saveSupplier = (s: Supplier) => writeJSON(K_SUPPLIER, s);

export const loadCounter = () => readJSON<Counter>(K_COUNTER);
export const saveCounter = (c: Counter) => writeJSON(K_COUNTER, c);

export const loadDraft = () => readJSON<Invoice>(K_DRAFT);
export const saveDraft = (i: Invoice) => writeJSON(K_DRAFT, i);

// --- named profiles (multiple snapshots, layered on top of the working copy) ---
export const loadSuppliers = () => readJSON<NamedRecord<Supplier>[]>(K_SUPPLIERS) ?? [];
export const saveSuppliers = (l: NamedRecord<Supplier>[]) => writeJSON(K_SUPPLIERS, l);

export const loadCustomers = () => readJSON<NamedRecord<Customer>[]>(K_CUSTOMERS) ?? [];
export const saveCustomers = (l: NamedRecord<Customer>[]) => writeJSON(K_CUSTOMERS, l);

export const loadPresets = () => readJSON<NamedRecord<Invoice>[]>(K_PRESETS) ?? [];
export const savePresets = (l: NamedRecord<Invoice>[]) => writeJSON(K_PRESETS, l);

export const profileId = () => `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
