/** Data model for the invoice app. See zadání. */

export type Lang = 'cs' | 'en';
export type Currency = 'CZK' | 'EUR';
export type PaymentMethod = string;

export interface Supplier {
  name: string;
  address: string; // multiline
  ico: string;
  dic?: string;
  email?: string;
  phone?: string;
  bankAccount?: string; // CZK
  iban?: string; // EUR / foreign
  swift?: string;
  registryNote?: string;
  logoDataUrl?: string;
}

export interface Customer {
  name: string;
  address: string;
  ico?: string;
  dic?: string;
}

/** A named, saved snapshot of any entity (supplier / customer / invoice). */
export interface NamedRecord<T> {
  id: string; // `p_${Date.now()}_${rand}`
  name: string; // user-facing label, defaults to data.name when present
  data: T;
}

export interface InvoiceItem {
  description: string;
  quantity: number; // integer
  unit?: string;
  unitPrice: number; // in the invoice currency
}

export interface Invoice {
  number: string; // RRRRNNN
  lang: Lang;
  currency: Currency;
  issueDate: string; // ISO; formatted at render time
  dueDate: string;
  paymentMethod: PaymentMethod;
  bankAccount?: string; // undefined uses supplier default; empty hides the account
  variableSymbol?: string;
  items: InvoiceItem[];
  note?: string;
  customer: Customer;
}

export function emptySupplier(): Supplier {
  return {
    name: '',
    address: '',
    ico: '',
    dic: '',
    email: '',
    phone: '',
    bankAccount: '',
    iban: '',
    swift: '',
    registryNote: 'Fyzická osoba zapsaná v živnostenském rejstříku.',
    logoDataUrl: '',
  };
}

export function emptyCustomer(): Customer {
  return { name: '', address: '', ico: '', dic: '' };
}

export function emptyItem(): InvoiceItem {
  return { description: '', quantity: 1, unit: 'ks', unitPrice: 0 };
}
