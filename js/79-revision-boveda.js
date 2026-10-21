'use strict';

// ---------- Revisar la bóveda ----------
// Revisa todas las notas de una vez (o las de una carpeta) y muestra su estado: cuántas hay y dónde,
// MOCs con sus enlaces pendientes (notas por escribir), propiedad «estado», enlaces rotos, notas
// vacías, enormes (libros convertidos que no caben en la nube), nombres repetidos, copias de
// conflicto y notas sueltas. Solo lee; la única acción que cambia notas («estado: borrador» a las que
// no lo tienen) se confirma y se puede deshacer. El informe se puede guardar como nota.
ICONS.stethoscope = '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>';
Object.assign(VIEW_TITLES, { revision: 'Revisar la bóveda' });
Object.assign(VIEW_ICONS, { revision: 'stethoscope' });
Object.assign(VIEW_RENDER, { revision: () => renderVaultReview() });
$('#views-pane main').append(el('section', { id: 'view-revision', className: 'view' }));

const RV_APP_FOLDERS = /^(Diario|Semanal|Mensual|Plantillas|Bases|Tareas|Proyectos|Pensar|Obras|Recetas|Contactos|Cursos|Biblioteca|Películas y series|Papelera)(\/|$)/i;
const RV_ASSET = /^\^|\.(png|jpe?g|gif|webp|bmp|svg|avif|pdf|mp3|mp4|webm|m4a|wav|excalidraw|canvas)$/i;
const RV_HUGE = 200 * 1024; // caracteres: cerca del bloque de 256 KB de la nube
const RV_LIST = 80; // elementos por lista antes de «y N más»
const rv = { folder: '', report: null, rev: -1 };

const rvBody = (text) => {
  const { end } = parseProps(text);
  return end > 0 ? text.split('\n').slice(end + 1).join('\n') : text;
};
const rvTargets = (body) => [...new Set(linksIn(body).map((l) => (l.target || '').trim()).filter((t) => t && !RV_ASSET.test(t) && !/^(tarea|proyecto|idea|h[aá]bito):/i.test(t)))];

