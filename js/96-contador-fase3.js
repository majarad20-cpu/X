'use strict';

// ---------- Especialidad Contador (fase 3): calculadoras, panel de clientes e informe al cliente ----------
// 🧮 Calculadoras: pago fuera de plazo (art. 53 CT), Impuesto Único de Segunda Categoría, APV, finiquito
//    y conversión UF/UTM con reajuste. Los valores que cambian (UTM, UF, tasas de interés penal por
//    semestre, escala del impuesto único, topes) viven en la nota de perfil (secciones «Parámetros de
//    cálculo», «Interés penal (art. 53 CT)» e «Impuesto Único de Segunda Categoría (art. 43 LIR)»); si
//    faltan se usan los de fábrica. Cada resultado muestra qué parámetro usó, su vigencia y su fuente, y
//    avisa ⚠️ cuando un dato puede estar desactualizado o falta (nunca lo inventa).
//    También van dentro de las notas: un bloque ```calculadora (tipo: art53 …) se ve como formulario.
// 👥 Clientes: notas con `tipo: cliente` (o en la carpeta «Clientes»). Panel con sus datos, próximos
//    vencimientos según sus obligaciones, pendientes, notas que los enlazan y bitácora.
// 📄 Informe al cliente: vencimientos, pendientes, novedades normativas y observaciones, editable antes
//    de exportar a PDF, a nota o a Google Doc.
// ✍️ Firma (opcional): se configura en Ajustes y cada documento tiene su casilla «Incluir mi firma».

// =========================================================
// ✍️ Firma de documentos (opcional)
// =========================================================
const FIRMA_FIELDS = [
  ['nombre', 'Nombre', 'Como quieres que aparezca'],
  ['titulo', 'Título o cargo', 'Contador Auditor'],
  ['empresa', 'Empresa o estudio', ''],
  ['contacto', 'Contacto', 'Teléfono, correo o sitio web'],
  ['ciudad', 'Ciudad', ''],
];
const firmaCfg = () => {
  if (!state.settings.firma || typeof state.settings.firma !== 'object') state.settings.firma = {};
  return state.settings.firma;
};
const firmaLines = () => FIRMA_FIELDS.map(([k]) => String(firmaCfg()[k] || '').trim()).filter(Boolean);
const firmaReady = () => firmaLines().length > 0;
// Se incluye por defecto solo si la persona lo activó y la firma tiene datos.
const firmaDefault = () => firmaCfg().on === true && firmaReady();
function firmaMarkdown() {
  const l = firmaLines();
  return l.length ? [`**${l[0]}**`, ...l.slice(1)].join('\n') : '';
}
// Casilla «Incluir mi firma» para cualquier documento.
function firmaCheckbox(initial = firmaDefault()) {
  const box = el('input', { type: 'checkbox', checked: initial && firmaReady(), disabled: !firmaReady() });
  const label = el('label', { className: 'firma-check', title: firmaReady() ? 'Agrega tu firma al final del documento' : 'Primero configura tu firma en Ajustes › Notas › Firma de documentos' }, [box, firmaReady() ? ' ✍️ Incluir mi firma' : ' ✍️ Firma (sin configurar)']);
  return { label, get on() { return box.checked; } };
}

function renderFirmaSettings() {
  const group = $('#set-g-notas');
  if (!group) return;
  let card = $('#firma-settings');
  if (!card) {
    group.append(el('h3', { className: 'section-title' }, 'Firma de documentos'));
    card = el('div', { id: 'firma-settings', className: 'card' });
    group.append(card);
  }
  const c = firmaCfg();
  const on = el('input', { type: 'checkbox', id: 'firma-on', checked: c.on === true });
  on.addEventListener('change', () => {
    firmaCfg().on = on.checked;
    save();
  });
  const preview = el('div', { className: 'firma-preview md' });
  const paint = () => {
    preview.innerHTML = firmaReady() ? renderMd(firmaMarkdown(), { noTasks: true }) : '<p class="muted">Sin datos: los documentos salen sin firma.</p>';
  };
  const inputs = FIRMA_FIELDS.map(([k, label, ph]) => {
    const inp = el('input', { type: 'text', value: c[k] || '', placeholder: ph, ariaLabel: label });
    inp.dataset.k = k;
    inp.addEventListener('input', () => {
      firmaCfg()[k] = inp.value.slice(0, 120);
      save();
      paint();
    });
    return el('label', { className: 'firma-field' }, [el('span', { className: 'muted' }, label), inp]);
  });
  paint();
  card.replaceChildren(
    el('p', { className: 'muted' }, 'Opcional. Es tuya y queda solo en esta app: Kataleya no la inventa ni la completa. Cada documento (PDF, Google Doc, informe al cliente) trae una casilla «Incluir mi firma» para decidir en cada caso.'),
    el('div', { className: 'firma-grid' }, inputs),
    el('label', { className: 'set-row' }, [on, ' Marcar «Incluir mi firma» por defecto']),
    el('div', { className: 'pro-sub' }, 'Así se verá'),
    preview
  );
}
renderFirmaSettings();

// =========================================================
// Parámetros de cálculo (en el perfil)
// =========================================================
const CALC_PROFILE_DEFAULT = `## Parámetros de cálculo
Cada línea: \`parámetro: valor · vigencia · fuente\`. La UTM y la UF cambian cada mes: actualízalas (sii.cl, bcentral.cl). Las calculadoras avisan si la vigencia es de un mes anterior.
- UTM: 72.440 · noviembre 2026 · sii.cl
- UF: 41.247,63 · 31-10-2026 · bcentral.cl
- Tope indemnización por años de servicio: 90 UF · art. 172 CT
- Tope de años de servicio: 11 · art. 163 CT (contratos desde el 14-08-1981)
- Tope indemnización sustitutiva del aviso previo: 90 UF · art. 172 CT
- Tope APV régimen B mensual: 50 UF · art. 42 bis LIR
- Tope APV anual: 600 UF · art. 42 bis LIR
- Bonificación APV régimen A: 15 % · art. 20 O DL 3.500
- Tope bonificación APV régimen A: 6 UTM · art. 20 O DL 3.500 (anual)

## Interés penal (art. 53 CT)
Cada línea: \`desde a hasta · tasa diaria % · resolución\`. Desde el 01-01-2025 (Ley 21.713) el interés penal es diario: tasa de interés corriente (CMF) + 3,5 %, dividida por 360. Si la mora abarca varios semestres, se suma el interés de cada uno con su tasa. Agrega la del semestre siguiente cuando el SII la publique (junio y diciembre).
- 01-01-2025 a 30-06-2025 · 0,0225555556 % · Res. Ex. SII 133/2024
- 01-07-2025 a 31-12-2025 · 0,0222222222 % · Res. Ex. SII 75/2025
- 01-01-2026 a 30-06-2026 · 0,0220000000 % · Res. Ex. SII 205/2025
- 01-07-2026 a 31-12-2026 · 0,0213888889 % · Res. Ex. SII 88/2026

## Impuesto Único de Segunda Categoría (art. 43 LIR)
Escala mensual: \`desde a hasta UTM · tasa % · rebaja UTM\` (el último tramo: «más de N»).
- 0 a 13,5 · 0 % · 0
- 13,5 a 30 · 4 % · 0,54
- 30 a 50 · 8 % · 1,74
- 50 a 70 · 13,5 % · 4,49
- 70 a 90 · 23 % · 11,14
- 90 a 120 · 30,4 % · 17,8
- 120 a 310 · 35 % · 23,32
- más de 310 · 40 % · 38,82
`;

