'use strict';

// ---------- Finanzas: un presupuesto personal sencillo ----------
// state.finance = { categories, tx, recurring, currency, hide, seeded, edited }
//   categories: [{ id, name, icon, color, kind: 'gasto'|'ingreso', budget? (céntimos al mes) }]
//   tx:         [{ id, date: 'AAAA-MM-DD', amount (céntimos, entero > 0), kind, categoryId, note, account?, recurringId?, createdAt, updatedAt }]
//   recurring:  [{ id, amount, kind, categoryId, note, day (1–31), active, since, lastRun }]
// Un movimiento borrado queda como { id, date, del: true, updatedAt }: los meses se fusionan por id
// entre dispositivos (fin-AAAA-MM en 19-sincronizacion.js) y así el borrado también llega.

ICONS.coin = '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.4A3 3 0 0 0 12 8c-1.7 0-3 .9-3 2s1.3 1.6 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-2.8-1.4M12 6.5V8M12 16v1.5"/>';

const FIN_DEFAULT_CATS = [
  ['comida', 'Comida', '🍽️', '#2a78d6', 'gasto'],
  ['casa', 'Casa', '🏠', '#eb6834', 'gasto'],
  ['transporte', 'Transporte', '🚌', '#1baf7a', 'gasto'],
  ['ocio', 'Ocio', '🎉', '#eda100', 'gasto'],
  ['salud', 'Salud', '💊', '#e87ba4', 'gasto'],
  ['compras', 'Compras', '🛍️', '#008300', 'gasto'],
  ['suscripciones', 'Suscripciones', '🔁', '#6250d6', 'gasto'],
  ['otros', 'Otros', '📦', '#898781', 'gasto'],
  ['sueldo', 'Sueldo', '💼', '#2a78d6', 'ingreso'],
  ['otros-ingresos', 'Otros ingresos', '💶', '#1baf7a', 'ingreso'],
].map(([id, name, icon, color, kind]) => ({ id: `c-${id}`, name, icon, color, kind }));

// Moneda por defecto según la región del navegador.
const FIN_REGION_CUR = { US: 'USD', GB: 'GBP', MX: 'MXN', AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN', UY: 'UYU', BR: 'BRL', CH: 'CHF', JP: 'JPY', CA: 'CAD', AU: 'AUD', DO: 'DOP', GT: 'GTQ', BO: 'BOB', PY: 'PYG', CR: 'CRC', IN: 'INR', CN: 'CNY', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN' };
const FIN_CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP', 'CLP', 'PEN', 'UYU', 'BRL', 'CHF', 'JPY', 'CAD', 'AUD'];
const finLocale = () => navigator.language || 'es-ES';
const finDefaultCurrency = () => FIN_REGION_CUR[(finLocale().split('-')[1] || '').toUpperCase()] || 'EUR';

function fin() {
  const f = (state.finance ||= {});
  f.categories ||= [];
  f.tx ||= [];
  f.recurring ||= [];
  if (!f.seeded) {
    const have = new Set(f.categories.map((c) => c.id));
    f.categories.push(...FIN_DEFAULT_CATS.filter((c) => !have.has(c.id)).map((c) => ({ ...c })));
    f.currency ||= finDefaultCurrency();
    f.seeded = true;
  }
  return f;
}
const finCurrency = () => fin().currency || finDefaultCurrency();
const finLive = () => fin().tx.filter((t) => !t.del);
const finCat = (id) => fin().categories.find((c) => c.id === id) || { id, name: 'Sin categoría', icon: '❔', color: '#898781', kind: 'gasto' };
const finCatsOf = (kind) => fin().categories.filter((c) => c.kind === kind);
const finFallbackCat = (kind) => fin().categories.find((c) => c.id === (kind === 'ingreso' ? 'c-otros-ingresos' : 'c-otros')) || finCatsOf(kind).at(-1) || null;
const finYm = (key) => key.slice(0, 7);

// ---------- Importes ----------
const finFmts = new Map();
function finNF(opts = {}) {
  const key = `${finCurrency()}|${JSON.stringify(opts)}`;
  if (!finFmts.has(key)) {
    try {
      finFmts.set(key, new Intl.NumberFormat(finLocale(), { style: 'currency', currency: finCurrency(), ...opts }));
    } catch {
      finFmts.set(key, new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', ...opts }));
    }
  }
  return finFmts.get(key);
}
// 2340 → «23,40 €»; con sign, «−23,40 €» o «+23,40 €».
function finMoney(cents, kind) {
  const s = finNF().format((cents || 0) / 100);
  return kind === 'gasto' ? `−${s}` : kind === 'ingreso' ? `+${s}` : s;
}
// Para los campos de texto: «23,40» (sin símbolo ni miles).
const finPlain = (cents) => new Intl.NumberFormat(finLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format((cents || 0) / 100);
const finDecSep = () => (1.5).toLocaleString(finLocale()).charAt(1) === ',' ? ',' : '.';

const FIN_AMOUNT_RE = /^([+\-−]?)(?:[€$£¥]|euros?|EUR|eur|USD|usd|[A-Z]{3})?([+\-−]?)([\d.,]+)(?:[€$£¥]|euros?|EUR|eur|USD|usd|[A-Z]{3})?([\-−]?)$/;
const finGroups = (s, sep) => {
  const [head, ...rest] = s.split(sep);
  return /^\d{1,3}$/.test(head) && rest.every((g) => /^\d{3}$/.test(g));
};
// «12,50», «12.50», «1.234,56», «1,234.56», «€12», «12 €», «-8» → céntimos (positivos); lo demás, null.
function finParseAmount(raw) {
  const m = String(raw ?? '').replace(/\s+/g, '').match(FIN_AMOUNT_RE);
  if (!m || (m[1] && m[2])) return null;
  const n = m[3];
  const dot = n.lastIndexOf('.');
  const comma = n.lastIndexOf(',');
  let int;
  let dec = '';
  if (dot >= 0 && comma >= 0) {
    const d = Math.max(dot, comma);
    const thou = d === dot ? ',' : '.';
    int = n.slice(0, d);
    dec = n.slice(d + 1);
    if (int.includes(n[d]) || !finGroups(int, thou)) return null;
    int = int.split(thou).join('');
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? '.' : ',';
    const parts = n.split(sep);
    if (parts.length > 2) {
      if (!finGroups(n, sep)) return null;
      int = parts.join('');
    } else if (parts[1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0])) int = parts.join(''); // 1.234 → miles
    else [int, dec] = [parts[0] || '0', parts[1]];
  } else int = n;
  if (!/^\d+$/.test(int) || !/^\d{0,2}$/.test(dec)) return null;
  const cents = Number(int) * 100 + Number(`${dec}00`.slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 && cents < 1e13 ? cents : null;
}
// +1 si lleva «+», −1 si lleva «-» (delante o detrás, como en algunos bancos), 0 si no.
const finSign = (raw) => {
  const s = String(raw ?? '').trim();
  return /^\+/.test(s) ? 1 : /^[-−]|[-−]$/.test(s) ? -1 : 0;
};

// Fechas: AAAA-MM-DD, DD/MM, DD/MM/AA(AA); con dots, también DD.MM.AAAA y DD-MM-AAAA (CSV).
function finParseDate(raw, dots = false) {
  const s = String(raw ?? '').trim();
  let y, mo, d;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(dots ? /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/ : /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/))) {
    [d, mo] = [+m[1], +m[2]];
    y = !m[3] ? new Date().getFullYear() : m[3].length === 2 ? 2000 + +m[3] : +m[3];
  } else return null;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dateKey(dt) : null;
}
function finWordDate(w) {
  const f = fold(w);
  if (f === 'hoy') return dateKey();
  if (f === 'ayer') return dateKey(addDays(new Date(), -1));
  if (f === 'anteayer') return dateKey(addDays(new Date(), -2));
  return finParseDate(w);
}

