'use strict';

// ---------- Vista previa de enlaces ----------
// Como «Page preview» de Obsidian: al dejar el ratón ~400 ms sobre un enlace [[…]] (lectura, vista
// previa al editar, enlaces entrantes, resultados de búsqueda, marcadores o un nodo del grafo) sale
// la nota en una ventanita. Sigue abierta mientras el ratón esté encima; se cierra al salir, con Esc
// o al desplazarse. Solo un nivel: los enlaces de dentro se siguen con clic, sin otra vista previa.
// En pantallas táctiles no hay «pasar por encima»: no se muestra.
const PV_DELAY = 400;
const PV_HIDE = 250;
const pv = { timer: null, hideTimer: null, anchor: null, graphHover: null, noteId: null };
const PV_SEL = 'a.wikilink:not(.unresolved), a.elink:not(.missing):not(.unresolved), [data-pv-note], .search-hit';

const pvBox = el('div', { id: 'link-preview', className: 'link-preview', hidden: true, role: 'dialog', ariaLabel: 'Vista previa de la nota' });
document.body.append(pvBox);
const pvOpen = () => !pvBox.hidden;

// Nota (y sección) a la que apunta un elemento, o null si no hay nada que mostrar.
function pvTarget(node) {
  // Ficha [[tarea:…]], [[proyecto:…]]…: tarjeta con estado, fecha y avance (60-relaciones.js).
  if (node.matches('a.elink')) {
    const { etype, eid, target } = node.dataset;
    if (etype !== 'note') return { ent: { type: etype, id: eid } };
    const note = findNoteByName(target);
    return note ? { note, heading: '' } : null;
  }
  if (node.matches('a.wikilink')) {
    const { target, heading } = node.dataset;
    const from = node.closest('[data-note]')?.dataset.note;
    const note = target ? findNoteByName(target) : from ? noteById(from) : activeNote();
    return note ? { note, heading: heading || '' } : null;
  }
  if (node.dataset.pvNote) {
    const note = noteById(node.dataset.pvNote);
    return note ? { note, heading: node.dataset.pvHeading || '' } : null;
  }
  // Resultado de búsqueda sin id: se busca por carpeta y nombre.
  const title = node.querySelector('.sh-title')?.textContent;
  const folder = node.querySelector('.sh-path')?.textContent || '';
  const note = title && findNoteByName(folder ? `${folder}/${title}` : title);
  return note ? { note, heading: '' } : null;
}

function showLinkPreview(target, rect) {
  const { note, heading } = target;
  clearTimeout(pv.hideTimer);
  if (target.ent) {
    pv.noteId = null;
    pvBox.replaceChildren(...entityPreview(target.ent.type, target.ent.id));
    pvBox.hidden = false;
    return pvPlace(rect);
  }
  pv.noteId = note.id;
  const text = noteText(note);
  const head = el('button', { className: 'lp-head', title: 'Abrir la nota' }, [el('span', { className: 'lp-title' }, baseName(note.path)), heading ? el('span', { className: 'lp-sec' }, `› ${heading}`) : '']);
  head.addEventListener('click', (e) => {
    hideLinkPreview();
    openNote(note, { heading, newTab: e.ctrlKey || e.metaKey });
  });
  const body = el('div', { className: 'lp-body md' });
  body.dataset.note = note.id;
  if (text === null) body.append(el('p', { className: 'muted lp-locked' }, '🔒 Nota protegida'));
  else if (!text.trim()) body.append(el('p', { className: 'muted' }, 'Nota vacía.'));
  else {
    body.innerHTML = renderMd(text, { noteId: note.id, noTasks: !!note.enc, depth: 1 });
    if (typeof hydrateQueries === 'function') hydrateQueries(body, note.id);
  }
  pvBox.replaceChildren(head, body);
  pvBox.hidden = false;
  pvPlace(rect);
  // Con «#sección» se baja hasta ese título (o bloque) y se resalta.
  if (heading && text) {
    const line = heading.startsWith('^') ? blockLine(text, heading.slice(1)) : headingsIn(text).find((h) => h.text.toLowerCase() === heading.toLowerCase())?.line;
    const at = line >= 0 && body.querySelector(`[data-line="${line}"]`);
    if (at) {
      at.classList.add('lp-target');
      body.scrollTop = at.getBoundingClientRect().top - body.getBoundingClientRect().top - 6;
    }
  }
}

