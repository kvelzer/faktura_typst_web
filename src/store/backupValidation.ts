import type { BackupFile } from './backup';
import { isISODate } from '../domain/dates';
import { lineTotalCents } from '../domain/money';

type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: RecordValue, required: string[], optional: string[] = []) =>
  required.every((k) => typeof v[k] === 'string') &&
  optional.every((k) => v[k] === undefined || typeof v[k] === 'string');
const optional = (v: RecordValue, key: string, check: (v: unknown) => boolean) =>
  v[key] === undefined || check(v[key]);

function supplier(v: unknown): boolean {
  return object(v) && strings(v, ['name', 'address', 'ico'],
    ['dic', 'email', 'phone', 'bankAccount', 'iban', 'swift', 'registryNote', 'logoDataUrl']);
}
function customer(v: unknown): boolean {
  return object(v) && strings(v, ['name', 'address'], ['ico', 'dic']);
}
function item(v: unknown): boolean {
  if (!object(v) || !strings(v, ['description'], ['unit']) ||
      typeof v.quantity !== 'number' || typeof v.unitPrice !== 'number') return false;
  try { lineTotalCents(v.quantity, v.unitPrice); return true; } catch { return false; }
}
function invoice(v: unknown): boolean {
  if (!object(v) || !strings(v, ['number', 'paymentMethod'], ['variableSymbol', 'bankAccount', 'note']) ||
      (v.lang !== 'cs' && v.lang !== 'en') || (v.currency !== 'CZK' && v.currency !== 'EUR') ||
      !isISODate(v.issueDate) || !isISODate(v.dueDate) || !customer(v.customer) ||
      !Array.isArray(v.items) || v.items.length === 0 || !v.items.every(item)) return false;
  const total = v.items.reduce((sum, it) => sum + lineTotalCents(it.quantity, it.unitPrice), 0);
  return Number.isSafeInteger(total);
}
function counter(v: unknown): boolean {
  // Retain compatibility with the original yearly counter; nextNumber resets it.
  return object(v) && Number.isSafeInteger(v.seq) && Number(v.seq) >= 0 &&
    ((typeof v.dateKey === 'string' && /^\d{6}$/.test(v.dateKey)) ||
      (v.dateKey === undefined && Number.isSafeInteger(v.year)));
}
function profiles(check: (v: unknown) => boolean): (v: unknown) => boolean {
  return (v) => Array.isArray(v) && v.every((r) => object(r) &&
    strings(r, ['id', 'name']) && r.id !== '' && check(r.data));
}

/** Reject the whole file before writing any of its records. */
export function validateBackup(raw: unknown): asserts raw is BackupFile {
  if (!object(raw) || raw.app !== 'faktura-pwa' || raw.type !== 'backup') {
    throw new Error('Neplatný soubor zálohy (chybí hlavička faktura-pwa/backup).');
  }
  if (raw.version !== 1) throw new Error('Nepodporovaná verze zálohy. Podporována je verze 1.');
  const ls = raw.localStorage;
  if (!strings(raw, ['exportedAt', 'activeTemplateId']) || !Number.isFinite(Date.parse(String(raw.exportedAt))) ||
      !object(ls) || !optional(ls, 'supplier', supplier) ||
      !optional(ls, 'counter', counter) || !optional(ls, 'draft', invoice) ||
      !optional(ls, 'suppliers', profiles(supplier)) || !optional(ls, 'customers', profiles(customer)) ||
      !optional(ls, 'presets', profiles(invoice)) || !Array.isArray(raw.templates) ||
      !raw.templates.every((t) => object(t) && strings(t, ['id', 'name', 'source']) &&
        t.id !== '' && t.id !== 'builtin' && typeof t.createdAt === 'number' && Number.isFinite(t.createdAt))) {
    throw new Error('Záloha obsahuje neplatná data. Zkontrolujte profily, data, celá množství a šablony. Nic nebylo importováno.');
  }
  const templateIds = raw.templates.map((t) => t.id);
  if (new Set(templateIds).size !== templateIds.length ||
      (raw.activeTemplateId !== 'builtin' && !templateIds.includes(raw.activeTemplateId))) {
    throw new Error('Záloha obsahuje neplatné odkazy na šablony. Nic nebylo importováno.');
  }
}
