import { h, clear, field } from './dom';
import {
  emptySupplier,
  emptyCustomer,
  emptyItem,
  type Supplier,
  type Customer,
  type Invoice,
  type InvoiceItem,
  type Currency,
  type Lang,
  type NamedRecord,
} from '../domain/model';
import { nextNumber, type Counter } from '../domain/numbering';
import { formatMoney } from '../domain/money';
import { buildMainContent, compilePdf, compileSvg, lineTotal } from '../typst/compile';
import {
  listTemplates,
  getActiveId,
  setActiveId,
  getActiveSource,
  getSourceById,
  importTemplate,
  deleteTemplate,
  BUILTIN_ID,
  type TemplateMeta,
} from '../typst/templateStore';
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
  profileId,
} from '../store/storage';
import { buildBackup, applyBackup } from '../store/backup';

interface State {
  supplier: Supplier;
  invoice: Invoice;
  counter: Counter | null;
  activeTemplateId: string;
  templates: TemplateMeta[];
  tab: 'invoice' | 'supplier' | 'templates';
  // Persisted profile-picker selections (survive form re-renders).
  profileSel: { supplier: string; customer: string; preset: string };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function freshInvoice(counter: Counter | null): Invoice {
  const issue = todayISO();
  const num = nextNumber(counter).number;
  return {
    number: num,
    lang: 'cs',
    currency: 'CZK',
    issueDate: issue,
    dueDate: addDaysISO(issue, 14),
    paymentMethod: 'Platba převodem',
    variableSymbol: num,
    customer: emptyCustomer(),
    items: [emptyItem()],
    note: '',
  };
}

function segmented(
  options: { value: string; label: string }[],
  current: string,
  onChange: (v: string) => void,
): HTMLElement {
  const box = h('div', { class: 'segmented' });
  const btns: HTMLButtonElement[] = [];
  for (const o of options) {
    const b = h(
      'button',
      {
        class: 'seg' + (o.value === current ? ' active' : ''),
        type: 'button',
        onClick: () => {
          for (const x of btns) x.classList.remove('active');
          b.classList.add('active');
          onChange(o.value);
        },
      },
      [o.label],
    ) as HTMLButtonElement;
    btns.push(b);
    box.append(b);
  }
  return box;
}

/**
 * Reusable saved-profile picker: a <select> of named snapshots plus
 * save-as / update / delete buttons. Generic over the stored entity.
 */
function renderProfileBar<T>(opts: {
  load: () => NamedRecord<T>[];
  save: (l: NamedRecord<T>[]) => void;
  current: () => T;
  apply: (data: T) => void;
  nameOf: (data: T) => string;
  // Selection id is persisted by the caller so it survives a full form re-render
  // (apply() -> renderForm() rebuilds this bar from scratch).
  selectedId: () => string;
  onSelect: (id: string) => void;
  placeholder?: string;
}): HTMLElement {
  let list = opts.load();
  let selectedId = opts.selectedId();

  const sel = h('select', { class: 'input profile-select' }) as HTMLSelectElement;
  const updateBtn = h('button', { class: 'btn', type: 'button' }, ['Aktualizovat']) as HTMLButtonElement;
  const delBtn = h('button', { class: 'btn btn-link danger', type: 'button' }, ['Smazat']) as HTMLButtonElement;

  const setSelected = (id: string) => {
    selectedId = list.some((r) => r.id === id) ? id : '';
    opts.onSelect(selectedId);
    sel.value = selectedId;
    updateBtn.disabled = delBtn.disabled = !selectedId;
  };

  const refreshOptions = () => {
    clear(sel);
    sel.append(h('option', { value: '' }, [opts.placeholder ?? '— vyber profil —']));
    for (const r of list) sel.append(h('option', { value: r.id }, [r.name]));
    setSelected(selectedId);
  };
  refreshOptions();

  sel.addEventListener('change', () => {
    setSelected(sel.value);
    const r = list.find((x) => x.id === selectedId);
    if (r) opts.apply(structuredClone(r.data));
  });

  const saveAsBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: () => {
      const name = prompt('Název profilu', opts.nameOf(opts.current()));
      if (name == null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const rec: NamedRecord<T> = { id: profileId(), name: trimmed, data: structuredClone(opts.current()) };
      list = [...list, rec];
      opts.save(list);
      refreshOptions();
      setSelected(rec.id);
    },
  }, ['Uložit jako…']) as HTMLButtonElement;