// Número en formato chileno: «72.440», «41.247,63», «0,0213888889», «13,5».
function calcNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? '').replace(/[$\s]/g, '').replace(/%$/, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const calcPesos = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('es-CL')}` : '—');
const calcDec = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—');
const calcIso = (s) => {
  const t = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const calcDmy = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
const calcAddDays = (iso, k) => dateKey(new Date(Date.parse(`${iso}T12:00:00`) + k * 864e5));
const calcDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 864e5);

function calcParams() {
  const note = typeof proProfileNote === 'function' ? proProfileNote() : null;
  const body = note && !note.enc ? note.body : '';
  return gvCached(`calc-params:${note?.id || 'base'}`, () => {
    const section = (text, title) => {
      const m = text.match(new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
      return m ? m[1].split('\n').filter((l) => /^\s*-\s/.test(l)).map((l) => l.replace(/^\s*-\s*/, '')) : null;
    };
    // Cada sección: la del perfil si existe; si no, la de fábrica.
    const pick = (title) => {
      const own = body ? section(body, title) : null;
      return own && own.length ? { lines: own, from: 'perfil' } : { lines: section(CALC_PROFILE_DEFAULT, title), from: 'fábrica' };
    };
    const vals = new Map();
    const p = pick('Par[aá]metros de c[aá]lculo');
    p.lines.forEach((l) => {
      const m = l.match(/^([^:]+):\s*(.+)$/);
      if (!m) return;
      const [val, ...rest] = m[2].split('·').map((x) => x.trim());
      const n = calcNum((val.match(/-?[\d.,]+/) || [''])[0]);
      // «valor · vigencia · fuente» o «valor · fuente» (una norma o un sitio).
      const isSrc = (x) => /\b(art\.?|ley|dl|dfl|res\.?|circular)\b|\.cl\b|\.org\b/i.test(x);
      const vig = rest.length >= 2 || (rest.length === 1 && !isSrc(rest[0])) ? rest[0] : '';
      const src = rest.length >= 2 ? rest.slice(1).join(' · ') : rest.length === 1 && isSrc(rest[0]) ? rest[0] : '';
      if (Number.isFinite(n)) vals.set(fold(m[1].trim()), { name: m[1].trim(), value: n, raw: val, vig, src, from: p.from });
    });
    const r = pick('Inter[eé]s penal');
    const rates = [];
    r.lines.forEach((l) => {
      const d = gvDatesIn(l).map((x) => x.date);
      const pct = l.split('·')[1];
      const n = calcNum((String(pct || '').match(/[\d.,]+/) || [''])[0]);
      if (d.length >= 2 && Number.isFinite(n)) rates.push({ from: d[0], to: d[1], pct: n, src: (l.split('·')[2] || '').trim(), origin: r.from });
    });
    rates.sort((a, b) => (a.from < b.from ? -1 : 1));
    const t = pick('Impuesto [UÚ]nico');
    const scale = [];
    t.lines.forEach((l) => {
      const parts = l.split('·').map((x) => x.trim());
      const nums = (parts[0].match(/[\d.,]+/g) || []).map(calcNum);
      const rate = calcNum((parts[1] || '').match(/[\d.,]+/)?.[0]);
      const reb = calcNum((parts[2] || '').match(/[\d.,]+/)?.[0]);
      if (!nums.length || !Number.isFinite(rate)) return;
      const open = /m[aá]s de/i.test(parts[0]);
      scale.push({ from: open ? nums[0] : nums[0], to: open ? Infinity : nums[1] ?? Infinity, rate, reb: Number.isFinite(reb) ? reb : 0 });
    });
    scale.sort((a, b) => a.from - b.from);
    return { vals, rates, scale, origin: { vals: p.from, rates: r.from, scale: t.from } };
  });
}
// Un parámetro por su nombre (sin tildes ni mayúsculas): { value, vig, src } o null.
const calcP = (name) => calcParams().vals.get(fold(name)) || null;

// ¿La vigencia de un valor mensual (UTM, UF) es de un mes anterior al de la fecha de referencia?
const CALC_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function calcVigMonth(vig) {
  const f = fold(vig || '');
  const d = gvDatesIn(vig || '')[0]?.date;
  if (d) return d.slice(0, 7);
  const mi = CALC_MONTHS.findIndex((m) => f.includes(m));
  const y = f.match(/(19|20)\d{2}/)?.[0];
  return mi >= 0 && y ? `${y}-${String(mi + 1).padStart(2, '0')}` : '';
}
function calcUnit(name, refIso, warnings, used) {
  const p = calcP(name);
  if (!p) {
    warnings.push(`⚠️ Falta el valor de la ${name} en el perfil (sección «Parámetros de cálculo»).`);
    return NaN;
  }
  used.push(`${p.name}: ${p.raw}${p.vig ? ` (${p.vig})` : ''}${p.src ? ` · ${p.src}` : ''}`);
  const ym = calcVigMonth(p.vig);
  const ref = (refIso || dateKey()).slice(0, 7);
  // La UF de un día distinto o la UTM de otro mes: se avisa para que se confirme.
  if (!ym) warnings.push(`⚠️ La ${name} del perfil no dice de qué fecha es: confirma el valor.`);
  else if (ym < ref) warnings.push(`⚠️ La ${name} del perfil es de ${calcDmy(p.vig.match(/\d{4}-\d{2}-\d{2}/)?.[0]) || p.vig}; para ${ref.split('-').reverse().join('-')} usa el valor vigente (actualízalo en el perfil).`);
  return p.value;
}

// =========================================================
// Cálculos (funciones puras: datos → filas, total, avisos y parámetros usados)
// =========================================================
function calcArt53(d) {
  const warnings = [];
  const used = [];
  const imp = calcNum(d.impuesto);
  const venc = calcIso(d.vencimiento);
  const pago = calcIso(d.pago);
  const reaj = calcNum(d.reajuste);
  const multa = calcNum(d.multa) || 0;
  if (!Number.isFinite(imp) || !venc || !pago) return { error: 'Completa el impuesto, el vencimiento y la fecha de pago.' };
  if (pago <= venc) return { rows: [['Impuesto', calcPesos(imp)]], total: ['Total a pagar', calcPesos(imp)], warnings: ['Se paga dentro del plazo: no hay reajuste, interés ni multa.'], used };
  if (!Number.isFinite(reaj)) warnings.push('⚠️ Falta el reajuste IPC: tómalo de la tabla de reajustes del SII para el mes de pago (sin él, el cálculo queda corto).');
  const reajuste = Number.isFinite(reaj) ? Math.round((imp * reaj) / 100) : 0;
  const base = imp + reajuste;
  const days = calcDiff(venc, pago);
  // Cada día de atraso con la tasa de su semestre.
  const { rates } = calcParams();
  const first = calcAddDays(venc, 1);
  const seg = [];
  let old = 0;
  let missing = 0;
  for (let cur = first; cur <= pago; cur = calcAddDays(cur, 1)) {
    if (cur < '2025-01-01') {
      old++;
      continue;
    }
    let r = rates.find((x) => cur >= x.from && cur <= x.to);
    if (!r) {
      missing++;
      r = rates.filter((x) => x.to < cur).at(-1) || rates[0];
      if (!r) break;
      r = { ...r, assumed: true };
    }
    const last = seg.at(-1);
    if (last && last.r.from === r.from && !!last.r.assumed === !!r.assumed) last.days++;
    else seg.push({ r, days: 1, start: cur });
  }
  if (old) warnings.push(`⚠️ ${plural(old, 'día', 'días')} de atraso son anteriores al 01-01-2025: regía el 1,5 % por mes o fracción. Ese tramo no está calculado (revisa la Circular SII 1/2025).`);
  if (missing) warnings.push(`⚠️ No hay tasa en el perfil para ${plural(missing, 'día', 'días')}: usé la última conocida. Agrega la tasa del semestre cuando el SII la publique.`);
  const interes = Math.round(seg.reduce((s, x) => s + (base * x.r.pct * x.days) / 100, 0));
  seg.forEach((x) => used.push(`Interés ${calcDmy(x.r.from)} a ${calcDmy(x.r.to)}: ${calcDec(x.r.pct, 10)} % diario${x.r.src ? ` · ${x.r.src}` : ''}${x.r.assumed ? ' (supuesta)' : ''}`));
  const rows = [
    ['Impuesto adeudado', calcPesos(imp)],
    [`Reajuste IPC${Number.isFinite(reaj) ? ` (${calcDec(reaj, 4)} %)` : ''}`, calcPesos(reajuste)],
    ['Impuesto reajustado', calcPesos(base)],
    [`Interés penal (${plural(days - old, 'día', 'días')})`, calcPesos(interes), seg.map((x) => `${x.days} × ${calcDec(x.r.pct, 10)} %`).join(' + ')],
  ];
  if (multa) rows.push(['Multa', calcPesos(multa)]);
  warnings.push('La multa (art. 97 N° 2 u 11) y la condonación (art. 56 y política de la TGR) dependen del caso: revísalas en la Tabla de Multas.');
  return { rows, total: ['Total a pagar', calcPesos(base + interes + multa)], value: base + interes + multa, warnings, used };
}

function calcIuscFor(base, utm, scale) {
  const u = base / utm;
  const t = scale.find((x) => u > x.from && u <= x.to) || scale[0];
  const tax = Math.max(0, Math.round(base * (t.rate / 100) - t.reb * utm));
  return { tax, t, u };
}
function calcIusc(d) {
  const warnings = [];
  const used = [];
  const base = calcNum(d.renta);
  if (!Number.isFinite(base)) return { error: 'Ingresa la remuneración tributable del mes (imponible menos cotizaciones obligatorias).' };
  const utm = calcUnit('UTM', calcIso(d.mes) || dateKey(), warnings, used);
  const { scale } = calcParams();
  if (!Number.isFinite(utm) || !scale.length) return { error: 'Falta la UTM o la escala del impuesto en el perfil.', warnings, used };
  const { tax, t, u } = calcIuscFor(base, utm, scale);
  used.push(`Escala del art. 43 LIR (${calcParams().origin.scale === 'perfil' ? 'del perfil' : 'de fábrica'})`);
  return {
    rows: [
      ['Remuneración tributable', calcPesos(base)],
      ['En UTM', calcDec(u, 2)],
      ['Tramo', t.to === Infinity ? `más de ${calcDec(t.from)} UTM` : `${calcDec(t.from)} a ${calcDec(t.to)} UTM`],
      ['Tasa', `${calcDec(t.rate, 2)} %`],
      ['Rebaja', `${calcDec(t.reb, 2)} UTM = ${calcPesos(t.reb * utm)}`],
      ['Tasa efectiva', base ? `${calcDec((tax / base) * 100, 2)} %` : '—'],
    ],
    total: ['Impuesto único del mes', calcPesos(tax)],
    value: tax,
    warnings,
    used,
  };
}

function calcApv(d) {
  const warnings = [];
  const used = [];
  const aporte = calcNum(d.aporte);
  const reg = String(d.regimen || 'A').toUpperCase().startsWith('B') ? 'B' : 'A';
  if (!Number.isFinite(aporte)) return { error: 'Ingresa el aporte mensual al APV.' };
  const ref = dateKey();
  const uf = calcUnit('UF', ref, warnings, used);
  const anual = aporte * 12;
  const topeAnual = calcP('Tope APV anual');
  const rows = [['Aporte mensual', calcPesos(aporte)], ['Aporte anual', calcPesos(anual)]];
  if (reg === 'A') {
    const pct = calcP('Bonificación APV régimen A');
    const tope = calcP('Tope bonificación APV régimen A');
    const utm = calcUnit('UTM', ref, warnings, used);
    if (!pct || !tope) return { error: 'Faltan la bonificación o su tope en el perfil.', warnings, used };
    used.push(`Bonificación: ${pct.raw} · tope ${tope.raw}${tope.src ? ` · ${tope.src}` : ''}`);
    const bon = Math.min((anual * pct.value) / 100, tope.value * utm);
    rows.push([`Bonificación fiscal (${calcDec(pct.value)} %)`, calcPesos((anual * pct.value) / 100)], [`Tope (${calcDec(tope.value)} UTM)`, calcPesos(tope.value * utm)]);
    warnings.push('Régimen A: el aporte no rebaja la base del impuesto; el Estado bonifica el 15 % (se calcula con la UTM vigente cuando se paga). Al retirarlo antes de pensionarse, se pierde la bonificación.');
    return { rows, total: ['Bonificación fiscal estimada del año', calcPesos(bon)], value: bon, warnings, used };
  }
  const topeMes = calcP('Tope APV régimen B mensual');
  if (!topeMes) return { error: 'Falta el tope mensual del APV régimen B en el perfil.', warnings, used };
  used.push(`Tope régimen B: ${topeMes.raw} al mes${topeMes.src ? ` · ${topeMes.src}` : ''}${topeAnual ? `; ${topeAnual.raw} al año` : ''}`);
  const deducible = Math.min(aporte, topeMes.value * uf);
  if (aporte > deducible) warnings.push(`⚠️ El aporte supera el tope de ${calcDec(topeMes.value)} UF al mes: el exceso no rebaja la base.`);
  rows.push(['Rebaja de la base al mes', calcPesos(deducible)]);
  let ahorro = NaN;
  const renta = calcNum(d.renta);
  if (Number.isFinite(renta)) {
    const utm = calcUnit('UTM', ref, warnings, used);
    const { scale } = calcParams();
    if (Number.isFinite(utm) && scale.length) {
      const sin = calcIuscFor(renta, utm, scale).tax;
      const con = calcIuscFor(Math.max(0, renta - deducible), utm, scale).tax;
      ahorro = sin - con;
      rows.push(['Impuesto único sin APV', calcPesos(sin)], ['Impuesto único con APV', calcPesos(con)]);
    }
  } else warnings.push('Ingresa la remuneración tributable para ver cuánto impuesto ahorra.');
  warnings.push('Régimen B: rebaja la base del impuesto único (vía empleador, tope mensual) o se reliquida en el F22 (depósito directo, tope anual de 600 UF). El retiro anticipado paga impuesto.');
  return { rows, total: ['Ahorro de impuesto al mes', Number.isFinite(ahorro) ? calcPesos(ahorro) : '—'], value: ahorro, warnings, used };
}

// Años, meses y días entre dos fechas (la de término incluida).
function calcSpan(a, b) {
  const s = new Date(`${a}T12:00:00`);
  const e = new Date(`${calcAddDays(b, 1)}T12:00:00`);
  let y = e.getFullYear() - s.getFullYear();
  let m = e.getMonth() - s.getMonth();
  let d = e.getDate() - s.getDate();
  if (d < 0) {
    m--;
    d += new Date(e.getFullYear(), e.getMonth(), 0).getDate();
  }
  if (m < 0) {
    y--;
    m += 12;
  }
  return { y, m, d };
}
function calcFiniquito(d) {
  const warnings = [];
  const used = [];
  const ini = calcIso(d.inicio);
  const fin = calcIso(d.termino);
  const rem = calcNum(d.remuneracion);
  const causal = String(d.causal || 'necesidades');
  if (!ini || !fin || !Number.isFinite(rem)) return { error: 'Completa el inicio, el término y la última remuneración mensual.' };
  if (fin < ini) return { error: 'La fecha de término es anterior al inicio.' };
  const uf = calcUnit('UF', fin, warnings, used);
  const span = calcSpan(ini, fin);
  const rows = [['Antigüedad', `${plural(span.y, 'año', 'años')}, ${plural(span.m, 'mes', 'meses')} y ${plural(span.d, 'día', 'días')}`], ['Última remuneración mensual', calcPesos(rem)]];
  let total = 0;
  const is161 = causal === 'necesidades' || causal === 'desahucio';
  if (is161) {
    const topeUf = calcP('Tope indemnización por años de servicio');
    const topeAn = calcP('Tope de años de servicio');
    const topeAv = calcP('Tope indemnización sustitutiva del aviso previo') || topeUf;
    const baseIas = Math.min(rem, (topeUf?.value ?? Infinity) * uf);
    if (topeUf) used.push(`Tope remuneración: ${topeUf.raw}${topeUf.src ? ` · ${topeUf.src}` : ''}`);
    if (topeAn) used.push(`Tope de años: ${topeAn.raw}${topeAn.src ? ` · ${topeAn.src}` : ''}`);
    if (span.y >= 1) {
      // Cada año y fracción superior a seis meses; tope de 11 años.
      let years = span.y + (span.m > 6 || (span.m === 6 && span.d > 0) ? 1 : 0);
      if (topeAn && years > topeAn.value) years = topeAn.value;
      const ias = Math.round(years * baseIas);
      rows.push([`Indemnización por años de servicio (${years} × ${calcPesos(baseIas)})`, calcPesos(ias), rem > baseIas ? 'con tope de 90 UF' : '']);
      total += ias;
      const afc = calcNum(d.afc);
      if (Number.isFinite(afc) && afc > 0) {
        rows.push(['Menos aporte del empleador al seguro de cesantía (art. 13 Ley 19.728)', `−${calcPesos(afc)}`]);
        total -= Math.min(afc, ias);
        warnings.push('La imputación del seguro de cesantía se cae si un tribunal declara injustificado el despido.');
      }
    } else rows.push(['Indemnización por años de servicio', calcPesos(0), 'requiere un año o más de servicio']);
    if (String(d.aviso || 'no') !== 'si') {
      const av = Math.round(Math.min(rem, (topeAv?.value ?? Infinity) * uf));
      rows.push(['Indemnización sustitutiva del aviso previo', calcPesos(av), 'sin aviso de 30 días']);
      total += av;
    }
  } else rows.push(['Indemnizaciones', calcPesos(0), 'la causal no da derecho a indemnización legal']);
  // Feriado proporcional (desde el último aniversario) más el pendiente de períodos anteriores.
  const anniv = new Date(`${ini}T12:00:00`);
  anniv.setFullYear(anniv.getFullYear() + span.y);
  const sinceAnniv = calcDiff(dateKey(anniv), fin) + 1;
  const prop = (sinceAnniv * 1.25) / 30;
  const pend = calcNum(d.feriado_pendiente) || 0;
  const habiles = prop + pend;
  const holidays = typeof ctProfile === 'function' ? ctProfile().holidays : new Set();
  let corridos = 0;
  let left = habiles;
  for (let cur = calcAddDays(fin, 1); left > 0 && corridos < 400; cur = calcAddDays(cur, 1)) {
    const work = typeof ctIsWorkday === 'function' ? ctIsWorkday(cur, holidays) : ![0, 6].includes(new Date(`${cur}T12:00:00`).getDay());
    if (work) {
      const take = Math.min(1, left);
      corridos += take;
      left -= take;
    } else corridos += 1;
  }
  const fer = Math.round((corridos * rem) / 30);
  rows.push([`Feriado: ${calcDec(habiles, 2)} días hábiles = ${calcDec(corridos, 2)} corridos`, calcPesos(fer), `${calcDec(prop, 2)} proporcionales${pend ? ` + ${calcDec(pend, 2)} pendientes` : ''}`]);
  total += fer;
  warnings.push('Los días hábiles se convierten en corridos contando sábados, domingos y feriados desde el día siguiente al término (feriados fijos y los del perfil).');
  warnings.push('No incluye remuneraciones del mes, gratificación ni recargos del art. 168. Revisa el caso con la nota «Cálculo de Finiquitos e Indemnizaciones Laborales».');
  return { rows, total: ['Total estimado del finiquito', calcPesos(total)], value: total, warnings, used };
}

function calcConversion(d) {
  const warnings = [];
  const used = [];
  const monto = calcNum(d.monto);
  const unidad = String(d.unidad || 'pesos');
  if (!Number.isFinite(monto)) return { error: 'Ingresa un monto.' };
  const ref = calcIso(d.fecha) || dateKey();
  const uf = calcUnit('UF', ref, warnings, used);
  const utm = calcUnit('UTM', ref, warnings, used);
  const pesos = unidad === 'uf' ? monto * uf : unidad === 'utm' ? monto * utm : monto;
  const rows = [['En pesos', calcPesos(pesos)], ['En UF', calcDec(pesos / uf, 2)], ['En UTM', calcDec(pesos / utm, 2)], ['En UTA (12 UTM)', calcDec(pesos / (12 * utm), 4)]];
  const reaj = calcNum(d.reajuste);
  if (Number.isFinite(reaj)) {
    rows.push([`Reajustado (${calcDec(reaj, 4)} %)`, calcPesos(pesos * (1 + reaj / 100))]);
    return { rows, total: ['Monto reajustado', calcPesos(pesos * (1 + reaj / 100))], value: pesos * (1 + reaj / 100), warnings, used };
  }
  return { rows, total: ['Monto en pesos', calcPesos(pesos)], value: pesos, warnings, used };
}

const CALC_TYPES = [
  { id: 'art53', icon: '🧾', short: 'Art. 53 CT', title: 'Pago fuera de plazo (art. 53 CT)', run: calcArt53, fields: [
    { k: 'impuesto', label: 'Impuesto adeudado ($)', ph: '1.500.000' },
    { k: 'vencimiento', label: 'Vencimiento', type: 'date' },
    { k: 'pago', label: 'Fecha de pago', type: 'date' },
    { k: 'reajuste', label: 'Reajuste IPC (%)', ph: '1,2', hint: 'De la tabla de reajustes del SII para el mes de pago' },
    { k: 'multa', label: 'Multa ($, opcional)', ph: '0' },
  ] },
  { id: 'iusc', icon: '💼', short: 'Impuesto único', title: 'Impuesto Único de Segunda Categoría', run: calcIusc, fields: [
    { k: 'renta', label: 'Remuneración tributable del mes ($)', ph: '1.800.000', hint: 'Imponible menos cotizaciones obligatorias' },
    { k: 'mes', label: 'Mes (para la UTM)', type: 'date' },
  ] },
  { id: 'apv', icon: '🏦', short: 'APV', title: 'Ahorro Previsional Voluntario (APV)', run: calcApv, fields: [
    { k: 'aporte', label: 'Aporte mensual ($)', ph: '200.000' },
    { k: 'regimen', label: 'Régimen', options: [['A', 'A · bonificación fiscal'], ['B', 'B · rebaja de la base']] },
    { k: 'renta', label: 'Remuneración tributable ($, régimen B)', ph: '3.000.000' },
  ] },
  { id: 'finiquito', icon: '🤝', short: 'Finiquito', title: 'Finiquito', run: calcFiniquito, fields: [
    { k: 'inicio', label: 'Inicio del contrato', type: 'date' },
    { k: 'termino', label: 'Término', type: 'date' },
    { k: 'causal', label: 'Causal', options: [['necesidades', 'Art. 161 · necesidades de la empresa'], ['desahucio', 'Art. 161 · desahucio'], ['otra', 'Renuncia, mutuo acuerdo, art. 159 o 160']] },
    { k: 'aviso', label: '¿Se dio aviso con 30 días?', options: [['no', 'No'], ['si', 'Sí']] },
    { k: 'remuneracion', label: 'Última remuneración mensual ($)', ph: '1.200.000' },
    { k: 'feriado_pendiente', label: 'Feriado pendiente de años anteriores (días hábiles)', ph: '0' },
    { k: 'afc', label: 'Aporte del empleador al seguro de cesantía ($, a imputar)', ph: '0' },
  ] },
  { id: 'conversion', icon: '💱', short: 'UF y UTM', title: 'UF, UTM y reajuste', run: calcConversion, fields: [
    { k: 'monto', label: 'Monto', ph: '25' },
    { k: 'unidad', label: 'Unidad', options: [['uf', 'UF'], ['utm', 'UTM'], ['pesos', 'Pesos']] },
    { k: 'fecha', label: 'Fecha (para avisar si el valor no es el vigente)', type: 'date' },
    { k: 'reajuste', label: 'Reajuste IPC (%, opcional)', ph: '' },
  ] },
];
const calcType = (id) => CALC_TYPES.find((t) => t.id === fold(String(id || '')).replace(/[^a-z0-9]/g, '')) || CALC_TYPES.find((t) => fold(t.title).includes(fold(String(id || '')))) || null;

function calcRun(typeId, data) {
  const t = calcType(typeId);
  if (!t) return { error: `Calculadora desconocida: ${typeId}. Tipos: ${CALC_TYPES.map((x) => x.id).join(', ')}` };
  try {
    return { type: t, ...t.run(data || {}) };
  } catch (e) {
    return { type: t, error: e?.message || 'No se pudo calcular' };
  }
}

// Resultado como Markdown (para notas, informes y PDF).
function calcMarkdown(typeId, data) {
  const r = calcRun(typeId, data);
  const t = r.type || calcType(typeId);
  const head = `### ${t ? `${t.icon} ${t.title}` : 'Cálculo'}`;
  if (r.error) return `${head}\n\n⚠️ ${r.error}`;
  const inputs = t.fields.filter((f) => String(data?.[f.k] ?? '').trim()).map((f) => {
    const v = data[f.k];
    const opt = f.options?.find(([k]) => k === v);
    return `${f.label}: ${opt ? opt[1] : f.type === 'date' ? calcDmy(calcIso(v)) || v : v}`;
  });
  return [
    head,
    inputs.length ? `*${inputs.join(' · ')}*` : '',
    '',
    '| Concepto | Monto | Detalle |',
    '|:--|--:|:--|',
    ...r.rows.map(([a, b, c]) => `| ${a} | ${b} | ${c || ''} |`),
    `| **${r.total[0]}** | **${r.total[1]}** | |`,
    '',
    ...(r.warnings || []).map((w) => `> ${w}`),
    r.used?.length ? `\n*Parámetros: ${r.used.join(' · ')}. Calculado el ${calcDmy(dateKey())}.*` : '',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

// ---------- Formulario de una calculadora ----------
function calcForm(typeId, values = {}, { onChange } = {}) {
  const t = calcType(typeId) || CALC_TYPES[0];
  const data = { ...values };
  const out = el('div', { className: 'calc-out' });
  const paint = () => {
    const r = calcRun(t.id, data);
    if (r.error) {
      out.replaceChildren(el('p', { className: 'muted' }, r.error), ...(r.warnings || []).map((w) => el('p', { className: 'calc-warn' }, w)));
      return;
    }
    out.replaceChildren(
      el('table', { className: 'calc-table' }, [el('tbody', {}, [
        ...r.rows.map(([a, b, c]) => el('tr', {}, [el('td', {}, [a, c ? el('div', { className: 'muted calc-sub' }, c) : '']), el('td', { className: 'calc-num' }, b)])),
        el('tr', { className: 'calc-total' }, [el('td', {}, r.total[0]), el('td', { className: 'calc-num' }, r.total[1])]),
      ])]),
      ...(r.warnings || []).map((w) => el('p', { className: w.startsWith('⚠️') ? 'calc-warn' : 'calc-info muted' }, w)),
      r.used?.length ? el('details', { className: 'calc-used' }, [el('summary', {}, 'Parámetros usados'), el('ul', {}, r.used.map((u) => el('li', {}, u)))]) : ''
    );
  };
  const inputs = t.fields.map((f) => {
    let inp;
    if (f.options) {
      inp = el('select', { ariaLabel: f.label }, f.options.map(([v, l]) => el('option', { value: v, selected: String(data[f.k] ?? f.options[0][0]) === v }, l)));
      if (data[f.k] == null) data[f.k] = f.options[0][0];
    } else inp = el('input', { type: f.type === 'date' ? 'date' : 'text', value: f.type === 'date' ? calcIso(data[f.k]) : data[f.k] ?? '', placeholder: f.ph || '', ariaLabel: f.label });
    inp.dataset.k = f.k;
    inp.addEventListener(f.options ? 'change' : 'input', () => {
      data[f.k] = inp.value;
      paint();
      onChange?.(data);
    });
    return el('label', { className: 'calc-field' }, [el('span', {}, f.label), inp, f.hint ? el('small', { className: 'muted' }, f.hint) : '']);
  });
  paint();
  const box = el('div', { className: 'calc-form' }, [el('div', { className: 'calc-fields' }, inputs), out]);
  box.calcData = data;
  box.calcType = t;
  return box;
}

// ---------- Vista 🧮 Calculadoras ----------
const calcState = { cur: 'art53', values: {} };
function calcEditProfile() {
  if (typeof proOpenProfile !== 'function') return;
  let note = proProfileNote();
  if (!note) {
    proOpenProfile();
    note = proProfileNote();
  }
  if (note && !/^##\s+Par[aá]metros de c[aá]lculo/m.test(note.body)) {
    note.body = `${note.body.replace(/\s+$/, '')}\n\n${CALC_PROFILE_DEFAULT}`;
    note.updatedAt = Date.now();
    dataRev++;
    save();
  }
  if (note) openNote(note);
}
const calcBlock = (typeId, data) => ['```calculadora', `tipo: ${typeId}`, ...Object.entries(data || {}).filter(([k, v]) => k !== 'tipo' && String(v ?? '').trim()).map(([k, v]) => `${k}: ${String(v).replace(/\n/g, ' ')}`), '```'].join('\n');
function calcInsertInNote(typeId, data) {
  openPicker({
    placeholder: 'Insertar la calculadora al final de la nota…',
    items: (q) => gvLive().filter((n) => !q || fold(n.path).includes(fold(q))).slice(0, 40).map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => {
      n.body = `${n.body.replace(/\s+$/, '')}\n\n${calcBlock(typeId, data)}\n`;
      n.updatedAt = Date.now();
      dataRev++;
      save();
      openNote(n);
      showToastMessage(`Calculadora agregada a «${baseName(n.path)}».`);
    } })),
  });
}
async function calcPdf(typeId, data, withFirma) {
  const t = calcType(typeId);
  const md = [`# ${t.title}`, `*${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}*`, '', calcMarkdown(typeId, data).replace(/^### .*\n/, ''), withFirma ? `\n---\n${firmaMarkdown()}` : ''].join('\n');
  await exportNotesPdf([{ id: `calc-${uid()}`, path: t.title, body: md }], { title: t.title });
}

function renderCalculadoras() {
  const box = $('#view-calculadoras');
  if (!box) return;
  const t = calcType(calcState.cur) || CALC_TYPES[0];
  const values = (calcState.values[t.id] ||= {});
  const form = calcForm(t.id, values, { onChange: (d) => Object.assign(values, d) });
  const firma = firmaCheckbox();
  const { origin } = calcParams();
  const bar = el('div', { className: 'gv-bar' }, [
    gvSeg(CALC_TYPES.map((x) => [x.id, `${x.icon} ${x.short}`]), t.id, (v) => { calcState.cur = v; renderCalculadoras(); }),
  ]);
  const actions = el('div', { className: 'gv-bar calc-actions' }, [
    gvBtn('📋 Copiar', async () => {
      const md = calcMarkdown(t.id, form.calcData);
      try {
        await navigator.clipboard.writeText(md);
        showToastMessage('Resultado copiado (en Markdown).');
      } catch {
        showToastMessage('No se pudo copiar.');
      }
    }, 'gv-chip', 'Copiar el resultado como tabla en Markdown'),
    gvBtn('📝 Insertar en una nota', () => calcInsertInNote(t.id, form.calcData), 'gv-chip', 'Agrega esta calculadora (con sus datos) a una nota'),
    gvBtn('📄 PDF', () => calcPdf(t.id, form.calcData, firma.on), 'gv-chip', 'Descargar el resultado en PDF'),
    firma.label,
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'muted calc-origin', title: 'Si no los agregaste al perfil, se usan los de fábrica' }, `Parámetros: ${origin.vals === 'perfil' ? 'del perfil' : 'de fábrica'}`),
    gvBtn('⚙ Parámetros', calcEditProfile, 'gv-chip', 'UTM, UF, tasas de interés penal, escala del impuesto único y topes, en el perfil'),
  ]);
  box.replaceChildren(
    gvHead('calculadoras', 'Calculadoras del contador con los parámetros del perfil (UTM, UF, tasas de interés penal por semestre, escala del impuesto único y topes). Cada resultado dice qué valor usó, de cuándo es y su fuente, y avisa ⚠️ si puede estar desactualizado. También puedes ponerlas dentro de una nota con un bloque ```calculadora.'),
    bar,
    actions,
    el('div', { className: 'gv-fill calc-scroll' }, el('div', { className: 'card calc-card' }, [el('h3', { className: 'spec-h' }, `${t.icon} ${t.title}`), form]))
  );
}