// Texto libre: «12,50 café comida», «+1500 sueldo», «ayer 30 gasolina transporte».
// → { cents, kind, categoryId (o null), note, date (o null) }, o null si no hay importe.
function finParseText(text, defKind = 'gasto') {
  const rest = [];
  let cents = null;
  let sign = 0;
  let date = null;
  for (const w of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    if (cents === null) {
      const c = finParseAmount(w);
      if (c !== null) {
        [cents, sign] = [c, finSign(w)];
        continue;
      }
    }
    if (!date) {
      const d = finWordDate(w);
      if (d) {
        date = d;
        continue;
      }
    }
    if (/^(?:[€$£¥]|euros?|EUR|eur)$/.test(w)) continue;
    rest.push(w);
  }
  if (cents === null) return null;
  // Categoría: la última palabra (o palabras) que coincida con su nombre (también en plural o singular).
  const words = rest.map((w) => fold(w).replace(/^[«"'(]+|[.,;:!?»"')]+$/g, ''));
  const same = (a, b) => a === b || `${a}s` === b || `${a}es` === b || `${b}s` === a || `${b}es` === a;
  let cat = null;
  let at = -1;
  let len = 0;
  for (const c of fin().categories) {
    const cw = fold(c.name).split(/\s+/);
    for (let i = words.length - cw.length; i >= 0; i--) {
      if (!cw.every((x, j) => same(words[i + j], x))) continue;
      if (i > at || (i === at && cw.length > len)) [cat, at, len] = [c, i, cw.length];
      break;
    }
  }
  const kind = sign > 0 ? 'ingreso' : sign < 0 ? 'gasto' : cat ? cat.kind : defKind;
  if (cat && cat.kind === kind) rest.splice(at, len);
  else cat = null;
  return { cents, kind, categoryId: cat?.id || null, note: rest.join(' '), date };
}

// ---------- Cambios (con «Deshacer») ----------
// withUndo devuelve los movimientos tal como estaban, con su updatedAt de entonces: al deshacer se
// marcan como cambiados ahora (y lo añadido se borra con marca), para que la fusión entre dispositivos
// no vuelva a dar por buena la versión deshecha.
function finUndo(message, change) {
  let after = null;
  withUndo(message, () => {
    change();
    fin().edited = true;
    after = new Map(fin().tx.map((t) => [t.id, JSON.stringify(t)]));
  });
  $('#toast .toast-action')?.addEventListener('click', () => {
    const f = fin();
    const now = Date.now();
    f.tx.forEach((t) => {
      if (after.get(t.id) !== JSON.stringify(t)) t.updatedAt = now;
    });
    const ids = new Set(f.tx.map((t) => t.id));
    for (const [id, json] of after) if (!ids.has(id)) f.tx.push({ id, date: JSON.parse(json).date, del: true, updatedAt: now });
    save();
    renderAll();
  });
}

function finSaveMeta(change) {
  change();
  fin().edited = true;
  save();
  renderAll();
}

// Con «Ocultar importes», los avisos y la búsqueda no dicen la cantidad.
const finHidden = () => !!state.finance?.hide;
const finOf = (cents) => (finHidden() ? '' : ` de ${finMoney(cents)}`);

function finAddTx(o, { toast = true } = {}) {
  const now = Date.now();
  const t = { id: uid(), date: o.date || dateKey(), amount: o.cents ?? o.amount, kind: o.kind, categoryId: o.categoryId || finFallbackCat(o.kind)?.id || null, note: (o.note || '').trim(), createdAt: now, updatedAt: now };
  if (o.account) t.account = o.account;
  const label = `${t.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}${finOf(t.amount)} en ${finCat(t.categoryId).name}${t.date !== dateKey() ? ` (${dayLabel(t.date).toLowerCase()})` : ''}`;
  if (toast) finUndo(`${label} añadido`, () => fin().tx.push(t));
  else {
    fin().tx.push(t);
    fin().edited = true;
    save();
    renderAll();
  }
  return t;
}

function finUpdateTx(id, patch, message = 'Movimiento actualizado') {
  finUndo(message, () => {
    const t = fin().tx.find((x) => x.id === id);
    if (t) Object.assign(t, patch, { updatedAt: Date.now() });
  });
}

function finDeleteTx(id) {
  const t = fin().tx.find((x) => x.id === id);
  if (!t) return;
  finUndo(`Movimiento${finOf(t.amount)} eliminado`, () => {
    const f = fin();
    f.tx[f.tx.indexOf(t)] = { id: t.id, date: t.date, del: true, updatedAt: Date.now() };
  });
}

function finDuplicateTx(id) {
  const t = fin().tx.find((x) => x.id === id);
  if (!t) return;
  const now = Date.now();
  const copy = { ...t, id: uid(), createdAt: now, updatedAt: now };
  delete copy.recurringId;
  finUndo('Movimiento duplicado', () => fin().tx.push(copy));
}

// ---------- Resumen del mes ----------
function finDaysLeft(ym) {
  const today = dateKey();
  const [y, m] = ym.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  if (ym < finYm(today)) return 0;
  if (ym > finYm(today)) return dim;
  return dim - Number(today.slice(8)) + 1;
}

function finSummary(ym) {
  const list = finLive().filter((t) => t.date.startsWith(ym));
  let inc = 0;
  let exp = 0;
  const byCat = new Map();
  for (const t of list) {
    if (t.kind === 'ingreso') inc += t.amount;
    else {
      exp += t.amount;
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount);
    }
  }
  const budgets = finCatsOf('gasto').filter((c) => c.budget > 0).map((c) => {
    const spent = byCat.get(c.id) || 0;
    const pct = spent / c.budget;
    return { cat: c, spent, budget: c.budget, pct, state: pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok' };
  });
  const budgetTotal = budgets.reduce((s, b) => s + b.budget, 0);
  const budgetSpent = budgets.reduce((s, b) => s + b.spent, 0);
  return { list, inc, exp, balance: inc - exp, byCat, budgets, budgetTotal, left: budgetTotal - budgetSpent, daysLeft: finDaysLeft(ym) };
}

const finShiftYm = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const finMonthName = (ym, opts = { month: 'long', year: 'numeric' }) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es', opts).replace(' de ', ' ');
};

// ---------- Gastos fijos ----------
// Cada uno crea como mucho un movimiento al mes, con id fijo (rec-<id>-<AAAA-MM>) e igual en todos
// los dispositivos: si dos lo crean, la fusión por id deja uno. Fecha de «hecho» fija (medianoche UTC
// del día) para que cualquier cambio a mano gane.
function finRunRecurring(today = dateKey()) {
  const f = fin();
  const ids = new Set(f.tx.map((t) => t.id));
  let made = 0;
  let touched = false;
  for (const r of f.recurring) {
    if (!r.active || r.lastRun === today) continue;
    const since = r.since || today;
    let ym = finYm(r.lastRun && r.lastRun > since ? r.lastRun : since);
    if (ym < finShiftYm(finYm(today), -12)) ym = finShiftYm(finYm(today), -12);
    for (; ym <= finYm(today); ym = finShiftYm(ym, 1)) {
      const [y, m] = ym.split('-').map(Number);
      const date = `${ym}-${String(Math.min(r.day, new Date(y, m, 0).getDate())).padStart(2, '0')}`;
      const id = `rec-${r.id}-${ym}`;
      if (date < since || date > today || ids.has(id)) continue;
      const at = Date.parse(`${date}T00:00:00Z`);
      f.tx.push({ id, date, amount: r.amount, kind: r.kind, categoryId: r.categoryId, note: r.note || '', recurringId: r.id, createdAt: at, updatedAt: at });
      ids.add(id);
      made++;
    }
    r.lastRun = today;
    touched = true;
  }
  if (touched) save();
  return made;
}

function finNextRun(r) {
  const today = dateKey();
  for (let ym = finYm(today), i = 0; i < 3; i++, ym = finShiftYm(ym, 1)) {
    const [y, m] = ym.split('-').map(Number);
    const date = `${ym}-${String(Math.min(r.day, new Date(y, m, 0).getDate())).padStart(2, '0')}`;
    if (date >= today && !fin().tx.some((t) => t.id === `rec-${r.id}-${ym}`)) return date;
  }
  return null;
}

// ---------- CSV ----------
const finCsvSep = () => (finDecSep() === ',' ? ';' : ',');
// Texto que empieza por = + - @ (o tabulador): con «'» delante, para que la hoja no lo tome por fórmula.
const finCsvCell = (v, sep, num = false) => {
  let s = String(v ?? '');
  if (!num && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const finTxOrder = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id));

// Con BOM, para que Excel y Hojas de cálculo abran bien las tildes; «;» donde la coma es decimal.
function finCsv(ym = null) {
  const sep = finCsvSep();
  const rows = finLive().filter((t) => !ym || t.date.startsWith(ym)).sort(finTxOrder);
  const lines = [['Fecha', 'Tipo', 'Categoría', 'Importe', 'Nota'], ...rows.map((t) => [t.date, t.kind === 'ingreso' ? 'Ingreso' : 'Gasto', finCat(t.categoryId).name, finPlain(t.amount), t.note || ''])];
  return `﻿${lines.map((r) => r.map((c, i) => finCsvCell(c, sep, i === 3)).join(sep)).join('\r\n')}\r\n`;
}

function finExport(ym = null) {
  const n = finLive().filter((t) => !ym || t.date.startsWith(ym)).length;
  if (!n) return showToastMessage(ym ? 'No hay movimientos en este mes.' : 'Aún no hay movimientos.');
  offerDownload(`finanzas-${ym || 'todo'}.csv`, finCsv(ym), 'text/csv;charset=utf-8');
}

// Lee un CSV (separador «;», «,» o tabulador, con comillas).
function finCsvParse(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const count = (c) => first.split(c).length;
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      [row, cell] = [[], ''];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return { sep, rows };
}

const FIN_COLS = [
  ['date', 'Fecha', /fecha|date|dia\b|valor$/],
  ['amount', 'Importe', /importe|amount|cantidad|monto|euros|^(cargo|debe|debito|debit|abono|haber|credito|credit)\b/],
  ['note', 'Nota', /concepto|descrip|nota|note|detalle|movimiento|memo|texto|comercio/],
  ['category', 'Categoría', /categor/],
  ['kind', 'Tipo', /^tipo|type/],
];
function finGuessColumns(header) {
  const map = {};
  const used = new Set();
  const find = (re) => header.findIndex((h, j) => !used.has(j) && re.test(fold(String(h).trim())));
  for (const [key, , re] of FIN_COLS) {
    // «Importe» o «Amount» a secas gana a cualquier otra columna que lo contenga.
    const exact = key === 'amount' ? find(/^(importe|amount)$/) : -1;
    const i = exact >= 0 ? exact : find(re);
    map[key] = i;
    if (i >= 0) used.add(i);
  }
  return map;
}

// Filas → movimientos. Duplicado: misma fecha, importe y nota que uno que ya existe (o que otra fila).
function finImportPlan(rows, map, header = true) {
  const keyOf = (date, cents, note) => `${date}|${cents}|${fold(String(note || '')).trim()}`;
  const have = new Map();
  finLive().forEach((t) => have.set(keyOf(t.date, t.amount, t.note), (have.get(keyOf(t.date, t.amount, t.note)) || 0) + 1));
  const byName = new Map(fin().categories.map((c) => [fold(c.name), c]));
  // Bancos con columnas «Cargo»/«Abono» (o Debe/Haber, Débito/Crédito): la columna dice el tipo.
  const names = header ? rows[0].map((h) => fold(String(h ?? '').trim())) : [];
  const side = (i) => (/^(cargo|debe|debito|debit)\b/.test(names[i] || '') ? 'gasto' : /^(abono|haber|credito|credit)\b/.test(names[i] || '') ? 'ingreso' : '');
  const pair = side(map.amount) ? names.findIndex((h, i) => i !== map.amount && side(i) && side(i) !== side(map.amount)) : -1;
  return rows.slice(header ? 1 : 0).map((r) => {
    const cell = (k) => (map[k] >= 0 ? String(r[map[k]] ?? '').trim() : '');
    const date = finParseDate(cell('date'), true);
    let amt = cell('amount');
    let forced = side(map.amount);
    if (!amt && pair >= 0 && String(r[pair] ?? '').trim()) [amt, forced] = [String(r[pair]).trim(), side(pair)];
    const cents = finParseAmount(amt);
    if (!date) return { raw: r, err: 'Fecha no válida' };
    if (cents === null) return { raw: r, err: 'Importe no válido' };
    const k = fold(cell('kind'));
    const kind = forced || (/ingreso|income|abono|haber|credit/.test(k) ? 'ingreso' : /gasto|expense|cargo|debe|debit/.test(k) ? 'gasto' : finSign(amt) < 0 ? 'gasto' : 'ingreso');
    const named = byName.get(fold(cell('category')));
    const categoryId = (named && named.kind === kind ? named : finFallbackCat(kind))?.id || null;
    const note = cell('note');
    const key = keyOf(date, cents, note);
    const dup = (have.get(key) || 0) > 0;
    if (dup) have.set(key, have.get(key) - 1);
    return { raw: r, dup, tx: { date, cents, kind, categoryId, note } };
  });
}

function finImportApply(plan, withDups = false) {
  const now = Date.now();
  const add = plan.filter((p) => p.tx && (withDups || !p.dup)).map((p, i) => ({ id: uid() + i, date: p.tx.date, amount: p.tx.cents, kind: p.tx.kind, categoryId: p.tx.categoryId, note: p.tx.note, account: 'CSV', createdAt: now, updatedAt: now }));
  if (!add.length) return showToastMessage('No hay movimientos nuevos que importar.'), 0;
  finUndo(`${plural(add.length, 'movimiento importado', 'movimientos importados')}`, () => fin().tx.push(...add));
  return add.length;
}

function finPickImport() {
  const input = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (file) finImportDialog(await file.text(), file.name);
  });
  document.body.append(input);
  input.click();
}

