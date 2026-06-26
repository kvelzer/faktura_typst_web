/** Tiny DOM helpers to keep UI code declarative without a framework. */

type Attrs = Record<string, string | number | boolean | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'value') {
      (el as HTMLInputElement).value = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Labelled field wrapper. */
export function field(labelText: string, control: HTMLElement, hint?: string): HTMLElement {
  const lbl = h('label', { class: 'field' }, [h('span', { class: 'field-label' }, [labelText]), control]);
  if (hint) lbl.append(h('span', { class: 'field-hint' }, [hint]));
  return lbl;
}
