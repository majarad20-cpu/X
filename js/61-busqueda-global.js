'use strict';

// ---------- Búsqueda global (Ctrl+K) ----------
// Un solo cuadro que busca en notas, tareas, proyectos, ideas, hábitos, diario, lienzos, marcadores
// y secciones. Atajos: Ctrl/Cmd+K fuera de los campos de texto (en el editor, Ctrl+K inserta un
// enlace: 40-edicion-bloques.js) y Ctrl/Cmd+Mayús+K en cualquier sitio, también escribiendo.
// Prefijos: n: notas, t: tareas, p: proyectos, i: ideas, h: hábitos. En notas valen los operadores
// de 49-busqueda.js (tag:, path:, [prop]…). Sin texto, enseña lo reciente.
// Cada tipo es un proveedor; otros módulos pueden añadir los suyos:
//   GS_PROVIDERS.push({ type, label, icon, items(): [{ id, title, text?, sub?, time? }], open(item, { newTab }) })
const GS_CAP = 50; // resultados por grupo antes de «Ver más»
const GS_FILTERS = [['all', 'Todo'], ['note', 'Notas'], ['task', 'Tareas'], ['project', 'Proyectos'], ['idea', 'Ideas'], ['habit', 'Hábitos']];
const GS_CHIP = { note: 'Nota', task: 'Tarea', project: 'Proyecto', idea: 'Idea', habit: 'Hábito', journal: 'Diario', canvas: 'Lienzo', bookmark: 'Marcador', view: 'Sección', other: 'Otro' };
const GS_PREFIX = { n: 'note', t: 'task', p: 'project', i: 'idea', h: 'habit' };
const GS_OPS_RE = /(?:^|\s)-?(?:file|path|content|line|tag|task|task-todo|task-done):|(?:^|\s)-?#[\p{L}\p{N}_]|\[[^\]]+\]|(?:^|\s)-\S|"[^"]*"|(?:^|\s)OR(?:\s|$)|(?:^|\s)\/[^/\s][^/]*\//u;
const gsFold = (s) => fold(String(s ?? ''));
const gsLine = (s) => String(s || '').split('\n').find((l) => l.trim())?.replace(/^\s*(?:#+|[-*+]\s+\[[ xX/]\]|[-*+>]|\d+[.)])\s*/, '').trim() || '';
const gsCut = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Línea que contiene los términos (la primera con todos; si no, con alguno), recortada alrededor.
function gsMatchLine(text, terms) {
  if (!terms.length || !text) return '';
  let any = '';
  for (const raw of text.split('\n')) {
    const f = gsFold(raw);
    if (!terms.some((t) => f.includes(t))) continue;
    const line = raw.replace(/^\s*(?:#+|[-*+]\s+\[[ xX/]\]|[-*+>])\s*/, '').trim();
    const at = Math.max(0, gsFold(line).indexOf(terms.find((t) => f.includes(t))) - 40);
    const out = (at ? '…' : '') + gsCut(line.slice(at), 140);
    if (terms.every((t) => f.includes(t))) return out;
    any = any || out;
  }
  return any;
}

const GS_PROVIDERS = [
  {
    type: 'note', label: 'Notas', icon: 'note',
    items: () => state.notes.map((n) => ({ id: n.id, title: baseName(n.path), text: n.enc ? '' : `${folderOf(n.path)}\n${n.body}`, enc: !!n.enc, time: n.updatedAt || n.createdAt || 0, ref: n })),
    snip: (it, terms) => (it.enc ? '🔒 Nota protegida' : gsMatchLine(it.ref.body, terms) || folderOf(it.ref.path) || gsCut(gsLine(it.ref.body))),
    open: (it, { newTab }) => openNote(it.ref, { newTab }),
  },
  {
    type: 'task', label: 'Tareas', icon: 'check',
    items: () => state.tasks.concat(state.archive || [], noteTasks()).map((t) => ({
      id: t.id, title: t.title, done: !!t.done, ref: t, time: t.completedAt || t.createdAt || 0,
      text: [(t.tags || []).map((x) => `#${x}`).join(' '), t.notes || '', (t.subtasks || []).map((s) => s.title).join('\n'), projectById(t.projectId)?.name || ''].join('\n'),
      sub: [t.virtual && `📝 ${baseName(noteById(t.noteId)?.path || '')}`, projectById(t.projectId) && `📁 ${projectById(t.projectId).name}`, t.due && `📅 ${formatDue(t.due)}`, `!${(PRIORITY_LABEL[t.priority] || 'Media').toLowerCase()}`, t.done && '✓ hecha'].filter(Boolean).join(' · '),
    })),
    open: (it, { newTab }) => (!it.ref.virtual && typeof relOpen === 'function' ? relOpen('task', it.ref) : gsOpenTask(it.ref, newTab)),
  },
  {
    type: 'project', label: 'Proyectos', icon: 'briefcase',
    items: () => state.projects.map((p) => ({ id: p.id, title: p.name, text: p.desc || '', time: p.createdAt || 0, ref: p, sub: [PROJECT_STATUS[p.status], p.deadline && `📅 ${formatDue(p.deadline)}`].filter(Boolean).join(' · ') })),
    open: (it) => openProject(it.id),
  },
  {
    type: 'idea', label: 'Ideas', icon: 'bulb',
    items: () => state.ideas.map((i) => ({ id: i.id, title: gsCut(gsLine(i.text) || 'Idea'), text: `${i.text}\n${(i.tags || []).map((t) => `#${t}`).join(' ')}`, time: i.updatedAt || i.createdAt || 0, ref: i, sub: (i.tags || []).map((t) => `#${t}`).join(' ') })),
    snip: (it, terms) => gsMatchLine(it.ref.text.split('\n').slice(1).join('\n'), terms) || it.sub || gsCut(gsLine(it.ref.text)),
    open: (it) => (typeof relOpen === 'function' ? relOpen('idea', it.ref) : gsOpenIdea(it.ref)),
  },
  {
    type: 'habit', label: 'Hábitos', icon: 'flame',
    items: () => state.habits.map((h) => ({ id: h.id, title: h.name, text: '', ref: h, sub: GOAL_LABEL(goalOf(h)) })),
    open: (it) => (typeof relOpen === 'function' ? relOpen('habit', it.ref) : gsFlash('habits', it.title)),
  },
  {
    type: 'journal', label: 'Diario', icon: 'book',
    items: () => (state.journal || []).map((e) => {
      const text = e.text || (e.sections || []).map((s) => s.a).filter(Boolean).join('\n');
      return { id: e.id, title: gsCut(gsLine(text) || JOURNAL_KINDS[e.kind]?.label || 'Entrada'), text, time: e.updatedAt || e.createdAt || 0, ref: e, sub: [JOURNAL_KINDS[e.kind]?.label, e.date && dayLabel(e.date)].filter(Boolean).join(' · ') };
    }),
    open: (it) => {
      expandedEntries.add(it.id);
      gsFlash('journal', gsLine(it.text));
    },
  },
  {
    type: 'canvas', label: 'Lienzos', icon: 'canvas',
    items: () => (state.canvases || []).map((c) => ({ id: c.id, title: c.title || 'Lienzo', text: (c.cards || []).map((k) => k.text || k.label || '').join('\n'), time: c.updatedAt || 0, ref: c, sub: plural((c.cards || []).length, 'tarjeta', 'tarjetas') })),
    open: (it) => openCanvas(it.id),
  },
  {
    type: 'bookmark', label: 'Marcadores', icon: 'link',
    items: () => bmList().filter((b) => !bmMissing(b)).map((b) => ({ id: b.id, title: bmLabel(b), text: b.group || '', ref: b, sub: `${BM_ICON[b.type] || ''} ${b.group || 'Marcador'}` })),
    open: (it, { newTab }) => openBookmark(it.ref, { newTab }),
  },
  {
    type: 'view', label: 'Secciones', icon: 'command',
    items: () => [...Object.entries(VIEW_TITLES), ['graph', 'Grafo']].map(([v, t]) => ({ id: v, title: t, text: '', icon: v === 'graph' ? 'graph' : VIEW_ICONS[v], sub: 'Sección' })),
    open: (it, { newTab }) => (it.id === 'graph' ? openTab({ type: 'graph' }, { newTab }) : showView(it.id, { newTab })),
  },
];

// Lo que 60-relaciones.js sepa listar y aquí no tenga proveedor propio (tipos nuevos) va en «Otros».
GS_PROVIDERS.push({
  type: 'other', label: 'Otros', icon: 'link',
  items: () => {
    if (typeof entityList !== 'function') return [];
    const known = new Set(GS_PROVIDERS.map((p) => p.type));
    try {
      return entityList().filter((e) => e && !known.has(e.type)).map((e) => ({ id: `${e.type}:${e.id}`, title: String(e.title || ''), text: '', sub: e.subtitle || e.type, ref: e }));
    } catch {
      return [];
    }
  },
  open: (it) => it.ref.open?.(),
});

// ---------- Índice: texto plegado (sin tildes, en minúsculas), rehecho cuando cambia dataRev ----------
const gsCache = { rev: -1, list: [], byKey: new Map(), folded: new Map() };

function gsIndex() {
  if (gsCache.rev === dataRev && gsCache.list.length) return gsCache;
  const list = [];
  const byKey = new Map();
  const folded = new Map();
  for (const p of GS_PROVIDERS) {
    for (const it of p.items()) {
      const key = `${p.type}:${it.id}`;
      // Solo se vuelve a plegar lo que cambió.
      const prev = gsCache.folded.get(key);
      const f = prev && prev.title === it.title && prev.text === it.text ? prev : { title: it.title, text: it.text, ft: gsFold(it.title), fx: gsFold(it.text) };
      folded.set(key, f);
      const e = { p, it, key, ft: f.ft, fx: f.fx };
      list.push(e);
      byKey.set(key, e);
    }
  }
  Object.assign(gsCache, { rev: dataRev, list, byKey, folded });
  return gsCache;
}

function gsParse(raw) {
  let q = String(raw || '').trim();
  let only = null;
  const m = q.match(/^([ntpih]):\s*/i);
  if (m) {
    only = GS_PREFIX[m[1].toLowerCase()];
    q = q.slice(m[0].length);
  }
  const ops = GS_OPS_RE.test(q);
  const groups = ops ? parseSearch(q) : null;
  const terms = [...new Set((ops ? searchHighlights(groups) : q.split(/\s+/)).map(gsFold).filter(Boolean))];
  return { q, fq: gsFold(q), only, ops, groups, terms };
}

// Puntos: título igual > empieza por > contiene (al principio de palabra, mejor) > todas las palabras
// en el título > en el contenido. Lo reciente o visitado suma un poco; lo hecho resta.
function gsScore(e, P, recent) {
  const { ft, fx } = e;
  const { fq, terms } = P;
  let s;
  if (P.ops) {
    if (e.p.type !== 'note') s = terms.length && terms.every((t) => ft.includes(t) || fx.includes(t)) ? (terms.every((t) => ft.includes(t)) ? 400 : 100) : 0;
    else if (e.it.enc) s = terms.length && terms.every((t) => ft.includes(t)) ? 400 : 0; // protegidas: solo el título
    else s = noteMatchesSearch(e.it.ref, P.groups) ? (terms.length && terms.every((t) => ft.includes(t)) ? 400 : 100) : 0;
  } else if (ft === fq) s = 1000;
  else if (ft.startsWith(fq)) s = 800;
  else if (ft.includes(` ${fq}`)) s = 600;
  else if (ft.includes(fq)) s = 500;
  else if (terms.every((t) => ft.includes(t))) s = 400;
  else if (terms.every((t) => ft.includes(t) || fx.includes(t))) s = 100;
  else s = 0;
  if (!s) return 0;
  const age = (Date.now() - (e.it.time || 0)) / 864e5;
  if (e.it.time) s += Math.max(0, 60 * (1 - age / 60));
  if (recent.has(e.key)) s += 35;
  if (e.it.done) s *= 0.5;
  return s;
}

// Visitado hace poco (atrás/adelante de 59-navegacion.js): clave de índice → orden.
function gsRecentKeys() {
  const out = new Map();
  if (typeof nav === 'undefined') return out;
  [...nav.back].reverse().forEach((t) => {
    const key = t.type === 'note' ? `note:${t.id}` : t.type === 'graph' ? 'view:graph' : `view:${t.view}`;
    if (!out.has(key)) out.set(key, out.size);
  });
  return out;
}

function gsRecents(idx, only) {
  const keys = [...gsRecentKeys().keys()];
  const byTime = (type, n) => idx.list.filter((e) => e.p.type === type && !e.it.done).sort((a, b) => b.it.time - a.it.time).slice(0, n).map((e) => e.key);
  const seen = new Set();
  const list = [];
  for (const k of [...keys, ...byTime('note', 8), ...byTime('task', 5)]) {
    const e = idx.byKey.get(k);
    if (!e || seen.has(k) || (only && e.p.type !== only)) continue;
    seen.add(k);
    list.push(e);
  }
  return list.slice(0, 15);
}

// Resultado: { P, only, best (clave del mejor), groups: [{ type, label, icon, total, items: [entrada] }] }
function gsSearch(raw, filter = 'all', limits = {}) {
  const P = gsParse(raw);
  const only = P.only || (filter === 'all' ? null : filter);
  const idx = gsIndex();
  if (!P.q) {
    const items = gsRecents(idx, only);
    return { P, only, groups: items.length ? [{ type: 'recent', label: 'Recientes', icon: 'timer', total: items.length, items }] : [] };
  }
  const recent = gsRecentKeys();
  const buckets = new Map();
  let best = null;
  let bestS = 0;
  for (const e of idx.list) {
    if (only && e.p.type !== only) continue;
    const s = gsScore(e, P, recent);
    if (!s) continue;
    if (s > bestS) [best, bestS] = [e.key, s];
    if (!buckets.has(e.p)) buckets.set(e.p, []);
    buckets.get(e.p).push({ e, s });
  }
  const groups = [];
  for (const p of GS_PROVIDERS) {
    const b = buckets.get(p);
    if (!b) continue;
    b.sort((x, y) => y.s - x.s || x.e.it.title.localeCompare(y.e.it.title, 'es'));
    groups.push({ type: p.type, label: p.label, icon: p.icon, total: b.length, items: b.slice(0, limits[p.type] || GS_CAP).map((x) => x.e) });
  }
  return { P, only, groups, best };
}

// Resaltado sin distinguir tildes: se busca en el texto plegado y se marca el original.
function gsMark(raw, terms) {
  const text = String(raw ?? '');
  const f = gsFold(text);
  if (!terms.length || f.length !== text.length) return highlight(text, terms);
  const re = new RegExp([...terms].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  let html = '';
  let last = 0;
  for (const m of f.matchAll(re)) {
    html += `${escHtml(text.slice(last, m.index))}<mark>${escHtml(text.slice(m.index, m.index + m[0].length))}</mark>`;
    last = m.index + m[0].length;
  }
  return html + escHtml(text.slice(last));
}

// ---------- Abrir cada tipo ----------
function gsOpenTask(t, newTab) {
  if (t.virtual) return openNoteAtLine(t.noteId, t.line, { newTab });
  showView('tasks', { newTab });
  if (taskView !== 'list') $('[data-taskview="list"]')?.click();
  tagFilter = null;
  if (!visibleTasks().includes(t)) $(`[data-filter="${t.done ? 'done' : 'all'}"]`)?.click();
  const at = visibleTasks().indexOf(t);
  if (at >= taskLimit) taskLimit = at + 1;
  if (state.tasks.includes(t) || state.archive?.includes(t)) startEditing(t.id);
}

function gsOpenIdea(idea) {
  showView('ideas');
  if (ideaView !== 'notes') $('[data-ideaview="notes"]')?.click();
  ideaTag = null;
  renderIdeas();
  gsFlash('ideas', gsLine(idea.text));
}

// Abre la sección y señala la tarjeta cuyo texto contiene `text`.
function gsFlash(view, text) {
  showView(view);
  const needle = gsFold(text).slice(0, 40);
  if (!needle) return;
  requestAnimationFrame(() => {
    // La más pequeña que lo contenga: la tarjeta o fila, no la caja que las agrupa.
    const card = [...$$('.view.active .card, .view.active tbody tr, .view.active li')].filter((n) => gsFold(n.textContent).includes(needle)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!card) return;
    reveal(card, { block: 'center' });
    card.classList.add('gs-flash');
    setTimeout(() => card.classList.remove('gs-flash'), 1400);
  });
}

// Enlace para pegar en una nota: [[Nota]]; tareas, proyectos, ideas y hábitos con la sintaxis
// de 60-relaciones.js ([[tarea:ID|Título]]) si está cargado.
function gsLink(e) {
  const typed = typeof relLinkText === 'function' && ['note', 'task', 'project', 'idea', 'habit'].includes(e.p.type) && !e.it.ref?.virtual;
  if (typed) return relLinkText(e.p.type, e.it.ref);
  return e.p.type === 'note' ? `[[${baseName(e.it.ref.path)}]]` : null;
}

function gsActions(e) {
  const isNote = e.p.type === 'note';
  const link = gsLink(e);
  return [
    { label: 'Abrir', kbd: 'Enter', action: () => gsOpen(e, false) },
    (isNote || e.p.type === 'view') && { label: 'Abrir en pestaña nueva', kbd: 'Ctrl+Enter', action: () => gsOpen(e, true) },
    e.p.type === 'task' && !e.it.done && { label: 'Marcar hecha', action: () => gsMarkDone(e.it.ref) },
    link && { label: `Copiar enlace ${gsCut(link, 40)}`, action: () => copyText(link, 'Enlace copiado') },
    isNote && { label: bmFind('note', e.it.id) ? '★ Ya está en marcadores' : 'Añadir a marcadores', disabled: !!bmFind('note', e.it.id), action: () => addBookmark({ type: 'note', ref: e.it.id }) },
  ];
}

function gsMarkDone(t) {
  if (t.virtual) toggleNoteTask(t.noteId, t.line, true);
  else toggleDone(t, true);
  if (gs.open) gsRender();
}

// ---------- El cuadro ----------
const gs = { open: false, fresh: false, filter: 'all', index: 0, rows: [], limits: {}, timer: null, last: null };
const gsBox = el('div', { id: 'gs', className: 'gs-back', hidden: true });
gsBox.innerHTML = `<div class="gs" role="dialog" aria-modal="true" aria-label="Buscar en todo">
  <div class="gs-head">${iconSvg('search')}<input id="gs-input" type="text" autocomplete="off" spellcheck="false" placeholder="Buscar en todo…" role="combobox" aria-expanded="true" aria-controls="gs-list" aria-autocomplete="list"><button class="gs-close" aria-label="Cerrar" title="Cerrar (Esc)">✕</button></div>
  <div class="gs-chips" role="group" aria-label="Filtrar por tipo">${GS_FILTERS.map(([k, l]) => `<button class="chip gs-filter" data-gs-filter="${k}" tabindex="-1">${l}</button>`).join('')}</div>
  <div id="gs-list" class="gs-list" role="listbox" aria-label="Resultados"></div>
  <div class="gs-hint"><kbd>↑↓</kbd> moverse · <kbd>Enter</kbd> abrir · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> pestaña nueva · <kbd>Tab</kbd> filtro · <kbd>Alt</kbd>+<kbd>Enter</kbd> acciones · <kbd>t:</kbd> <kbd>n:</kbd> <kbd>p:</kbd> <kbd>i:</kbd> <kbd>h:</kbd> · <kbd>Esc</kbd> cerrar</div>
</div>`;
document.body.append(gsBox);
const gsInput = $('#gs-input');
const gsList = $('#gs-list');

function openGlobalSearch({ query = '', filter = 'all' } = {}) {
  if (typeof flushNoteSave === 'function') flushNoteSave();
  if (!$('#picker').hidden) closePicker();
  if (!$('#note-menu').hidden) hideMenu();
  gs.open = true;
  gs.filter = filter;
  gs.limits = {};
  gs.index = 0;
  gs.fresh = true;
  gsBox.hidden = false;
  document.body.classList.add('gs-open');
  gsInput.value = query;
  gsRender();
  gsInput.focus();
  gsInput.select();
}

function closeGlobalSearch() {
  if (!gs.open) return;
  clearTimeout(gs.timer);
  gs.open = false;
  gsBox.hidden = true;
  document.body.classList.remove('gs-open');
  if (!$('#note-menu').hidden) hideMenu();
  if (document.activeElement === gsInput) gsInput.blur();
}

function gsRender() {
  const res = gsSearch(gsInput.value, gs.filter, gs.limits);
  gs.last = res;
  const active = res.only || 'all';
  $$('#gs .gs-filter').forEach((b) => b.classList.toggle('active', b.dataset.gsFilter === active));
  const terms = res.P.terms;
  const rows = [];
  let html = '';
  for (const g of res.groups) {
    html += `<div class="gs-group">${iconSvg(g.icon)}<span>${escHtml(g.label)}</span><span class="gs-count">${g.total}</span></div>`;
    for (const e of g.items) {
      const i = rows.length;
      rows.push(e);
      const snip = e.p.snip ? e.p.snip(e.it, terms) : e.it.sub || '';
      html += `<div class="gs-item${i === gs.index ? ' active' : ''}${e.it.done ? ' done' : ''}" role="option" id="gs-o${i}" data-i="${i}" aria-selected="${i === gs.index}">`
        + `<span class="gs-ico">${iconSvg(e.it.icon || e.p.icon)}</span>`
        + `<span class="gs-main"><span class="gs-title">${gsMark(e.it.title || 'Sin título', terms)}</span>${snip ? `<span class="gs-snip">${gsMark(snip, terms)}</span>` : ''}</span>`
        + `<span class="gs-type">${escHtml(GS_CHIP[e.p.type] || e.p.chip || e.p.label)}</span>`
        + `<button class="gs-act" tabindex="-1" aria-label="Acciones" title="Acciones" data-act="${i}">⋯</button></div>`;
    }
    if (g.total > g.items.length) html += `<button class="gs-more" tabindex="-1" data-more="${g.type}">Ver más (${g.total - g.items.length})</button>`;
  }
  if (!rows.length) html = `<p class="gs-empty muted">${res.P.q ? 'Sin resultados' : 'Escribe para buscar en notas, tareas, proyectos, ideas, hábitos…'}</p>`;
  gs.rows = rows;
  // Los grupos van en orden fijo, pero con una búsqueda nueva queda elegido el mejor resultado.
  if (gs.fresh) gs.index = Math.max(0, rows.findIndex((e) => e.key === res.best));
  gs.fresh = false;
  gs.index = Math.min(gs.index, Math.max(0, rows.length - 1));
  gsList.innerHTML = html;
  gsSelect(gs.index);
  return res;
}

function gsSelect(i) {
  gs.index = i;
  gsList.querySelectorAll('.gs-item.active').forEach((n) => {
    n.classList.remove('active');
    n.setAttribute('aria-selected', 'false');
  });
  const node = gsList.querySelector(`#gs-o${i}`);
  if (!node) return gsInput.removeAttribute('aria-activedescendant');
  node.classList.add('active');
  node.setAttribute('aria-selected', 'true');
  gsInput.setAttribute('aria-activedescendant', node.id);
  reveal(node);
}

function gsOpen(e, newTab = false) {
  if (!e) return;
  closeGlobalSearch();
  e.p.open(e.it, { newTab });
}

function gsMenu(i, anchor) {
  const e = gs.rows[i];
  if (!e) return;
  gsSelect(i);
  showMenu(anchor, gsActions(e));
}

function gsSetFilter(f) {
  gs.filter = f;
  gs.index = 0;
  gs.fresh = true;
  gs.limits = {};
  gsInput.value = gsInput.value.replace(/^\s*[ntpih]:\s*/i, ''); // el chip manda sobre el prefijo
  gsRender();
}

gsInput.addEventListener('input', () => {
  clearTimeout(gs.timer);
  gs.timer = setTimeout(() => {
    gs.timer = null;
    gs.fresh = true;
    gs.limits = {};
    gsRender();
  }, 80);
});

gsInput.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  const n = gs.rows.length;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeGlobalSearch();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (gs.timer) gsFlushInput();
    if (n) gsSelect((gs.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    gsFlushInput();
    if (e.altKey) return gsMenu(gs.index, gsList.querySelector(`#gs-o${gs.index} .gs-act`) || gsInput);
    gsOpen(gs.rows[gs.index], mod);
  } else if (e.key === 'ContextMenu') {
    e.preventDefault();
    gsMenu(gs.index, gsList.querySelector(`#gs-o${gs.index} .gs-act`) || gsInput);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const cur = GS_FILTERS.findIndex(([k]) => k === (gs.last?.only || 'all'));
    gsSetFilter(GS_FILTERS[(cur + (e.shiftKey ? GS_FILTERS.length - 1 : 1)) % GS_FILTERS.length][0]);
  } else if (mod && !e.altKey && ['o', 'p', 'n', 'g'].includes(e.key.toLowerCase())) closeGlobalSearch(); // deja paso a esos atajos
});

// Enter justo después de escribir: se busca ya, sin esperar a la pausa.
function gsFlushInput() {
  if (!gs.timer) return;
  clearTimeout(gs.timer);
  gs.timer = null;
  gs.fresh = true;
  gsRender();
}

gsList.addEventListener('click', (e) => {
  const more = e.target.closest('.gs-more');
  if (more) {
    gs.limits[more.dataset.more] = (gs.limits[more.dataset.more] || GS_CAP) + GS_CAP;
    gsRender();
    return gsInput.focus();
  }
  const act = e.target.closest('.gs-act');
  if (act) return gsMenu(Number(act.dataset.act), act);
  const row = e.target.closest('.gs-item');
  if (row) gsOpen(gs.rows[Number(row.dataset.i)], e.ctrlKey || e.metaKey);
});
gsList.addEventListener('auxclick', (e) => {
  const row = e.button === 1 && e.target.closest('.gs-item');
  if (row) gsOpen(gs.rows[Number(row.dataset.i)], true);
});
gsList.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.gs-item');
  if (!row) return;
  e.preventDefault();
  e.stopPropagation();
  gsMenu(Number(row.dataset.i), { x: e.clientX, y: e.clientY });
});
gsList.addEventListener('mousemove', (e) => {
  const row = e.target.closest('.gs-item');
  if (row && Number(row.dataset.i) !== gs.index) gsSelect(Number(row.dataset.i));
});
gsBox.addEventListener('pointerdown', (e) => {
  if (e.target === gsBox) closeGlobalSearch();
});
gsBox.querySelector('.gs-close').addEventListener('click', closeGlobalSearch);
gsBox.querySelectorAll('.gs-filter').forEach((b) =>
  b.addEventListener('click', () => {
    gsSetFilter(b.dataset.gsFilter);
    gsInput.focus();
  })
);

// Atajo: Ctrl/Cmd+K fuera de los campos de texto; Ctrl/Cmd+Mayús+K en cualquier sitio.
// (Ctrl+Alt+K no: en teclados españoles Ctrl+Alt es AltGr.)
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing || e.altKey || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
  if (!$('#draw')?.hidden || ($('#present') && !$('#present').hidden)) return;
  const field = e.target.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  if (!e.shiftKey && field && field !== gsInput) return; // en el editor, Ctrl+K es «insertar enlace»
  e.preventDefault();
  if (gs.open) {
    gsInput.focus();
    gsInput.select();
  } else openGlobalSearch();
});

$('#gs-open')?.addEventListener('click', () => openGlobalSearch());
$('#gs-open-m')?.addEventListener('click', () => openGlobalSearch());
COMMANDS_EXTRA.push(() => [{ label: 'Buscar en todo (notas, tareas, proyectos, ideas, hábitos…)', kbd: 'Ctrl+K', action: () => setTimeout(() => openGlobalSearch()) }]);
