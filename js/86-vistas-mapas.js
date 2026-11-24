'use strict';

// ---------- Vistas gráficas (2): Mapas de notas y Mosaico ----------
// Mapas: una nota (normalmente un MOC) se dibuja como mapa: la nota en el centro, sus títulos como
// ramas y las notas que enlaza como hojas. Usa las disposiciones de Ideas y mapas (73-diagramas.js):
// mapa mental, organigrama, esquema y radial. Tocar una hoja abre la nota; tocar una rama la pliega;
// el clic derecho dibuja el mapa de esa nota. «Llevar a Ideas y mapas» crea una copia editable.
// Mosaico: las notas del origen en bloques proporcionales (por MOC, carpeta o una propiedad), con
// color por estado o por antigüedad; al tocar un bloque se ven sus notas, también en bloques.

// =========================================================
// 🗺️ Mapas de notas
// =========================================================
const gvMap = { x: 0, y: 0, z: 1, folded: new Set(), key: '', fit: true };

// Árbol de nodos { id, parent, text, noteId?, kind: 'root'|'head'|'note'|'missing' }.
function gvMapTree(note, { members = true } = {}) {
  const nodes = [{ id: 'root', parent: null, text: baseName(note.path), noteId: note.id, kind: 'root' }];
  const lines = note.body.split('\n');
  const { end } = parseProps(note.body);
  const stack = [{ level: 0, id: 'root' }];
  const seen = new Map(); // padre -> Set de notas ya puestas
  const linked = new Set();
  let inCode = false;
  let k = 0;
  const add = (parent, text, extra) => {
    const id = `n${++k}`;
    nodes.push({ id, parent, text, ...extra });
    return id;
  };
  lines.forEach((line, i) => {
    if (i <= end) return;
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (inCode) return;
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (h) {
      const level = h[1].length;
      if (level === 1) return; // el título principal repite el nombre de la nota (la raíz)
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      const text = plainText(h[2]) || h[2];
      const id = add(stack[stack.length - 1].id, text, { kind: 'head' });
      stack.push({ level, id });
      return;
    }
    const parent = stack[stack.length - 1].id;
    const plain = line.replace(/`[^`]*`/g, '');
    for (const m of plain.matchAll(WIKILINK_RE)) {
      if (m[1]) continue; // incrustada
      const w = parseWikiInner(m[2]);
      if (!w.target) continue;
      const target = findNoteByName(w.target);
      const keyN = target ? target.id : `?${w.target.toLowerCase()}`;
      if (!seen.has(parent)) seen.set(parent, new Set());
      if (seen.get(parent).has(keyN) || target === note) continue;
      seen.get(parent).add(keyN);
      if (target) linked.add(target.id);
      add(parent, target ? baseName(target.path) : w.target.split('/').pop(), target ? { noteId: target.id, kind: 'note' } : { kind: 'missing' });
    }
  });
  if (members) {
    const extra = gvMocMembers(note).filter((n) => !linked.has(n.id));
    if (extra.length) {
      const id = add('root', `Otras notas con moc: ${baseName(note.path)}`, { kind: 'head' });
      sortNotesBy(extra, 'nombre', false).forEach((n) => add(id, baseName(n.path), { noteId: n.id, kind: 'note' }));
    }
  }
  // Ramas sin hojas (títulos sin enlaces) se quitan para que el mapa muestre notas.
  let changed = true;
  while (changed) {
    changed = false;
    const parents = new Set(nodes.map((n) => n.parent));
    for (let i = nodes.length - 1; i > 0; i--) {
      if (nodes[i].kind === 'head' && !parents.has(nodes[i].id)) {
        nodes.splice(i, 1);
        changed = true;
      }
    }
  }
  return nodes;
}

// Tamaño de cada caja según su texto (con un lienzo para medir, sin tocar la página).
const gvMeasureCtx = document.createElement('canvas').getContext('2d');
function gvMapSizes(nodes) {
  const font = getComputedStyle(document.body).fontFamily || 'system-ui';
  const sizes = {};
  nodes.forEach((n) => {
    const big = n.kind === 'root';
    const head = n.kind === 'head';
    gvMeasureCtx.font = `${big ? 700 : head ? 600 : 400} ${big ? 15 : 13}px ${font}`;
    const maxW = big ? 260 : 220;
    const words = n.text.split(/\s+/);
    let line = '';
    let lines = 1;
    let widest = 0;
    words.forEach((w) => {
      const t = line ? `${line} ${w}` : w;
      if (gvMeasureCtx.measureText(t).width > maxW - 24 && line) {
        widest = Math.max(widest, gvMeasureCtx.measureText(line).width);
        line = w;
        lines++;
      } else line = t;
    });
    widest = Math.max(widest, gvMeasureCtx.measureText(line).width);
    sizes[n.id] = { w: Math.ceil(Math.min(maxW, widest + 26)), h: Math.ceil((big ? 20 : 17) * Math.min(lines, 4) + (big ? 18 : 12)) };
  });
  return sizes;
}

function renderMapas() {
  const box = $('#view-mapas');
  if (!box) return;
  const src = gvOpt('mapas', 'src', null);
  const kind = gvOpt('mapas', 'kind', 'mindmap');
  const members = gvOpt('mapas', 'members', true);
  const note = src && noteById(src.v);
  const pick = () => gvPickSource((s) => {
    gvMap.folded = new Set();
    gvMap.fit = true;
    gvSetOpt('mapas', { src: s });
  }, { notesOnly: true });
  const bar = el('div', { className: 'gv-bar' }, [
    note ? gvSourceButton(src, (s) => { gvMap.folded = new Set(); gvMap.fit = true; gvSetOpt('mapas', { src: s }); }, { notesOnly: true }) : gvBtn('🧭 Elegir un MOC o una nota…', pick, 'primary'),
    gvSeg([['mindmap', '🧠 Mapa mental'], ['org', '🏢 Organigrama'], ['outline', '🗂️ Esquema'], ['radial', '🌞 Radial']], kind, (v) => { gvMap.fit = true; gvSetOpt('mapas', { kind: v }); }),
    note ? gvBtn(members ? '☑ Notas con su «moc»' : '☐ Notas con su «moc»', () => { gvMap.fit = true; gvSetOpt('mapas', { members: !members }); }, 'gv-chip', 'Añadir también las notas que lo nombran en la propiedad «moc» aunque el MOC no las enlace') : '',
    el('span', { className: 'gv-spacer' }),
    note ? gvBtn('⊟ Plegar todo', () => { gvMap.folded = new Set(gvMapTree(note, { members }).filter((n) => n.kind === 'head').map((n) => n.text)); gvMap.fit = true; renderMapas(); }) : '',
    note ? gvBtn('⊞ Desplegar', () => { gvMap.folded = new Set(); gvMap.fit = true; renderMapas(); }) : '',
    note ? gvBtn('✏️ Llevar a Ideas y mapas', () => gvMapToIdeas(note, kind, members), 'gv-chip', 'Crear una copia editable en Ideas y mapas') : '',
  ]);
  if (!note) {
    const mocs = gvMocs();
    box.replaceChildren(
      gvHead('mapas', 'Elige un MOC (o cualquier nota) y verás sus títulos como ramas y las notas que enlaza como hojas. Toca una hoja para abrirla.'),
      bar,
      mocs.length ? el('div', { className: 'gv-presets' }, mocs.slice(0, 24).map((m) => gvBtn([el('strong', {}, baseName(m.path)), el('span', { className: 'muted' }, plural(gvMocMembers(m).length, 'nota', 'notas'))], () => gvSetOpt('mapas', { src: { t: 'moc', v: m.id } }), 'card gv-preset'))) : ''
    );
    return;
  }
  const all = gvMapTree(note, { members });
  // Plegado por texto de la rama (así se conserva aunque cambien los ids al editar la nota).
  const hidden = new Set();
  const kids = new Map();
  all.forEach((n) => n.parent && (kids.get(n.parent) || kids.set(n.parent, []).get(n.parent)).push(n));
  const hide = (id) => (kids.get(id) || []).forEach((c) => {
    hidden.add(c.id);
    hide(c.id);
  });
  all.filter((n) => n.kind === 'head' && gvMap.folded.has(n.text)).forEach((n) => hide(n.id));
  const nodes = all.filter((n) => !hidden.has(n.id));
  const map = { kind, edge: kind === 'mindmap' ? 'curve' : undefined, nodes: nodes.map((n) => ({ id: n.id, parent: n.parent, text: n.text })) };
  const sizes = gvMapSizes(nodes);
  let L;
  try {
    L = diagramLayout(map, sizes);
  } catch {
    L = computeLayout(map, sizes);
  }
  if (!L.paths) {
    L.paths = map.nodes.filter((n) => n.parent && L.pos[n.parent] && L.pos[n.id]).map((n) => ({ d: edgePath(L.pos[n.parent], L.pos[n.id], L.side[n.id] || 1), stroke: dgColor(map, n) }));
    L.ox = 0;
    L.oy = 0;
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gvmap-edges');
  svg.setAttribute('width', String(L.width));
  svg.setAttribute('height', String(L.height));
  svg.append(diagramSvg(L));
  const stage = el('div', { className: 'gvmap-stage' }, [svg]);
  Object.assign(stage.style, { width: `${L.width}px`, height: `${L.height}px` });
  nodes.forEach((n) => {
    const p = L.pos[n.id];
    if (!p) return;
    const mn = map.nodes.find((x) => x.id === n.id);
    const bi = n.parent ? branchIndex(map, mn) : -1;
    const count = (kids.get(n.id) || []).length;
    const folded = n.kind === 'head' && gvMap.folded.has(n.text);
    const b = el('button', { className: `gvmap-node k-${n.kind}${bi >= 0 ? ` b${bi}` : ''}`, title: n.kind === 'note' ? 'Abrir la nota (clic derecho: más opciones)' : n.kind === 'head' ? (folded ? 'Desplegar la rama' : 'Plegar la rama') : n.kind === 'missing' ? 'Nota por escribir (tócala para crearla)' : 'Abrir la nota' }, [n.text, folded ? el('span', { className: 'gvmap-fold' }, `+${count}`) : '']);
    Object.assign(b.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, minHeight: `${p.h}px` });
    b.addEventListener('click', (e) => {
      if (gvMap.dragged) return;
      if (n.kind === 'head') {
        if (gvMap.folded.has(n.text)) gvMap.folded.delete(n.text);
        else gvMap.folded.add(n.text);
        return renderMapas();
      }
      if (n.kind === 'missing') return openNoteByLink(n.text, { newTab: e.ctrlKey || e.metaKey, fromNote: note });
      const t = noteById(n.noteId);
      if (t) gvOpen(t, e);
    });
    b.addEventListener('contextmenu', (e) => {
      const t = n.noteId && noteById(n.noteId);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      showMenu({ x: e.clientX, y: e.clientY }, [
        { label: 'Abrir la nota', action: () => gvOpen(t) },
        { label: 'Abrir en otra pestaña', action: () => gvOpen(t, { ctrlKey: true }) },
        { label: '🗺️ Ver el mapa de esta nota', action: () => { gvMap.folded = new Set(); gvMap.fit = true; gvSetOpt('mapas', { src: { t: 'moc', v: t.id } }); } },
        typeof canvasFromLinks === 'function' && { label: '🧩 Crear lienzo con sus enlaces', action: () => canvasFromLinks(t) },
      ]);
    });
    stage.append(b);
  });
  const vp = el('div', { className: 'gvmap-viewport', tabIndex: 0, ariaLabel: `Mapa de ${baseName(note.path)}` }, stage);
  const zoomBar = el('div', { className: 'gvmap-zoom' }, [
    gvBtn('−', () => gvMapZoom(vp, stage, 1 / 1.2), 'gv-chip', 'Alejar'),
    gvBtn('Ajustar', () => gvMapFit(vp, stage, L), 'gv-chip', 'Ver todo el mapa'),
    gvBtn('+', () => gvMapZoom(vp, stage, 1.2), 'gv-chip', 'Acercar'),
  ]);
  const leaves = nodes.filter((n) => n.kind === 'note').length;
  const missing = all.filter((n) => n.kind === 'missing').length;
  box.replaceChildren(
    gvHead('mapas', `${plural(all.filter((n) => n.kind === 'note').length, 'nota enlazada', 'notas enlazadas')}${missing ? ` · ${plural(missing, 'nota por escribir', 'notas por escribir')} (en línea discontinua)` : ''}${leaves < all.filter((n) => n.kind === 'note').length ? ' · algunas ramas plegadas' : ''}. Arrastra el fondo para moverte; rueda para acercar o alejar.`),
    bar,
    el('div', { className: 'gvmap-wrap' }, [vp, zoomBar])
  );
  gvMapPanZoom(vp, stage);
  const key = `${note.id}|${kind}|${members}`;
  if (gvMap.fit || gvMap.key !== key) {
    gvMap.key = key;
    gvMap.fit = false;
    requestAnimationFrame(() => gvMapFit(vp, stage, L));
  } else gvMapApply(stage);
}

const gvMapApply = (stage) => (stage.style.transform = `translate(${gvMap.x}px, ${gvMap.y}px) scale(${gvMap.z})`);
function gvMapFit(vp, stage, L) {
  const r = vp.getBoundingClientRect();
  if (!r.width) return;
  gvMap.z = Math.max(0.15, Math.min(1.2, Math.min(r.width / L.width, r.height / L.height)));
  gvMap.x = (r.width - L.width * gvMap.z) / 2;
  gvMap.y = Math.max(0, (r.height - L.height * gvMap.z) / 2);
  gvMapApply(stage);
}
function gvMapZoom(vp, stage, f, cx, cy) {
  const r = vp.getBoundingClientRect();
  const px = cx ?? r.width / 2;
  const py = cy ?? r.height / 2;
  const z = Math.max(0.1, Math.min(3, gvMap.z * f));
  gvMap.x = px - ((px - gvMap.x) * z) / gvMap.z;
  gvMap.y = py - ((py - gvMap.y) * z) / gvMap.z;
  gvMap.z = z;
  gvMapApply(stage);
}
function gvMapPanZoom(vp, stage) {
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) gvMapZoom(vp, stage, e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    else {
      gvMap.x -= e.deltaX;
      gvMapApply(stage);
    }
  }, { passive: false });
  vp.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const start = { x: e.clientX, y: e.clientY, ox: gvMap.x, oy: gvMap.y };
    gvMap.dragged = false;
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!gvMap.dragged && Math.hypot(dx, dy) < 5) return;
      gvMap.dragged = true;
      vp.classList.add('panning');
      gvMap.x = start.ox + dx;
      gvMap.y = start.oy + dy;
      gvMapApply(stage);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      vp.classList.remove('panning');
      setTimeout(() => (gvMap.dragged = false));
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });
  vp.addEventListener('keydown', (e) => {
    const step = 60;
    if (e.key === '+' || e.key === '=') gvMapZoom(vp, stage, 1.2);
    else if (e.key === '-') gvMapZoom(vp, stage, 1 / 1.2);
    else if (e.key === 'ArrowLeft') gvMap.x += step;
    else if (e.key === 'ArrowRight') gvMap.x -= step;
    else if (e.key === 'ArrowUp') gvMap.y += step;
    else if (e.key === 'ArrowDown') gvMap.y -= step;
    else return;
    e.preventDefault();
    gvMapApply(stage);
  });
}

// Copia editable en Ideas y mapas (las hojas guardan su nota para abrirla desde allí).
function gvMapToIdeas(note, kind, members) {
  const nodes = gvMapTree(note, { members });
  const map = newMap(baseName(note.path));
  map.nodes = nodes.map((n) => ({ id: n.id, parent: n.parent, text: n.text, ...(n.noteId && n.kind !== 'root' ? { noteId: n.noteId } : {}) }));
  map.kind = kind;
  map.updatedAt = Date.now();
  save();
  openMap(map.id);
  showToastMessage('Copia creada en Ideas y mapas: ahí la puedes editar. La nota no cambia.');
}

// =========================================================
// 🧱 Mosaico
// =========================================================
const gvTile = { open: null };
const GV_DONE = /^(completa|completo|revisada|revisado|verificada|verificado|vigente|terminad[ao]|hech[ao]|publicad[ao])$/i;

// Rectángulos proporcionales («squarified»): cada elemento { value } recibe x, y, w, h.
function gvSquarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return out;
  let rest = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value).map((i) => ({ ...i, a: (i.value * w * h) / total }));
  while (rest.length) {
    const short = Math.min(w, h);
    const worst = (row) => {
      const s = row.reduce((t, r) => t + r.a, 0);
      const mx = Math.max(...row.map((r) => r.a));
      const mn = Math.min(...row.map((r) => r.a));
      return Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn));
    };
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]]) <= worst(row)) row.push(rest[i++]);
    const s = row.reduce((t, r) => t + r.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      row.forEach((r) => {
        out.push({ ...r, x, y: cy, w: cw, h: r.a / cw });
        cy += r.a / cw;
      });
      x += cw;
      w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      row.forEach((r) => {
        out.push({ ...r, x: cx, y, w: r.a / rh, h: rh });
        cx += r.a / rh;
      });
      y += rh;
      h -= rh;
    }
    rest = rest.slice(i);
  }
  return out;
}

const gvWords = (n) => gvCached(`w:${n.id}`, () => (n.body.match(/\S+/g) || []).length);
// Días desde la última actualización: la propiedad «actualizada» si existe; si no, la del archivo.
function gvAgeDays(n) {
  const v = propValues(n, 'actualizada')[0] || '';
  const t = /^\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v.slice(0, 10)) : n.updatedAt || n.createdAt || Date.now();
  return Math.max(0, (Date.now() - t) / 864e5);
}

function gvGroupKey(n, by) {
  if (by === 'carpeta') return folderOf(n.path).split('/').pop() || '(raíz)';
  return gvVal(n, by) || `Sin ${by}`;
}

function renderMosaico() {
  const box = $('#view-mosaico');
  if (!box) return;
  const src = gvOpt('mosaico', 'src', { t: 'all' });
  const by = gvOpt('mosaico', 'by', 'moc');
  const size = gvOpt('mosaico', 'size', 'notas');
  const color = gvOpt('mosaico', 'color', 'estado');
  const notes = gvNotes(src);
  const groups = new Map();
  notes.forEach((n) => {
    const k = gvGroupKey(n, by);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  });
  if (gvTile.open && !groups.has(gvTile.open)) gvTile.open = null;
  const inside = gvTile.open ? groups.get(gvTile.open) : null;
  const valueOf = (list) => (size === 'palabras' ? list.reduce((s, n) => s + gvWords(n), 0) : list.length);
  const doneShare = (list) => list.filter((n) => GV_DONE.test(gvVal(n, 'estado'))).length / Math.max(1, list.length);
  const avgAge = (list) => list.reduce((s, n) => s + gvAgeDays(n), 0) / Math.max(1, list.length);
  const tone = (list, i) => {
    if (color === 'grupo') return `var(--b${i % 6})`;
    if (color === 'actualizacion') {
      const a = avgAge(list);
      return a <= 30 ? 'var(--low)' : a <= 180 ? 'var(--mid)' : 'var(--high)';
    }
    const d = doneShare(list);
    return d >= 0.75 ? 'var(--low)' : d >= 0.4 ? 'var(--mid)' : 'var(--high)';
  };
  const items = inside
    ? inside.map((n, i) => ({ key: n.id, label: baseName(n.path), value: size === 'palabras' ? Math.max(1, gvWords(n)) : 1, list: [n], i }))
    : [...groups].map(([k, list], i) => ({ key: k, label: k, value: valueOf(list), list, i }));
  const rects = gvSquarify(items, 0, 0, 100, 100);
  const board = el('div', { className: 'gvt-board' }, rects.map((r) => {
    const n = r.list.length;
    const t = el('button', { className: 'gvt-tile', title: inside ? `${r.label}\n${gvWords(r.list[0])} palabras · estado: ${gvVal(r.list[0], 'estado') || '—'}` : `${r.label}\n${plural(n, 'nota', 'notas')} · ${Math.round(doneShare(r.list) * 100)} % completas · ${Math.round(avgAge(r.list))} días de antigüedad media` }, [
      el('span', { className: 'gvt-name' }, r.label),
      el('span', { className: 'gvt-meta' }, inside ? (gvVal(r.list[0], 'estado') || '') : `${n} · ${Math.round(doneShare(r.list) * 100)} %`),
    ]);
    Object.assign(t.style, { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` });
    t.style.setProperty('--tone', tone(r.list, r.i));
    if (r.w * r.h < 6) t.classList.add('tiny');
    t.addEventListener('click', (e) => {
      if (inside) return gvOpen(r.list[0], e);
      gvTile.open = r.key;
      renderMosaico();
    });
    t.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (inside) return;
      showMenu({ x: e.clientX, y: e.clientY }, [
        { label: 'Ver sus notas en bloques', action: () => { gvTile.open = r.key; renderMosaico(); } },
        { label: 'Lista de sus notas…', action: () => gvCellList(r.list, r.label) },
      ]);
    });
    return t;
  }));
  const legend = color === 'grupo' ? '' : el('div', { className: 'gvt-legend muted' }, color === 'actualizacion'
    ? [el('span', { className: 'gvt-key', style: '--tone: var(--low)' }, 'hasta 30 días'), el('span', { className: 'gvt-key', style: '--tone: var(--mid)' }, 'hasta 6 meses'), el('span', { className: 'gvt-key', style: '--tone: var(--high)' }, 'más de 6 meses')]
    : [el('span', { className: 'gvt-key', style: '--tone: var(--low)' }, '75 % o más completas'), el('span', { className: 'gvt-key', style: '--tone: var(--mid)' }, '40 % a 75 %'), el('span', { className: 'gvt-key', style: '--tone: var(--high)' }, 'menos de 40 %')]);
  const bar = el('div', { className: 'gv-bar' }, [
    gvSourceButton(src, (s) => { gvTile.open = null; gvSetOpt('mosaico', { src: s }); }),
    gvBtn([el('span', { className: 'muted' }, 'Bloques por: '), by, ' ▾'], () => openPicker({
      placeholder: 'Agrupar en bloques por…',
      hint: '<kbd>Enter</kbd> elegir',
      items: (typed) => [['moc', 'MOC (propiedad «moc»)'], ['carpeta', 'Carpeta'], ['area', 'Área'], ['estado', 'Estado'], ['tipo', 'Tipo'], ...gvPropKeys(notes).map((k) => [k.key, `Propiedad «${k.key}»`])]
        .filter(([, l], i, a) => fold(l).includes(fold(typed)) && a.findIndex(([x]) => x.toLowerCase() === a[i][0].toLowerCase()) === i)
        .map(([k, l]) => ({ label: l, action: () => { gvTile.open = null; gvSetOpt('mosaico', { by: k }); } })),
    })),
    gvSeg([['notas', 'Tamaño: notas'], ['palabras', 'Tamaño: palabras']], size, (v) => gvSetOpt('mosaico', { size: v })),
    gvSeg([['estado', 'Color: % completas'], ['actualizacion', 'Color: antigüedad'], ['grupo', 'Color: grupo']], color, (v) => gvSetOpt('mosaico', { color: v })),
  ]);
  const crumb = inside
    ? el('div', { className: 'gvt-crumb' }, [gvBtn(`← ${by === 'carpeta' ? 'Carpetas' : by}`, () => { gvTile.open = null; renderMosaico(); }, 'link back-link'), el('strong', {}, ` ${gvTile.open}`), el('span', { className: 'muted' }, ` · ${plural(inside.length, 'nota', 'notas')} · toca un bloque para abrir la nota`)])
    : el('div', { className: 'gvt-crumb muted' }, `${plural(groups.size, 'bloque', 'bloques')} · ${plural(notes.length, 'nota', 'notas')} · toca un bloque para ver sus notas`);
  box.replaceChildren(gvHead('mosaico', 'Cada bloque es un grupo de notas, de tamaño proporcional. El color dice cuánto está terminado o cuán al día está.'), bar, crumb, notes.length ? board : el('p', { className: 'empty' }, 'No hay notas en este origen.'), legend);
}

Object.assign(VIEW_RENDER, { mapas: renderMapas, mosaico: renderMosaico });
