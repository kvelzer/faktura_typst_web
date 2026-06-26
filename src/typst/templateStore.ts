import { BUILTIN_TEMPLATE_SOURCE, buildMainContent, compileSvg } from './compile';
import type { Invoice, Supplier } from '../domain/model';

export const BUILTIN_ID = 'builtin';

export interface StoredTemplate {
  id: string;
  name: string;
  source: string;
  createdAt: number;
}

export interface TemplateMeta {
  id: string;
  name: string;
  builtin: boolean;
}

const DB_NAME = 'faktura';
const DB_VERSION = 1;
const STORE = 'templates';
const META_STORE = 'meta';
const ACTIVE_KEY = 'activeTemplateId';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** List all stored (imported) templates, newest first. */
async function listStored(): Promise<StoredTemplate[]> {
  const all = await tx<StoredTemplate[]>(STORE, 'readonly', (s) => s.getAll() as IDBRequest<StoredTemplate[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Templates available in the UI: built-in first, then imported. */
export async function listTemplates(): Promise<TemplateMeta[]> {
  const stored = await listStored();
  return [
    { id: BUILTIN_ID, name: 'Vestavěná šablona', builtin: true },
    ...stored.map((t) => ({ id: t.id, name: t.name, builtin: false })),
  ];
}

export async function getActiveId(): Promise<string> {
  try {
    const id = await tx<string | undefined>(META_STORE, 'readonly', (s) => s.get(ACTIVE_KEY) as IDBRequest<string | undefined>);
    if (!id || id === BUILTIN_ID) return BUILTIN_ID;
    // Ensure it still exists; otherwise fall back to built-in.
    const exists = await tx<StoredTemplate | undefined>(STORE, 'readonly', (s) => s.get(id) as IDBRequest<StoredTemplate | undefined>);
    return exists ? id : BUILTIN_ID;
  } catch {
    return BUILTIN_ID;
  }
}

export async function setActiveId(id: string): Promise<void> {
  await tx(META_STORE, 'readwrite', (s) => s.put(id, ACTIVE_KEY));
}

/** Resolve the source of the active template (built-in fallback). */
export async function getActiveSource(): Promise<string> {
  const id = await getActiveId();
  return getSourceById(id);
}

export async function getSourceById(id: string): Promise<string> {
  if (id === BUILTIN_ID) return BUILTIN_TEMPLATE_SOURCE;
  const t = await tx<StoredTemplate | undefined>(STORE, 'readonly', (s) => s.get(id) as IDBRequest<StoredTemplate | undefined>);
  return t ? t.source : BUILTIN_TEMPLATE_SOURCE;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (id === BUILTIN_ID) return; // built-in cannot be deleted
  await tx(STORE, 'readwrite', (s) => s.delete(id));
  const active = await getActiveId();
  if (active === id) await setActiveId(BUILTIN_ID);
}

/** All stored (imported) templates — full records, for backup export. */
export async function exportTemplates(): Promise<StoredTemplate[]> {
  return listStored();
}

async function existingTemplateIds(): Promise<Set<string>> {
  const ids = await tx<IDBValidKey[]>(STORE, 'readonly', (s) => s.getAllKeys());
  return new Set(ids.map(String));
}

/**
 * Insert templates whose id isn't already present. Returns count added.
 * No re-validation — records come from our own export.
 */
export async function importTemplatesMerge(recs: StoredTemplate[]): Promise<number> {
  const have = await existingTemplateIds();
  let added = 0;
  for (const r of recs) {
    if (!r || typeof r.id !== 'string' || typeof r.source !== 'string' || have.has(r.id)) continue;
    await tx(STORE, 'readwrite', (s) => s.put(r));
    have.add(r.id);
    added++;
  }
  return added;
}

/** Dummy data covering the full contract, used to validate imported templates. */
function dummyInvoice(): Invoice {
  return {
    number: '2026001',
    lang: 'cs',
    currency: 'CZK',
    issueDate: '2026-01-15',
    dueDate: '2026-01-29',
    paymentMethod: 'transfer',
    variableSymbol: '2026001',
    customer: { name: 'Testovací odběratel', address: 'Ulice 1\n100 00 Praha', ico: '12345678', dic: 'CZ12345678' },
    items: [
      { description: 'Příliš žluťoučký kůň úpěl ďábelské ódy', quantity: 2, unit: 'ks', unitPrice: 100 },
    ],
    note: 'Testovací poznámka',
  };
}
function dummySupplier(): Supplier {
  return {
    name: 'Testovací dodavatel',
    address: 'Náměstí 2\n110 00 Praha',
    ico: '87654321',
    dic: '',
    bankAccount: '123456789/0100',
    iban: 'CZ6508000000192000145399',
    swift: 'GIBACZPX',
    registryNote: 'Fyzická osoba zapsaná v živnostenském rejstříku.',
  };
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate a candidate template by compiling it against the data contract with
 * dummy data. Rejects @preview packages (would break offline) up front.
 */
export async function validateTemplate(source: string): Promise<ValidationResult> {
  if (/#import\s+"@preview\//.test(source) || /@preview\//.test(source)) {
    return {
      ok: false,
      error:
        'Šablona používá balíček z @preview (Typst Universe). Ty nejsou podporované (rozbily by offline režim). Použij soběstačnou .typ šablonu držící datový kontrakt.',
    };
  }
  if (!/#let\s+invoice\s*\(/.test(source) && !/#let\s+invoice\b/.test(source)) {
    return {
      ok: false,
      error: 'Šablona nedefinuje funkci `invoice(...)` podle datového kontraktu.',
    };
  }
  try {
    const main = buildMainContent(dummyInvoice(), dummySupplier(), source);
    const svg = await compileSvg(main);
    if (!svg || svg.length < 50) {
      return { ok: false, error: 'Šablona se zkompilovala, ale nevznikl žádný výstup.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) };
  }
}

/**
 * Validate and store a new imported template. On success it becomes active.
 * Returns the new template id, or throws with a human-readable message.
 */
export async function importTemplate(name: string, source: string): Promise<string> {
  const res = await validateTemplate(source);
  if (!res.ok) throw new Error(res.error || 'Neplatná šablona.');
  const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record: StoredTemplate = { id, name, source, createdAt: Date.now() };
  await tx(STORE, 'readwrite', (s) => s.put(record));
  await setActiveId(id);
  return id;
}