// ---------- Calculadoras dentro de las notas: bloque ```calculadora ----------
function calcParseBlock(code) {
  const data = {};
  String(code || '').split('\n').forEach((l) => {
    const m = l.match(/^\s*([\wáéíóúñ_ -]+?)\s*:\s*(.*)$/i);
    if (m) data[fold(m[1]).replace(/\s+/g, '_')] = m[2].trim();
  });
  return data;
}
// HTML fijo (lo que se ve antes de hidratar y lo que sale en el PDF).
function calcStaticHtml(code) {
  const d = calcParseBlock(code);
  return renderMd(calcMarkdown(d.tipo || 'art53', d), { noTasks: true });
}
// Reescribe el bloque n° idx de una nota con los datos nuevos.
function calcSaveBlock(note, idx, typeId, data) {
  const lines = note.body.split('\n');
  let k = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!/^```\s*(calculadora|calc)\s*$/i.test(lines[i])) continue;
    k++;
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    if (k === idx) {
      lines.splice(i, j - i + 1, ...calcBlock(typeId, data).split('\n'));
      note.body = lines.join('\n');
      note.updatedAt = Date.now();
      dataRev++;
      save();
      return true;
    }
    i = j;
  }
  return false;
}
function calcHydrate(container, noteId) {
  const boxes = [...(container?.querySelectorAll?.('.calc-box') || [])];
  boxes.forEach((b, idx) => {
    if (b.dataset.done) return;
    b.dataset.done = '1';
    const d = calcParseBlock(decodeURIComponent(b.dataset.code || ''));
    const t = calcType(d.tipo || 'art53');
    if (!t) return;
    const form = calcForm(t.id, d);
    const note = noteId ? noteById(noteId) : null;
    const saveBtn = note ? gvBtn('Guardar los datos en la nota', () => {
      if (calcSaveBlock(note, idx, t.id, form.calcData)) showToastMessage('Datos guardados en la nota.');
    }, 'link') : '';
    b.replaceChildren(el('div', { className: 'calc-in-note' }, [el('div', { className: 'calc-in-head' }, [el('strong', {}, `${t.icon} ${t.title}`), el('span', { className: 'gv-spacer' }), saveBtn, gvBtn('Abrir en Calculadoras', () => {
      calcState.cur = t.id;
      calcState.values[t.id] = { ...form.calcData };
      showView('calculadoras');
    }, 'link')]), form]));
  });
}
if (typeof hydrateQueries === 'function') {
  const prevHydrate = hydrateQueries;
  // eslint-disable-next-line no-global-assign
  hydrateQueries = function hydrateQueriesCalc(container, selfId) {
    const r = prevHydrate(container, selfId);
    calcHydrate(container, selfId);
    return r;
  };
}
if (typeof SLASH_ITEMS !== 'undefined') SLASH_ITEMS.push({ group: 'Insertar', icon: '🧮', label: 'Calculadora', detail: 'Art. 53, impuesto único, APV, finiquito, UF/UTM', keys: 'calculadora calculo interes penal art 53 iusc apv finiquito uf utm', text: '```calculadora\ntipo: art53\nimpuesto: ‸\nvencimiento: \npago: \nreajuste: \n```' });

// =========================================================
// 👥 Panel de clientes
// =========================================================
const CLIENT_FOLDER = 'Clientes';
const clientIs = (n) => /^cliente$/i.test(String(propOf(n, 'tipo') || '').trim()) || (folderOf(n.path) === CLIENT_FOLDER && !/^informe/i.test(String(propOf(n, 'tipo') || '')));
const clientList = () => gvCached('clients', () => gvLive().filter(clientIs).sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), 'es')));
const clientListProp = (n, k) => {
  const v = propOf(n, k);
  return (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
};
function clientInfo(n) {
  return {
    note: n,
    name: baseName(n.path),
    rut: String(propOf(n, 'rut') || ''),
    regimen: String(propOf(n, 'regimen') || propOf(n, 'régimen') || ''),
    giro: String(propOf(n, 'giro') || ''),
    contacto: String(propOf(n, 'contacto') || ''),
    estado: String(propOf(n, 'estado') || 'activo'),
    obligaciones: clientListProp(n, 'obligaciones'),
  };
}
const CLIENT_TEMPLATE = (name) => `---
tipo: cliente
rut:
regimen:
giro:
obligaciones: [F29 por internet, Cotizaciones previsionales (pago electrónico), F22]
contacto:
estado: activo
---
# ${name}

## Datos
- Representante:
- Inicio de la relación:

## Pendientes
- [ ]

## Bitácora
- ${calcDmy(dateKey())}: cliente creado.
`;
// «obligaciones» usa los nombres del calendario del perfil (basta una parte: «F29 por internet»).
function clientEvents(info, days = 45) {
  const to = dateKey(new Date(Date.now() + days * 864e5));
  if (typeof ctEvents !== 'function') return [];
  return ctEvents(dateKey(), to).filter((e) => e.kind === 'obl' && (!info.obligaciones.length || info.obligaciones.some((o) => fold(e.title).includes(fold(o)) || fold(o).includes(fold(e.title)))));
}
function clientTasks(info) {
  const name = fold(info.name);
  const linked = (t) => t.noteId === info.note.id || fold(t.title).includes(name) || (t.noteId && (noteById(t.noteId)?.body.split('\n')[t.line] || '').toLowerCase().includes(`[[${info.name.toLowerCase()}`));
  return allTasks().filter((t) => !t.done && fold(t.title).includes(name)).concat(noteTasks().filter((t) => !t.done && linked(t)));
}
function clientSection(info, title) {
  const m = info.note.body.match(new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
  return m ? m[1].split('\n').filter((l) => l.trim()) : [];
}
// Agrega una línea al final de una sección (la crea si no existe).
function clientAppend(note, title, line) {
  const lines = note.body.replace(/\s+$/, '').split('\n');
  const h = lines.findIndex((l) => new RegExp(`^##\\s+${title}`, 'i').test(l));
  if (h < 0) lines.push('', `## ${title}`, line);
  else {
    let end = h + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end++;
    while (end > h + 1 && !lines[end - 1].trim()) end--;
    // Una casilla vacía de la plantilla se reemplaza.
    if (/^- \[ \]\s*$/.test(lines[end - 1] || '')) lines.splice(end - 1, 1, line);
    else lines.splice(end, 0, line);
  }
  note.body = `${lines.join('\n')}\n`;
  note.updatedAt = Date.now();
  dataRev++;
  save();
}
function clientNew(e) {
  promptText({ placeholder: 'Nombre del cliente (p. ej. Comercial Cachapoal Ltda.)', action: 'Crear cliente', onSubmit: (name) => {
    const clean = cleanName(name);
    if (findNoteByName(`${CLIENT_FOLDER}/${clean}`)) return showToastMessage('Ya existe un cliente con ese nombre.');
    if (!state.folders.includes(CLIENT_FOLDER)) state.folders.push(CLIENT_FOLDER);
    const n = createNote({ folder: CLIENT_FOLDER, title: clean, body: CLIENT_TEMPLATE(clean), open: false, edit: false, log: false });
    gvCfg().view.clientes = { ...(gvCfg().view.clientes || {}), cur: n.id };
    save();
    showView('clientes', { newTab: !!(e?.ctrlKey || e?.metaKey) });
    showToastMessage('Cliente creado: completa sus datos en la nota (RUT, régimen, giro y obligaciones).');
  } });
}

const clState = { q: '', estado: 'activo' };
function renderClientes() {
  const box = $('#view-clientes');
  if (!box) return;
  const all = clientList().map(clientInfo);
  const list = all.filter((c) => (clState.estado === 'todos' || fold(c.estado) === fold(clState.estado)) && (!clState.q || fold(`${c.name} ${c.rut} ${c.giro} ${c.regimen}`).includes(fold(clState.q))));
  let cur = all.find((c) => c.note.id === gvOpt('clientes', 'cur', '')) || list[0] || null;
  const pick = (c) => gvSetOpt('clientes', { cur: c.note.id });
  const search = el('input', { type: 'search', className: 'gv-input', placeholder: 'Buscar cliente…', value: clState.q, ariaLabel: 'Buscar cliente' });
  search.addEventListener('input', () => {
    clState.q = search.value;
    renderClientes();
    $('#view-clientes .gv-input')?.focus();
    const s = $('#view-clientes .gv-input');
    if (s) s.selectionStart = s.selectionEnd = s.value.length;
  });
  const bar = el('div', { className: 'gv-bar' }, [
    search,
    gvSeg([['activo', 'Activos'], ['todos', 'Todos']], clState.estado, (v) => { clState.estado = v; renderClientes(); }),
    el('span', { className: 'muted gv-count' }, plural(list.length, 'cliente', 'clientes')),
    el('span', { className: 'gv-spacer' }),
    gvBtn('＋ Nuevo cliente', clientNew, 'gv-chip'),
  ]);
  const side = el('div', { className: 'cl-list' }, list.length ? list.map((c) => {
    const next = clientEvents(c, 45)[0];
    const pend = clientTasks(c).length;
    const b = el('button', { className: `cl-item${cur && c.note.id === cur.note.id ? ' on' : ''}` }, [
      el('strong', {}, c.name),
      el('span', { className: 'muted' }, [c.regimen || 'Sin régimen', c.rut ? ` · ${c.rut}` : ''].join('')),
      el('span', { className: 'cl-badges' }, [next ? el('span', { className: `pro-badge${ctDaysLeft(next.date) <= 3 ? ' warn' : ''}` }, `📅 ${ctFmt(next.date)} ${ctShort(next.title)}`) : '', pend ? el('span', { className: 'pro-badge' }, `☐ ${pend}`) : '', fold(c.estado) !== 'activo' ? el('span', { className: 'pro-badge' }, c.estado) : '']),
    ]);
    b.addEventListener('click', () => pick(c));
    b.addEventListener('dblclick', (e) => gvOpen(c.note, e));
    return b;
  }) : [el('p', { className: 'muted' }, all.length ? 'Ningún cliente coincide.' : 'Aún no tienes clientes. Crea uno: queda como nota en la carpeta «Clientes», con sus datos en las propiedades.')]);
  let detail;
  if (!cur) detail = el('div', { className: 'card cl-empty' }, [el('h3', { className: 'spec-h' }, '👥 Panel de clientes'), el('p', { className: 'muted' }, 'Cada cliente es una nota con `tipo: cliente` (RUT, régimen, giro, obligaciones y contacto). Aquí verás sus próximos vencimientos según sus obligaciones, sus pendientes, las notas que lo enlazan y su bitácora, y podrás preparar su informe.'), gvBtn('＋ Nuevo cliente', clientNew, 'primary')]);
  else {
    const evs = clientEvents(cur, 45);
    const tasks = clientTasks(cur);
    const back = typeof backlinksOf === 'function' ? backlinksOf(cur.note).linked : [];
    const log = clientSection(cur, 'Bit[aá]cora').filter((l) => /^\s*-/.test(l)).slice(-6).reverse();
    const field = (k, v) => el('div', { className: 'cl-field' }, [el('span', { className: 'muted' }, k), el('span', {}, v || '—')]);
    const addTask = () => promptText({ placeholder: `Nuevo pendiente de ${cur.name}`, action: 'Agregar', onSubmit: (t) => { clientAppend(cur.note, 'Pendientes', `- [ ] ${t}`); renderClientes(); } });
    const addLog = () => promptText({ placeholder: `Anotar en la bitácora de ${cur.name}`, action: 'Anotar', onSubmit: (t) => { clientAppend(cur.note, 'Bitácora', `- ${calcDmy(dateKey())}: ${t}`); renderClientes(); } });
    detail = el('div', { className: 'cl-detail' }, [
      el('div', { className: 'gv-head-row cl-head' }, [
        el('h2', { className: 'gv-title' }, cur.name),
        el('span', { className: 'gv-spacer' }),
        gvBtn('Abrir la nota', (e) => gvOpen(cur.note, e), 'gv-chip'),
        gvBtn('📄 Informe al cliente', () => informeOpen(cur.note), 'gv-chip primary'),
      ]),
      el('div', { className: 'spec-grid' }, [
        el('div', { className: 'card spec-card' }, [el('h3', { className: 'spec-h' }, '🗂 Datos'), field('RUT', cur.rut), field('Régimen', cur.regimen), field('Giro', cur.giro), field('Contacto', cur.contacto), field('Estado', cur.estado), field('Obligaciones', cur.obligaciones.join(', ') || 'todas las del calendario')]),
        el('div', { className: 'card spec-card' }, [el('h3', { className: 'spec-h' }, '📅 Próximos vencimientos (45 días)'), evs.length ? el('div', { className: 'ct-up' }, evs.slice(0, 10).map((e) => ctEventChip(e, { long: true }))) : el('p', { className: 'muted' }, 'Nada en los próximos 45 días.')]),
        el('div', { className: 'card spec-card' }, [el('h3', { className: 'spec-h' }, '☐ Pendientes'), tasks.length ? el('div', { className: 'pro-lines' }, tasks.slice(0, 14).map((t) => {
          const b = el('button', { className: 'pro-line' }, [el('strong', {}, t.title), el('span', { className: 'muted' }, [t.due ? `📅 ${calcDmy(t.due)}` : '', t.noteId && t.noteId !== cur.note.id ? ` · ${baseName(noteById(t.noteId)?.path || '')}` : ''].join(''))]);
          b.addEventListener('click', (e) => (t.noteId ? openNoteAtLine(t.noteId, t.line, { newTab: e.ctrlKey || e.metaKey }) : showView('today')));
          return b;
        })) : el('p', { className: 'muted' }, 'Sin pendientes.'), gvBtn('＋ Pendiente', addTask, 'link')]),
        el('div', { className: 'card spec-card' }, [el('h3', { className: 'spec-h' }, '🔗 Notas que lo enlazan'), back.length ? el('div', { className: 'pro-lines' }, back.slice(0, 12).map(({ note }) => {
          const b = el('button', { className: 'pro-line' }, [el('strong', {}, baseName(note.path)), el('span', { className: 'muted' }, folderOf(note.path))]);
          b.addEventListener('click', (e) => gvOpen(note, e));
          return b;
        })) : el('p', { className: 'muted' }, `Ninguna nota enlaza a [[${cur.name}]] todavía.`)]),
        el('div', { className: 'card spec-card' }, [el('h3', { className: 'spec-h' }, '📝 Bitácora'), log.length ? el('ul', { className: 'cl-log' }, log.map((l) => el('li', {}, plainText(l.replace(/^\s*-\s*/, ''))))) : el('p', { className: 'muted' }, 'Sin anotaciones.'), gvBtn('＋ Anotar', addLog, 'link')]),
      ]),
    ]);
  }
  box.replaceChildren(
    gvHead('clientes', 'Tus clientes, cada uno como nota (tipo: cliente) con RUT, régimen, giro, obligaciones y contacto. Los vencimientos salen del calendario del perfil filtrados por sus «obligaciones». Los datos quedan solo en tu bóveda.'),
    bar,
    el('div', { className: 'cl-wrap gv-fill' }, [side, detail])
  );
}

// =========================================================
// 📄 Informe al cliente
// =========================================================
function informeMarkdown(note, { dias = 30, pendientes = true, novedades = true, observaciones = '', firma = false } = {}) {
  const c = clientInfo(note);
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  const out = [`# Informe para ${c.name}`, `*${fecha} · período: próximos ${dias} días${c.rut ? ` · RUT ${c.rut}` : ''}*`, ''];
  const evs = clientEvents(c, dias);
  out.push('## Próximos vencimientos');
  if (evs.length) out.push('| Fecha | Obligación | Detalle |', '|:--|:--|:--|', ...evs.map((e) => `| ${ctFmt(e.date, { weekday: 'short', day: 'numeric', month: 'short' })} | ${e.title} | ${(e.detail || '').replace(/\|/g, '/')} |`));
  else out.push(`No hay vencimientos en los próximos ${dias} días.`);
  out.push('', '> Fechas según el calendario general (corridas al día hábil siguiente cuando corresponde). Confírmalas con el calendario del SII.', '');
  if (pendientes) {
    const ts = clientTasks(c);
    out.push('## Pendientes', ...(ts.length ? ts.slice(0, 20).map((t) => `- ${t.title}${t.due ? ` (para el ${calcDmy(t.due)})` : ''}`) : ['Sin pendientes.']), '');
  }
  if (novedades && typeof ctEvents === 'function') {
    const nov = ctEvents(dateKey(), dateKey(new Date(Date.now() + Math.max(dias, 90) * 864e5))).filter((e) => e.kind !== 'obl');
    const seen = new Set();
    const items = nov.filter((e) => {
      const k = `${e.date}|${e.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 12);
    out.push('## Novedades normativas a considerar', ...(items.length ? items.map((e) => `- **${calcDmy(e.date)}** · ${plainText(e.title.replace(/^[⚠️⚖️\s]+/u, ''))}`) : ['No hay cambios normativos con fecha en los próximos meses.']), '');
  }
  if (String(observaciones).trim()) out.push('## Observaciones', String(observaciones).trim(), '');
  if (firma && firmaReady()) out.push('---', firmaMarkdown());
  return out.join('\n');
}

let informeBack = null;
function informeClose() {
  if (informeBack) informeBack.hidden = true;
}
function informeOpen(note, init = {}) {
  if (!note) return;
  if (!informeBack) {
    informeBack = el('div', { id: 'informe', className: 'modal-back', hidden: true });
    informeBack.addEventListener('click', (e) => e.target === informeBack && informeClose());
    informeBack.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        informeClose();
      }
    });
    document.body.append(informeBack);
  }
  const c = clientInfo(note);
  const opts = { dias: [15, 30, 45, 60, 90].includes(init.dias) ? init.dias : 30, pendientes: true, novedades: true, observaciones: String(init.observaciones || '') };
  const firma = firmaCheckbox();
  const text = el('textarea', { className: 'informe-text', spellcheck: true, ariaLabel: 'Texto del informe' });
  let edited = false;
  text.addEventListener('input', () => (edited = true));
  const rebuild = () => {
    if (edited && !confirm('Vas a perder los cambios que hiciste al texto. ¿Rehacerlo?')) return;
    edited = false;
    text.value = informeMarkdown(note, { ...opts, firma: firma.on });
  };
  const days = el('select', { ariaLabel: 'Período' }, [15, 30, 45, 60, 90].map((d) => el('option', { value: d, selected: d === opts.dias }, `${d} días`)));
  days.addEventListener('change', () => { opts.dias = Number(days.value); rebuild(); });
  const chk = (k, label) => {
    const b = el('input', { type: 'checkbox', checked: opts[k] });
    b.addEventListener('change', () => { opts[k] = b.checked; rebuild(); });
    return el('label', {}, [b, ` ${label}`]);
  };
  firma.label.querySelector('input').addEventListener('change', rebuild);
  const md = () => text.value;
  const title = `Informe ${c.name} ${dateKey()}`;
  const asNote = () => {
    const folder = `${CLIENT_FOLDER}/Informes`;
    [CLIENT_FOLDER, folder].forEach((f) => state.folders.includes(f) || state.folders.push(f));
    const n = createNote({ folder, title, body: `---\ntipo: informe\ncliente: "[[${c.name}]]"\nfecha: ${dateKey()}\n---\n${md()}`, open: false, edit: false, log: false });
    clientAppend(note, 'Bitácora', `- ${calcDmy(dateKey())}: informe preparado ([[${baseName(n.path)}]]).`);
    showToastMessage('Informe guardado en «Clientes/Informes».');
    return n;
  };
  const toDoc = async () => {
    if (typeof kataDriveUpload !== 'function' || typeof kataDocHtml !== 'function') return showToastMessage('Google Docs solo está disponible al abrir la app desde Claude.');
    try {
      showToastMessage('Creando el Google Doc…');
      const r = await kataDriveUpload(title, kataDocHtml(md()), 'text/html');
      showToastMessage(`Google Doc creado en ${r.folder}.`);
      if (r.url) kataOpenUrl(r.url);
    } catch (e) {
      showToastMessage(`No se pudo crear el Google Doc: ${e?.message || e}`);
    }
  };
  const close = el('button', { className: 'iv-close modal-x', type: 'button', ariaLabel: 'Cerrar' }, '✕');
  close.addEventListener('click', informeClose);
  informeBack.replaceChildren(el('div', { className: 'modal informe-modal', role: 'dialog', ariaModal: 'true', ariaLabel: `Informe para ${c.name}` }, [
    el('header', { className: 'modal-head' }, [el('h3', {}, `📄 Informe para ${c.name}`), close]),
    el('div', { className: 'informe-opts' }, [el('label', {}, ['Período: ', days]), chk('pendientes', 'Pendientes'), chk('novedades', 'Novedades normativas'), firma.label]),
    el('p', { className: 'muted informe-hint' }, 'Revisa y edita el texto antes de exportarlo: es lo que verá tu cliente. Agrega tus observaciones al final.'),
    text,
    el('div', { className: 'row end informe-foot' }, [
      gvBtn('Guardar como nota', () => { asNote(); informeClose(); }, ''),
      gvBtn('📝 Google Doc', toDoc, ''),
      gvBtn('📄 Descargar PDF', async () => { await exportNotesPdf([{ id: `inf-${uid()}`, path: title, body: md() }], { title }); }, 'primary'),
    ]),
  ]));
  text.value = informeMarkdown(note, { ...opts, firma: firma.on });
  informeBack.hidden = false;
  text.focus();
  text.setSelectionRange(0, 0);
  text.scrollTop = 0;
}

// =========================================================
// Registro: vistas, menú «Especialidades» y paleta
// =========================================================
GV_VIEWS.push(
  { id: 'clientes', title: 'Clientes', icon: 'users', hint: 'Panel de clientes: datos, vencimientos según sus obligaciones, pendientes, notas e informe' },
  { id: 'calculadoras', title: 'Calculadoras', icon: 'calc', hint: 'Calculadoras: art. 53 CT, impuesto único, APV, finiquito y UF/UTM, con los parámetros del perfil' }
);
if (!ICONS.users) ICONS.users = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c3 .2 5.5 2.3 5.5 5.3"/>';
if (!ICONS.calc) ICONS.calc = '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3.5" rx=".8"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>';
['clientes', 'calculadoras'].forEach((id) => {
  const v = GV_VIEWS.find((x) => x.id === id);
  VIEW_TITLES[id] = v.title;
  VIEW_ICONS[id] = v.icon;
  $('#views-pane main').append(el('section', { id: `view-${id}`, className: 'view gv-view' }));
  const b = el('button', { className: 'rib', title: v.hint, ariaLabel: v.title }, [ico(v.icon), el('span', { className: 'rib-label' }, v.title)]);
  b.dataset.view = id;
  b.addEventListener('click', (e) => showView(id, { newTab: e.ctrlKey || e.metaKey }));
  const prof = $('#rib-pro-profile');
  if (prof && prof.parentElement) prof.before(b);
  else $('.ribbon [data-group="pro"] .rib-gitems')?.append(b);
});
Object.assign(VIEW_RENDER, { clientes: renderClientes, calculadoras: renderCalculadoras });
if (typeof menusRefresh === 'function') menusRefresh();

if (typeof COMMANDS_EXTRA !== 'undefined') {
  COMMANDS_EXTRA.push((note) => {
    if (typeof proOn === 'function' && !proOn()) return [];
    const out = [{ label: 'Nuevo cliente…', action: () => clientNew() }];
    if (note && clientIs(note)) out.push({ label: `Informe al cliente: ${baseName(note.path)}`, action: () => informeOpen(note) });
    return out;
  });
}
