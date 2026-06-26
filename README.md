# Faktura PWA — fakturace pro OSVČ neplátce DPH

Bezplatná fakturační **PWA**. PDF se generuje **přímo v prohlížeči** přes Typst
zkompilovaný do WASM — žádný backend, žádný server na kompilaci. Funguje na webu
i na Androidu z jednoho kódu, jde nainstalovat přes „Přidat na plochu" a běží
**offline** (po prvním načtení se appka, WASM i fonty cachují service workerem).

## Vlastnosti

- **Neplátce DPH** — žádné DPH sloupce ani výpočty, povinná doložka
  „Dodavatel není plátcem DPH.", celková částka = prostý součet položek, **bez DUZP**.
- **Dvojjazyčně** (`cs` / `en`) a **dvě měny** (`CZK` / `EUR`) přepínatelné per faktura.
- **Profil dodavatele** se uloží a předvyplní u každé další faktury.
- **Živý SVG náhled** vedle formuláře (debounce) + stažení **PDF**.
- **Platební údaje volitelné** — prázdná pole se na faktuře vůbec nezobrazí.
  Pro EUR se použijí IBAN + SWIFT, pro CZK bankovní účet.
- **Vlastní šablony** — import vlastního `.typ` souboru s validací proti
  datovému kontraktu; vestavěná šablona je vždy dostupný fallback.
- **Perzistence** přes `localStorage` (profil, čítač čísel, rozpracovaná faktura)
  a `IndexedDB` (uložené šablony).

## Architektura

Veškeré **výpočty, formátování čísel/měn a i18n se dělají v TypeScriptu**
(`Intl.NumberFormat`). Typst šablona je jen layout — dostává plochý objekt s už
hotovými řetězci (včetně „Kč"/„€"). Tím je Typst část jednoduchá a robustní.

Tok dat: formulář → `Invoice` (TS) → TS spočítá součty a naformátuje částky →
TS sestaví `mainContent` = zdroj šablony + vygenerované `#invoice(...)` (řetězce
escapované) → typst.ts zkompiluje na PDF (stažení) i SVG (náhled).

```
src/
  main.ts                 bootstrap, registrace service workeru, warm-up Typstu
  ui/
    app.ts                formuláře (dodavatel, faktura, položky), náhled, šablony
    dom.ts                drobné DOM helpery
  typst/
    template.typ          vestavěná šablona (importuje se přes ?raw)
    compile.ts            init typst.ts (lokální WASM+fonty), buildMainContent, pdf()/svg()
    escape.ts             escapování řetězců do Typstu
    templateStore.ts      seznam/aktivní/validace importovaných šablon (IndexedDB)
  domain/
    model.ts              datový model
    money.ts              Intl formátování CZK/EUR × cs/en, datumy
    numbering.ts          auto číslo faktury RRRRNNN
  store/
    storage.ts            localStorage: supplier, čítač, draft
  assets/fonts/           bundlované TTF fonty (Liberation Sans, DejaVu Sans) — offline
public/
  icon.svg, pwa-192.png, pwa-512.png
```

### Offline / WASM / fonty

- WASM kompilátoru i rendereru typst.ts se importují přes Vite `?url`, takže se
  zabundlují (hashované) a service worker je **precachuje** (`globPatterns`
  zahrnují `wasm`, plus runtime `CacheFirst` pro `wasm/ttf/otf/woff2`).
- Fonty s plnou podporou české diakritiky se **bundlují lokálně** (žádné CDN).

## Datový kontrakt šablony

Importovaná šablona musí definovat funkci se stejnou signaturou jako vestavěná:

```typst
#let invoice(
  lang: "cs",            // "cs" | "en"
  supplier: (:),         // name, address, ico, dic?, registryNote?, ...
  customer: (:),         // name, address, ico?, dic?
  meta: (:),             // number, issueDate, dueDate, payment, vs?, account?, iban?, swift?
  items: (),             // pole dictů: (desc, qty, unit, unitPrice, lineTotal) — řetězce
  totalFormatted: "",    // celková částka jako řetězec (vč. měny)
  note: none,            // string | none
) = { /* libovolný layout */ }
```

Veškeré výpočty/formátování dělá TypeScript — šablona dostává jen řetězce.
Balíčky `@preview` (Typst Universe) **nejsou podporované** (rozbily by offline).
Import se validuje zkušební kompilací s dummy daty; nevalidní soubor se odmítne
s konkrétní hláškou a ponechá se aktivní předchozí šablona.

## Vývoj

```bash
npm install
npm run dev        # vývojový server
npm run build      # produkční build (tsc + vite + PWA)
npm run preview    # náhled produkčního buildu (zde funguje service worker)
```

> Service worker se registruje jen v produkčním buildu — pro test offline použij
> `npm run build && npm run preview`.

## Budoucí rozšíření (připraveno místo)

- QR platba: **QR Platba (SPAYD)** pro CZK, **EPC QR / GiroCode** pro EUR.
- Režim plátce DPH (sazby, rekapitulace DPH, DUZP).
- Odesílání e-mailem, export ISDOC, cloud sync / historie.
