import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

// Use the app's existing TypeScript loader; no extra test framework is needed.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: 'custom',
});
after(() => server.close());
const { todayISO, parseInputDate } = await server.ssrLoadModule('/src/domain/dates.ts');
const { moneyInCents, lineTotalCents } = await server.ssrLoadModule('/src/domain/money.ts');
const { validateBackup } = await server.ssrLoadModule('/src/store/backupValidation.ts');

function backup() {
  return {
    app: 'faktura-pwa', type: 'backup', version: 1,
    exportedAt: '2026-10-22T00:00:00Z', activeTemplateId: 'builtin', templates: [],
    localStorage: {
      supplier: { name: 'Dodavatel', address: 'Praha', ico: '12345678' },
      counter: { dateKey: '261022', seq: 50 },
      draft: {
        number: '261022050', lang: 'cs', currency: 'CZK',
        issueDate: '2026-10-22', dueDate: '2026-11-05', paymentMethod: 'Převodem',
        customer: { name: 'Odběratel', address: 'Brno' },
        items: [{ description: 'Práce', quantity: 2, unitPrice: 10.5 }],
      },
    },
  };
}

test('day-first dates reject impossible calendar dates and accept leap days', () => {
  assert.equal(parseInputDate('29/02/2028'), '2028-02-29');
  for (const value of ['29/02/2027', '31/04/2028', '12/31/2028', '2028-01-01', '', '01/01/0000']) {
    assert.equal(parseInputDate(value), null, value);
  }
});

test('today follows the local calendar near midnight, in both directions from UTC', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Prague';
    assert.equal(todayISO(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(todayISO(new Date('2026-10-22T01:30:00Z')), '2026-10-21');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('line sums use the displayed unit price, including negative prices', () => {
  assert.equal(moneyInCents(1.005), 101);
  assert.equal(lineTotalCents(2, 1.005), 202);
  assert.equal(lineTotalCents(2, -1.005), -202);
  assert.equal(lineTotalCents(1, 0.1) + lineTotalCents(1, 0.2), 30);
  assert.throws(() => lineTotalCents(0.5, 0.01));
  assert.throws(() => lineTotalCents(Infinity, 1));
  assert.throws(() => lineTotalCents(1, Infinity));
  assert.throws(() => lineTotalCents(Number.MAX_SAFE_INTEGER, 1));
});

test('backup accepts valid exports, including legacy yearly counters', () => {
  assert.doesNotThrow(() => validateBackup(backup()));
  const legacy = backup();
  legacy.localStorage.counter = { year: 2026, seq: 4 };
  assert.doesNotThrow(() => validateBackup(legacy));
});

test('backup rejects unsupported versions and malformed profiles', () => {
  assert.throws(() => validateBackup({ ...backup(), version: 999 }), /verze/);
  const broken = backup();
  broken.localStorage.customers = [{ id: 'bad', name: 'Broken', data: null }];
  assert.throws(() => validateBackup(broken), /neplatná data/);
});

test('backup rejects invalid dates, enum types, fractional quantities and unsafe amounts', () => {
  for (const change of [
    { issueDate: '2026-02-31' }, { lang: ['cs'] }, { currency: 'USD' },
    { items: [{ description: 'Práce', quantity: 0.5, unitPrice: 1 }] },
    { items: [{ description: 'Práce', quantity: 1, unitPrice: Infinity }] },
  ]) {
    const broken = backup();
    Object.assign(broken.localStorage.draft, change);
    assert.throws(() => validateBackup(broken), /neplatná data/);
  }
});

test('backup rejects missing or reserved template references', () => {
  assert.throws(() => validateBackup({ ...backup(), activeTemplateId: 'missing' }), /šablony/);
  assert.throws(() => validateBackup({ ...backup(), templates: [{ id: 'builtin', name: 'Bad', source: '', createdAt: 1 }] }));
});
