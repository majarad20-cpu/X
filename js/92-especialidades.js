'use strict';

// ---------- Módulo de especialidades ----------
// Cada especialidad es un perfil (una nota en «Sistema») más sus vistas. Hay dos de fábrica:
//   🧾 Contador (89-especialidad.js y 91-vigencia-calendario.js): Radar normativo, Contradicciones,
//      Revisión de vigencia y Calendario tributario.
//   🏛️ Estoicismo: panel con la máxima del día y la racha, Práctica diaria (98-estoicismo.js),
//      🧭 Dicotomía del control y 📈 Registro de virtudes.
// y las **libres**, que crea la persona («＋ Nueva especialidad»): un perfil con su origen (carpeta,
// etiqueta o MOC), sus fuentes (autores, normas u obras que se cuentan), su calendario de prácticas o
// plazos y sus accesos a las vistas gráficas. Todas usan el mismo **panel** (vista «especialidad»).
// Se activan o se ocultan en Ajustes › Notas › Especialidades; el menú «🎓 Especialidades» de la barra
// de arriba (93-menus.js) las muestra.

const SPEC_DIR = 'Sistema';
const specCfg = () => {
  if (!state.settings.specs || typeof state.settings.specs !== 'object') state.settings.specs = {};
  const c = state.settings.specs;
  if (!Array.isArray(c.off)) c.off = [];
  if (!Array.isArray(c.custom)) c.custom = [];
  return c;
};

// ---------- Perfil genérico ----------
const SPEC_ACCESS = [
  { id: 'estudio', label: 'Tarjetas de estudio' },
  { id: 'tableros', label: 'Tableros' },
  { id: 'linea', label: 'Línea de tiempo' },
  { id: 'mapas', label: 'Mapas de notas' },
  { id: 'mosaico', label: 'Mosaico' },
  { id: 'matriz', label: 'Matriz' },
];

function specTemplate({ name, icon = '⭐', origin = `carpeta: ${name}`, sources = [], calendar = [], access = ['estudio', 'tableros', 'linea', 'mapas'] }) {
  return `---
tipo: perfil
area: sistema
especialidad: ${name}
icono: ${icon}
estado: completa
---
# Especialidad - ${name}

**Idea central:** este perfil define la especialidad «${name}» en Enfoque: de dónde salen sus notas, qué fuentes se cuentan, su calendario y sus accesos. Edítalo cuando quieras; el panel se actualiza solo.

## Origen
De dónde salen las notas de la especialidad. Una línea: \`carpeta: …\`, \`etiqueta: …\` o \`moc: …\`.
- ${origin}

## Fuentes
Autores, normas u obras que el panel cuenta en tus notas (una por línea).
${sources.length ? sources.map((s) => `- ${s}`).join('\n') : '- '}

## Calendario
Cada línea: \`frecuencia · cuándo · actividad · detalle\`. Frecuencias: Diario, Semanal (lunes … domingo), Mensual (día N) y Anual (DD-MM).
${calendar.length ? calendar.map((c) => `- ${c}`).join('\n') : '- Semanal · domingo · Revisión semanal'}

## Accesos
${SPEC_ACCESS.map((a) => `- [${access.includes(a.id) ? 'x' : ' '}] ${a.label}`).join('\n')}
`;
}

const SPEC_STOA_SOURCES = ['Séneca', 'Epicteto', 'Marco Aurelio', 'Musonio Rufo', 'Zenón', 'Cleantes', 'Crisipo', 'Catón', 'Hierocles'];
const SPEC_STOA_CAL = ['Diario · Premeditatio malorum · por la mañana', 'Diario · Examen de la noche · las tres preguntas de Séneca', 'Semanal · domingo · Memento mori y revisión de la semana', 'Mensual · día 1 · Incomodidad voluntaria · un ejercicio de austeridad'];
const specStoaRoot = () => (typeof stoaFolder === 'function' ? stoaFolder().split('/')[0] : 'Estoicismo');