// ---------- Diálogos ----------
function finDialog(title, body, { onSave, onDelete, saveLabel = 'Guardar', deleteLabel = 'Eliminar', wide = false } = {}) {
  $('#fin-dialog')?.remove();
  const ret = document.activeElement;
  const close = () => {
    back.remove();
    if (ret?.isConnected && ret.offsetParent !== null) ret.focus({ preventScroll: true });
  };
  const x = el('button', { className: 'iv-close modal-x', type: 'button', ariaLabel: 'Cerrar' }, '✕');
  const err = el('p', { className: 'fin-err', role: 'alert' });
  const foot = el('div', { className: 'fin-dlg-foot' }, [
    onDelete ? el('button', { type: 'button', className: 'fin-del' }, deleteLabel) : '',
    el('span', { className: 'rib-spacer' }),
    el('button', { type: 'button', className: 'fin-cancel' }, 'Cancelar'),
    onSave ? el('button', { type: 'submit', className: 'primary' }, saveLabel) : '',
  ]);
  const form = el('form', { className: 'fin-dlg-body' }, [...[].concat(body), err, foot]);
  const dialog = el('div', { className: `modal fin-modal${wide ? ' wide' : ''}`, role: 'dialog' }, [el('header', { className: 'modal-head' }, [el('h3', { id: 'fin-dialog-title' }, title), x]), form]);
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'fin-dialog-title');
  const back = el('div', { id: 'fin-dialog', className: 'modal-back' }, dialog);
  x.addEventListener('click', close);
  foot.querySelector('.fin-cancel').addEventListener('click', close);
  foot.querySelector('.fin-del')?.addEventListener('click', () => {
    close();
    onDelete();
  });
  back.addEventListener('click', (e) => e.target === back && close());
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = onSave?.();
    if (typeof msg === 'string') err.textContent = msg;
    else close();
  });
  document.body.append(back);
  (form.querySelector('input:not([type=checkbox]), select') || form.querySelector('button'))?.focus();
  return { back, form, close };
}

const finField = (label, input, cls = '') => el('label', { className: `fin-field ${cls}` }, [el('span', {}, label), input]);
const finSelect = (options, value) => {
  const s = el('select', {}, options.map(([v, t]) => el('option', { value: v }, t)));
  s.value = value ?? '';
  return s;
};
const finCatOptions = (kind) => finCatsOf(kind).map((c) => [c.id, `${c.icon} ${c.name}`]);
// Tipo + categoría: al cambiar el tipo, cambian las categorías.
function finKindCat(kind, catId) {
  const kindSel = finSelect([['gasto', '− Gasto'], ['ingreso', '+ Ingreso']], kind);
  const catSel = finSelect(finCatOptions(kind), catId);
  if (!catSel.value) catSel.value = finFallbackCat(kind)?.id || '';
  kindSel.addEventListener('change', () => {
    catSel.replaceChildren(...finCatOptions(kindSel.value).map(([v, t]) => el('option', { value: v }, t)));
    catSel.value = finFallbackCat(kindSel.value)?.id || '';
  });
  return [kindSel, catSel];
}

function finEditTx(id) {
  const t = fin().tx.find((x) => x.id === id && !x.del);
  if (!t) return;
  const [kindSel, catSel] = finKindCat(t.kind, t.categoryId);
  const amount = el('input', { type: 'text', value: finPlain(t.amount), inputMode: 'decimal', autocomplete: 'off', className: 'fin-amount-in' });
  const date = el('input', { type: 'date', value: t.date });
  const note = el('input', { type: 'text', value: t.note || '', maxLength: 200, placeholder: 'Nota' });
  finDialog('Editar movimiento', [finField('Tipo', kindSel), finField('Importe', amount), finField('Categoría', catSel), finField('Fecha', date), finField('Nota', note, 'full')], {
    onSave: () => {
      const cents = finParseAmount(amount.value);
      if (cents === null) return 'Escribe un importe válido, p. ej. 12,50';
      if (!finParseDate(date.value)) return 'Elige una fecha';
      finUpdateTx(id, { amount: cents, kind: kindSel.value, categoryId: catSel.value, date: date.value, note: note.value.trim() });
    },
    onDelete: () => finDeleteTx(id),
  });
}

