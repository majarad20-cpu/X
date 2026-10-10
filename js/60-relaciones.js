'use strict';

// ---------- Relaciones: enlaces universales y panel «Relacionado» ----------
// Enlace a cualquier cosa, con prefijo e id (el texto tras «|» es solo para Obsidian y el PDF):
//   [[tarea:ID|Título]]   [[proyecto:ID|Nombre]]   [[idea:ID|Texto corto]]   [[habito:ID|Nombre]]
// Las notas siguen con [[Nota]]. Los «:» no chocan con las notas: cleanName los quita de sus nombres,
// así que ninguna nota se llama «tarea:…» (ni relinkAll ni el grafo las confunden con una nota).
// Al leer, cada enlace es una ficha con icono y el nombre de ahora (renombrar no rompe nada); si la
// cosa ya no existe, sale tachada. Tareas, proyectos, ideas y hábitos guardan sus enlaces en
// `links: [{ type, id }]` (va con los datos: se sincroniza y se deshace como el resto).
//
// relIndex(): índice en memoria (se rehace al cambiar dataRev) 'tipo:id' -> { out, in } con los
// enlaces de las notas, los `links` y la jerarquía (tarea→proyecto, proyecto↔nota, tarea↔su nota, tareas de una nota).
//
// entityList() -> [{ type, id, title, subtitle, icon, open() }] con todas las notas, tareas, proyectos,
// ideas y hábitos (type: 'note' | 'task' | 'project' | 'idea' | 'habit'). La usa la búsqueda global (61).

const REL_TYPES = ['note', 'task', 'project', 'idea', 'habit'];
const REL_PREFIX = { task: 'tarea', project: 'proyecto', idea: 'idea', habit: 'habito' };
const REL_OF_PREFIX = { tarea: 'task', proyecto: 'project', idea: 'idea', habito: 'habit', 'hábito': 'habit' };
const REL_ICON = { note: '📝', task: '☑', project: '📁', idea: '💡', habit: '🔁' };
const REL_LABEL = { note: 'Nota', task: 'Tarea', project: 'Proyecto', idea: 'Idea', habit: 'Hábito' };
const REL_TYPED_RE = /^(tarea|proyecto|idea|h[aá]bito):([A-Za-z0-9_-]+)$/i;

