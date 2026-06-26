import type { Supplier, Customer, Invoice, NamedRecord } from '../domain/model';
import type { Counter } from '../domain/numbering';
import {
  loadSupplier,
  saveSupplier,
  loadCounter,
  saveCounter,
  loadDraft,
  saveDraft,
  loadSuppliers,
  saveSuppliers,
  loadCustomers,
  saveCustomers,
  loadPresets,
  savePresets,
} from './storage';
import {
  BUILTIN_ID,
  exportTemplates,
  importTemplatesMerge,
  getActiveId,
  setActiveId,
  type StoredTemplate,
} from '../typst/templateStore';

const APP = 'faktura-pwa';
const TYPE = 'backup';
const VERSION = 1;

export interface BackupFile {
  app: typeof APP;
  type: typeof TYPE;
  version: number;
  exportedAt: string;
  localStorage: {
    supplier?: Supplier;
    counter?: Counter;
    draft?: Invoice;
    suppliers?: NamedRecord<Supplier>[];
    customers?: NamedRecord<Customer>[];
    presets?: NamedRecord<Invoice>[];
  };
  templates: StoredTemplate[];
  activeTemplateId: string;
}

export interface ImportSummary {
  suppliers: number;
  customers: number;
  presets: number;
  templates: number;
}

/** Gather all device data into one portable bundle. */
export async function buildBackup(): Promise<BackupFile> {
  const ls: BackupFile['localStorage'] = {};
  const supplier = loadSupplier();
  const counter = loadCounter();
  const draft = loadDraft();
  if (supplier) ls.supplier = supplier;
  if (counter) ls.counter = counter;
  if (draft) ls.draft = draft;
  const suppliers = loadSuppliers();
  const customers = loadCustomers();
  const presets = loadPresets();
  if (suppliers.length) ls.suppliers = suppliers;
  if (customers.length) ls.customers = customers;
  if (presets.length) ls.presets = presets;

  return {
    app: APP,
    type: TYPE,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    localStorage: ls,
    templates: await exportTemplates(),
    activeTemplateId: await getActiveId(),
  };
}

/** Merge incoming NamedRecords into the existing list, skipping ids already present. */
function mergeById<T>(
  load: () => NamedRecord<T>[],
  save: (l: NamedRecord<T>[]) => void,
  incoming: NamedRecord<T>[] | undefined,
): number {
  if (!Array.isArray(incoming) || incoming.length === 0) return 0;
  const list = load();
  const have = new Set(list.map((r) => r.id));
  let added = 0;
  for (const r of incoming) {
    if (!r || typeof r.id !== 'string' || have.has(r.id)) continue;
    list.push(r);
    have.add(r.id);
    added++;
  }
  if (added) save(list);
  return added;
}

/** Validate and merge a backup bundle into the current device (non-destructive). */
export async function applyBackup(raw: unknown): Promise<ImportSummary> {
  const b = raw as Partial<BackupFile>;
  if (!b || typeof b !== 'object' || b.app !== APP || b.type !== TYPE) {
    throw new Error('Neplatný soubor zálohy (chybí hlavička faktura-pwa/backup).');
  }
  const ls = b.localStorage ?? {};

  // Singletons: only fill when the device has none — never clobber working state.
  if (ls.supplier && loadSupplier() === null) saveSupplier(ls.supplier);
  if (ls.counter && loadCounter() === null) saveCounter(ls.counter);
  if (ls.draft && loadDraft() === null) saveDraft(ls.draft);

  const summary: ImportSummary = {
    suppliers: mergeById(loadSuppliers, saveSuppliers, ls.suppliers),
    customers: mergeById(loadCustomers, saveCustomers, ls.customers),
    presets: mergeById(loadPresets, savePresets, ls.presets),
    templates: Array.isArray(b.templates) ? await importTemplatesMerge(b.templates) : 0,
  };

  // Adopt the source's active template only if it now exists and the device is still on builtin.
  if (b.activeTemplateId && b.activeTemplateId !== BUILTIN_ID) {
    const current = await getActiveId();
    if (current === BUILTIN_ID) await setActiveId(b.activeTemplateId);
  }

  return summary;
}