const FIN_EMOJI = ['🍽️', '🛒', '☕', '🏠', '💡', '🚌', '⛽', '🎉', '🎬', '💊', '🛍️', '👕', '🔁', '📱', '🎁', '✈️', '📚', '🐶', '👶', '💼', '💶', '📦'];
function finEditCat(id, kind = 'gasto') {
  const c = id ? fin().categories.find((x) => x.id === id) : null;
  const name = el('input', { type: 'text', value: c?.name || '', maxLength: 40, required: true, placeholder: 'Nombre' });
  const icon = el('input', { type: 'text', value: c?.icon || '📦', maxLength: 8, className: 'fin-icon-in', ariaLabel: 'Icono' });
  const emoji = el('div', { className: 'fin-emoji' }, FIN_EMOJI.map((e) => {
    const b = el('button', { type: 'button', className: 'chip' }, e);
    b.addEventListener('click', () => (icon.value = e));
    return b;
  }));
  const color = el('input', { type: 'color', value: c?.color || '#2a78d6' });
  const kindSel = finSelect([['gasto', 'Gasto'], ['ingreso', 'Ingreso']], c?.kind || kind);
  const budget = el('input', { type: 'text', value: c?.budget ? finPlain(c.budget) : '', inputMode: 'decimal', placeholder: 'Sin presupuesto' });
  const budgetField = finField('Presupuesto al mes', budget);
  const sync = () => (budgetField.hidden = kindSel.value !== 'gasto');
  kindSel.addEventListener('change', sync);
  sync();
  finDialog(c ? 'Editar categoría' : 'Nueva categoría', [finField('Nombre', name), finField('Icono', icon), emoji, finField('Color', color), finField('Tipo', kindSel), budgetField], {
    onSave: () => {
      const n = name.value.trim();
      if (!n) return 'Ponle un nombre';
      if (fin().categories.some((x) => x !== c && fold(x.name) === fold(n))) return 'Ya hay una categoría con ese nombre';
      const b = budget.value.trim() && kindSel.value === 'gasto' ? finParseAmount(budget.value) : 0;
      if (b === null) return 'Escribe un presupuesto válido, p. ej. 300';
      const data = { name: n, icon: icon.value.trim() || '📦', color: color.value, kind: kindSel.value };
      finUndo(c ? 'Categoría actualizada' : `Categoría «${n}» creada`, () => {
        const cat = c ? fin().categories.find((x) => x.id === c.id) : { id: `c-${uid()}` };
        Object.assign(cat, data);
        if (b) cat.budget = b;
        else delete cat.budget;
        if (!c) fin().categories.push(cat);
      });
    },
    onDelete: c ? () => finDeleteCat(c.id) : null,
  });
}

// Si tiene movimientos (o gastos fijos), pregunta a qué categoría pasarlos.
function finDeleteCat(id) {
  const c = fin().categories.find((x) => x.id === id);
  if (!c) return;
  const used = finLive().filter((t) => t.categoryId === id).length + fin().recurring.filter((r) => r.categoryId === id).length;
  const remove = (to) => finUndo(`Categoría «${c.name}» eliminada`, () => {
    const f = fin();
    const now = Date.now();
    f.tx.forEach((t) => {
      if (!t.del && t.categoryId === id) Object.assign(t, { categoryId: to, updatedAt: now });
    });
    f.recurring.forEach((r) => r.categoryId === id && (r.categoryId = to));
    f.categories = f.categories.filter((x) => x.id !== id);
  });
  const others = fin().categories.filter((x) => x.id !== id && x.kind === c.kind);
  if (!used) return remove(null);
  if (!others.length) return showToastMessage('Crea antes otra categoría del mismo tipo para pasarle sus movimientos.');
  const to = finSelect(others.map((x) => [x.id, `${x.icon} ${x.name}`]), (finFallbackCat(c.kind)?.id !== id && finFallbackCat(c.kind)?.id) || others[0].id);
  finDialog(`Eliminar «${c.name}»`, [el('p', {}, `Tiene ${plural(used, 'movimiento o gasto fijo', 'movimientos o gastos fijos')}. ¿A qué categoría los pasamos?`), finField('Mover a', to, 'full')], {
    saveLabel: 'Mover y eliminar',
    onSave: () => remove(to.value),
  });
}

function finEditRecurring(id) {
  const r = id ? fin().recurring.find((x) => x.id === id) : null;
  const [kindSel, catSel] = finKindCat(r?.kind || 'gasto', r?.categoryId);
  const amount = el('input', { type: 'text', value: r ? finPlain(r.amount) : '', inputMode: 'decimal', placeholder: '650', autocomplete: 'off' });
  const note = el('input', { type: 'text', value: r?.note || '', maxLength: 120, placeholder: 'Alquiler, gimnasio…' });
  const day = el('input', { type: 'number', min: 1, max: 31, value: r?.day || Number(dateKey().slice(8)) });
  const active = el('input', { type: 'checkbox', checked: r ? r.active !== false : true });
  finDialog(r ? 'Editar gasto fijo' : 'Nuevo gasto fijo', [finField('Concepto', note, 'full'), finField('Importe', amount), finField('Día del mes', day), finField('Tipo', kindSel), finField('Categoría', catSel), el('label', { className: 'fin-check full' }, [active, ' Activo (se apunta solo cada mes)'])], {
    onSave: () => {
      const cents = finParseAmount(amount.value);
      if (cents === null) return 'Escribe un importe válido, p. ej. 650';
      const d = Math.round(Number(day.value));
      if (!(d >= 1 && d <= 31)) return 'El día va del 1 al 31';
      finUndo(r ? 'Gasto fijo actualizado' : 'Gasto fijo creado', () => {
        const rec = r ? fin().recurring.find((x) => x.id === r.id) : { id: uid(), since: dateKey(), lastRun: null };
        const wasActive = rec.active;
        Object.assign(rec, { amount: cents, kind: kindSel.value, categoryId: catSel.value, note: note.value.trim(), day: d, active: active.checked });
        if (r && active.checked && !wasActive) Object.assign(rec, { since: dateKey(), lastRun: null });
        if (!r) fin().recurring.push(rec);
      });
      if (finRunRecurring()) renderAll();
    },
    onDelete: r ? () => finUndo('Gasto fijo eliminado', () => (fin().recurring = fin().recurring.filter((x) => x.id !== r.id))) : null,
  });
}

function finToggleRecurring(id) {
  const r = fin().recurring.find((x) => x.id === id);
  if (!r) return;
  finSaveMeta(() => {
    r.active = !r.active;
    // Al reanudar no se apuntan los meses en pausa.
    if (r.active) Object.assign(r, { since: dateKey(), lastRun: null });
  });
  if (r.active && finRunRecurring()) renderAll();
  showToastMessage(r.active ? 'Gasto fijo reanudado' : 'Gasto fijo en pausa');
}

function finCurrencyDialog() {
  const cur = finCurrency();
  const sel = finSelect([...new Set([cur, ...FIN_CURRENCIES])].map((c) => [c, c]), cur);
  finDialog('Moneda', [finField('Moneda de los importes', sel, 'full')], { onSave: () => finSaveMeta(() => (fin().currency = sel.value)) });
}

function finSetHidden(on = !fin().hide) {
  finSaveMeta(() => (fin().hide = on));
}

function finImportDialog(text, filename = 'CSV') {
  const { rows } = finCsvParse(text);
  if (!rows.length) return showToastMessage('El archivo está vacío.');
  const width = Math.max(...rows.map((r) => r.length));
  const header = el('input', { type: 'checkbox', checked: true });
  const guess = finGuessColumns(rows[0]);
  if (guess.date < 0 && guess.amount < 0) header.checked = false;
  const colName = (i) => (header.checked ? String(rows[0][i] || '').trim() || `Columna ${i + 1}` : `Columna ${i + 1}`);
  const selects = {};
  const mapRow = el('div', { className: 'fin-map' });
  const summary = el('p', { className: 'fin-import-sum', ariaLive: 'polite' });
  const dups = el('input', { type: 'checkbox' });
  const table = el('div', { className: 'fin-import-preview' });
  let plan = [];
  const buildSelects = () => {
    mapRow.replaceChildren(...FIN_COLS.map(([key, label]) => {
      const prev = selects[key]?.value;
      const s = finSelect([['-1', '—'], ...Array.from({ length: width }, (_, i) => [String(i), colName(i)])], prev ?? String(guess[key] ?? -1));
      s.addEventListener('change', update);
      selects[key] = s;
      return finField(label + (key === 'date' || key === 'amount' ? ' *' : ''), s);
    }));
  };
  function update() {
    const map = Object.fromEntries(Object.entries(selects).map(([k, s]) => [k, Number(s.value)]));
    plan = finImportPlan(rows, map, header.checked);
    const ok = plan.filter((p) => p.tx && !p.dup).length;
    const dup = plan.filter((p) => p.dup).length;
    const bad = plan.filter((p) => p.err).length;
    summary.textContent = `${plural(ok, 'nuevo', 'nuevos')} · ${plural(dup, 'duplicado', 'duplicados')} · ${plural(bad, 'fila con errores', 'filas con errores')}`;
    const head = el('tr', {}, ['Fecha', 'Tipo', 'Categoría', 'Importe', 'Nota', 'Estado'].map((h) => el('th', {}, h)));
    const body = plan.slice(0, 60).map((p) => el('tr', { className: p.err ? 'err' : p.dup ? 'dup' : '' }, p.err
      ? [el('td', { colSpan: 5 }, p.raw.join(' · ')), el('td', {}, `⚠️ ${p.err}`)]
      : [p.tx.date, p.tx.kind === 'ingreso' ? 'Ingreso' : 'Gasto', finCat(p.tx.categoryId).name, finAmt(finMoney(p.tx.cents)), p.tx.note, p.dup ? '⧉ Duplicado' : '✓ Nuevo'].map((v) => el('td', {}, v))));
    table.replaceChildren(el('table', {}, [el('thead', {}, head), el('tbody', {}, body)]), plan.length > 60 ? el('p', { className: 'muted' }, `… y ${plan.length - 60} filas más`) : '');
    const n = plan.filter((p) => p.tx && (dups.checked || !p.dup)).length;
    const btn = $('#fin-dialog button[type=submit]');
    if (btn) {
      btn.textContent = `Importar ${plural(n, 'movimiento', 'movimientos')}`;
      btn.disabled = !n;
    }
  }
  header.addEventListener('change', () => {
    buildSelects();
    update();
  });
  dups.addEventListener('change', update);
  buildSelects();
  finDialog(`Importar ${filename}`, [
    el('p', { className: 'muted full' }, 'Elige qué columna es cada cosa. Los importes negativos se toman como gastos y los positivos como ingresos (salvo que haya una columna de tipo).'),
    el('label', { className: 'fin-check full' }, [header, ' La primera fila son los nombres de las columnas']),
    mapRow, summary,
    el('label', { className: 'fin-check full' }, [dups, ' Importar también los duplicados (misma fecha, importe y nota)']),
    table,
  ], { wide: true, saveLabel: 'Importar', onSave: () => (finImportApply(plan, dups.checked) ? undefined : 'No hay nada que importar') });
  update();
}