// Especialidades: las de fábrica y las libres.
function specList() {
  const custom = specCfg().custom.map((c) => ({ ...c, builtin: false, views: ['especialidad'] }));
  return [
    { id: 'contador', name: 'Contador', icon: '🧾', builtin: true, profilePath: 'Sistema/Perfil - Contador Chile', views: ['radar', 'contradicciones', 'vigencia', 'calendario-trib'] },
    { id: 'estoicismo', name: 'Estoicismo', icon: '🏛️', builtin: true, profilePath: `${SPEC_DIR}/Especialidad - Estoicismo`, views: ['especialidad', 'stoa', 'dicotomia', 'virtudes'] },
    ...custom,
  ];
}
const specById = (id) => specList().find((s) => s.id === id);
const specOn = (id) => (id === 'contador' ? proOn() : !specCfg().off.includes(id));
function specSetOn(id, on) {
  if (id === 'contador') proCfg().on = on;
  const c = specCfg();
  c.off = c.off.filter((x) => x !== id);
  if (!on) c.off.push(id);
  save();
  if (typeof proApply === 'function') proApply();
  if (typeof menusRefresh === 'function') menusRefresh();
}

const specNote = (spec) => findNoteByName(spec.profilePath) || gvLive().find((n) => baseName(n.path) === baseName(spec.profilePath)) || null;
function specDefaultText(spec) {
  if (spec.id === 'estoicismo') return specTemplate({ name: 'Estoicismo', icon: '🏛️', origin: `carpeta: ${specStoaRoot()}`, sources: SPEC_STOA_SOURCES, calendar: SPEC_STOA_CAL, access: ['estudio', 'linea', 'mapas'] });
  return specTemplate({ name: spec.name, icon: spec.icon });
}

function specOpenProfile(spec) {
  if (spec.id === 'contador') return proOpenProfile();
  let note = specNote(spec);
  if (!note) {
    if (!state.folders.includes(SPEC_DIR)) state.folders.push(SPEC_DIR);
    note = createNote({ folder: SPEC_DIR, title: baseName(spec.profilePath), body: specDefaultText(spec), open: false, edit: false, log: false });
  }
  openNote(note);
}