// Junto al enlace (debajo o, si no cabe, encima), siempre dentro de la ventana.
function pvPlace(r) {
  const w = pvBox.offsetWidth;
  const h = pvBox.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = r.bottom + 6;
  if (top + h > vh - 8) top = r.top - h - 6 >= 8 ? r.top - h - 6 : Math.max(8, vh - h - 8);
  pvBox.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8))}px`;
  pvBox.style.top = `${top}px`;
}

function hideLinkPreview() {
  clearTimeout(pv.timer);
  clearTimeout(pv.hideTimer);
  pv.anchor = null;
  pv.noteId = null;
  if (pvOpen()) {
    pvBox.hidden = true;
    pvBox.replaceChildren();
  }
}
const pvLater = () => {
  clearTimeout(pv.hideTimer);
  if (pvOpen()) pv.hideTimer = setTimeout(hideLinkPreview, PV_HIDE);
};

document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (pvBox.contains(e.target)) return clearTimeout(pv.hideTimer);
  const node = e.target.closest(PV_SEL);
  if (!node || node.closest('#note-menu, #picker')) return;
  if (node === pv.anchor) return clearTimeout(pv.hideTimer);
  clearTimeout(pv.timer);
  pv.anchor = node;
  pv.timer = setTimeout(() => {
    if (!node.isConnected || pv.anchor !== node) return;
    const target = pvTarget(node);
    if (target) showLinkPreview(target, node.getBoundingClientRect());
  }, PV_DELAY);
});

document.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse') return;
  const to = e.relatedTarget;
  if (to && (pvBox.contains(to) || pv.anchor?.contains(to))) return;
  if (pvBox.contains(e.target) || pv.anchor?.contains(e.target)) {
    clearTimeout(pv.timer);
    if (!pvOpen()) pv.anchor = null;
    pvLater();
  }
});

// Grafo: el nodo bajo el ratón lo sabe el propio grafo (se dibuja en un canvas).
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.target.tagName !== 'CANVAS') return;
  const g = [typeof globalGraph !== 'undefined' && globalGraph, typeof localGraph !== 'undefined' && localGraph].find((x) => x && x.canvas === e.target);
  if (!g) return;
  const id = g.drag ? null : g.hover;
  if (id === pv.graphHover) return;
  pv.graphHover = id;
  clearTimeout(pv.timer);
  pvLater();
  const node = id && g.byId?.get(id);
  if (node?.kind !== 'note') return;
  const { clientX: x, clientY: y } = e;
  pv.anchor = e.target;
  pv.timer = setTimeout(() => {
    if (pv.graphHover === id && noteById(node.note.id)) showLinkPreview({ note: node.note, heading: '' }, { left: x + 12, right: x + 12, top: y - 8, bottom: y + 12 });
  }, PV_DELAY);
});
document.documentElement.addEventListener('pointerleave', hideLinkPreview);

// Dentro de la ventanita los enlaces funcionan como en la lectura.
pvBox.addEventListener('click', (e) => {
  const link = e.target.closest('a.wikilink');
  if (link) {
    e.preventDefault();
    const from = noteById(pv.noteId);
    hideLinkPreview();
    openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey, fromNote: from });
    return;
  }
  const tag = e.target.closest('a.tag-link');
  if (tag) {
    e.preventDefault();
    hideLinkPreview();
    searchTag(tag.dataset.tag);
    return;
  }
  const box = e.target.closest('input.task-check');
  if (box) toggleNoteTask(box.closest('[data-note]').dataset.note, Number(box.dataset.line), box.checked);
});

document.addEventListener('pointerdown', (e) => pvOpen() && !pvBox.contains(e.target) && hideLinkPreview(), true);
document.addEventListener('scroll', (e) => pvOpen() && !pvBox.contains(e.target) && hideLinkPreview(), true);
window.addEventListener('blur', hideLinkPreview);
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !pvOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  hideLinkPreview();
}, true);