// ---------- La sección ----------
let finMonthSel = finYm(dateKey());
let finKindSel = 'gasto';
let finChipCat = null;
const finFilter = { cat: '', q: '' };

function finBuild() {
  const root = $('#view-finanzas');
  if (root.dataset.built) return root;
  root.dataset.built = '1';
  const btn = (id, text, attrs = {}) => el('button', { id, type: 'button', ...attrs }, text);
  const nav = el('div', { className: 'fin-monthnav' }, [
    btn('fin-prev', '‹', { className: 'nav-btn', ariaLabel: 'Mes anterior' }),
    el('span', { id: 'fin-month', className: 'fin-month', ariaLive: 'polite' }),
    btn('fin-next', '›', { className: 'nav-btn', ariaLabel: 'Mes siguiente' }),
    btn('fin-now', 'Este mes', { className: 'chip' }),
  ]);
  const tools = el('div', { className: 'fin-tools' }, [
    btn('fin-hide', '👁 Ocultar importes', { className: 'chip', title: 'Difumina los importes (pasa el ratón o toca para verlos)' }),
    btn('fin-more', '⋯ Más', { className: 'chip', ariaHasPopup: 'menu' }),
  ]);
  const kinds = el('div', { className: 'fin-kind', role: 'group', ariaLabel: 'Tipo' }, [
    btn('', '− Gasto', { className: 'chip' }),
    btn('', '+ Ingreso', { className: 'chip' }),
  ]);
  kinds.children[0].dataset.kind = 'gasto';
  kinds.children[1].dataset.kind = 'ingreso';
  const form = el('form', { id: 'fin-form', className: 'card fin-add', autocomplete: 'off' }, [
    kinds,
    el('input', { id: 'fin-amount', type: 'text', placeholder: '12,50  ·  o escribe «12,50 café comida»', ariaLabel: 'Importe (o texto: «12,50 café comida», «+1500 sueldo»)', maxLength: 200, autocomplete: 'off' }),
    el('select', { id: 'fin-cat', ariaLabel: 'Categoría' }),
    el('input', { id: 'fin-note', type: 'text', placeholder: 'Nota (opcional)', ariaLabel: 'Nota', maxLength: 200 }),
    el('input', { id: 'fin-date', type: 'date', ariaLabel: 'Fecha' }),
    el('button', { type: 'submit', className: 'primary' }, 'Añadir'),
    el('div', { id: 'fin-chips', className: 'fin-chips', role: 'group', ariaLabel: 'Categorías más usadas' }),
    el('div', { id: 'fin-preview', className: 'fin-preview muted', ariaLive: 'polite' }),
  ]);
  const head = (title, extra = []) => el('h2', { className: 'section-title fin-sec' }, [el('span', {}, title), ...extra]);
  const filterCat = el('select', { id: 'fin-filter-cat', ariaLabel: 'Filtrar por categoría' });
  const filterQ = el('input', { id: 'fin-filter-q', type: 'search', placeholder: 'Buscar…', ariaLabel: 'Buscar en los movimientos' });
  const addRec = btn('fin-add-rec', '＋ Añadir', { className: 'chip' });
  const addCat = btn('fin-add-cat', '＋ Nueva', { className: 'chip' });
  root.replaceChildren(
    el('div', { className: 'fin-top' }, [el('h2', { className: 'section-title first' }, '💰 Finanzas'), nav, tools]),
    el('div', { id: 'fin-cards', className: 'stats fin-cards' }),
    form,
    head('Presupuestos'), el('div', { id: 'fin-budgets', className: 'card fin-budgets' }),
    head('Gráficos'), el('div', { id: 'fin-charts', className: 'fin-charts' }),
    head('Movimientos', [el('span', { className: 'fin-filters' }, [filterCat, filterQ])]), el('div', { id: 'fin-list', className: 'fin-list' }),
    head('Gastos fijos', [addRec]), el('div', { id: 'fin-rec', className: 'card fin-rec' }),
    head('Categorías', [addCat]), el('div', { id: 'fin-cats', className: 'card fin-cats' }),
  );
  $('#fin-date').value = dateKey();
  $('#fin-prev').addEventListener('click', () => finGoMonth(finShiftYm(finMonthSel, -1)));
  $('#fin-next').addEventListener('click', () => finGoMonth(finShiftYm(finMonthSel, 1)));
  $('#fin-now').addEventListener('click', () => finGoMonth(finYm(dateKey())));
  $('#fin-hide').addEventListener('click', () => finSetHidden());
  $('#fin-more').addEventListener('click', (e) => showMenu(e.currentTarget, finMoreItems()));
  kinds.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    finKindSel = b.dataset.kind;
    finChipCat = null;
    finRenderForm();
    $('#fin-amount').focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finSubmitForm();
  });
  ['fin-amount', 'fin-note', 'fin-date', 'fin-cat'].forEach((id) => $(`#${id}`).addEventListener('input', finRenderPreview));
  $('#fin-cat').addEventListener('change', () => {
    finChipCat = $('#fin-cat').value;
    finRenderChips();
    finRenderPreview();
  });
  filterCat.addEventListener('change', () => {
    finFilter.cat = filterCat.value;
    finRenderList();
  });
  filterQ.addEventListener('input', () => {
    finFilter.q = filterQ.value;
    finRenderList();
  });
  addRec.addEventListener('click', () => finEditRecurring(null));
  addCat.addEventListener('click', () => finEditCat(null));
  $('#fin-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-tx]');
    if (row) finEditTx(row.dataset.tx);
  });
  $('#fin-list').addEventListener('contextmenu', (e) => {
    const row = e.target.closest('[data-tx]');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    let { clientX: x, clientY: y } = e;
    if (!x && !y) {
      const r = row.getBoundingClientRect();
      [x, y] = [r.left + 12, r.bottom];
    }
    showMenu({ x, y }, finTxMenu(row.dataset.tx, x, y));
  });
  return root;
}

function finTxMenu(id, x, y) {
  const t = fin().tx.find((v) => v.id === id);
  if (!t) return [];
  return [
    { label: '✏️ Editar', action: () => finEditTx(id) },
    { label: '⧉ Duplicar', action: () => finDuplicateTx(id) },
    { label: '🏷️ Cambiar categoría ▸', action: () => showMenu({ x, y }, finCatsOf(t.kind).map((c) => ({ label: `${c.id === t.categoryId ? '✓ ' : ''}${c.icon} ${c.name}`, disabled: c.id === t.categoryId, action: () => finUpdateTx(id, { categoryId: c.id }, `Movido a ${c.name}`) }))) },
    { sep: true },
    { label: '🗑 Eliminar', danger: true, action: () => finDeleteTx(id) },
  ];
}

function finMoreItems() {
  return [
    { label: `⬇️ Exportar CSV de ${finMonthName(finMonthSel)}`, action: () => finExport(finMonthSel) },
    { label: '⬇️ Exportar todo (CSV)', action: () => finExport() },
    { label: '⬆️ Importar CSV del banco…', action: finPickImport },
    { sep: true },
    { label: `💱 Moneda: ${finCurrency()}…`, action: finCurrencyDialog },
    { label: fin().hide ? '👁 Mostrar importes' : '🙈 Ocultar importes', action: () => finSetHidden() },
  ];
}