const relIdeaTitle = (i) => (i.text || '').split('\n').map((l) => l.replace(/^\s*[-*]\s+(\[[ xX]\]\s*)?/, '').trim()).find(Boolean)?.slice(0, 80) || 'Idea';
const relAlias = (s) => String(s).replace(/[[\]|\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

function relName(type, x) {
  if (type === 'note') return baseName(x.path);
  if (type === 'task') return x.title;
  if (type === 'idea') return relIdeaTitle(x);
  return x.name;
}

// «tarea:abc» -> { type: 'task', id: 'abc' }; cualquier otro destino -> null.
function relParse(target) {
  const m = REL_TYPED_RE.exec(String(target).trim());
  return m ? { type: REL_OF_PREFIX[m[1].toLowerCase()], id: m[2] } : null;
}

// Tareas, proyectos, ideas y hábitos por id (se rehace al cambiar los datos).
const relCache = { rev: -1, src: null, maps: null, list: null };
function relMaps() {
  const src = [state.tasks, state.archive, state.projects, state.ideas, state.habits, state.notes];
  if (relCache.rev === dataRev && relCache.src.every((a, i) => a === src[i] && a.length === relCache.len[i])) return relCache.maps;
  const maps = { task: new Map(), project: new Map(), idea: new Map(), habit: new Map() };
  state.archive.concat(state.tasks).forEach((t) => maps.task.set(t.id, t));
  state.projects.forEach((p) => maps.project.set(p.id, p));
  state.ideas.forEach((i) => maps.idea.set(i.id, i));
  state.habits.forEach((h) => maps.habit.set(h.id, h));
  Object.assign(relCache, { rev: dataRev, src, len: src.map((a) => a.length), maps, list: null });
  return maps;
}

function relFind(type, id) {
  if (type === 'note') return noteById(id) || null;
  return relMaps()[type]?.get(id) || null;
}

// Texto del enlace a una cosa, listo para pegar en una nota.
function relLinkText(type, x) {
  if (type === 'note') return `[[${linkNameOf(x)}]]`;
  return `[[${REL_PREFIX[type]}:${x.id}|${relAlias(relName(type, x)) || REL_LABEL[type]}]]`;
}

// ---------- Fichas en la lectura (11-markdown.js las pide para cada [[…]]) ----------
function entityLinkHtml(target, alias) {
  const ref = relParse(target);
  if (!ref) return '';
  const x = relFind(ref.type, ref.id);
  const attrs = `href="#" data-etype="${ref.type}" data-eid="${escHtml(ref.id)}" data-alias="${escHtml(alias || '')}"`;
  const icon = `<span class="elink-ico" aria-hidden="true">${REL_ICON[ref.type]}</span>`;
  if (!x) return `<a ${attrs} class="elink missing" title="${REL_LABEL[ref.type]} que ya no existe">${icon}<s>${escHtml(alias || target)}</s></a>`;
  const done = (ref.type === 'task' && x.done) || (ref.type === 'project' && x.status === 'done');
  const name = relName(ref.type, x);
  return `<a ${attrs} class="elink e-${ref.type}${done ? ' done' : ''}" title="${REL_LABEL[ref.type]}: ${escHtml(name)}">${icon}${escHtml(name)}</a>`;
}

// Texto libre (ideas, notas de una tarea) con sus [[enlaces]] como fichas.
function relTextNodes(text) {
  if (!text.includes('[[')) return [text];
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
    out.push(text.slice(last, m.index));
    const { target, alias } = parseWikiInner(m[1]);
    const note = !relParse(target) && findNoteByName(target);
    const box = document.createElement('span');
    box.innerHTML = entityLinkHtml(target, alias) || `<a href="#" class="elink e-note${note ? '' : ' unresolved'}" data-etype="note" data-target="${escHtml(target)}"><span class="elink-ico" aria-hidden="true">📝</span>${escHtml(alias || target)}</a>`;
    out.push(box.firstChild);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out.filter((x) => x !== '');
}

// ---------- Abrir cada cosa ----------
function relOpen(type, x, { newTab = false } = {}) {
  if (typeof hideLinkPreview === 'function') hideLinkPreview();
  closeRelated();
  if (type === 'note') return openNote(x, { newTab });
  if (type === 'project') return openProject(x.id);
  if (type === 'task') return relOpenTask(x);
  if (type === 'idea') return relOpenIdea(x);
  if (type === 'habit') return relOpenHabit(x);
}

// La tarea, en su formulario de la lista (con el filtro que la deja ver).
function relOpenTask(t) {
  if (t.virtual) return openNoteAtLine(t.noteId, t.line);
  const shown = { all: !state.archive.includes(t), today: isDueToday(t), pending: !t.done, done: t.done };
  if (!shown[taskFilter]) $(`[data-filter="${state.archive.includes(t) ? 'done' : 'all'}"]`).click();
  if (tagFilter && !(t.tags || []).includes(tagFilter)) tagFilter = null;
  const pos = visibleTasks().indexOf(t);
  if (pos >= taskLimit) taskLimit = pos + 1;
  editTaskInList(t);
}

function relOpenIdea(idea) {
  showView('ideas');
  if (ideaView !== 'notes') $('[data-ideaview="notes"]').click();
  ideaTag = null;
  ideaColor = null;
  ideaSearch = '';
  $('#idea-search').value = '';
  editingIdeaId = idea.id;
  renderIdeas();
  reveal($(`#idea-list [data-rel-id="${idea.id}"]`), { block: 'center' });
}

function relOpenHabit(h) {
  showView('habits');
  editingHabitId = h.id;
  renderHabits();
  reveal($(`#habit-body [data-rel-id="${h.id}"]`), { block: 'center' });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a.elink');
  if (!a) return;
  e.preventDefault();
  const newTab = e.ctrlKey || e.metaKey;
  if (a.dataset.etype === 'note') return openNoteByLink(a.dataset.target, { newTab, fromNote: activeNote() });
  const x = relFind(a.dataset.etype, a.dataset.eid);
  if (!x) return showToastMessage(`${REL_LABEL[a.dataset.etype] || 'Elemento'} que ya no existe.`);
  relOpen(a.dataset.etype, x, { newTab });
});

// ---------- Lista de todo (búsqueda, «Enlazar con…», [[ ) ----------
function relSubtitle(type, x) {
  if (type === 'note') return folderOf(x.path) || 'Nota';
  if (type === 'task') {
    const p = projectById(x.projectId);
    return [x.done ? 'Tarea hecha' : 'Tarea', x.due && formatDue(x.due), p && `📁 ${p.name}`].filter(Boolean).join(' · ');
  }
  if (type === 'project') return `Proyecto · ${PROJECT_STATUS[x.status] || ''} · ${projectProgress(x)} %`;
  if (type === 'idea') return ['Idea', ...(x.tags || []).map((t) => `#${t}`)].join(' ');
  return `Hábito · ${GOAL_LABEL(goalOf(x))}`;
}

function relEntity(type, x) {
  return {
    type,
    id: x.id,
    title: relName(type, x),
    get subtitle() {
      return relSubtitle(type, x);
    },
    icon: REL_ICON[type],
    done: type === 'task' ? !!x.done : type === 'project' ? x.status === 'done' : false,
    at: x.updatedAt || x.createdAt || 0,
    item: x,
    open: (o) => relOpen(type, x, o),
  };
}

function entityList() {
  relMaps();
  if (relCache.list) return relCache.list;
  const out = [];
  state.notes.forEach((n) => out.push(relEntity('note', n)));
  state.tasks.concat(state.archive).forEach((t) => out.push(relEntity('task', t)));
  state.projects.forEach((p) => out.push(relEntity('project', p)));
  state.ideas.forEach((i) => out.push(relEntity('idea', i)));
  state.habits.forEach((h) => out.push(relEntity('habit', h)));
  relCache.list = out;
  return out;
}

// Parecido de un título con lo escrito: igual > empieza > palabra que empieza > contiene.
function relScore(title, q) {
  if (!q) return 1;
  const t = title.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return 0;
}
// Con el mismo parecido: tareas pendientes, proyectos activos, ideas, hábitos y, al final, lo hecho.
const REL_RANK = { note: 0, task: 1, project: 2, idea: 3, habit: 4 };

function relSearch(q, { types = REL_TYPES, exclude = '', limit = 30 } = {}) {
  q = q.trim().toLowerCase();
  const hits = [];
  for (const e of entityList()) {
    if (!types.includes(e.type) || `${e.type}:${e.id}` === exclude) continue;
    const score = relScore(e.title, q);
    if (score) hits.push({ e, score });
  }
  hits.sort((a, b) => b.score - a.score || a.e.done - b.e.done || REL_RANK[a.e.type] - REL_RANK[b.e.type] || b.e.at - a.e.at);
  return hits.slice(0, limit).map(({ e, score }) => Object.assign(Object.create(e), { score }));
}

// Sugerencias al escribir [[ (12-notas.js): notas y lo demás, mezclado por parecido.
function relSuggest(q, current) {
  const notes = state.notes
    .filter((n) => n !== current && (baseName(n.path).toLowerCase().includes(q) || n.path.toLowerCase().includes(q)))
    .sort((a, b) => (baseName(b.path).toLowerCase().startsWith(q) ? 1 : 0) - (baseName(a.path).toLowerCase().startsWith(q) ? 1 : 0) || b.updatedAt - a.updatedAt)
    .slice(0, q ? 8 : 6)
    .map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), insert: linkNameOf(n), icon: '📝', score: relScore(baseName(n.path), q) || 20 }));
  const ents = relSearch(q, { types: ['task', 'project', 'idea', 'habit'], limit: q ? 8 : 4 }).map((e) => ({
    label: e.title,
    detail: e.subtitle,
    icon: e.icon,
    insert: `${REL_PREFIX[e.type]}:${e.id}|${relAlias(e.title) || REL_LABEL[e.type]}`,
    score: e.score,
  }));
  return notes.concat(ents).sort((a, b) => b.score - a.score).slice(0, 10);
}

