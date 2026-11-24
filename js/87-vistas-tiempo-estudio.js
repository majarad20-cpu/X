'use strict';

// ---------- Vistas gráficas (3): Línea de tiempo y Tarjetas de estudio ----------
// Línea de tiempo: busca fechas en el texto de las notas (2027-01-01, 15-10-2027, 15/10/2027 y
// «15 de octubre de 2027») o en sus propiedades de fecha, y las pone en columnas por mes, trimestre o
// año, con la columna de hoy marcada. Sirve para ver vigencias, plazos y cambios de normas. Tocar una
// fecha abre la nota en esa línea.
// Tarjetas de estudio: cada nota (o cada sección «## …») es una tarjeta: el título por delante y la
// idea central o el texto de la sección por detrás. Repaso espaciado con cajas (1, 3, 7, 16, 35 días),
// guardado en los ajustes (state.settings.gv.srs) para seguir en cualquier dispositivo.

// =========================================================
// 📅 Línea de tiempo
// =========================================================
const GV_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const GV_MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const gvLine = { q: '' };

function gvIso(y, m, d) {
  const Y = Number(y);
  const M = Number(m);
  const D = Number(d);
  if (Y < 1900 || Y > 2100 || M < 1 || M > 12 || D < 1 || D > 31) return null;
  const dt = new Date(Y, M - 1, D);
  if (dt.getMonth() !== M - 1) return null;
  return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}

const GV_DATE_RE = new RegExp(String.raw`\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b|\b(\d{1,2})\s+de\s+(${GV_MONTHS.join('|')}|setiembre)\s+(?:de|del)\s+(\d{4})\b`, 'gi');

// Fechas de una línea: [{ date, at }].
function gvDatesIn(line) {
  const out = [];
  for (const m of line.matchAll(GV_DATE_RE)) {
    let d = null;
    if (m[1]) d = gvIso(m[1], m[2], m[3]);
    else if (m[4]) d = gvIso(m[6], m[5], m[4]);
    else if (m[7]) {
      const mon = m[8].toLowerCase() === 'setiembre' ? 9 : GV_MONTHS.indexOf(m[8].toLowerCase()) + 1;
      d = gvIso(m[9], mon, m[7]);
    }
    if (d) out.push({ date: d, at: m.index });
  }
  return out;
}

const gvSnippet = (s) => plainText(s.replace(/^\s*(?:[-*+]|\d+\.|>)\s*(\[.\]\s*)?/, '').replace(/\|/g, ' · ').replace(/\s+/g, ' ')).replace(/^·\s*|\s*·$/g, '').trim().slice(0, 180);