function finGoMonth(ym) {
  finMonthSel = ym;
  renderFinance();
}

// Lo que dice el formulario: importe solo (con los campos) o texto libre («12,50 café comida»).
function finReadForm() {
  const raw = $('#fin-amount').value.trim();
  if (!raw) return null;
  const cents = finParseAmount(raw);
  const sel = $('#fin-cat').value;
  const formDate = finParseDate($('#fin-date').value) || dateKey();
  if (cents !== null) {
    const sign = finSign(raw);
    const kind = sign > 0 ? 'ingreso' : sign < 0 ? 'gasto' : finKindSel;
    const catOk = finCat(sel).kind === kind && fin().categories.some((c) => c.id === sel);
    return { cents, kind, categoryId: catOk ? sel : finFallbackCat(kind)?.id, note: $('#fin-note').value.trim(), date: formDate };
  }
  const p = finParseText(raw, finKindSel);
  if (!p) return { error: 'No encuentro el importe. Prueba «12,50» o «12,50 café comida».' };
  const catOk = finCat(sel).kind === p.kind && fin().categories.some((c) => c.id === sel);
  return { ...p, categoryId: p.categoryId || (catOk ? sel : finFallbackCat(p.kind)?.id), note: [p.note, $('#fin-note').value.trim()].filter(Boolean).join(' · '), date: p.date || formDate };
}

function finSubmitForm() {
  const r = finReadForm();
  const input = $('#fin-amount');
  if (!r || r.error) {
    input.ariaInvalid = 'true';
    $('#fin-preview').textContent = r?.error || 'Escribe un importe, p. ej. 12,50';
    return input.focus();
  }
  input.ariaInvalid = 'false';
  finAddTx(r);
  input.value = '';
  $('#fin-note').value = '';
  $('#fin-date').value = dateKey();
  finRenderPreview();
  input.focus();
}

function finRenderPreview() {
  const box = $('#fin-preview');
  if (!box) return;
  const r = finReadForm();
  $('#fin-amount').ariaInvalid = 'false';
  if (!r) return (box.textContent = 'Enter guarda. También vale texto: «12,50 café comida», «+1500 sueldo», «ayer 30 gasolina transporte».');
  if (r.error) return (box.textContent = r.error);
  const c = finCat(r.categoryId);
  box.replaceChildren(`→ ${r.kind === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${c.icon} ${c.name} · `, finAmt(finMoney(r.cents)), `${r.note ? ` · «${r.note}»` : ''} · ${dayLabel(r.date)}`);
}