function computeVaultReview(folder = '') {
  const inScope = (n) => !folder || n.path === folder || n.path.startsWith(`${folder}/`);
  const notes = state.notes.filter(inScope);
  const r = { at: Date.now(), folder, total: notes.length, locked: 0, words: 0, folders: new Map(), empty: [], huge: [], dupes: [], conflicts: [], orphans: [], ghosts: new Map(), mocs: [], estados: new Map(), sinEstado: new Map(), tipos: new Map() };
  const incoming = new Map();
  const out = new Map();
  for (const n of notes) {
    const top = n.path.includes('/') ? n.path.split('/').slice(0, n.path.split('/').length > 2 ? 2 : 1).join('/') : '(raíz)';
    r.folders.set(top, (r.folders.get(top) || 0) + 1);
    if (n.enc) {
      r.locked++;
      continue;
    }
    const text = n.body || '';
    const body = rvBody(text);
    r.words += (body.match(/[\p{L}\p{N}]+/gu) || []).length;
    if (!body.replace(/^#.*$/gm, '').trim()) r.empty.push(n);
    if (text.length > RV_HUGE) r.huge.push(n);
    if (/\((desde Drive|Obsidian)\)$/i.test(baseName(n.path))) r.conflicts.push(n);
    const props = parseProps(text).props;
    const prop = (k) => props.find((p) => p.key.toLowerCase() === k)?.value;
    const estado = prop('estado');
    if (estado != null && String(estado).trim()) r.estados.set(String(estado).trim().toLowerCase(), (r.estados.get(String(estado).trim().toLowerCase()) || 0) + 1);
    else if (!RV_APP_FOLDERS.test(n.path) && !/\bMOC\b/i.test(baseName(n.path))) {
      const f = folderOf(n.path) || '(raíz)';
      if (!r.sinEstado.has(f)) r.sinEstado.set(f, []);
      r.sinEstado.get(f).push(n);
    }
    const tipo = prop('tipo');
    if (tipo != null && String(tipo).trim()) r.tipos.set(String(tipo).trim().toLowerCase(), (r.tipos.get(String(tipo).trim().toLowerCase()) || 0) + 1);
    const targets = rvTargets(text);
    const resolved = [];
    for (const t of targets) {
      const hit = findNoteByName(t);
      if (hit) {
        resolved.push(hit);
        incoming.set(hit.id, (incoming.get(hit.id) || 0) + 1);
      } else {
        const g = r.ghosts.get(t.toLowerCase()) || { name: t, from: new Set() };
        g.from.add(n);
        r.ghosts.set(t.toLowerCase(), g);
      }
    }
    out.set(n.id, resolved.length);
    if (/\bMOC\b/i.test(baseName(n.path))) {
      const pending = targets.filter((t) => !findNoteByName(t));
      r.mocs.push({ note: n, total: targets.length, done: targets.length - pending.length, pending });
    }
  }
  // Las notas de fuera de la carpeta también cuentan como enlaces entrantes.
  if (folder) {
    state.notes.filter((n) => !inScope(n) && !n.enc).forEach((n) => rvTargets(n.body || '').forEach((t) => {
      const hit = findNoteByName(t);
      if (hit && inScope(hit)) incoming.set(hit.id, (incoming.get(hit.id) || 0) + 1);
    }));
  }
  r.orphans = notes.filter((n) => !n.enc && !RV_APP_FOLDERS.test(n.path) && !out.get(n.id) && !incoming.get(n.id));
  const byName = new Map();
  notes.forEach((n) => {
    const k = baseName(n.path).toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(n);
  });
  r.dupes = [...byName.values()].filter((l) => l.length > 1);
  r.mocs.sort((a, b) => a.note.path.localeCompare(b.note.path, 'es', { numeric: true }));
  r.huge.sort((a, b) => (b.body || '').length - (a.body || '').length);
  r.ghostList = [...r.ghosts.values()].sort((a, b) => b.from.size - a.from.size || a.name.localeCompare(b.name, 'es'));
  return r;
}

// Añade «estado: borrador» a las notas indicadas que no tienen estado (todo de una vez, con «Deshacer»).
function rvSetDraft(list) {
  const todo = list.filter((n) => !n.enc && !parseProps(n.body || '').props.some((p) => p.key.toLowerCase() === 'estado'));
  if (!todo.length) return showToastMessage('Todas tienen ya un estado.');
  withUndo(`«estado: borrador» en ${plural(todo.length, 'nota', 'notas')}`, () => {
    const now = Date.now();
    todo.forEach((n) => {
      const lines = (n.body || '').split('\n');
      const { end } = parseProps(n.body || '');
      const rows = peLines('estado', 'text', 'borrador');
      if (end > 0) lines.splice(end, 0, ...rows);
      else lines.unshift('---', ...rows, '---');
      n.body = lines.join('\n');
      n.updatedAt = now;
    });
    dataRev++;
  });
  rv.rev = -1;
  renderVaultReview();
}

// ---------- Informe como nota ----------
function rvMarkdown(r) {
  const link = (n) => `[[${n.path}|${baseName(n.path)}]]`;
  const more = (arr, n = RV_LIST) => (arr.length > n ? [`- … y ${arr.length - n} más`] : []);
  const pct = (m) => (m.total ? Math.round((m.done / m.total) * 100) : 100);
  const L = [`# 🩺 Revisión de la bóveda · ${dateKey()}`, '', `Ámbito: **${r.folder || 'toda la bóveda'}** · ${plural(r.total, 'nota', 'notas')} · ${r.words.toLocaleString('es')} palabras${r.locked ? ` · ${r.locked} con contraseña (no revisadas)` : ''}.`, ''];
  L.push('## Carpetas', '', ...[...r.folders].sort((a, b) => b[1] - a[1]).map(([f, c]) => `- ${f}: ${c}`), '');
  if (r.mocs.length) {
    L.push('## MOCs y notas por escribir', '', '| MOC | Enlaces | Escritas | Pendientes | Avance |', '|---|---|---|---|---|');
    r.mocs.forEach((m) => L.push(`| ${link(m.note)} | ${m.total} | ${m.done} | ${m.pending.length} | ${pct(m)} % |`));
    L.push('');
    r.mocs.filter((m) => m.pending.length).forEach((m) => L.push(`### Pendientes de ${baseName(m.note.path)}`, '', ...m.pending.slice(0, RV_LIST).map((t) => `- [ ] [[${t}]]`), ...more(m.pending), ''));
  }
  if (r.estados.size || r.sinEstado.size) {
    L.push('## Estado de las notas', '', ...[...r.estados].sort((a, b) => b[1] - a[1]).map(([e, c]) => `- ${e}: ${c}`));
    const sin = [...r.sinEstado.values()].reduce((s, l) => s + l.length, 0);
    if (sin) L.push(`- sin estado: ${sin}`);
    L.push('');
  }
  const sec = (title, arr, fmt = link) => arr.length && L.push(`## ${title} (${arr.length})`, '', ...arr.slice(0, RV_LIST).map((x) => `- ${fmt(x)}`), ...more(arr), '');
  sec('Notas vacías', r.empty);
  sec('Notas enormes (más de 200 KB)', r.huge, (n) => `${link(n)} · ${Math.round((n.body || '').length / 1024)} KB`);
  sec('Nombres repetidos', r.dupes, (l) => l.map(link).join(' · '));
  sec('Copias de conflicto', r.conflicts);
  sec('Enlaces a notas que no existen', r.ghostList, (g) => `[[${g.name}]] · desde ${g.from.size}`);
  sec('Notas sueltas (sin enlaces)', r.orphans);
  return `${L.join('\n')}\n`;
}

// ---------- Pantalla ----------
function renderVaultReview() {
  const box = $('#view-revision');
  if (!box) return;
  if (!rv.report || rv.rev !== dataRev) {
    rv.report = computeVaultReview(rv.folder);
    rv.rev = dataRev;
  }
  const r = rv.report;
  const openN = (n) => {
    const a = el('a', { href: '#', className: 'rv-note', title: n.path }, baseName(n.path));
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openNote(n, { newTab: e.ctrlKey || e.metaKey });
    });
    return a;
  };
  const list = (items, render) => el('ul', { className: 'rv-list' }, [...items.slice(0, RV_LIST).map((x) => el('li', {}, render(x))), ...(items.length > RV_LIST ? [el('li', { className: 'muted' }, `… y ${items.length - RV_LIST} más (están todas en el informe guardado como nota)`)] : [])]);
  const card = (title, count, hint, body, tone = '') => el('details', { className: `card rv-card ${tone}`, open: tone === 'warn' && count > 0 && count < 30 }, [el('summary', {}, [el('strong', {}, title), el('span', { className: `rv-count ${count ? tone : 'ok'}` }, String(count)), el('span', { className: 'muted rv-hint' }, hint)]), ...(count ? [body()] : [el('p', { className: 'muted' }, 'Nada que revisar aquí. 👍')])]);

  const folders = el('select', { ariaLabel: 'Carpeta a revisar' }, [el('option', { value: '' }, 'Toda la bóveda'), ...allFolders().filter((f) => f.split('/').length <= 3).map((f) => el('option', { value: f }, f))]);
  folders.value = rv.folder;
  folders.addEventListener('change', () => {
    rv.folder = folders.value;
    rv.rev = -1;
    renderVaultReview();
  });
  const again = el('button', {}, '↻ Volver a revisar');
  again.addEventListener('click', () => {
    rv.rev = -1;
    renderVaultReview();
    showToastMessage('Revisión actualizada');
  });
  const saveBtn = el('button', { className: 'primary' }, '📝 Guardar el informe como nota');
  saveBtn.addEventListener('click', () => createNote({ folder: '', title: `🩺 Revisión de la bóveda ${dateKey()}`, body: rvMarkdown(r) }));

  const pct = (m) => (m.total ? Math.round((m.done / m.total) * 100) : 100);
  const mocs = r.mocs.map((m) => el('details', { className: 'rv-moc' }, [
    el('summary', {}, [openN(m.note), el('span', { className: 'rv-bar', title: `${pct(m)} % escrito` }, el('i', { style: `width:${pct(m)}%` })), el('span', { className: 'muted' }, `${m.done}/${m.total} · ${m.pending.length} por escribir`)]),
    m.pending.length ? list(m.pending, (t) => {
      const a = el('a', { href: '#', className: 'rv-ghost', title: 'Crear esta nota' }, `＋ ${t}`);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openNoteByLink(t, { newTab: e.ctrlKey || e.metaKey });
      });
      return a;
    }) : el('p', { className: 'muted' }, 'Todas sus notas están escritas. 🎉'),
  ]));
  const totalPending = r.mocs.reduce((s, m) => s + m.pending.length, 0);
  const sinEstado = [...r.sinEstado].sort((a, b) => b[1].length - a[1].length);
  const sinCount = sinEstado.reduce((s, [, l]) => s + l.length, 0);

  box.replaceChildren(
    el('div', { className: 'rv-head' }, [
      el('div', {}, [el('h2', {}, '🩺 Revisar la bóveda'), el('p', { className: 'muted' }, 'Revisa todas tus notas a la vez y te dice qué falta y qué conviene arreglar. Solo lee: no cambia nada sin preguntarte.')]),
      el('div', { className: 'row rv-actions' }, [folders, again, saveBtn]),
    ]),
    el('div', { className: 'rv-stats' }, [
      ['Notas', r.total], ['Palabras', r.words.toLocaleString('es')], ['MOCs', r.mocs.length], ['Por escribir', totalPending], ['Enlaces rotos', r.ghostList.length], ['Sueltas', r.orphans.length],
    ].map(([l, v]) => el('div', { className: 'stat rv-stat' }, [el('strong', {}, String(v)), el('span', { className: 'muted' }, l)]))),
    card('MOCs y notas por escribir', r.mocs.length, 'Cada enlace de un MOC que aún no tiene nota es una nota por escribir: tu lista de trabajo.', () => el('div', {}, mocs)),
    card('Estado de las notas', r.estados.size + sinCount, 'Propiedad «estado» (borrador, revisada…).', () => el('div', {}, [
      el('p', {}, [...r.estados].sort((a, b) => b[1] - a[1]).map(([e, c]) => el('span', { className: 'chip rv-chip' }, `${e}: ${c}`))),
      ...(sinCount ? [el('p', { className: 'muted' }, `${plural(sinCount, 'nota', 'notas')} de contenido sin «estado», por carpeta:`), el('ul', { className: 'rv-list' }, sinEstado.slice(0, 40).map(([f, l]) => {
        const b = el('button', { className: 'link', title: `Añade «estado: borrador» a estas ${l.length} notas (se puede deshacer)` }, '＋ marcar como borrador');
        b.addEventListener('click', () => {
          askConfirm(`¿Añadir «estado: borrador» a ${plural(l.length, 'nota', 'notas')} de «${f}»? No cambia nada más y se puede deshacer.`, 'Sí, marcar', () => rvSetDraft(l));
        });
        return el('li', {}, [el('span', {}, `${f} · ${l.length}`), ' ', b]);
      }))] : []),
    ]), sinCount ? 'warn' : ''),
    card('Enlaces a notas que no existen', r.ghostList.length, 'Enlaces [[…]] sin nota: pueden ser notas por escribir o nombres mal escritos.', () => list(r.ghostList, (g) => {
      const a = el('a', { href: '#', className: 'rv-ghost', title: 'Crear esta nota' }, `＋ ${g.name}`);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openNoteByLink(g.name, { newTab: e.ctrlKey || e.metaKey });
      });
      return [a, el('span', { className: 'muted' }, ` · desde ${[...g.from].slice(0, 3).map((n) => baseName(n.path)).join(', ')}${g.from.size > 3 ? ` y ${g.from.size - 3} más` : ''}`)];
    }), 'warn'),
    card('Notas enormes', r.huge.length, 'Más de 200 KB (suelen ser libros convertidos): van lentas y no caben en la sincronización entre dispositivos. Mejor como fuentes fuera de la bóveda, o divididas.', () => list(r.huge, (n) => [openN(n), el('span', { className: 'muted' }, ` · ${Math.round((n.body || '').length / 1024)} KB`)]), 'warn'),
    card('Notas vacías', r.empty.length, 'Solo título o nada: complétalas o bórralas.', () => list(r.empty, openN), 'warn'),
    card('Nombres repetidos', r.dupes.length, 'Varias notas con el mismo nombre: los [[enlaces]] pueden ir a la que no es.', () => list(r.dupes, (l) => l.flatMap((n, i) => [i ? ' · ' : '', openN(n), el('span', { className: 'muted' }, ` (${folderOf(n.path) || 'raíz'})`)])), 'warn'),
    card('Copias de conflicto', r.conflicts.length, '«(desde Drive)» u «(Obsidian)»: se crearon para no perder cambios hechos en dos sitios. Compáralas con la original y borra la que sobre.', () => list(r.conflicts, openN), 'warn'),
    card('Notas sueltas', r.orphans.length, 'Sin enlaces de entrada ni de salida: enlázalas a su MOC o a notas relacionadas.', () => list(r.orphans, (n) => [openN(n), el('span', { className: 'muted' }, ` · ${folderOf(n.path) || 'raíz'}`)])),
    card('Carpetas', r.folders.size, 'Cuántas notas hay en cada carpeta.', () => list([...r.folders].sort((a, b) => b[1] - a[1]), ([f, c]) => `${f}: ${c}`)),
    el('p', { className: 'muted rv-foot' }, `Revisado ${new Date(r.at).toLocaleTimeString('es', { timeStyle: 'short' })}${r.locked ? ` · ${plural(r.locked, 'nota con contraseña', 'notas con contraseña')} sin revisar` : ''}.`),
  );
}

// Entradas: menú «Más» de la barra de arriba y paleta de comandos.
(() => {
  const menu = $('.prodbar [data-group="more"] .tb-menu');
  if (!menu) return;
  const b = el('button', { id: 'rib-revision', className: 'rib', title: 'Revisar la bóveda: estado de todas las notas', ariaLabel: 'Revisar la bóveda' }, [ico('stethoscope'), el('span', { className: 'rib-label' }, 'Revisar la bóveda')]);
  b.addEventListener('click', (e) => showView('revision', { newTab: e.ctrlKey || e.metaKey }));
  menu.prepend(b);
})();
COMMANDS_EXTRA.push(() => [{ label: '🩺 Revisar la bóveda (estado de las notas)', action: ({ newTab } = {}) => showView('revision', { newTab }) }]);
