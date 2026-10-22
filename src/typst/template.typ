// Vestavěná šablona. Měnu i formát čísel řeší TypeScript a předává hotové
// řetězce (vč. "Kč"/"€"); částky se tu už NEpočítají. Vícejazyčnost přes `lang`.

#let t = (
  cs: (
    title: "Faktura", supplier: "Dodavatel", customer: "Odběratel",
    ico: "IČO", dic: "DIČ", notvat: "Neplátce DPH",
    vs: "Variabilní symbol", pay: "Způsob platby",
    issued: "Datum vystavení", due: "Datum splatnosti",
    acc: "Číslo účtu", iban: "IBAN", swift: "SWIFT/BIC",
    unitprice: "Cena za MJ", amount: "Celkem", note: "Poznámka",
  ),
  en: (
    title: "Invoice", supplier: "Supplier", customer: "Customer",
    ico: "Business ID", dic: "VAT ID", notvat: "Not a VAT payer",
    vs: "Variable symbol", pay: "Payment method",
    issued: "Issue date", due: "Due date",
    acc: "Bank account", iban: "IBAN", swift: "SWIFT/BIC",
    unitprice: "Unit price", amount: "Amount", note: "Note",
  ),
)

#let invoice(
  lang: "cs",
  supplier: (:),     // name, address(víceřádkový), ico, dic(none=neplátce), registryNote?
  customer: (:),     // name, address, ico?, dic?
  meta: (:),         // number, issueDate, dueDate, payment, vs?, account?, iban?, swift?
  items: (),         // (qty, unit?, desc, unitPrice, lineTotal) — vše řetězce
  totalFormatted: "",
  note: none,
) = {
  let L = t.at(lang)
  let gray  = rgb("#5d5d5d")
  let light = rgb("#8a8a8a")
  let hair  = rgb("#cfcfcf")

  set page(
    paper: "a4",
    margin: (top: 20mm, bottom: 14mm, left: 16mm, right: 16mm),
    footer: context [
      #set text(size: 8pt, fill: gray)
      #supplier.at("registryNote", default: "")
    ],
  )
  set text(font: ("Liberation Sans", "Inter", "DejaVu Sans"),
           size: 10pt, fill: black, lang: lang)
  set par(leading: 0.65em)

  let dash = box(line(length: 16pt, stroke: 0.8pt + gray))
  let stitek(s) = text(size: 9pt, fill: gray, tracking: 0.4pt)[#s]
  let kv(label, value) = block(width: 100%, above: 11pt, grid(
    columns: (1fr, auto), stitek(label), align(right)[#value],
  ))
  let strana(titulek, p) = [
    #dash \ #v(4pt)
    #stitek(upper(titulek)) #v(7pt)
    #text(weight: "bold", size: 11pt)[#p.name] \ #v(1pt)
    #for ln in p.address.split("\n") [ #text(fill: gray)[#ln] \ ]
  ]
  let dph-radek(p) = if p.at("dic", default: none) == none {
    block(width: 100%, above: 11pt)[#text(weight: "bold")[#L.notvat]]
  } else { kv(L.dic, p.dic) }

  // hlavička
  align(right)[
    #line(length: 52%, stroke: 1.4pt + black) #v(5pt)
    #text(size: 21pt, weight: "bold")[#L.title #h(4pt) #text(fill: light)[#meta.number]]
  ]
  v(20pt)

  // strany
  grid(columns: (1fr, 1fr), column-gutter: 28pt,
    strana(L.supplier, supplier),
    strana(L.customer, customer),
  )
  v(14pt)

  // detaily
  grid(columns: (1fr, 1fr), column-gutter: 28pt,
    [
      #kv(L.ico, supplier.ico)
      #dph-radek(supplier)
      #if meta.at("vs", default: "") != "" [ #kv(L.vs, meta.vs) ]
      #kv(L.pay, meta.payment)
      #if meta.at("account", default: "") != "" [ #kv(L.acc, meta.account) ]
      #if meta.at("iban", default: "") != "" [ #kv(L.iban, meta.iban) ]
      #if meta.at("swift", default: "") != "" [ #kv(L.swift, meta.swift) ]
    ],
    [
      #if customer.at("ico", default: "") != "" [ #kv(L.ico, customer.ico) ]
      #dph-radek(customer)
      #kv(L.issued, meta.issueDate)
      #kv(L.due, meta.dueDate)
    ],
  )
  v(30pt)

  // tabulka položek
  let th(s) = text(size: 8.5pt, fill: gray, tracking: 0.5pt)[#upper(s)]
  {
    let body = ()
    for p in items {
      body += ([#p.qty #p.at("unit", default: "")], [#p.desc],
               [#p.unitPrice], [#p.lineTotal])
    }
    table(
      columns: (auto, 1fr, auto, auto),
      align: (left, left, right, right),
      inset: (x: 6pt, y: 9pt), stroke: none,
      table.cell(colspan: 2)[], th(L.unitprice), th(L.amount),
      table.hline(stroke: 0.6pt + hair),
      ..body,
      table.hline(stroke: 0.6pt + hair),
    )
  }
  v(26pt)

  // celkem
  align(right)[
    #line(length: 32%, stroke: 1.4pt + black) #v(9pt)
    #text(size: 15pt, weight: "bold")[#totalFormatted]
  ]

  if note != none [
    #v(16pt) #stitek(upper(L.note)) #v(4pt) #text(size: 9pt)[#note]
  ]
}
