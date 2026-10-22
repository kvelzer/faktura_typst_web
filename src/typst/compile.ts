import { $typst } from '@myriaddreamin/typst.ts';
import { loadFonts } from '@myriaddreamin/typst.ts';

import type { Invoice, Supplier } from '../domain/model';
import { formatMoney, formatQuantity, formatDate } from '../domain/money';
import { typstString, typstStringOrNone } from './escape';

// Built-in template source, bundled at build time.
import builtinTemplate from './template.typ?raw';

// Local WASM modules (bundled by Vite, hashed, precached by the service worker).
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';

// Bundled fonts with full Czech coverage (offline, deterministic rendering).
import fontLiberationRegular from '../assets/fonts/LiberationSans-Regular.ttf?url';
import fontLiberationBold from '../assets/fonts/LiberationSans-Bold.ttf?url';
import fontLiberationItalic from '../assets/fonts/LiberationSans-Italic.ttf?url';
import fontDejaVu from '../assets/fonts/DejaVuSans.ttf?url';
import fontDejaVuBold from '../assets/fonts/DejaVuSans-Bold.ttf?url';

export const BUILTIN_TEMPLATE_SOURCE = builtinTemplate;

const FONT_URLS = [
  fontLiberationRegular,
  fontLiberationBold,
  fontLiberationItalic,
  fontDejaVu,
  fontDejaVuBold,
];

let initialized: Promise<void> | null = null;

/** Initialize the global $typst instance once, fully offline. */
export function initTypst(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    $typst.setCompilerInitOptions({
      getModule: () => compilerWasmUrl,
      beforeBuild: [loadFonts(FONT_URLS, { assets: false })],
    });
    $typst.setRendererInitOptions({
      getModule: () => rendererWasmUrl,
    });
    // Force eager construction so the first compile is fast and errors surface early.
    await $typst.svg({ mainContent: '#set page(width: 1pt, height: 1pt)\n' });
  })();
  return initialized;
}


/** Compute line total for one item. */
export function lineTotal(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

/** Compute the invoice grand total. */
export function invoiceTotal(invoice: Invoice): number {
  return invoice.items.reduce((sum, it) => sum + lineTotal(it.quantity, it.unitPrice), 0);
}

/**
 * Build the full Typst `mainContent`: the active template source followed by a
 * generated `#invoice(...)` call carrying already-formatted strings.
 *
 * All calculation, number/currency formatting and i18n happen here in TS; the
 * template only lays out strings. `dic` is `none` for a non-VAT payer.
 */
export function buildMainContent(
  invoice: Invoice,
  supplier: Supplier,
  templateSource: string = BUILTIN_TEMPLATE_SOURCE,
): string {
  const lang = invoice.lang;
  const currency = invoice.currency;

  const supplierFields: string[] = [
    `name: ${typstString(supplier.name)}`,
    `address: ${typstString(supplier.address)}`,
    `ico: ${typstString(supplier.ico)}`,
    `dic: ${typstStringOrNone(supplier.dic)}`,
    `registryNote: ${typstStringOrNone(supplier.registryNote)}`,
  ];

  const customer = invoice.customer;
  const customerFields: string[] = [
    `name: ${typstString(customer.name)}`,
    `address: ${typstString(customer.address)}`,
    `ico: ${typstStringOrNone(customer.ico)}`,
    `dic: ${typstStringOrNone(customer.dic)}`,
  ];

  // An invoice can override (or explicitly hide) the supplier's default account.
  const metaFields: string[] = [
    `number: ${typstString(invoice.number)}`,
    `issueDate: ${typstString(formatDate(invoice.issueDate, lang))}`,
    `dueDate: ${typstString(formatDate(invoice.dueDate, lang))}`,
    `payment: ${typstString(invoice.paymentMethod)}`,
    `vs: ${typstString(invoice.variableSymbol ?? '')}`,
  ];
  const bankAccount = invoice.bankAccount ?? (currency === 'CZK' ? supplier.bankAccount : '');
  if (bankAccount?.trim()) {
    metaFields.push(`account: ${typstString(bankAccount.trim())}`);
  }
  if (supplier.iban) metaFields.push(`iban: ${typstString(supplier.iban)}`);
  if (supplier.swift) metaFields.push(`swift: ${typstString(supplier.swift)}`);


  const itemDicts = invoice.items.map((it) => {
    const fields = [
      `qty: ${typstString(formatQuantity(it.quantity, lang))}`,
      `unit: ${typstString(it.unit ?? '')}`,
      `desc: ${typstString(it.description)}`,
      `unitPrice: ${typstString(formatMoney(it.unitPrice, lang, currency))}`,
      `lineTotal: ${typstString(formatMoney(lineTotal(it.quantity, it.unitPrice), lang, currency))}`,
    ];
    return `(${fields.join(', ')})`;
  });
  // Trailing comma ensures a single-item tuple is still a Typst array.
  const itemsLiteral = `(${itemDicts.join(', ')}${itemDicts.length === 1 ? ',' : ''})`;

  const totalFormatted = formatMoney(invoiceTotal(invoice), lang, currency);

  const call = [
    '#invoice(',
    `  lang: ${typstString(lang)},`,
    `  supplier: (${supplierFields.join(', ')}),`,
    `  customer: (${customerFields.join(', ')}),`,
    `  meta: (${metaFields.join(', ')}),`,
    `  items: ${itemsLiteral},`,
    `  totalFormatted: ${typstString(totalFormatted)},`,
    `  note: ${typstStringOrNone(invoice.note)},`,
    ')',
  ].join('\n');

  return `${templateSource}\n\n${call}\n`;
}

/** Compile to a PDF byte array. */
export async function compilePdf(mainContent: string): Promise<Uint8Array> {
  await initTypst();
  const pdf = await $typst.pdf({ mainContent });
  if (!pdf) throw new Error('Typst nevrátil PDF.');
  return pdf;
}

/** Compile to an SVG string (for live preview). */
export async function compileSvg(mainContent: string): Promise<string> {
  await initTypst();
  return await $typst.svg({ mainContent });
}
