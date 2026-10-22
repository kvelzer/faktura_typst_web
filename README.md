# Faktura PWA — fakturace jednoduše

Bezplatná fakturační **PWA**. PDF se generuje **přímo v prohlížeči** přes Typst
zkompilovaný do WASM — žádný backend, žádný server na kompilaci. Funguje na webu
i na Androidu z jednoho kódu, jde nainstalovat přes „Přidat na plochu" a běží
**offline** (po prvním načtení se appka, WASM i fonty cachují service workerem).

## Vlastnosti

- **Neplátce DPH** — žádné DPH sloupce ani výpočty, povinná doložka
  „Dodavatel není plátcem DPH.", celková částka = prostý součet položek, **bez DUZP**.
- **Dvojjazyčně** (`cs` / `en`) a **dvě měny** (`CZK` / `EUR`) přepínatelné per faktura.
- **Uložené profily** — více pojmenovaných profilů **dodavatele** i **odběratele**;
  vybraný se předvyplní do faktury (ukládání, aktualizace, mazání přes picker).
- **Presety faktur** — celá faktura (položky, poznámka, platba, měna, jazyk,
  odběratel) se uloží pod názvem a znovu načte; načtení vygeneruje nové číslo a data.
- **Záloha / obnova** — export všech profilů, presetů, aktivního dodavatele,
  čítače, rozpracované faktury i uložených šablon do jednoho JSON souboru.
  Import je **nedestruktivní** (merge podle id, existující se přeskočí; singletony
  se doplní jen když chybí) — data se čistě přenesou na nové zařízení.
- **Živý SVG náhled** vedle formuláře (debounce) + stažení **PDF**.
- **Platební údaje volitelné** — prázdná pole se na faktuře vůbec nezobrazí.
  Pro EUR se použijí IBAN + SWIFT, pro CZK bankovní účet dodavatele.
  Číslo účtu lze přímo ve faktuře změnit nebo vymazat; ukládá se i do presetů.
- **Zadávání dat** — datum vystavení a splatnosti se zadává jako `DD/MM/YYYY`;
  dnešní datum se určuje podle místního času a formát v PDF podle jazyka faktury.
- **Množství a částky** — množství je celé číslo, ceny se zaokrouhlují na dvě
  desetinná místa a součty se počítají v haléřích/centech.
- **Vlastní šablony** — import vlastního `.typ` souboru s validací proti
  datovému kontraktu; vestavěná šablona je vždy dostupný fallback.
- **Perzistence** přes `localStorage` (dodavatel, čítač čísel, rozpracovaná faktura,
  uložené profily a presety) a `IndexedDB` (uložené šablony).

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
  style.css               styly aplikace
  ui/
    app.ts                formuláře (dodavatel, faktura, položky), profily/presety, náhled, šablony
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
    storage.ts            localStorage: dodavatel, čítač, draft, profily, presety
    backup.ts             sestavení/obnova celé zálohy (JSON export/import)
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
npm test           # regresní testy dat, částek a validace záloh
```

> Service worker se registruje jen v produkčním buildu — pro test offline použij
> `npm run build && npm run preview`.

## Budoucí rozšíření (připraveno místo)

- QR platba: **QR Platba (SPAYD)** pro CZK, **EPC QR / GiroCode** pro EUR.
- Režim plátce DPH (sazby, rekapitulace DPH, DUZP).
- Odesílání e-mailem, export ISDOC, cloud sync / historie.
