import './style.css';
import { buildMainContent, compilePdf, compileSvg } from './typst/compile';
import type { Invoice, Supplier } from './domain/model';

// --- temporary step-2 smoke test: compile one hardcoded invoice ---
const supplier: Supplier = {
  name: 'Bro2',
  address: 'Letná\n999 99 Praha',
  ico: '99999999',
  dic: '',
  registryNote: 'Fyzická osoba zapsaná v živnostenském rejstříku.',
};

const invoice: Invoice = {
  number: '2026001',
  lang: 'cs',
  currency: 'CZK',
  issueDate: '2026-05-12',
  dueDate: '2026-05-26',
  paymentMethod: 'transfer',
  variableSymbol: '2026001',
  customer: { name: 'Bro1', address: 'Na letné\n999 99 Praha', ico: '9999999', dic: 'CZ09999999' },
  items: [
    { description: 'Příliš žluťoučký kůň úpěl ďábelské ódy', quantity: 5, unit: 'ks', unitPrice: 70 },
    { description: 'Konzultace', quantity: 2, unit: 'hod', unitPrice: 1200 },
  ],
  note: 'Děkuji za spolupráci.',
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>Faktura — smoke test</h1>
  <button id="dl">Stáhnout PDF</button>
  <div id="preview">Kompiluji…</div>
`;

async function run() {
  const main = buildMainContent(invoice, { ...supplier, bankAccount: '123456789/0100' });
  const preview = document.querySelector<HTMLDivElement>('#preview')!;
  try {
    preview.innerHTML = await compileSvg(main);
    (window as unknown as { __ready: boolean }).__ready = true;
  } catch (e) {
    preview.textContent = 'Chyba: ' + (e as Error).message;
    (window as unknown as { __error: string }).__error = (e as Error).message;
  }

  document.querySelector<HTMLButtonElement>('#dl')!.addEventListener('click', async () => {
    const pdf = await compilePdf(main);
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faktura-${invoice.number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

run();