// Selector «Enlazar con…» sobre todo.
function pickEntity({ exclude = '', types = REL_TYPES, onPick, placeholder = 'Enlazar con… (nota, tarea, proyecto, idea o hábito)' }) {
  openPicker({
    placeholder,
    hint: '📝 nota · ☑ tarea · 📁 proyecto · 💡 idea · 🔁 hábito',
    items: (q) => relSearch(q, { types, exclude, limit: 40 }).map((e) => ({ label: `${e.icon} ${e.title}`, detail: e.subtitle, action: () => onPick(e) })),
  });
}

// ---------- Enlazar sin escribir ----------
// En la nota: en el cursor si se edita; al final si se lee.
function relInsertInNote(note, link) {
  const ta = $('#note-editor');
  if (isEditing(note.id) && ta.dataset.note === note.id && !ta.hidden) {
    ta.focus({ preventScroll: true });
    ta.setRangeText(link, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
    return;
  }
  flushNoteSave();
  const body = note.body.replace(/\s+$/, '');
  note.body = body ? `${body}\n\n${link}` : link;
  note.updatedAt = Date.now();
  save();
  renderAll();
  showToastMessage('Enlace añadido al final de la nota');
}

// Desde una tarea, proyecto, idea o hábito hacia una nota: va a «## Relacionado», al final de la nota.
function relAppendToNote(note, link) {
  if (note.enc) return showToastMessage('La nota está protegida: no se puede añadir el enlace.');
  flushNoteSave();
  if (note.body.includes(link.replace(/\|.*$/, ''))) return showToastMessage(`Ya estaba enlazado en «${baseName(note.path)}»`);
  const lines = note.body.trim() ? note.body.replace(/\s+$/, '').split('\n') : [];
  const h = lines.findIndex((l) => /^##\s+Relacionado\s*$/i.test(l));
  if (h < 0) lines.push(...(lines.length ? [''] : []), '## Relacionado', `- ${link}`);
  else {
    let end = h + 1;
    while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
    while (end > h + 1 && !lines[end - 1].trim()) end--;
    lines.splice(end, 0, `- ${link}`);
  }
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  save();
  renderAll();
  showToastMessage(`Enlazado en «${baseName(note.path)}»`);
}

function relAddLink(x, ref) {
  x.links = (x.links || []).filter((l) => !(l.type === ref.type && l.id === ref.id));
  x.links.push({ type: ref.type, id: ref.id });
  save();
  renderAll();
  showToastMessage(`Enlazado con ${REL_ICON[ref.type]} ${ref.title || relName(ref.type, relFind(ref.type, ref.id))}`);
}

function relRemoveLink(x, ref) {
  withUndo('Enlace quitado', () => {
    x.links = (x.links || []).filter((l) => !(l.type === ref.type && l.id === ref.id));
    if (!x.links.length) delete x.links;
  });
}

// «🔗 Enlazar con…» de una tarea, proyecto, idea o hábito (o de una nota del explorador).
function relLinkFrom(type, x) {
  pickEntity({
    exclude: `${type}:${x.id}`,
    onPick: (e) => {
      if (type === 'note') return relAppendToNote(x, relLinkText(e.type, e.item));
      if (e.type === 'note') return relAppendToNote(e.item, relLinkText(type, x));
      relAddLink(x, e);
    },
  });
}

// ---------- Índice de relaciones ----------
const relIdx = { key: '', src: null, nodes: new Map(), vtasks: new Map() };

function relIndex() {
  const src = [state.notes, state.tasks, state.archive, state.projects, state.ideas, state.habits];
  const key = `${dataRev}:${src.map((a) => a.length).join(',')}`;
  if (relIdx.key === key && relIdx.src.every((a, i) => a === src[i])) return relIdx;
  const nodes = new Map();
  const node = (k) => {
    let n = nodes.get(k);
    if (!n) nodes.set(k, (n = { out: new Set(), in: new Set() }));
    return n;
  };
  const edge = (a, b) => {
    if (a === b) return;
    node(a).out.add(b);
    node(b).in.add(a);
  };
  for (const n of state.notes) {
    if (!n.body.includes('[[')) continue;
    const from = `note:${n.id}`;
    for (const l of linksIn(n.body)) {
      if (!l.target) continue;
      const ref = relParse(l.target);
      if (ref) edge(from, `${ref.type}:${ref.id}`);
      else {
        const t = findNoteByName(l.target);
        if (t) edge(from, `note:${t.id}`);
      }
    }
  }
  const lists = { task: state.archive.concat(state.tasks), project: state.projects, idea: state.ideas, habit: state.habits };
  for (const [type, list] of Object.entries(lists)) {
    for (const x of list) {
      for (const l of x.links || []) if (l?.type && l.id) edge(`${type}:${x.id}`, `${l.type}:${l.id}`);
      // [[…]] escritos en el texto de una idea o en las notas de una tarea.
      const text = type === 'idea' ? x.text : type === 'task' ? x.notes : '';
      if (text?.includes('[[')) {
        for (const l of linksIn(text)) {
          const ref = relParse(l.target);
          const n = !ref && l.target && findNoteByName(l.target);
          if (ref || n) edge(`${type}:${x.id}`, ref ? `${ref.type}:${ref.id}` : `note:${n.id}`);
        }
      }
      if (type === 'task' && x.projectId) edge(`task:${x.id}`, `project:${x.projectId}`);
      if (type === 'task' && x.noteId) edge(`task:${x.id}`, `note:${x.noteId}`); // nota de la tarea (63)
      if (type === 'project' && x.noteId) edge(`project:${x.id}`, `note:${x.noteId}`);
    }
  }
  // Tareas escritas en notas: la nota las muestra y se relaciona con su proyecto.
  const vtasks = new Map();
  for (const t of noteTasks()) {
    if (!vtasks.has(t.noteId)) vtasks.set(t.noteId, []);
    vtasks.get(t.noteId).push(t);
    if (t.projectId) edge(`note:${t.noteId}`, `project:${t.projectId}`);
  }
  Object.assign(relIdx, { key, src, nodes, vtasks });
  return relIdx;
}

// Lo relacionado con una cosa, por tipo (solo lo que existe).
function relatedOf(type, id) {
  const idx = relIndex();
  const self = `${type}:${id}`;
  const node = idx.nodes.get(self) || { out: new Set(), in: new Set() };
  const g = { project: [], task: [], idea: [], habit: [], noteOut: [], noteIn: [] };
  for (const k of new Set([...node.out, ...node.in])) {
    const i = k.indexOf(':');
    const t = k.slice(0, i);
    const x = relFind(t, k.slice(i + 1));
    if (!x || k === self) continue;
    if (t === 'note') (node.out.has(k) ? g.noteOut : g.noteIn).push(x);
    else g[t].push(x);
  }
  if (type === 'note') g.task.push(...(idx.vtasks.get(id) || []));
  return g;
}

// ---------- Panel «Relacionado» ----------
function relCrumb(type, x, current) {
  const label = `${REL_ICON[type]} ${relName(type, x)}`;
  if (current) return el('span', { className: 'rel-crumb current' }, label);
  const b = el('button', { type: 'button', className: 'rel-crumb' }, label);
  b.addEventListener('click', (e) => relOpen(type, x, { newTab: e.ctrlKey || e.metaKey }));
  if (type === 'note') b.dataset.pvNote = x.id;
  return b;
}

// «📁 Proyecto › ☑ Tarea · 📝 Nota del proyecto».
function relHierarchyEl(type, x, g) {
  const project = type === 'project' ? x : type === 'task' ? projectById(x.projectId) : (type === 'note' && state.projects.find((p) => p.noteId === x.id)) || g.project[0];
  if (!project) return null;
  const note = project.noteId && noteById(project.noteId);
  const parts = [relCrumb('project', project, type === 'project')];
  if (type !== 'project') parts.push(el('span', { className: 'rel-sep' }, '›'), relCrumb(type, x, true));
  if (note && !(type === 'note' && note.id === x.id)) parts.push(el('span', { className: 'rel-sep' }, '·'), relCrumb('note', note));
  return el('div', { className: 'rel-path' }, parts);
}

function relRow(type, x) {
  const row = el('div', { className: `rel-row r-${type}` });
  if (!x.virtual) {
    row.dataset.relType = type;
    row.dataset.relId = x.id;
  }
  if (type === 'task') {
    const box = el('input', { type: 'checkbox', checked: !!x.done, ariaLabel: `Completar ${x.title}` });
    box.addEventListener('change', () => (x.virtual ? toggleNoteTask(x.noteId, x.line, box.checked, x.title) : toggleDone(x, box.checked)));
    row.append(box);
    if (x.done) row.classList.add('done');
  }
  if (type === 'habit') {
    const today = dateKey();
    const box = el('input', { type: 'checkbox', checked: !!x.log?.[today], ariaLabel: `${x.name}: hecho hoy`, title: 'Hecho hoy' });
    box.addEventListener('change', () => {
      toggleHabit(x, today);
      renderAll();
    });
    row.append(box);
  }
  const name = el('button', { type: 'button', className: 'rel-name' }, [el('span', { className: 'rel-ico', ariaHidden: 'true' }, REL_ICON[type]), el('span', {}, relName(type, x))]);
  name.addEventListener('click', (e) => relOpen(type, x, { newTab: e.ctrlKey || e.metaKey }));
  if (type === 'note') name.dataset.pvNote = x.id;
  row.append(name);
  if (type === 'project') {
    const pct = projectProgress(x);
    row.append(el('span', { className: 'rel-progress' }, [progressBar(pct), el('span', { className: 'rel-meta' }, `${pct} %`)]));
  }
  if (type === 'task' && x.due && !x.done) row.append(el('span', { className: `rel-meta${x.due < dateKey() ? ' overdue' : ''}` }, formatDue(x.due)));
  if (type === 'task' && x.virtual) row.append(el('span', { className: 'rel-meta' }, `📝 ${baseName(noteById(x.noteId)?.path || '')}`));
  if (type === 'habit') {
    const s = streak(x);
    if (s) row.append(el('span', { className: 'rel-meta' }, `🔥 ${s}`));
  }
  return row;
}

function relGroup(title, rows) {
  return el('div', { className: 'rel-group' }, [el('div', { className: 'rel-group-head' }, title), ...rows]);
}

// Bloque «Relacionado» de cualquier cosa. En un proyecto, sus tareas ya se listan aparte (skipChildren).
function relatedBlock(type, id, { skipChildren = false, noteIn = type !== 'note' } = {}) {
  const box = el('section', { className: 'rel-block' });
  box.dataset.rel = `${type}:${id}`;
  const x = relFind(type, id);
  if (!x) return box;
  const g = relatedOf(type, id);
  const hier = relHierarchyEl(type, x, g);
  box.append(el('h4', { className: 'bl-head rel-head' }, 'Relacionado'));
  if (hier) box.append(hier);
  // Tiempo dedicado a la nota con el Pomodoro (66-pomodoro-extra.js).
  const time = type === 'note' && typeof pomoTimeLine === 'function' && pomoTimeLine('note', id);
  if (time) box.append(time);
  const tasks = (skipChildren && type === 'project' ? g.task.filter((t) => t.projectId !== id) : g.task).slice().sort((a, b) => a.done - b.done || (a.due || '9999').localeCompare(b.due || '9999'));
  const pending = tasks.filter((t) => !t.done).length;
  const groups = [];
  if (g.project.length) groups.push(relGroup(g.project.length > 1 ? 'Proyectos' : 'Proyecto', g.project.map((p) => relRow('project', p))));
  if (tasks.length) groups.push(relGroup(`Tareas · ${plural(pending, 'pendiente', 'pendientes')} · ${plural(tasks.length - pending, 'hecha', 'hechas')}`, tasks.slice(0, 60).map((t) => relRow('task', t))));
  if (g.idea.length) groups.push(relGroup('Ideas', g.idea.map((i) => relRow('idea', i))));
  if (g.habit.length) groups.push(relGroup('Hábitos', g.habit.map((h) => relRow('habit', h))));
  if (g.noteOut.length) groups.push(relGroup('Notas enlazadas', g.noteOut.map((n) => relRow('note', n))));
  if (noteIn && g.noteIn.length) groups.push(relGroup('Notas que enlazan aquí', g.noteIn.map((n) => relRow('note', n))));
  if (groups.length) box.append(...groups);
  else box.append(el('p', { className: 'muted side-empty' }, 'Nada relacionado todavía. Usa «🔗 Enlazar con…» o escribe [[ en una nota.'));
  return box;
}

// Enlaces guardados en la cosa: fichas con × y «+ Enlazar».
function relLinksEditor(type, x) {
  const box = el('div', { className: 'rel-links' }, el('span', { className: 'rel-links-label' }, '🔗 Enlaces'));
  (x.links || []).forEach((l) => {
    const target = relFind(l.type, l.id);
    const open = el('button', { type: 'button', className: 'rel-chip-open', title: target ? 'Abrir' : 'Ya no existe' }, `${REL_ICON[l.type] || '?'} ${target ? relName(l.type, target) : 'borrado'}`);
    open.addEventListener('click', () => target && relOpen(l.type, target));
    const del = el('button', { type: 'button', className: 'rel-chip-x', title: 'Quitar el enlace', ariaLabel: 'Quitar el enlace' }, '×');
    del.addEventListener('click', () => relRemoveLink(x, l));
    box.append(el('span', { className: `rel-chip${target ? '' : ' missing'}` }, [open, del]));
  });
  const add = el('button', { type: 'button', className: 'chip rel-add' }, '+ Enlazar');
  add.addEventListener('click', () => relLinkFrom(type, x));
  box.append(add);
  return box;
}

// Bloque completo para el formulario o detalle de una cosa (no nota).
function relItemPanel(type, x, opts) {
  return el('div', { className: 'rel-panel' }, [relLinksEditor(type, x), relatedBlock(type, x.id, opts)]);
}

// ---------- «Ver relacionado…» (ventana) ----------
let relModalRef = null;

function closeRelated() {
  relModalRef = null;
  if ($('#rel-modal')) $('#rel-modal').hidden = true;
}

function openRelated(type, id) {
  let back = $('#rel-modal');
  if (!back) {
    back = el('div', { id: 'rel-modal', className: 'modal-back', hidden: true });
    back.innerHTML = '<div class="modal rel-modal" role="dialog" aria-modal="true" aria-labelledby="rel-title"><header class="modal-head"><h3 id="rel-title"></h3><button id="rel-close" class="iv-close modal-x" aria-label="Cerrar">✕</button></header><div id="rel-body" class="rel-modal-body"></div></div>';
    document.body.append(back);
    $('#rel-close').addEventListener('click', closeRelated);
    back.addEventListener('click', (e) => e.target === back && closeRelated());
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRelated();
      }
    });
  }
  relModalRef = { type, id };
  renderRelated();
  back.hidden = false;
  $('#rel-close').focus();
}