// Elementos de la línea de tiempo: { date, note, line, text, key }.
function gvTimeItems(src, mode) {
  return gvCached(`time:${mode}:${JSON.stringify(src)}`, () => {
    const out = [];
    gvNotes(src).forEach((n) => {
      const { end } = parseProps(n.body);
      if (mode === 'props') {
        noteFields(n).forEach((p) => {
          if (p.inline) return;
          const d = gvDatesIn(String(p.value || ''))[0];
          if (d) out.push({ date: d.date, note: n, line: p.line, text: `${p.key}: ${p.value}`, key: p.key });
        });
        return;
      }
      const seen = new Set();
      let inCode = false;
      n.body.split('\n').forEach((line, i) => {
        if (i <= end) return;
        if (/^\s*```/.test(line)) inCode = !inCode;
        if (inCode || !/\d{4}/.test(line)) return;
        gvDatesIn(line).forEach(({ date }) => {
          if (seen.has(date)) return;
          seen.add(date);
          out.push({ date, note: n, line: i, text: gvSnippet(line) });
        });
      });
    });
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  });
}

const gvPeriod = (date, zoom) => {
  const [y, m] = date.split('-').map(Number);
  if (zoom === 'anio') return String(y);
  if (zoom === 'trimestre') return `${y}-T${Math.ceil(m / 3)}`;
  return `${y}-${String(m).padStart(2, '0')}`;
};
const gvPeriodLabel = (p, zoom) => {
  if (zoom === 'anio') return p;
  if (zoom === 'trimestre') return `${p.split('-')[1]} ${p.split('-')[0]}`;
  const [y, m] = p.split('-').map(Number);
  return `${GV_MON[m - 1]} ${y}`;
};
// Todos los periodos entre dos fechas (también los vacíos, para que el eje sea continuo).
function gvPeriods(from, to, zoom) {
  const out = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy;
  let m = zoom === 'trimestre' ? Math.floor((fm - 1) / 3) * 3 + 1 : zoom === 'anio' ? 1 : fm;
  const step = zoom === 'anio' ? 12 : zoom === 'trimestre' ? 3 : 1;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(gvPeriod(`${y}-${String(m).padStart(2, '0')}-01`, zoom));
    m += step;
    while (m > 12) {
      m -= 12;
      y++;
    }
    if (out.length > 400) break;
  }
  return out;
}

function gvRange(range) {
  const now = new Date();
  const shift = (months) => dateKey(new Date(now.getFullYear(), now.getMonth() + months, 1));
  if (range === 'proximos') return [shift(0), shift(12)];
  if (range === 'tres') return [shift(-3), shift(36)];
  if (range === 'anio') return [shift(-12), shift(12)];
  return null; // todo
}

function renderLinea() {
  const box = $('#view-linea');
  if (!box) return;
  const src = gvOpt('linea', 'src', { t: 'all' });
  const mode = gvOpt('linea', 'mode', 'texto');
  const zoom = gvOpt('linea', 'zoom', 'mes');
  const range = gvOpt('linea', 'range', 'tres');
  const today = dateKey();
  let items = gvTimeItems(src, mode);
  const q = fold(gvLine.q.trim());
  if (q) items = items.filter((it) => fold(`${baseName(it.note.path)} ${it.text}`).includes(q));
  const r = gvRange(range);
  if (r) items = items.filter((it) => it.date >= r[0] && it.date <= `${r[1].slice(0, 7)}-31`);
  const from = r ? r[0] : items[0]?.date || today;
  const to = r ? r[1] : items[items.length - 1]?.date || today;
  const periods = items.length || r ? gvPeriods(from < to ? from : to, to > from ? to : from, zoom) : [];
  const byPeriod = new Map(periods.map((p) => [p, []]));
  items.forEach((it) => byPeriod.get(gvPeriod(it.date, zoom))?.push(it));
  const nowP = gvPeriod(today, zoom);
  const search = el('input', { type: 'search', className: 'gv-search', placeholder: 'Filtrar (p. ej. Ley 21.719, vigencia, IVA…)', value: gvLine.q, ariaLabel: 'Filtrar las fechas' });
  let t = 0;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      gvLine.q = search.value;
      renderLinea();
      $('#view-linea .gv-search')?.focus();
      const s = $('#view-linea .gv-search');
      if (s) s.setSelectionRange(s.value.length, s.value.length);
    }, 250);
  });
  const bar = el('div', { className: 'gv-bar' }, [
    gvSourceButton(src, (s) => gvSetOpt('linea', { src: s })),
    gvSeg([['texto', 'Fechas en el texto'], ['props', 'Fechas en propiedades']], mode, (v) => gvSetOpt('linea', { mode: v })),
    gvSeg([['proximos', 'Próximos 12 meses'], ['anio', '± 1 año'], ['tres', '−3 meses a +3 años'], ['todo', 'Todo']], range, (v) => gvSetOpt('linea', { range: v })),
    gvSeg([['mes', 'Meses'], ['trimestre', 'Trimestres'], ['anio', 'Años']], zoom, (v) => gvSetOpt('linea', { zoom: v })),
    search,
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'muted gv-count' }, plural(items.length, 'fecha', 'fechas')),
  ]);
  const cols = periods.map((p) => {
    const list = byPeriod.get(p) || [];
    const cards = list.slice(0, 60).map((it) => {
      const past = it.date < today;
      const chip = el('button', { className: `gvl-item${past ? ' past' : ''}${it.date === today ? ' today' : ''}`, title: `${it.date} · ${it.note.path}\n${it.text}` }, [
        el('span', { className: 'gvl-date' }, `${it.date.slice(8, 10)} ${GV_MON[Number(it.date.slice(5, 7)) - 1]}${zoom === 'anio' ? '' : ''}`),
        el('span', { className: 'gvl-note' }, baseName(it.note.path)),
        el('span', { className: 'gvl-text' }, it.text),
      ]);
      chip.addEventListener('click', (e) => openNoteAtLine(it.note.id, it.line, { newTab: e.ctrlKey || e.metaKey }));
      return chip;
    });
    if (list.length > 60) cards.push(gvBtn(`y ${list.length - 60} más…`, () => openPicker({
      placeholder: `${gvPeriodLabel(p, zoom)} · ${plural(list.length, 'fecha', 'fechas')}`,
      items: (typed) => list.filter((it) => fold(`${baseName(it.note.path)} ${it.text}`).includes(fold(typed))).map((it) => ({ label: `${it.date} · ${baseName(it.note.path)}`, detail: it.text, action: () => openNoteAtLine(it.note.id, it.line) })),
    }), 'link'));
    const col = el('section', { className: `gvl-col${p === nowP ? ' now' : p < nowP ? ' past' : ''}${list.length ? '' : ' empty'}` }, [
      el('header', { className: 'gvl-head' }, [el('span', {}, gvPeriodLabel(p, zoom)), p === nowP ? el('span', { className: 'gvl-now' }, 'Hoy') : '', list.length ? el('span', { className: 'kcol-count' }, String(list.length)) : '']),
      el('div', { className: 'gvl-items' }, cards),
    ]);
    return col;
  });
  const strip = el('div', { className: 'gvl-strip gv-fill' }, cols);
  box.replaceChildren(
    gvHead('linea', mode === 'texto' ? 'Las fechas escritas en tus notas (vigencias, plazos, publicaciones en el Diario Oficial) en columnas por periodo. Toca una para abrir la nota en esa línea.' : 'Las propiedades con fecha de tus notas (creada, actualizada, vence…) en columnas por periodo.'),
    bar,
    items.length || periods.length ? strip : el('p', { className: 'empty' }, 'No hay fechas en este origen y periodo.')
  );
  // La columna de hoy, a la vista.
  requestAnimationFrame(() => {
    const now = strip.querySelector('.gvl-col.now');
    if (now) strip.scrollLeft = Math.max(0, now.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft - 24);
  });
}

// =========================================================
// 🃏 Tarjetas de estudio
// =========================================================
const GV_BOXES = [0, 1, 3, 7, 16, 35, 75];
const gvStudy = { key: '', queue: [], shown: false, done: 0, all: false };

// Texto sin propiedades ni título repetido.
function gvBodyText(n) {
  const lines = n.body.split('\n');
  const { end } = parseProps(n.body);
  const rest = lines.slice(end + 1);
  if (rest[0] && /^#\s/.test(rest[0])) rest.shift();
  return rest.join('\n');
}

// La «idea central» o el primer párrafo de verdad.
function gvGist(n) {
  const text = gvBodyText(n);
  const idea = text.match(/\*\*Idea central:?\*\*:?\s*([\s\S]+?)(?:\n\s*\n|$)/i);
  if (idea) return idea[1].trim();
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !/^(#|---|```|>\s*\[!|\||<)/.test(p));
  return (paras[0] || '').slice(0, 900);
}

function gvStudyCards(src, mode) {
  return gvCached(`study:${mode}:${JSON.stringify(src)}`, () => {
    const out = [];
    gvNotes(src).filter((n) => !gvIsMoc(n)).forEach((n) => {
      const title = baseName(n.path);
      if (mode === 'nota') {
        const back = gvGist(n);
        if (back) out.push({ id: n.id, note: n, front: title, back });
        return;
      }
      const text = gvBodyText(n);
      const parts = text.split(/^(?=##\s)/m);
      parts.forEach((p) => {
        const h = p.match(/^##\s+(.+)\n([\s\S]*)$/);
        if (!h) return;
        const body = h[2].trim();
        if (body.replace(/\s/g, '').length < 40) return;
        const head = plainText(h[1]);
        if (/^(relacionadas|fuentes|ver también|enlaces)/i.test(head)) return;
        out.push({ id: `${n.id}#${head}`, note: n, front: `${title}\n› ${head}`, back: body.length > 1400 ? `${body.slice(0, 1400)}…` : body, heading: head });
      });
    });
    return out;
  });
}

const gvSrs = () => gvCfg().srs;
const gvDue = (c) => {
  const r = gvSrs()[c.id];
  return !r || r.due <= dateKey();
};

function gvStudyQueue(cards, all) {
  const due = cards.filter((c) => all || gvDue(c));
  const seen = due.filter((c) => gvSrs()[c.id]);
  const fresh = due.filter((c) => !gvSrs()[c.id]);
  // Primero lo que toca repasar (lo más atrasado antes); luego hasta 20 nuevas, mezcladas.
  seen.sort((a, b) => (gvSrs()[a.id].due < gvSrs()[b.id].due ? -1 : 1));
  const mixed = fresh.map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return [...seen, ...(all ? mixed : mixed.slice(0, 20))];
}

function gvGrade(card, grade) {
  const srs = gvSrs();
  const r = srs[card.id] || { box: 0 };
  let box = r.box || 0;
  if (grade === 1) box = 0;
  else if (grade === 2) box = Math.max(1, box);
  else if (grade === 3) box = Math.min(GV_BOXES.length - 1, box + 1);
  else box = Math.min(GV_BOXES.length - 1, box + 2);
  const d = new Date();
  d.setDate(d.getDate() + GV_BOXES[box]);
  srs[card.id] = { box, due: dateKey(d), seen: (r.seen || 0) + 1 };
  save();
  gvStudy.queue.shift();
  if (grade === 1) gvStudy.queue.push(card); // otra vez, al final de la sesión
  else gvStudy.done++;
  gvStudy.shown = false;
  renderEstudio();
}

function renderEstudio() {
  const box = $('#view-estudio');
  if (!box) return;
  const src = gvOpt('estudio', 'src', null);
  const mode = gvOpt('estudio', 'mode', 'nota');
  const bar = el('div', { className: 'gv-bar' }, [
    src ? gvSourceButton(src, (s) => gvSetOpt('estudio', { src: s })) : gvBtn('🧭 Elegir qué estudiar…', () => gvPickSource((s) => gvSetOpt('estudio', { src: s })), 'primary'),
    gvSeg([['nota', 'Una tarjeta por nota'], ['seccion', 'Una por sección']], mode, (v) => gvSetOpt('estudio', { mode: v })),
  ]);
  if (!src) {
    box.replaceChildren(gvHead('estudio', 'Elige un MOC, una carpeta o una etiqueta. Cada nota (o cada sección) será una tarjeta: el título por delante y la idea central por detrás. Lo que sabes vuelve cada vez más tarde; lo que no, vuelve pronto.'), bar,
      el('div', { className: 'gv-presets' }, gvMocs().slice(0, 18).map((m) => gvBtn([el('strong', {}, baseName(m.path)), el('span', { className: 'muted' }, 'MOC')], () => gvSetOpt('estudio', { src: { t: 'moc', v: m.id } }), 'card gv-preset'))));
    return;
  }
  const cards = gvStudyCards(src, mode);
  const key = `${JSON.stringify(src)}|${mode}`;
  if (gvStudy.key !== key) {
    gvStudy.key = key;
    gvStudy.all = false;
    gvStudy.queue = gvStudyQueue(cards, false);
    gvStudy.shown = false;
    gvStudy.done = 0;
  }
  // Tarjetas que ya no existen (nota borrada o cambiada) salen de la cola.
  const ids = new Set(cards.map((c) => c.id));
  gvStudy.queue = gvStudy.queue.filter((c) => ids.has(c.id)).map((c) => cards.find((x) => x.id === c.id));
  const learned = cards.filter((c) => (gvSrs()[c.id]?.box || 0) >= 3).length;
  const dueNow = cards.filter(gvDue).length;
  const stats = el('div', { className: 'gvs-stats' }, [
    el('span', {}, [el('strong', {}, String(cards.length)), ' tarjetas']),
    el('span', {}, [el('strong', {}, String(dueNow)), ' para hoy']),
    el('span', {}, [el('strong', {}, String(learned)), ' aprendidas']),
    el('span', {}, [el('strong', {}, String(gvStudy.done)), ' repasadas en esta sesión']),
  ]);
  const card = gvStudy.queue[0];
  if (!card) {
    box.replaceChildren(gvHead('estudio', 'Repaso espaciado de tus notas.'), bar, stats,
      el('div', { className: 'card gvs-done' }, [
        el('p', { className: 'gvs-big' }, cards.length ? '🎉 Listo por hoy' : 'No hay tarjetas: las notas de este origen no tienen texto (o son MOC).'),
        cards.length ? el('p', { className: 'muted' }, 'Las tarjetas vuelven cuando toca: 1, 3, 7, 16, 35 y 75 días según lo bien que las sepas.') : '',
        cards.length ? gvBtn('Repasar todas igualmente', () => { gvStudy.queue = gvStudyQueue(cards, true); gvStudy.all = true; renderEstudio(); }) : '',
      ]));
    return;
  }
  const r = gvSrs()[card.id];
  const front = el('div', { className: 'gvs-front' }, card.front.split('\n').map((l, i) => el(i ? 'p' : 'h3', { className: i ? 'gvs-sub' : '' }, l)));
  const back = el('div', { className: 'gvs-back md' });
  back.innerHTML = renderMd(card.back);
  const actions = gvStudy.shown
    ? el('div', { className: 'gvs-grades' }, [
        gvBtn([el('strong', {}, 'Otra vez'), el('span', { className: 'muted' }, 'hoy · 1')], () => gvGrade(card, 1), 'gvs-g g1'),
        gvBtn([el('strong', {}, 'Difícil'), el('span', { className: 'muted' }, `${GV_BOXES[Math.max(1, r?.box || 0)]} d · 2`)], () => gvGrade(card, 2), 'gvs-g g2'),
        gvBtn([el('strong', {}, 'Bien'), el('span', { className: 'muted' }, `${GV_BOXES[Math.min(GV_BOXES.length - 1, (r?.box || 0) + 1)]} d · 3`)], () => gvGrade(card, 3), 'gvs-g g3'),
        gvBtn([el('strong', {}, 'Fácil'), el('span', { className: 'muted' }, `${GV_BOXES[Math.min(GV_BOXES.length - 1, (r?.box || 0) + 2)]} d · 4`)], () => gvGrade(card, 4), 'gvs-g g4'),
      ])
    : el('div', { className: 'gvs-grades' }, [gvBtn('Mostrar respuesta (espacio)', () => { gvStudy.shown = true; renderEstudio(); }, 'primary big')]);
  box.replaceChildren(
    gvHead('estudio', 'Piensa la respuesta, muéstrala y di qué tan bien la sabías.'),
    bar,
    stats,
    el('div', { className: `card gvs-card${gvStudy.shown ? ' shown' : ''}` }, [
      el('div', { className: 'gvs-meta muted' }, [r ? `Caja ${r.box} · vista ${plural(r.seen || 0, 'vez', 'veces')}` : 'Nueva', ' · ', gvBtn('Abrir la nota', (e) => gvOpen(card.note, e), 'link')]),
      front,
      gvStudy.shown ? back : '',
    ]),
    actions,
    el('p', { className: 'muted gvs-left' }, `Quedan ${gvStudy.queue.length} en esta sesión`)
  );
}

document.addEventListener('keydown', (e) => {
  if (activeTab()?.type !== 'view' || activeTab().view !== 'estudio') return;
  if (e.target.closest?.('input, textarea, [contenteditable="true"], .picker, dialog')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const card = gvStudy.queue[0];
  if (!card) return;
  if (!gvStudy.shown && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    gvStudy.shown = true;
    renderEstudio();
  } else if (gvStudy.shown && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation(); // los números no cambian de sección mientras se repasa
    gvGrade(card, Number(e.key));
  }
}, true);

Object.assign(VIEW_RENDER, { linea: renderLinea, estudio: renderEstudio });