  updateBtn.addEventListener('click', () => {
    if (!selectedId) return;
    const r = list.find((x) => x.id === selectedId);
    if (!r) return;
    r.data = structuredClone(opts.current());
    opts.save(list);
  });

  delBtn.addEventListener('click', () => {
    if (!selectedId) return;
    const r = list.find((x) => x.id === selectedId);
    if (!r || !confirm(`Smazat profil „${r.name}"?`)) return;
    list = list.filter((x) => x.id !== selectedId);
    opts.save(list);
    selectedId = '';
    refreshOptions();
  });

  return h('div', { class: 'profile-bar' }, [sel, saveAsBtn, updateBtn, delBtn]);
}

export function mountApp(root: HTMLElement): void {
  const state: State = {
    supplier: loadSupplier() ?? emptySupplier(),
    invoice: loadDraft() ?? freshInvoice(loadCounter()),
    counter: loadCounter(),
    activeTemplateId: BUILTIN_ID,
    templates: [{ id: BUILTIN_ID, name: 'Vestavěná šablona', builtin: true }],
    tab: 'invoice',
    profileSel: { supplier: '', customer: '', preset: '' },
  };
  if (!state.invoice.customer) state.invoice.customer = emptyCustomer();
  if (!state.invoice.items || state.invoice.items.length === 0) state.invoice.items = [emptyItem()];

  // Always refresh dates to today on app open
  const today = todayISO();
  state.invoice.issueDate = today;
  state.invoice.dueDate = addDaysISO(today, 14);

  const tabBtns = {
    invoice: h('button', { class: 'tab active', onClick: () => switchTab('invoice') }, ['Faktura']),
    supplier: h('button', { class: 'tab', onClick: () => switchTab('supplier') }, ['Dodavatel']),
    templates: h('button', { class: 'tab', onClick: () => switchTab('templates') }, ['Šablony']),
  };
  const formPane = h('div', { class: 'form-pane' });
  const previewBox = h('div', { class: 'preview-box', id: 'preview' }, ['Inicializuji…']);
  const previewStatus = h('div', { class: 'preview-status' });
  const dlBtn = h('button', { class: 'btn btn-primary', onClick: onDownloadPdf }, ['Stáhnout PDF']);

  const header = h('header', { class: 'app-header' }, [
    h('div', { class: 'brand' }, [h('strong', {}, ['Faktura']), h('span', { class: 'muted' }, [' — neplátce DPH'])]),
    h('nav', { class: 'tabs' }, [tabBtns.invoice, tabBtns.supplier, tabBtns.templates]),
  ]);

  const previewPane = h('section', { class: 'preview-pane' }, [
    h('div', { class: 'preview-toolbar' }, [h('strong', {}, ['Náhled']), dlBtn]),
    previewStatus,
    previewBox,
  ]);

  root.append(
    h('div', { class: 'layout' }, [
      header,
      h('main', { class: 'main-grid' }, [h('section', { class: 'form-section' }, [formPane]), previewPane]),
    ]),
  );

  function switchTab(tab: State['tab']): void {
    state.tab = tab;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('active', k === tab);
    renderForm();
  }

  // --- preview (debounced) ---
  let previewTimer: number | undefined;
  let activeSourceCache = '';

  function schedulePreview(): void {
    saveDraft(state.invoice);
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 350);
  }

  async function renderPreview(): Promise<void> {
    if (formPane.querySelector('input[data-invoice-date]:invalid')) {
      previewStatus.textContent = 'Zkontrolujte datum ve formátu DD/MM/YYYY.';
      return;
    }
    previewStatus.textContent = 'Překresluji…';
    try {
      if (!activeSourceCache) activeSourceCache = await getActiveSource();
      const main = buildMainContent(state.invoice, state.supplier, activeSourceCache);
      const svg = await compileSvg(main);
      previewBox.innerHTML = svg;
      previewStatus.textContent = '';
    } catch (e) {
      previewStatus.innerHTML = '';
      previewStatus.append(h('div', { class: 'error' }, ['Chyba kompilace: ' + (e as Error).message]));
    }
  }

  async function refreshActiveSource(): Promise<void> {
    activeSourceCache = await getActiveSource();
    await renderPreview();
  }

  async function onDownloadPdf(): Promise<void> {
    const invalidInput = formPane.querySelector<HTMLInputElement>('input[data-invoice-date]:invalid');
    if (invalidInput) {
      invalidInput.reportValidity();
      return;
    }
    dlBtn.setAttribute('disabled', '');
    const prev = dlBtn.textContent;
    dlBtn.textContent = 'Generuji…';
    try {
      const source = activeSourceCache || (await getActiveSource());
      const main = buildMainContent(state.invoice, state.supplier, source);
      const pdf = await compilePdf(main);
      const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.invoice.number || 'faktura'}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Nepodařilo se vygenerovat PDF:\n' + (e as Error).message);
    } finally {
      dlBtn.removeAttribute('disabled');
      dlBtn.textContent = prev;
    }
  }

  // --- form dispatch ---
  function renderForm(): void {
    clear(formPane);
    if (state.tab === 'invoice') formPane.append(renderInvoiceForm());
    else if (state.tab === 'supplier') formPane.append(renderSupplierForm());
    else formPane.append(renderTemplatesForm());
  }

  function bindInput(
    get: () => string,
    set: (v: string) => void,
    opts: { type?: string; placeholder?: string } = {},
  ): HTMLInputElement {
    const input = h('input', {
      class: 'input',
      type: opts.type ?? 'text',
      value: get(),
      placeholder: opts.placeholder ?? '',
    }) as HTMLInputElement;
    input.addEventListener('input', () => {
      set(input.value);
      schedulePreview();
    });
    return input;
  }

  function bindTextarea(get: () => string, set: (v: string) => void, placeholder = ''): HTMLTextAreaElement {
    const ta = h('textarea', { class: 'input', rows: 3, placeholder }) as HTMLTextAreaElement;
    ta.value = get();
    ta.addEventListener('input', () => {
      set(ta.value);
      schedulePreview();
    });
    return ta;
  }

  /** Keep ISO dates in storage/PDF data while showing a fixed day-first format. */
  function bindDate(get: () => string, set: (v: string) => void): HTMLInputElement {
    const [year, month, day] = get().split('-');
    const input = h('input', {
      class: 'input',
      type: 'text',
      value: `${day}/${month}/${year}`,
      placeholder: 'DD/MM/YYYY',
      'data-invoice-date': true,
      required: true,
    });
    input.addEventListener('input', () => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.value);
      let iso = '';
      if (match) {
        const [, d, m, y] = match;
        const candidate = `${y}-${m}-${d}`;
        const date = new Date(`${candidate}T00:00:00Z`);
        if (Number(y) > 0 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate) {
          iso = candidate;
        }
      }
      input.setCustomValidity(iso ? '' : 'Zadejte platné datum ve formátu DD/MM/YYYY.');
      input.setAttribute('aria-invalid', String(!iso));
      if (iso) set(iso);
      schedulePreview();
    });
    input.addEventListener('blur', () => {
      if (!input.validity.valid) input.reportValidity();
    });
    return input;
  }

  // ---- Supplier (settings) ----
  function renderSupplierForm(): HTMLElement {
    const s = state.supplier;
    const persist = () => {
      saveSupplier(state.supplier);
      schedulePreview();
    };
    const inp = (get: () => string, set: (v: string) => void, ph = '') => {
      const i = h('input', { class: 'input', type: 'text', value: get(), placeholder: ph }) as HTMLInputElement;
      i.addEventListener('input', () => {
        set(i.value);
        persist();
      });
      return i;
    };

    const logoPreview = h('div', { class: 'logo-preview' });
    const renderLogo = () => {
      clear(logoPreview);
      if (s.logoDataUrl) {
        logoPreview.append(h('img', { src: s.logoDataUrl, alt: 'logo' }));
        logoPreview.append(
          h('button', {
            class: 'btn btn-link',
            onClick: () => {
              s.logoDataUrl = '';
              persist();
              renderLogo();
            },
          }, ['Odebrat logo']),
        );
      }
    };
    renderLogo();
    const logoInput = h('input', { class: 'input', type: 'file', accept: 'image/*' }) as HTMLInputElement;
    logoInput.addEventListener('change', () => {
      const f = logoInput.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        s.logoDataUrl = String(reader.result);
        persist();
        renderLogo();
      };
      reader.readAsDataURL(f);
    });

    const addressTa = h('textarea', { class: 'input', rows: 3 }) as HTMLTextAreaElement;
    addressTa.value = s.address;
    addressTa.addEventListener('input', () => {
      s.address = addressTa.value;
      persist();
    });

    return h('div', { class: 'form' }, [
      h('h2', {}, ['Dodavatel (uloží se a předvyplní)']),
      h('p', { class: 'muted small' }, ['Vyplňte jednou. Údaje se ukládají a předvyplní u každé nové faktury.']),
      h('p', { class: 'muted small' }, ['Uložené profily dodavatele:']),
      renderProfileBar<Supplier>({
        load: loadSuppliers,
        save: saveSuppliers,
        current: () => state.supplier,
        apply: (data) => {
          state.supplier = data;
          saveSupplier(state.supplier);
          renderForm();
          schedulePreview();
        },
        nameOf: (data) => data.name || 'Dodavatel',
        selectedId: () => state.profileSel.supplier,
        onSelect: (id) => (state.profileSel.supplier = id),
        placeholder: '— vyber dodavatele —',
      }),
      field('Jméno / název *', inp(() => s.name, (v) => (s.name = v), 'Jan Novák')),
      field('Adresa (víceřádková) *', addressTa),
      h('div', { class: 'row2' }, [
        field('IČO *', inp(() => s.ico, (v) => (s.ico = v), '12345678')),
        field('DIČ (nepovinné)', inp(() => s.dic ?? '', (v) => (s.dic = v), 'prázdné = neplátce DPH')),
      ]),
      h('div', { class: 'row2' }, [
        field('E-mail', inp(() => s.email ?? '', (v) => (s.email = v))),
        field('Telefon', inp(() => s.phone ?? '', (v) => (s.phone = v))),
      ]),
      h('h3', {}, ['Platební údaje (vše nepovinné)']),
      field('Bankovní účet (CZK)', inp(() => s.bankAccount ?? '', (v) => (s.bankAccount = v), '123456789/0100')),
      h('div', { class: 'row2' }, [
        field('IBAN (pro EUR)', inp(() => s.iban ?? '', (v) => (s.iban = v), 'CZ65 0800 0000 1920 0014 5399')),
        field('SWIFT/BIC (pro EUR)', inp(() => s.swift ?? '', (v) => (s.swift = v), 'GIBACZPX')),
      ]),
      field('Poznámka o registraci', inp(() => s.registryNote ?? '', (v) => (s.registryNote = v))),
      h('h3', {}, ['Logo (nepovinné)']),
      logoInput,
      logoPreview,
    ]);
  }

  // ---- Invoice form ----
  function renderInvoiceForm(): HTMLElement {
    const inv = state.invoice;
    const accountValue = () => inv.bankAccount ?? (inv.currency === 'CZK' ? state.supplier.bankAccount ?? '' : '');
    const accountInput = bindInput(accountValue, (v) => (inv.bankAccount = v), { placeholder: '123456789/0100' });

    const langToggle = segmented(
      [
        { value: 'cs', label: 'CZ' },
        { value: 'en', label: 'EN' },
      ],
      inv.lang,
      (v) => {
        inv.lang = v as Lang;
        renderItems();
        schedulePreview();
      },
    );
    const currencyToggle = segmented(
      [
        { value: 'CZK', label: 'CZK' },
        { value: 'EUR', label: 'EUR' },
      ],
      inv.currency,
      (v) => {
        inv.currency = v as Currency;
        accountInput.value = accountValue();
        renderItems();
        schedulePreview();
      },
    );
    const payInput = h('input', { class: 'input', type: 'text', value: inv.paymentMethod, placeholder: 'Převodem / Hotově / ...' }) as HTMLInputElement;
    payInput.addEventListener('input', () => {
      inv.paymentMethod = payInput.value;
      schedulePreview();
    });

    const itemsBox = h('div', { class: 'items' });
    const renderItems = () => {
      clear(itemsBox);
      itemsBox.append(
        h('div', { class: 'item-head' }, [
          h('span', {}, ['Popis']),
          h('span', {}, ['Množství']),
          h('span', {}, ['MJ']),
          h('span', {}, ['Cena/MJ']),
          h('span', {}, ['Celkem']),
          h('span', {}, ['']),
        ]),
      );
      inv.items.forEach((it, idx) => itemsBox.append(renderItemRow(it, idx, renderItems)));
      itemsBox.append(
        h('button', {
          class: 'btn btn-link',
          onClick: () => {
            inv.items.push(emptyItem());
            renderItems();
            schedulePreview();
          },
        }, ['+ Přidat řádek']),
      );
    };
    renderItems();

    return h('div', { class: 'form' }, [
      h('div', { class: 'form-toolbar' }, [
        h('button', {
          class: 'btn',
          onClick: () => {
            const committed = nextNumber(state.counter).counter;
            state.counter = committed;
            saveCounter(committed);
            state.invoice = freshInvoice(committed);
            saveDraft(state.invoice);
            renderForm();
            schedulePreview();
          },
        }, ['Nová faktura']),
        h('div', { class: 'toggles' }, [
          h('span', { class: 'toggle-label' }, ['Jazyk']),
          langToggle,
          h('span', { class: 'toggle-label' }, ['Měna']),
          currencyToggle,
        ]),
      ]),

      h('p', { class: 'muted small' }, ['Uložené šablony faktur (s daty):']),
      renderProfileBar<Invoice>({
        load: loadPresets,
        save: savePresets,
        current: () => state.invoice,
        apply: (data) => {
          const t = todayISO();
          data.issueDate = t;
          data.dueDate = addDaysISO(t, 14);
          const num = nextNumber(state.counter).number;
          data.number = num;
          data.variableSymbol = num;
          if (!data.customer) data.customer = emptyCustomer();
          if (!data.items || data.items.length === 0) data.items = [emptyItem()];
          state.invoice = data;
          saveDraft(state.invoice);
          renderForm();
          schedulePreview();
        },
        nameOf: (data) => (data.customer?.name ? `Faktura – ${data.customer.name}` : 'Faktura'),
        selectedId: () => state.profileSel.preset,
        onSelect: (id) => (state.profileSel.preset = id),
        placeholder: '— vyber šablonu faktury —',
      }),

      h('h2', {}, ['Odběratel']),
      renderProfileBar<Customer>({
        load: loadCustomers,
        save: saveCustomers,
        current: () => state.invoice.customer,
        apply: (data) => {
          state.invoice.customer = data;
          renderForm();
          schedulePreview();
        },
        nameOf: (data) => data.name || 'Odběratel',
        selectedId: () => state.profileSel.customer,
        onSelect: (id) => (state.profileSel.customer = id),
        placeholder: '— vyber odběratele —',
      }),
      field('Název *', bindInput(() => inv.customer.name, (v) => (inv.customer.name = v), { placeholder: 'Firma s.r.o.' })),
      field('Adresa *', bindTextarea(() => inv.customer.address, (v) => (inv.customer.address = v))),
      h('div', { class: 'row2' }, [
        field('IČO', bindInput(() => inv.customer.ico ?? '', (v) => (inv.customer.ico = v))),
        field('DIČ', bindInput(() => inv.customer.dic ?? '', (v) => (inv.customer.dic = v))),
      ]),

      h('h2', {}, ['Hlavička faktury']),
      h('div', { class: 'row2' }, [
        field('Číslo faktury', bindInput(() => inv.number, (v) => (inv.number = v))),
        field('Variabilní symbol', bindInput(() => inv.variableSymbol ?? '', (v) => (inv.variableSymbol = v))),
      ]),
      h('div', { class: 'row2' }, [
        field('Datum vystavení', bindDate(() => inv.issueDate, (v) => (inv.issueDate = v)), 'DD/MM/YYYY'),
        field('Datum splatnosti', bindDate(() => inv.dueDate, (v) => (inv.dueDate = v)), 'DD/MM/YYYY'),
      ]),
      field('Způsob platby', payInput),
      field('Číslo účtu (nepovinné)', accountInput),

      h('h2', {}, ['Položky']),
      itemsBox,

      h('h2', {}, ['Poznámka']),
      field('', bindTextarea(() => inv.note ?? '', (v) => (inv.note = v), 'Volitelná poznámka na faktuře')),
    ]);
  }

  function renderItemRow(it: InvoiceItem, idx: number, rerender: () => void): HTMLElement {
    const inv = state.invoice;
    const totalCell = h('span', { class: 'item-total' }, [formatMoney(lineTotal(it.quantity, it.unitPrice), inv.lang, inv.currency)]);
    const updateTotal = () => {
      totalCell.textContent = formatMoney(lineTotal(it.quantity, it.unitPrice), inv.lang, inv.currency);
    };
    const desc = h('input', { class: 'input', type: 'text', value: it.description, placeholder: 'Popis položky' }) as HTMLInputElement;
    desc.addEventListener('input', () => {
      it.description = desc.value;
      schedulePreview();
    });
    const qty = h('input', { class: 'input', type: 'number', step: '0.01', value: String(it.quantity) }) as HTMLInputElement;
    qty.addEventListener('input', () => {
      it.quantity = parseFloat(qty.value) || 0;
      updateTotal();
      schedulePreview();
    });
    const unit = h('input', { class: 'input', type: 'text', value: it.unit ?? '', placeholder: 'ks' }) as HTMLInputElement;
    unit.addEventListener('input', () => {
      it.unit = unit.value;
      schedulePreview();
    });
    const price = h('input', { class: 'input', type: 'number', step: '0.01', value: String(it.unitPrice) }) as HTMLInputElement;
    price.addEventListener('input', () => {
      it.unitPrice = parseFloat(price.value) || 0;
      updateTotal();
      schedulePreview();
    });
    const del = h('button', {
      class: 'btn btn-icon',
      title: 'Odebrat řádek',
      onClick: () => {
        inv.items.splice(idx, 1);
        if (inv.items.length === 0) inv.items.push(emptyItem());
        rerender();
        schedulePreview();
      },
    }, ['✕']);
    return h('div', { class: 'item-row' }, [desc, qty, unit, price, totalCell, del]);
  }

  // ---- Templates form ----
  function renderTemplatesForm(): HTMLElement {
    const wrap = h('div', { class: 'form' }, [h('h2', {}, ['Šablony']), h('p', { class: 'muted' }, ['Načítám…'])]);
    void (async () => {
      state.templates = await listTemplates();
      state.activeTemplateId = await getActiveId();
      clear(wrap);
      wrap.append(h('h2', {}, ['Šablony']));
      wrap.append(
        h('p', { class: 'muted small' }, ['Vyber aktivní šablonu, importuj vlastní .typ, nebo si stáhni aktuální jako základ pro úpravy.']),
      );

      const list = h('div', { class: 'template-list' });
      for (const t of state.templates) {
        const radio = h('input', { type: 'radio', name: 'tpl', value: t.id }) as HTMLInputElement;
        radio.checked = t.id === state.activeTemplateId;
        radio.addEventListener('change', async () => {
          await setActiveId(t.id);
          state.activeTemplateId = t.id;
          await refreshActiveSource();
        });
        const row = h('label', { class: 'template-row' }, [
          radio,
          h('span', { class: 'template-name' }, [t.name, t.builtin ? h('span', { class: 'badge' }, ['vestavěná']) : '']),
        ]);
        if (!t.builtin) {
          row.append(
            h('button', {
              class: 'btn btn-link danger',
              onClick: async (e: Event) => {
                e.preventDefault();
                if (!confirm(`Smazat šablonu „${t.name}"?`)) return;
                await deleteTemplate(t.id);
                switchTab('templates');
                await refreshActiveSource();
              },
            }, ['Smazat']),
          );
        }
        list.append(row);
      }
      wrap.append(list);

      const importErr = h('div', { class: 'error' });
      importErr.style.display = 'none';
      const importInfo = h('div', { class: 'info' });
      importInfo.style.display = 'none';
      const fileInput = h('input', { class: 'input', type: 'file', accept: '.typ,text/plain' }) as HTMLInputElement;
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        importErr.style.display = 'none';
        importInfo.textContent = `Validuji „${f.name}"…`;
        importInfo.style.display = 'block';
        try {
          const text = await f.text();
          const name = f.name.replace(/\.typ$/i, '');
          await importTemplate(name, text);
          switchTab('templates');
          await refreshActiveSource();
        } catch (err) {
          importInfo.style.display = 'none';
          importErr.textContent = 'Import selhal: ' + (err as Error).message;
          importErr.style.display = 'block';
        } finally {
          fileInput.value = '';
        }
      });

      wrap.append(h('h3', {}, ['Importovat vlastní šablonu (.typ)']));
      wrap.append(fileInput);
      wrap.append(importInfo);
      wrap.append(importErr);

      wrap.append(h('h3', {}, ['Export']));
      wrap.append(
        h('button', {
          class: 'btn',
          onClick: async () => {
            const src = await getSourceById(state.activeTemplateId);
            const blob = new Blob([src], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const active = state.templates.find((t) => t.id === state.activeTemplateId);
            a.download = `${active?.name || 'sablona'}.typ`;
            a.click();
            URL.revokeObjectURL(url);
          },
        }, ['Stáhnout aktuální šablonu']),
      );

      wrap.append(
        h('p', { class: 'muted small' }, [
          'Kontrakt: šablona musí definovat funkci invoice(lang, supplier, customer, meta, items, totalFormatted, note). Balíčky @preview nejsou podporované (offline).',
        ]),
      );

      // ---- Záloha dat (full backup / restore across devices) ----
      wrap.append(h('h3', {}, ['Záloha dat']));
      wrap.append(
        h('p', { class: 'muted small' }, [
          'Exportuj všechna data (dodavatelé, odběratelé, šablony faktur i .typ šablony) do jednoho .json souboru a naimportuj je na jiném zařízení. Import přidává, nepřepisuje.',
        ]),
      );

      const backupErr = h('div', { class: 'error' });
      backupErr.style.display = 'none';
      const backupInfo = h('div', { class: 'info' });
      backupInfo.style.display = 'none';

      wrap.append(
        h('button', {
          class: 'btn',
          onClick: async () => {
            backupErr.style.display = 'none';
            try {
              const data = await buildBackup();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `faktura-zaloha-${todayISO()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              backupErr.textContent = 'Export zálohy selhal: ' + (e as Error).message;
              backupErr.style.display = 'block';
            }
          },
        }, ['Exportovat zálohu (.json)']),
      );

      const backupFile = h('input', { class: 'input', type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
      backupFile.addEventListener('change', async () => {
        const f = backupFile.files?.[0];
        if (!f) return;
        backupErr.style.display = 'none';
        backupInfo.textContent = `Importuji „${f.name}"…`;
        backupInfo.style.display = 'block';
        try {
          const data = JSON.parse(await f.text());
          const r = await applyBackup(data);
          // switchTab below rebuilds this form, so surface the summary via alert.
          alert(`Záloha naimportována:\n+${r.suppliers} dodavatelů\n+${r.customers} odběratelů\n+${r.presets} šablon faktur\n+${r.templates} .typ šablon`);
          switchTab('templates');
          await refreshActiveSource();
        } catch (err) {
          backupInfo.style.display = 'none';
          backupErr.textContent = 'Import zálohy selhal: ' + (err as Error).message;
          backupErr.style.display = 'block';
        } finally {
          backupFile.value = '';
        }
      });
      wrap.append(h('h3', {}, ['Importovat zálohu (.json)']));
      wrap.append(backupFile);
      wrap.append(backupInfo);
      wrap.append(backupErr);
    })();
    return wrap;
  }

  // --- init ---
  renderForm();
  void refreshActiveSource();
}