// Las más usadas del tipo elegido (y, si faltan, las demás en su orden).
function finTopCats(kind, n = 6) {
  const count = new Map();
  finLive().forEach((t) => t.kind === kind && count.set(t.categoryId, (count.get(t.categoryId) || 0) + 1));
  return finCatsOf(kind).map((c, i) => [c, count.get(c.id) || 0, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, n).map(([c]) => c);
}

function finRenderChips() {
  const sel = $('#fin-cat').value;
  $('#fin-chips').replaceChildren(...finTopCats(finKindSel).map((c) => {
    const b = el('button', { type: 'button', className: `chip${c.id === sel ? ' active' : ''}`, ariaPressed: String(c.id === sel) }, `${c.icon} ${c.name}`);
    b.addEventListener('click', () => {
      finChipCat = c.id;
      $('#fin-cat').value = c.id;
      finRenderChips();
      finRenderPreview();
      $('#fin-amount').focus();
    });
    return b;
  }));
}

function finRenderForm() {
  $$('#fin-form .fin-kind [data-kind]').forEach((b) => {
    b.classList.toggle('active', b.dataset.kind === finKindSel);
    b.ariaPressed = String(b.dataset.kind === finKindSel);
  });
  const sel = $('#fin-cat');
  const cats = finCatsOf(finKindSel);
  sel.replaceChildren(...cats.map((c) => el('option', { value: c.id }, `${c.icon} ${c.name}`)));
  sel.value = cats.some((c) => c.id === finChipCat) ? finChipCat : finTopCats(finKindSel, 1)[0]?.id || '';
  finRenderChips();
  finRenderPreview();
}

const finAmt = (text, cls = '') => el('span', { className: `fin-amt ${cls}`.trim() }, text);

function finRenderCards(s) {
  const card = (label, value, cls = '', sub = '') => el('div', { className: `stat ${cls}` }, [el('span', { className: 'num' }, finAmt(value)), el('span', { className: 'label' }, label), sub ? el('span', { className: 'delta' }, sub) : '']);
  const hasBudget = s.budgetTotal > 0;
  $('#fin-cards').replaceChildren(
    card('Ingresos', finMoney(s.inc), 'fin-c-inc'),
    card('Gastos', finMoney(s.exp), 'fin-c-exp'),
    card('Balance', `${s.balance < 0 ? '−' : ''}${finMoney(Math.abs(s.balance))}`, `fin-c-bal${s.balance < 0 ? ' alert' : ''}`),
    hasBudget
      ? card('Te queda este mes', `${s.left < 0 ? '−' : ''}${finMoney(Math.abs(s.left))}`, `fin-c-left${s.left < 0 ? ' alert' : ''}`, [s.daysLeft ? `${plural(s.daysLeft, 'día', 'días')} · de ` : 'de ', finAmt(finMoney(s.budgetTotal))])
      : el('button', { className: 'stat fin-c-left fin-c-empty', type: 'button', title: 'Pon un presupuesto a tus categorías' }, [el('span', { className: 'num' }, '—'), el('span', { className: 'label' }, 'Te queda este mes'), el('span', { className: 'delta' }, 'Sin presupuestos')])
  );
  $('#fin-cards .fin-c-empty')?.addEventListener('click', () => reveal($('#fin-cats'), { block: 'start', smooth: true }));
}

function finRenderBudgets(s) {
  const box = $('#fin-budgets');
  if (!s.budgets.length) {
    const b = el('button', { type: 'button', className: 'link' }, 'Ponle un presupuesto mensual a una categoría');
    b.addEventListener('click', () => finEditCat(finTopCats('gasto', 1)[0]?.id));
    return box.replaceChildren(el('p', { className: 'muted' }, ['Sin presupuestos. ', b, ' y verás aquí cuánto te queda.']));
  }
  const days = s.daysLeft ? ` · ${plural(s.daysLeft, 'día', 'días')} para acabar el mes` : '';
  box.replaceChildren(...s.budgets.sort((a, b) => b.pct - a.pct).map((b) => {
    const pct = Math.round(b.pct * 100);
    const status = b.state === 'over' ? `⛔ ${pct} %` : b.state === 'warn' ? `⚠️ ${pct} %` : `${pct} %`;
    const rest = b.budget - b.spent;
    const row = el('div', { className: `fin-budget ${b.state}`, title: 'Editar la categoría' }, [
      el('div', { className: 'fin-budget-head' }, [
        el('span', { className: 'fin-budget-name' }, `${b.cat.icon} ${b.cat.name}`),
        el('span', { className: 'fin-budget-nums' }, [finAmt(finMoney(b.spent)), ' de ', finAmt(finMoney(b.budget)), el('strong', { className: 'fin-budget-pct' }, ` ${status}`)]),
      ]),
      el('div', { className: 'fin-meter', role: 'meter', ariaValueMin: 0, ariaValueMax: b.budget / 100, ariaValueNow: b.spent / 100, ariaLabel: `${b.cat.name}: ${pct} % del presupuesto` }, el('span', { className: 'fin-meter-fill', style: `width:${Math.min(100, pct)}%` })),
      el('div', { className: 'fin-budget-foot muted' }, [rest >= 0 ? ['Quedan ', finAmt(finMoney(rest))] : ['Te has pasado ', finAmt(finMoney(-rest))], days].flat()),
    ]);
    row.addEventListener('click', () => finEditCat(b.cat.id));
    return row;
  }));
}

// ---------- Gráficos (SVG en línea) ----------
const FIN_SVG = 'http://www.w3.org/2000/svg';
function finSvg(tag, attrs = {}, children = []) {
  const n = document.createElementNS(FIN_SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => v !== undefined && n.setAttribute(k, v));
  [].concat(children).forEach((c) => n.append(c));
  return n;
}
// Barra con el extremo de datos redondeado (4 px) y recta en la base.
function finBarPath(x, y, w, h, dir = 'right') {
  const r = Math.min(4, dir === 'right' ? w / 2 : h / 2, dir === 'right' ? h / 2 : w / 2);
  if (dir === 'right') return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z`;
  return `M${x},${y + h}v-${h - r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}
const finNice = (max) => {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || p * 10;
  return { step, top: step * Math.ceil(max / step || 1) };
};
const finTable = (heads, rows) => el('details', { className: 'fin-table' }, [el('summary', {}, 'Ver como tabla'), el('table', {}, [el('thead', {}, el('tr', {}, heads.map((h) => el('th', {}, h)))), el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', {}, finAmtCell(c))))))])]);
const finAmtCell = (c) => (c && typeof c === 'object' ? finAmt(c.money) : String(c));

// Gasto por categoría del mes: barras horizontales, de mayor a menor (un solo color: el de «gastos»).
function finChartCats(s, width) {
  const total = s.exp;
  const card = el('div', { className: 'card fin-chart', id: 'fin-chart-cats' }, el('h3', { className: 'fin-chart-title' }, ['Gasto por categoría · ', finAmt(finMoney(total))]));
  if (!total) return card.append(el('p', { className: 'empty' }, 'Sin gastos este mes.')), card;
  let data = [...s.byCat].map(([id, v]) => ({ cat: finCat(id), v })).sort((a, b) => b.v - a.v);
  if (data.length > 8) data = [...data.slice(0, 7), { cat: { icon: '…', name: 'Resto' }, v: data.slice(7).reduce((a, d) => a + d.v, 0) }];
  const W = Math.max(280, width);
  const labelW = Math.min(150, Math.round(W * 0.34));
  const valueW = 112;
  const rowH = 30;
  const barH = 16;
  const max = data[0].v;
  const H = data.length * rowH + 4;
  const svg = finSvg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'fin-svg', role: 'img', 'aria-label': `Gasto por categoría: ${data.map((d) => `${d.cat.name} ${finMoney(d.v)}`).join(', ')}` });
  svg.append(finSvg('line', { x1: labelW, x2: labelW, y1: 0, y2: H, class: 'fin-axis' }));
  data.forEach((d, i) => {
    const y = i * rowH + (rowH - barH) / 2 + 2;
    const w = Math.max(2, Math.round((d.v / max) * (W - labelW - valueW)));
    const pct = Math.round((d.v / total) * 100);
    const name = d.cat.name.length > 16 ? `${d.cat.name.slice(0, 15)}…` : d.cat.name;
    const g = finSvg('g', { class: 'fin-mark', tabindex: 0, 'data-cat': d.cat.id || '', 'data-value': d.v, 'aria-label': `${d.cat.name}: ${finMoney(d.v)} (${pct} %)` }, [
      finSvg('title', {}, `${d.cat.name}: ${finMoney(d.v)} · ${pct} % del gasto`),
      finSvg('rect', { x: 0, y: i * rowH, width: W, height: rowH, class: 'fin-hit' }),
      finSvg('text', { x: labelW - 8, y: y + barH / 2, 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'fin-label' }, `${d.cat.icon} ${name}`),
      finSvg('path', { d: finBarPath(labelW, y, w, barH), class: 'fin-bar exp' }),
      finSvg('text', { x: labelW + w + 6, y: y + barH / 2, 'dominant-baseline': 'central', class: 'fin-value fin-amt' }, `${finMoney(d.v)} · ${pct} %`),
    ]);
    svg.append(g);
  });
  card.append(svg, finTable(['Categoría', 'Gasto', '%'], data.map((d) => [`${d.cat.icon} ${d.cat.name}`, { money: finMoney(d.v) }, `${Math.round((d.v / total) * 100)} %`])));
  return card;
}

// Ingresos y gastos de los últimos 6 meses: columnas agrupadas (azul ingresos, naranja gastos).
function finChartMonths(ym, width) {
  const months = Array.from({ length: 6 }, (_, i) => finShiftYm(ym, i - 5));
  const live = finLive();
  const data = months.map((m) => {
    let inc = 0;
    let exp = 0;
    live.forEach((t) => t.date.startsWith(m) && (t.kind === 'ingreso' ? (inc += t.amount) : (exp += t.amount)));
    return { m, inc, exp };
  });
  const legend = el('div', { className: 'fin-legend' }, [el('span', {}, [el('i', { className: 'fin-key inc' }), 'Ingresos']), el('span', {}, [el('i', { className: 'fin-key exp' }), 'Gastos'])]);
  const card = el('div', { className: 'card fin-chart', id: 'fin-chart-months' }, [el('h3', { className: 'fin-chart-title' }, 'Últimos 6 meses'), legend]);
  const max = Math.max(...data.map((d) => Math.max(d.inc, d.exp)));
  if (!max) return card.append(el('p', { className: 'empty' }, 'Aún no hay movimientos.')), card;
  const { step, top } = finNice(max);
  const W = Math.max(280, width);
  const H = 190;
  const [l, r, t, b] = [56, 8, 10, 24];
  const ph = H - t - b;
  const sw = (W - l - r) / 6;
  const bw = Math.min(24, Math.floor((sw - 14) / 2));
  const yOf = (v) => t + ph - (v / top) * ph;
  const compact = finNF({ notation: 'compact', maximumFractionDigits: 1 });
  const svg = finSvg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'fin-svg', role: 'img', 'aria-label': `Ingresos y gastos de ${finMonthName(months[0])} a ${finMonthName(ym)}` });
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = Math.round(yOf(v)) + 0.5;
    svg.append(finSvg('line', { x1: l, x2: W - r, y1: y, y2: y, class: v ? 'fin-grid' : 'fin-axis' }), finSvg('text', { x: l - 6, y, 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'fin-tick fin-amt' }, compact.format(v / 100)));
  }
  data.forEach((d, i) => {
    const cx = l + sw * i + sw / 2;
    const col = (v, x, cls) => (v ? finSvg('path', { d: finBarPath(x, yOf(v), bw, t + ph - yOf(v), 'up'), class: `fin-bar ${cls}` }) : '');
    const g = finSvg('g', { class: `fin-mark${d.m === ym ? ' current' : ''}`, tabindex: 0, 'data-month': d.m, 'data-inc': d.inc, 'data-exp': d.exp, 'aria-label': `${finMonthName(d.m)}: ingresos ${finMoney(d.inc)}, gastos ${finMoney(d.exp)}` }, [
      finSvg('title', {}, `${finMonthName(d.m)}\nIngresos: ${finMoney(d.inc)}\nGastos: ${finMoney(d.exp)}\nBalance: ${d.inc - d.exp < 0 ? '−' : ''}${finMoney(Math.abs(d.inc - d.exp))}`),
      finSvg('rect', { x: l + sw * i, y: t, width: sw, height: ph + b, class: 'fin-hit' }),
      col(d.inc, cx - bw - 1, 'inc'),
      col(d.exp, cx + 1, 'exp'),
      finSvg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'fin-tick fin-month-tick' }, finMonthName(d.m, { month: 'short' }).replace('.', '')),
    ]);
    g.addEventListener('click', () => finGoMonth(d.m));
    svg.append(g);
  });
  card.append(svg, finTable(['Mes', 'Ingresos', 'Gastos'], data.map((d) => [finMonthName(d.m), { money: finMoney(d.inc) }, { money: finMoney(d.exp) }])));
  return card;
}

function finRenderCharts(s) {
  const box = $('#fin-charts');
  const w = box.clientWidth || 600;
  const each = w >= 760 ? Math.floor((w - 12) / 2) - 34 : w - 34;
  box.replaceChildren(finChartCats(s, each), finChartMonths(finMonthSel, each));
}

function finRenderList() {
  const box = $('#fin-list');
  const sel = $('#fin-filter-cat');
  const all = finLive().filter((t) => t.date.startsWith(finMonthSel));
  const used = new Set(all.map((t) => t.categoryId));
  sel.replaceChildren(el('option', { value: '' }, 'Todas las categorías'), ...fin().categories.filter((c) => used.has(c.id) || c.id === finFilter.cat).map((c) => el('option', { value: c.id }, `${c.icon} ${c.name}`)));
  sel.value = finFilter.cat;
  const q = fold(finFilter.q.trim());
  const list = all.filter((t) => (!finFilter.cat || t.categoryId === finFilter.cat) && (!q || finTxText(t).includes(q))).sort((a, b) => -finTxOrder(a, b));
  if (!list.length) return box.replaceChildren(el('p', { className: 'empty' }, all.length ? 'Nada coincide con el filtro.' : `Sin movimientos en ${finMonthName(finMonthSel)}. Añade uno arriba.`));
  const days = new Map();
  list.forEach((t) => days.set(t.date, [...(days.get(t.date) || []), t]));
  box.replaceChildren(...[...days].map(([day, items]) => {
    const net = items.reduce((s, t) => s + (t.kind === 'ingreso' ? t.amount : -t.amount), 0);
    return el('section', { className: 'fin-day' }, [
      el('h3', { className: 'fin-day-head' }, [el('span', {}, dayLabel(day)), finAmt(`${net < 0 ? '−' : net > 0 ? '+' : ''}${finMoney(Math.abs(net))}`, 'muted')]),
      ...items.map((t) => {
        const c = finCat(t.categoryId);
        const row = el('button', { type: 'button', className: `fin-row ${t.kind}`, title: 'Clic para editar · clic derecho para más opciones' }, [
          el('span', { className: 'fin-row-icon', style: `--cat:${c.color || '#898781'}`, ariaHidden: 'true' }, c.icon),
          el('span', { className: 'fin-row-main' }, [el('span', { className: 'fin-row-note' }, t.note || c.name), el('span', { className: 'fin-row-sub muted' }, [c.name, t.recurringId ? ' · 🔁 fijo' : '', t.account ? ` · ${t.account}` : ''].join(''))]),
          finAmt(finMoney(t.amount, t.kind), 'fin-row-amt'),
        ]);
        row.dataset.tx = t.id;
        return row;
      }),
    ]);
  }));
}
const finTxText = (t) => fold(`${t.note || ''} ${finCat(t.categoryId).name} ${finPlain(t.amount)} ${(t.amount / 100).toFixed(2)} ${finMoney(t.amount)}`);