function specProfile(spec) {
  const note = specNote(spec);
  const text = note && !note.enc ? note.body : specDefaultText(spec);
  return gvCached(`spec:${spec.id}:${note?.id || 'base'}`, () => {
    const section = (title) => {
      const m = text.match(new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
      return m ? m[1].split('\n').filter((l) => /^\s*-\s+\S/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trim()) : [];
    };
    let src = { t: 'all' };
    const o = section('Origen')[0] || '';
    const m = o.match(/^(carpeta|etiqueta|moc)\s*:\s*(.+)$/i);
    if (m) {
      const v = m[2].trim().replace(/^#/, '');
      if (/^carpeta/i.test(m[1])) src = { t: 'folder', v };
      else if (/^etiqueta/i.test(m[1])) src = { t: 'tag', v: v.toLowerCase() };
      else {
        const moc = findNoteByName(gvClean(v));
        src = moc ? { t: 'moc', v: moc.id } : { t: 'all' };
      }
    }
    const sources = section('Fuentes').filter((s) => s.length > 1);
    const access = new Set();
    const acc = text.match(/^##\s+Accesos[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/mi)?.[1] || '';
    SPEC_ACCESS.forEach((a) => {
      const line = acc.split('\n').find((l) => fold(l).includes(fold(a.label)));
      if (line && /\[[xX]\]/.test(line)) access.add(a.id);
    });
    return { src, sources, calendar: specCalendarItems(section('Calendario')), access, icon: propOf({ body: text }, 'icono') || spec.icon };
  });
}

// Calendario genérico: Diario, Semanal (día de la semana), Mensual (día N) y Anual (DD-MM, varias).
const SPEC_WD = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
function specCalendarItems(lines) {
  const out = [];
  lines.forEach((l) => {
    const parts = l.split('·').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return;
    const f = fold(parts[0]);
    let i = 1;
    const it = {};
    if (f.startsWith('diar')) it.kind = 'diario';
    else if (f.startsWith('seman')) {
      it.kind = 'semanal';
      it.wd = SPEC_WD.indexOf(fold(parts[1]).replace(/s$/, ''));
      if (it.wd < 0) return;
      i = 2;
    } else if (f.startsWith('mens')) {
      it.kind = 'mensual';
      it.day = Number((parts[1].match(/\d{1,2}/) || [])[0]);
      if (!(it.day >= 1 && it.day <= 31)) return;
      i = 2;
    } else if (f.startsWith('anu')) {
      it.kind = 'anual';
      it.dates = [...parts[1].matchAll(/(\d{1,2})-(\d{1,2})/g)].map((x) => [Number(x[1]), Number(x[2])]);
      if (!it.dates.length) return;
      i = 2;
    } else return;
    if (/^h[aá]bil$/i.test(parts[i] || '')) {
      it.habil = true;
      i++;
    }
    it.title = parts[i];
    it.detail = parts.slice(i + 1).join(' · ');
    if (it.title) out.push(it);
  });
  return out;
}
function specCalendarEvents(items, days = 30) {
  const out = [];
  const start = new Date();
  for (let k = 0; k <= days; k++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
    const iso = dateKey(d);
    items.forEach((it) => {
      const hit = it.kind === 'diario' || (it.kind === 'semanal' && d.getDay() === it.wd) || (it.kind === 'mensual' && d.getDate() === Math.min(it.day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())) || (it.kind === 'anual' && it.dates.some(([dd, mm]) => d.getDate() === dd && d.getMonth() + 1 === mm));
      if (hit) out.push({ date: it.habil && typeof ctShift === 'function' ? ctShift(iso, new Set()) : iso, title: it.title, detail: it.detail, daily: it.kind === 'diario' });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Menciones de las fuentes en las notas del origen: [{ source, notes: Map(id -> [{ line, text }]) }].
function specSourceIndex(spec, prof) {
  return gvCached(`spec-src:${spec.id}:${JSON.stringify(prof.src)}:${prof.sources.join('|')}`, () => {
    const res = prof.sources.map((s) => ({ source: s, re: new RegExp(`(^|[^\\wÁÉÍÓÚáéíóúÑñ])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\wÁÉÍÓÚáéíóúÑñ])`, 'i'), notes: new Map() }));
    gvNotes(prof.src).forEach((n) => n.body.split('\n').forEach((line, i) => res.forEach((r) => {
      if (!r.re.test(line)) return;
      if (!r.notes.has(n.id)) r.notes.set(n.id, []);
      r.notes.get(n.id).push({ line: i, text: gvSnippet(line) });
    })));
    return res.sort((a, b) => b.notes.size - a.notes.size);
  });
}

// ---------- Panel de una especialidad (vista «especialidad») ----------
GV_VIEWS.push(
  { id: 'especialidad', title: 'Especialidad', icon: 'spec', hint: 'Panel de la especialidad: origen, fuentes, calendario y accesos' },
  { id: 'dicotomia', title: 'Dicotomía del control', icon: 'scale', hint: 'Dicotomía del control: separa lo que depende de ti de lo que no' },
  { id: 'virtudes', title: 'Registro de virtudes', icon: 'chart', hint: 'Registro de virtudes: sabiduría, justicia, coraje y templanza, día a día' }
);
Object.assign(ICONS, { spec: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M7 10.5V15c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5M21 8v6"/>' });
['especialidad', 'dicotomia', 'virtudes'].forEach((id) => {
  const v = GV_VIEWS.find((x) => x.id === id);
  VIEW_TITLES[id] = v.title;
  VIEW_ICONS[id] = v.icon;
  $('#views-pane main').append(el('section', { id: `view-${id}`, className: 'view gv-view' }));
});

function specOpen(id, e) {
  const cfg = gvCfg();
  cfg.view.especialidad = { ...(cfg.view.especialidad || {}), cur: id };
  save();
  showView('especialidad', { newTab: !!(e?.ctrlKey || e?.metaKey) });
}

function renderEspecialidad() {
  const box = $('#view-especialidad');
  if (!box) return;
  const spec = specById(gvOpt('especialidad', 'cur', 'estoicismo')) || specById('estoicismo');
  const prof = specProfile(spec);
  const notes = gvNotes(prof.src);
  const head = el('div', { className: 'gv-head' }, [el('div', { className: 'gv-head-row' }, [
    el('h2', { className: 'gv-title' }, `${prof.icon} ${spec.name}`),
    el('span', { className: 'gv-spacer' }),
    gvBtn('⚙ Perfil', () => specOpenProfile(spec), 'gv-chip', 'Origen, fuentes, calendario y accesos de la especialidad'),
  ])]);
  const bar = el('div', { className: 'gv-bar' }, [
    el('span', { className: 'gv-chip spec-origin', title: 'Se cambia en el perfil (sección «Origen»)' }, [el('span', { className: 'muted' }, 'Origen: '), gvSrcLabel(prof.src)]),
    el('span', { className: 'muted gv-count' }, plural(notes.length, 'nota', 'notas')),
    el('span', { className: 'gv-spacer' }),
    ...SPEC_ACCESS.filter((a) => prof.access.has(a.id)).map((a) => gvBtn(`${a.label}`, (e) => {
      gvCfg().view[a.id] = { ...(gvCfg().view[a.id] || {}), src: prof.src };
      save();
      showView(a.id, { newTab: e.ctrlKey || e.metaKey });
    }, 'gv-chip', `Abrir ${a.label} con las notas de ${spec.name}`)),
  ]);
  const cards = [];
  if (spec.id === 'estoicismo' && typeof stoaMaxim === 'function') {
    const mx = stoaMaxim();
    cards.push(el('div', { className: 'card spec-card spec-wide' }, [
      el('h3', { className: 'spec-h' }, '🏛️ Hoy'),
      typeof stoaMaximCard === 'function' ? stoaMaximCard(mx, { compact: true }) : el('blockquote', {}, mx?.text || ''),
      el('div', { className: 'gv-bar' }, [
        el('span', { className: 'pro-badge' }, `🔥 Racha: ${plural(typeof stoaStreak === 'function' ? stoaStreak() : 0, 'día', 'días')}`),
        gvBtn('Práctica diaria', (e) => showView('stoa', { newTab: e.ctrlKey || e.metaKey }), 'gv-chip'),
        gvBtn('🧭 Dicotomía del control', (e) => showView('dicotomia', { newTab: e.ctrlKey || e.metaKey }), 'gv-chip'),
        gvBtn('📈 Virtudes', (e) => showView('virtudes', { newTab: e.ctrlKey || e.metaKey }), 'gv-chip'),
      ]),
    ]));
  }
  // Fuentes
  const idx = specSourceIndex(spec, prof);
  cards.push(el('div', { className: 'card spec-card' }, [
    el('h3', { className: 'spec-h' }, '📚 Fuentes'),
    idx.some((r) => r.notes.size) ? el('div', { className: 'spec-src' }, idx.filter((r) => r.notes.size).map((r) => {
      const det = el('details', { className: 'pro-item' });
      const lines = [...r.notes].flatMap(([id, ls]) => ls.map((l) => ({ note: noteById(id), ...l }))).filter((x) => x.note);
      det.append(el('summary', { className: 'pro-row' }, [el('span', { className: 'pro-key' }, el('strong', {}, r.source)), el('span', { className: 'pro-num' }, plural(r.notes.size, 'nota', 'notas')), el('span', { className: 'pro-num muted' }, `${lines.length}×`)]), el('div', { className: 'pro-detail' }, lines.length ? proLineList(lines, 20) : el('p', { className: 'muted' }, 'Aún no aparece en las notas del origen.')));
      return det;
    })) : el('p', { className: 'muted' }, idx.length ? 'Ninguna fuente del perfil aparece todavía en las notas del origen.' : 'Agrega autores, normas u obras en la sección «Fuentes» del perfil.'),
    idx.some((r) => !r.notes.size) && idx.some((r) => r.notes.size) ? el('p', { className: 'muted spec-none' }, `Sin menciones: ${idx.filter((r) => !r.notes.size).map((r) => r.source).join(', ')}`) : '',
  ]));
  // Calendario
  const evs = specCalendarEvents(prof.calendar, 30);
  const today = dateKey();
  const todayList = evs.filter((e) => e.date === today);
  const next = evs.filter((e) => e.date > today && !e.daily).slice(0, 8);
  cards.push(el('div', { className: 'card spec-card' }, [
    el('h3', { className: 'spec-h' }, '📅 Calendario'),
    prof.calendar.length ? el('div', { className: 'spec-cal' }, [
      el('p', { className: 'pro-sub' }, 'Hoy'),
      ...(todayList.length ? todayList.map((e) => el('div', { className: 'spec-ev today' }, [el('strong', {}, e.title), e.detail ? el('span', { className: 'muted' }, ` · ${e.detail}`) : ''])) : [el('p', { className: 'muted' }, 'Nada para hoy.')]),
      el('p', { className: 'pro-sub' }, 'Próximos'),
      ...(next.length ? next.map((e) => el('div', { className: 'spec-ev' }, [el('span', { className: 'spec-date' }, new Date(`${e.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })), el('strong', {}, e.title)])) : [el('p', { className: 'muted' }, 'Nada en los próximos 30 días.')]),
    ]) : el('p', { className: 'muted' }, 'Agrega prácticas o plazos en la sección «Calendario» del perfil.'),
  ]));
  // Notas recientes
  const recent = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12);
  cards.push(el('div', { className: 'card spec-card' }, [
    el('h3', { className: 'spec-h' }, '🕘 Notas recientes'),
    recent.length ? el('div', { className: 'pro-lines' }, recent.map((n) => {
      const b = el('button', { className: 'pro-line' }, [el('strong', {}, baseName(n.path)), el('span', { className: 'muted' }, folderOf(n.path))]);
      b.addEventListener('click', (e) => gvOpen(n, e));
      return b;
    })) : el('p', { className: 'muted' }, 'No hay notas en el origen. Cámbialo en el perfil.'),
  ]));
  box.replaceChildren(head, bar, el('div', { className: 'spec-grid gv-fill' }, cards));
}

// ---------- 🧭 Dicotomía del control ----------
const dicState = { situation: '', mine: '', notMine: '', action: '' };
const dicFolder = () => `${specStoaRoot()}/Dicotomía`;
function renderDicotomia() {
  const box = $('#view-dicotomia');
  if (!box) return;
  const field = (key, placeholder, rows = 8) => {
    const t = el('textarea', { className: 'dic-text', rows, placeholder, value: dicState[key] });
    t.addEventListener('input', () => (dicState[key] = t.value));
    return t;
  };
  const sit = el('input', { type: 'text', className: 'dic-sit', placeholder: 'La situación de hoy (p. ej. «Reunión difícil con un cliente»)', value: dicState.situation });
  sit.addEventListener('input', () => (dicState.situation = sit.value));
  const saveBtn = gvBtn('💾 Guardar como nota', () => {
    const list = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => `- ${x.replace(/^[-*]\s*/, '')}`).join('\n') || '- ';
    if (!dicState.mine.trim() && !dicState.notMine.trim()) return showToastMessage('Escribe algo en las columnas primero.');
    const folder = dicFolder();
    folder.split('/').forEach((_, i, a) => {
      const f = a.slice(0, i + 1).join('/');
      if (!state.folders.includes(f)) state.folders.push(f);
    });
    const d = new Date();
    const title = `Dicotomía ${dateKey(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
    createNote({ folder, title, body: `---\ntipo: práctica\nfecha: ${dateKey(d)}\ntags: [estoicismo, dicotomia]\n---\n# ${dicState.situation.trim() || title}\n\n> «De las cosas, unas dependen de nosotros y otras no.» — Epicteto, Enquiridión 1\n\n## ✅ Depende de mí\n${list(dicState.mine)}\n\n## 🌊 No depende de mí\n${list(dicState.notMine)}\n\n## ➡️ Qué haré\n${dicState.action.trim() || '- '}\n`, open: false, edit: false, log: false });
    Object.assign(dicState, { situation: '', mine: '', notMine: '', action: '' });
    renderAll();
    showToastMessage('Guardada en tus notas de estoicismo.');
  }, 'primary');
  const past = gvLive().filter((n) => n.path.startsWith(`${dicFolder()}/`)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
  box.replaceChildren(
    gvHead('dicotomia', 'Escribe la situación y separa lo que depende de ti (tus juicios, tus actos, tu esfuerzo) de lo que no (lo demás). Guárdala como nota para volver a ella.'),
    el('div', { className: 'gv-bar' }, [sit, saveBtn]),
    el('div', { className: 'dic-grid gv-fill' }, [
      el('div', { className: 'card dic-col mine' }, [el('h3', {}, '✅ Depende de mí'), field('mine', 'Mis juicios, mis decisiones, mi esfuerzo… (una por línea)')]),
      el('div', { className: 'card dic-col' }, [el('h3', {}, '🌊 No depende de mí'), field('notMine', 'Lo que hagan otros, el resultado, el clima… (una por línea)')]),
      el('div', { className: 'card dic-col dic-wide' }, [el('h3', {}, '➡️ Qué haré'), field('action', 'Mi próxima acción, solo sobre lo que depende de mí', 3)]),
      past.length ? el('div', { className: 'card dic-col dic-wide' }, [el('h3', {}, 'Anteriores'), el('div', { className: 'pro-lines' }, past.map((n) => {
        const b = el('button', { className: 'pro-line' }, [el('strong', {}, baseName(n.path)), el('span', { className: 'muted' }, (n.body.match(/^#\s+(.+)$/m) || [])[1] || '')]);
        b.addEventListener('click', (e) => gvOpen(n, e));
        return b;
      }))]) : '',
    ])
  );
}

// ---------- 📈 Registro de virtudes ----------
const VIRTUES = [
  { id: 'sabiduria', label: 'Sabiduría', icon: '🦉', hint: 'Juzgar bien: distinguir lo bueno, lo malo y lo indiferente' },
  { id: 'justicia', label: 'Justicia', icon: '⚖️', hint: 'Tratar bien a los demás y cumplir con lo que te toca' },
  { id: 'coraje', label: 'Coraje', icon: '🦁', hint: 'Hacer lo correcto aunque cueste o dé miedo' },
  { id: 'templanza', label: 'Templanza', icon: '🌿', hint: 'Medida y autocontrol en deseos y reacciones' },
];
const virtLog = () => {
  if (!state.settings.virtues || typeof state.settings.virtues !== 'object') state.settings.virtues = {};
  return state.settings.virtues;
};
function virtToggle(day, id) {
  const log = virtLog();
  const set = new Set(log[day] || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  if (set.size) log[day] = [...set];
  else delete log[day];
  save();
  renderVirtudes();
}
function virtStreak(id) {
  let n = 0;
  const d = new Date();
  if (!(virtLog()[dateKey(d)] || []).includes(id)) d.setDate(d.getDate() - 1);
  while ((virtLog()[dateKey(d)] || []).includes(id)) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function renderVirtudes() {
  const box = $('#view-virtudes');
  if (!box) return;
  const today = dateKey();
  const log = virtLog();
  const mine = new Set(log[today] || []);
  const todayRow = el('div', { className: 'virt-today' }, VIRTUES.map((v) => {
    const b = gvBtn([el('span', { className: 'virt-ico' }, v.icon), el('strong', {}, v.label), el('span', { className: 'muted' }, `racha ${virtStreak(v.id)}`)], () => virtToggle(today, v.id), `card virt-btn${mine.has(v.id) ? ' on' : ''}`, v.hint);
    b.ariaPressed = String(mine.has(v.id));
    return b;
  }));
  // Mapa de calor de las últimas 53 semanas (lunes arriba).
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7 * 52 - ((end.getDay() + 6) % 7));
  const cells = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dateKey(d);
    const n = (log[k] || []).length;
    const c = el('button', { className: `virt-cell v${n}`, title: `${k.split('-').reverse().join('-')}: ${n ? (log[k] || []).map((id) => VIRTUES.find((v) => v.id === id)?.label).join(', ') : 'sin registro'}` });
    c.addEventListener('click', () => promptText({ placeholder: `Virtudes del ${k.split('-').reverse().join('-')} (separadas por comas: sabiduría, justicia, coraje, templanza)`, initial: (log[k] || []).map((id) => VIRTUES.find((v) => v.id === id)?.label).join(', '), action: 'Guardar', onSubmit: (t) => {
      const ids = VIRTUES.filter((v) => fold(t).includes(fold(v.label))).map((v) => v.id);
      if (ids.length) log[k] = ids;
      else delete log[k];
      save();
      renderVirtudes();
    } }));
    cells.push(c);
  }
  const days30 = [...Array(30)].map((_, i) => dateKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)));
  const stats = el('div', { className: 'virt-stats' }, VIRTUES.map((v) => el('div', { className: 'virt-stat' }, [el('span', {}, `${v.icon} ${v.label}`), el('strong', {}, `${days30.filter((k) => (log[k] || []).includes(v.id)).length}/30`)])));
  box.replaceChildren(
    gvHead('virtudes', 'Al final del día, marca las virtudes que practicaste. El mapa muestra el año: más color, más virtudes ese día. Toca un día para corregirlo.'),
    el('p', { className: 'pro-sub' }, `Hoy, ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`),
    todayRow,
    stats,
    el('div', { className: 'virt-heat gv-fill' }, [el('div', { className: 'virt-grid' }, cells), el('div', { className: 'virt-legend muted' }, ['Menos ', ...[0, 1, 2, 3, 4].map((n) => el('span', { className: `virt-cell v${n}` })), ' Más'])])
  );
}

// ---------- Nueva especialidad ----------
function specNew() {
  promptText({ placeholder: 'Nombre de la especialidad (p. ej. Auditor, Laboral, Docente, Lector)', action: 'Crear', onSubmit: (raw) => {
    const name = raw.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    if (!name) return;
    const id = `x-${fold(name).replace(/[^a-z0-9]+/g, '-')}`;
    if (specById(id)) return specOpen(id);
    const icon = ({ auditor: '🔎', laboral: '👷', docente: '🎓', lector: '📖', finanzas: '💰', abogado: '⚖️', salud: '🩺' })[fold(name).split(' ')[0]] || '⭐';
    specCfg().custom.push({ id, name, icon, profilePath: `${SPEC_DIR}/Especialidad - ${name}` });
    if (!state.folders.includes(SPEC_DIR)) state.folders.push(SPEC_DIR);
    if (!findNoteByName(`${SPEC_DIR}/Especialidad - ${name}`)) createNote({ folder: SPEC_DIR, title: `Especialidad - ${name}`, body: specTemplate({ name, icon }), open: false, edit: false, log: false });
    save();
    if (typeof menusRefresh === 'function') menusRefresh();
    renderSpecSettings();
    specOpen(id);
    showToastMessage(`Especialidad «${name}» creada. Ajusta su origen, fuentes y calendario en «⚙ Perfil».`);
  } });
}

function specRemove(id) {
  const c = specCfg();
  const spec = specById(id);
  c.custom = c.custom.filter((x) => x.id !== id);
  save();
  if (typeof menusRefresh === 'function') menusRefresh();
  renderSpecSettings();
  showToastMessage(`Especialidad «${spec?.name || id}» quitada del menú. Su nota de perfil se conserva.`);
}

// ---------- Ajustes › Notas › Especialidades ----------
function renderSpecSettings() {
  const group = $('#set-g-notas');
  if (!group) return;
  let card = $('#spec-settings');
  if (!card) {
    // Reemplaza la tarjeta de 89-especialidad.js por la lista de todas.
    const h = [...group.querySelectorAll('h3.section-title')].find((x) => x.textContent === 'Especialidad');
    if (h) {
      h.textContent = 'Especialidades';
      h.nextElementSibling?.remove();
    } else group.append(el('h3', { className: 'section-title' }, 'Especialidades'));
    card = el('div', { id: 'spec-settings', className: 'card' });
    (h || group.lastElementChild).after(card);
  }
  card.replaceChildren(
    ...specList().map((s) => {
      const box = el('input', { type: 'checkbox', checked: specOn(s.id) });
      if (s.id === 'contador') box.id = 'pro-on';
      box.addEventListener('change', () => specSetOn(s.id, box.checked));
      return el('div', { className: 'set-row spec-row' }, [
        el('label', {}, [box, ` ${s.icon} ${s.name}`]),
        el('span', { className: 'gv-spacer' }),
        gvBtn('Perfil', () => specOpenProfile(s), 'link'),
        s.builtin ? '' : gvBtn('Quitar', () => specRemove(s.id), 'link danger-link'),
      ]);
    }),
    el('div', { className: 'set-row' }, [gvBtn('＋ Nueva especialidad…', specNew, 'gv-chip')]),
    el('p', { className: 'muted' }, 'Cada especialidad tiene su perfil en la carpeta «Sistema»: ahí se definen su origen, sus fuentes, su calendario y sus accesos. Ocultar una no borra nada.')
  );
}
renderSpecSettings();

Object.assign(VIEW_RENDER, { especialidad: renderEspecialidad, dicotomia: renderDicotomia, virtudes: renderVirtudes });