function renderRelated() {
  if (!relModalRef) return;
  const { type, id } = relModalRef;
  const x = relFind(type, id);
  $('#rel-title').textContent = x ? `${REL_ICON[type]} ${relName(type, x)}` : `${REL_LABEL[type]} que ya no existe`;
  if (!x) return $('#rel-body').replaceChildren();
  const open = el('button', { type: 'button', className: 'chip' }, `Abrir ${REL_LABEL[type].toLowerCase()}`);
  open.addEventListener('click', () => relOpen(type, x));
  $('#rel-body').replaceChildren(el('div', { className: 'row rel-modal-top' }, [el('span', { className: 'muted' }, relSubtitle(type, x)), open]), ...(type === 'note' ? [] : [relLinksEditor(type, x)]), relatedBlock(type, id));
}
RENDER_HOOKS.push(() => relModalRef && !$('#rel-modal').hidden && renderRelated());

// ---------- Vista previa al pasar el ratón (45-vista-previa.js) ----------
function entityPreview(type, id) {
  const x = relFind(type, id);
  if (!x) return [el('div', { className: 'lp-body' }, el('p', { className: 'muted' }, `${REL_LABEL[type]} que ya no existe.`))];
  const head = el('button', { className: 'lp-head', title: 'Abrir' }, el('span', { className: 'lp-title' }, `${REL_ICON[type]} ${relName(type, x)}`));
  head.addEventListener('click', () => relOpen(type, x));
  const line = (...c) => el('p', { className: 'rel-pv-line' }, c);
  const body = el('div', { className: 'lp-body rel-pv' });
  if (type === 'task') {
    const p = projectById(x.projectId);
    const subs = x.subtasks || [];
    body.append(line(x.done ? '✓ Hecha' : x.status === 'doing' ? '◐ En curso' : '○ Pendiente', ` · Prioridad ${PRIORITY_LABEL[x.priority]?.toLowerCase() || 'media'}`));
    if (x.due) body.append(line(`📅 ${formatDue(x.due)}${x.time ? ` · ⏰ ${x.time}` : ''}`));
    if (p) body.append(line(`📁 ${p.name}`));
    if (subs.length) body.append(line(`☑ ${subs.filter((s) => s.done).length}/${subs.length} subtareas`));
    if (x.notes) body.append(el('p', { className: 'muted rel-pv-text' }, x.notes.slice(0, 200)));
  } else if (type === 'project') {
    const pct = projectProgress(x);
    const tasks = projectTasks(x).filter((t) => !t.repeat);
    body.append(line(PROJECT_STATUS[x.status], ` · ${tasks.filter((t) => t.done).length}/${tasks.length} tareas`), el('div', { className: 'rel-progress' }, [progressBar(pct), el('span', { className: 'rel-meta' }, `${pct} %`)]));
    if (x.deadline) body.append(line(deadlineText(x)));
    if (x.desc) body.append(el('p', { className: 'muted rel-pv-text' }, x.desc.slice(0, 200)));
  } else if (type === 'idea') {
    body.append(el('p', { className: 'rel-pv-text' }, x.text.slice(0, 300)));
    if (x.tags?.length) body.append(line(x.tags.map((t) => `#${t}`).join(' ')));
  } else if (type === 'habit') {
    const s = streak(x);
    body.append(line(GOAL_LABEL(goalOf(x))), line(x.log?.[dateKey()] ? '✓ Hecho hoy' : '○ Hoy sin hacer', s ? ` · 🔥 ${streakText(x, s)}` : ''));
  }
  return [head, body];
}