function finRenderRecurring() {
  const list = fin().recurring;
  const box = $('#fin-rec');
  if (!list.length) return box.replaceChildren(el('p', { className: 'muted' }, 'Alquiler, gimnasio, suscripciones… Añádelos y se apuntan solos cada mes, el día que toque.'));
  box.replaceChildren(...list.map((r) => {
    const c = finCat(r.categoryId);
    const next = r.active ? finNextRun(r) : null;
    const pause = el('button', { type: 'button', className: 'chip' }, r.active ? '⏸ Pausar' : '▶ Reanudar');
    pause.addEventListener('click', (e) => {
      e.stopPropagation();
      finToggleRecurring(r.id);
    });
    const row = el('div', { className: `fin-rec-row${r.active ? '' : ' paused'}`, tabIndex: 0, role: 'button', title: 'Editar' }, [
      el('span', { className: 'fin-row-icon', style: `--cat:${c.color || '#898781'}`, ariaHidden: 'true' }, c.icon),
      el('span', { className: 'fin-row-main' }, [el('span', { className: 'fin-row-note' }, r.note || c.name), el('span', { className: 'fin-row-sub muted' }, `Día ${r.day} · ${c.name}${r.active ? (next ? ` · próximo: ${dayLabel(next).toLowerCase()}` : '') : ' · en pausa'}`)]),
      finAmt(finMoney(r.amount, r.kind), 'fin-row-amt'),
      pause,
    ]);
    row.dataset.rec = r.id;
    row.addEventListener('click', () => finEditRecurring(r.id));
    row.addEventListener('keydown', (e) => e.key === 'Enter' && e.target === row && finEditRecurring(r.id));
    return row;
  }));
}

function finRenderCats() {
  const count = new Map();
  finLive().forEach((t) => count.set(t.categoryId, (count.get(t.categoryId) || 0) + 1));
  const group = (kind, title) => [
    el('h3', { className: 'fin-cats-head' }, title),
    ...finCatsOf(kind).map((c) => {
      const row = el('button', { type: 'button', className: 'fin-cat-row' }, [
        el('span', { className: 'fin-row-icon', style: `--cat:${c.color || '#898781'}`, ariaHidden: 'true' }, c.icon),
        el('span', { className: 'fin-row-main' }, [el('span', { className: 'fin-row-note' }, c.name), el('span', { className: 'fin-row-sub muted' }, plural(count.get(c.id) || 0, 'movimiento', 'movimientos'))]),
        c.budget ? el('span', { className: 'fin-row-amt' }, [finAmt(finMoney(c.budget)), el('span', { className: 'muted' }, ' /mes')]) : el('span', { className: 'muted fin-row-amt' }, kind === 'gasto' ? 'Sin presupuesto' : ''),
      ]);
      row.dataset.cat = c.id;
      row.addEventListener('click', () => finEditCat(c.id));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showMenu({ x: e.clientX, y: e.clientY }, [{ label: '✏️ Editar', action: () => finEditCat(c.id) }, { label: '🗑 Eliminar', danger: true, action: () => finDeleteCat(c.id) }]);
      });
      return row;
    }),
  ];
  $('#fin-cats').replaceChildren(...group('gasto', 'Gastos'), ...group('ingreso', 'Ingresos'));
}

function renderFinance() {
  finBuild();
  const s = finSummary(finMonthSel);
  const cur = finYm(dateKey());
  $('#fin-month').textContent = finMonthName(finMonthSel);
  $('#fin-now').hidden = finMonthSel === cur;
  $('#fin-hide').classList.toggle('active', !!fin().hide);
  $('#fin-hide').ariaPressed = String(!!fin().hide);
  if (!$('#fin-date').value) $('#fin-date').value = dateKey();
  finRenderCards(s);
  finRenderForm();
  finRenderBudgets(s);
  finRenderCharts(s);
  finRenderList();
  finRenderRecurring();
  finRenderCats();
}

// ---------- «Ocultar importes» ----------
// Difumina los importes hasta pasar el ratón o tocarlos (el primer toque solo los enseña).
document.addEventListener('click', (e) => {
  if (!document.documentElement.classList.contains('fin-hide')) return;
  const a = e.target.closest?.('.fin-amt');
  if (!a || a.classList.contains('fin-show')) return;
  e.preventDefault();
  e.stopPropagation();
  a.classList.add('fin-show');
}, true);

// ---------- Hoy: «💰 Hoy: 23,40 €» si hay movimientos hoy ----------
const finTodayBtn = el('button', { id: 'today-fin', className: 'chip fin-today', type: 'button', hidden: true, title: 'Abrir Finanzas' });
finTodayBtn.addEventListener('click', () => {
  finMonthSel = finYm(dateKey());
  showView('finanzas');
});
$('#view-today .stats')?.after(finTodayBtn);

function finRenderToday() {
  const today = finLive().filter((t) => t.date === dateKey());
  finTodayBtn.hidden = !today.length;
  if (!today.length) return;
  const exp = today.filter((t) => t.kind === 'gasto').reduce((s, t) => s + t.amount, 0);
  const inc = today.filter((t) => t.kind === 'ingreso').reduce((s, t) => s + t.amount, 0);
  finTodayBtn.replaceChildren('💰 Hoy: ', finAmt(exp || !inc ? finMoney(exp) : finMoney(inc, 'ingreso')), exp && inc ? el('span', { className: 'muted' }, [' · ', finAmt(finMoney(inc, 'ingreso'))]) : '');
}

RENDER_HOOKS.push(() => {
  document.documentElement.classList.toggle('fin-hide', !!state.finance?.hide);
  // Gastos fijos que tocan (como mucho una vez al día cada uno: lastRun).
  if (state.finance?.recurring?.length && finRunRecurring() && activeTab()?.view === 'finanzas') renderFinance();
  finRenderToday();
});

// ---------- Captura rápida (57): chip «Gasto» ----------
CAPTURE_KINDS.push(['gasto', '💰', 'Gasto', '💰 Nuevo gasto…']);
CAPTURE_HOOKS.gasto = (text) => {
  const p = finParseText(text.split('\n')[0], 'gasto');
  if (!p) {
    openCapture('gasto');
    $('#capture-text').value = text;
    showToastMessage('No encuentro el importe. Prueba «12,50 café comida».');
    return false;
  }
  finAddTx({ ...p, categoryId: p.categoryId || finFallbackCat(p.kind)?.id });
  return true;
};

// ---------- Búsqueda global (61) ----------
GS_CHIP.finance = 'Movimiento';
GS_PROVIDERS.splice(GS_PROVIDERS.findIndex((p) => p.type === 'other') >>> 0, 0, {
  type: 'finance', label: 'Movimientos', icon: 'coin',
  items: () => (state.finance?.tx || []).filter((t) => !t.del).map((t) => {
    const c = finCat(t.categoryId);
    return { id: t.id, title: t.note || c.name, text: `${c.name}\n${finPlain(t.amount)} ${(t.amount / 100).toFixed(2)} ${finMoney(t.amount)}`, time: t.createdAt || 0, ref: t, sub: `${c.icon} ${c.name} · ${dayLabel(t.date)}${finHidden() ? '' : ` · ${finMoney(t.amount, t.kind)}`}` };
  }),
  open: (it, { newTab } = {}) => {
    finMonthSel = finYm(it.ref.date);
    showView('finanzas', { newTab });
    finEditTx(it.id);
  },
});

// ---------- Paleta de comandos ----------
COMMANDS_EXTRA.push(() => [
  { label: '💰 Añadir gasto', action: () => openCapture('gasto') },
  { label: '💰 Abrir Finanzas', action: ({ newTab } = {}) => showView('finanzas', { newTab }) },
  { label: '⬇️ Exportar movimientos (CSV)', action: () => finExport() },
  { label: '⬆️ Importar movimientos (CSV)', action: finPickImport },
  { label: fin().hide ? '👁 Mostrar importes' : '🙈 Ocultar importes', action: () => finSetHidden() },
]);