// ---------- Menús ----------
// Nota (menú ⋯ y clic derecho en la lectura): el enlace va en el cursor o al final.
NOTE_MENU_EXTRA.push((note) =>
  note.enc ? null : { label: '🔗 Enlazar con…', action: () => pickEntity({ exclude: `note:${note.id}`, onPick: (e) => relInsertInNote(note, relLinkText(e.type, e.item)) }) }
);

// Clic derecho en tareas, proyectos, ideas, hábitos y notas del explorador.
CTX_MENU_EXTRA.push((kind, x) => {
  if (!REL_TYPES.includes(kind) || !x?.id || x.virtual) return [];
  return [
    { sep: true },
    { label: '🔗 Enlazar con…', action: () => relLinkFrom(kind, x) },
    { label: '🔗 Ver relacionado…', action: () => openRelated(kind, x.id) },
  ];
});

// Menú de un elemento con data-rel-type (tarjeta de proyecto, idea, hábito, fila de «Relacionado»).
function relCtxItems(type, id) {
  const x = relFind(type, id);
  if (!x) return [];
  if (type === 'task') return taskMenuItems(x);
  if (type === 'note') return treeNoteItems(x);
  return [{ label: 'Abrir', action: () => relOpen(type, x) }, ...ctxExtra(type, x)];
}

// Menú de una ficha [[tipo:id]].
function elinkMenuItems(a) {
  const { etype, eid } = a.dataset;
  if (etype === 'note') return [{ label: 'Abrir', action: () => openNoteByLink(a.dataset.target, { fromNote: activeNote() }) }];
  const x = relFind(etype, eid);
  return [
    { label: 'Abrir', disabled: !x, action: () => relOpen(etype, x) },
    { label: '🔗 Ver relacionado…', disabled: !x, action: () => openRelated(etype, eid) },
    { label: 'Copiar enlace', action: () => copyText(x ? relLinkText(etype, x) : `[[${REL_PREFIX[etype]}:${eid}]]`, 'Enlace copiado') },
  ];
}
