'use strict';

// ---------- Títulos plegables ----------
// En la lectura (y en la vista dividida) cada título lleva una flecha: al tocarla se oculta lo que
// hay debajo hasta el siguiente título del mismo nivel o superior, como en Obsidian. No se envuelve
// nada: los bloques siguen siendo hijos directos de la lectura (la edición por bloques los busca así).
// Lo plegado se recuerda por nota y título en localStorage («enfoque:folds»).
const FOLD_KEY = 'enfoque:folds';
const FOLD_HEADS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';

function foldsLoad() {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function foldsSave(all) {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(all));
  } catch {
    // Sin almacenamiento: el plegado dura hasta que se vuelve a dibujar.
  }
}
const foldedOf = (noteId) => new Set(Array.isArray(foldsLoad()[noteId]) ? foldsLoad()[noteId] : []);
function setFolded(noteId, set) {
  const all = foldsLoad();
  if (set.size) all[noteId] = [...set];
  else delete all[noteId];
  foldsSave(all);
}
const headLevel = (n) => (/^H[1-6]$/.test(n.tagName) ? Number(n.tagName[1]) : 0);

// Oculta lo que queda bajo cada título plegado.
function applyFolds(reading) {
  const folded = foldedOf(reading.dataset.note);
  let level = 0;
  for (const n of reading.children) {
    const lv = headLevel(n);
    if (level && lv && lv <= level) level = 0;
    n.classList.toggle('fold-hidden', !!level);
    if (!lv) continue;
    const on = folded.has(n.id);
    n.classList.toggle('folded', on);
    const b = n.querySelector(':scope > .fold-toggle');
    if (b) {
      b.ariaExpanded = String(!on);
      b.title = on ? 'Desplegar la sección' : 'Plegar la sección';
    }
    if (!level && on) level = lv;
  }
}

function addFoldToggles(reading) {
  reading.querySelectorAll(FOLD_HEADS).forEach((h) => {
    if (h.querySelector(':scope > .fold-toggle')) return;
    const b = el('button', { type: 'button', className: 'fold-toggle' });
    b.ariaLabel = 'Plegar o desplegar la sección';
    h.prepend(b);
  });
  applyFolds(reading);
}
READING_EXTRA.push((reading) => addFoldToggles(reading));

function toggleFold(h) {
  const reading = h.parentElement;
  const id = reading?.dataset.note;
  if (!id || !h.id) return;
  const set = foldedOf(id);
  if (set.has(h.id)) set.delete(h.id);
  else set.add(h.id);
  setFolded(id, set);
  applyFolds(reading);
}

// Solo la flecha pliega; tocar el texto del título no hace nada distinto.
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('#note-reading .fold-toggle');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  toggleFold(b.parentElement);
});

// Abre los títulos que esconden `target` (y el propio título, si está plegado): enlaces [[Nota#Título]].
function unfoldTo(target) {
  const reading = $('#note-reading');
  if (!target || !reading?.contains(target)) return;
  let top = target;
  while (top.parentElement !== reading) top = top.parentElement;
  const set = foldedOf(reading.dataset.note);
  let changed = set.delete(top.id);
  let lv = headLevel(top) || 7;
  for (let n = top.previousElementSibling; n && lv > 1; n = n.previousElementSibling) {
    const k = headLevel(n);
    if (!k || k >= lv) continue;
    if (set.delete(n.id)) changed = true;
    lv = k;
  }
  if (!changed) return;
  setFolded(reading.dataset.note, set);
  applyFolds(reading);
}

function foldAll(note, fold) {
  const set = new Set();
  if (fold) {
    const reading = $('#note-reading');
    if (reading.dataset.note === note.id && !reading.hidden) reading.querySelectorAll(FOLD_HEADS).forEach((h) => set.add(h.id));
    else headingsIn(noteText(note) || '').forEach((h) => set.add(h.id));
  }
  setFolded(note.id, set);
  const reading = $('#note-reading');
  if (reading.dataset.note === note.id) applyFolds(reading);
}

COMMANDS_EXTRA.push((note) => (note && noteText(note) !== null ? [
  { label: 'Plegar todos los títulos', action: () => foldAll(note, true) },
  { label: 'Desplegar todos los títulos', action: () => foldAll(note, false) },
] : []));

// ---------- Archivos guardados en la app: ![nombre.ext](file:ID) ----------
// Viven en el mismo almacén que las imágenes (26-imagenes.js). Se muestran según su tipo:
// audio y vídeo con reproductor, PDF con «Abrir» y «Descargar», y lo demás como chip que descarga.
const FILE_ID_RE = /^[a-z0-9]+$/i;
const fileBlobs = new Map(); // id -> { blob, url }

function fileMime(rec) {
  const d = rec.data;
  const v = String(rec.mime || rec.type || (typeof d === 'string' ? (d.match(/^data:([^;,]+)/) || [])[1] : d instanceof Blob ? d.type : '') || '').toLowerCase().trim();
  return /^[a-z]+\/[a-z0-9.+-]+$/.test(v) ? v : 'application/octet-stream';
}

function fileBlob(id, rec, mime) {
  const known = fileBlobs.get(id);
  if (known && known.blob.type === mime) return known;
  let blob = null;
  const d = rec.data;
  if (d instanceof Blob) blob = d.slice(0, d.size, mime);
  else if (typeof d === 'string' && d.startsWith('data:')) {
    const k = d.indexOf(',');
    if (k < 0) return null;
    try {
      const meta = d.slice(5, k);
      const raw = /;base64$/i.test(meta) ? atob(d.slice(k + 1)) : decodeURIComponent(d.slice(k + 1));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      blob = new Blob([bytes], { type: mime });
    } catch {
      return null;
    }
  }
  if (!blob) return null;
  if (known) URL.revokeObjectURL(known.url);
  const out = { blob, url: URL.createObjectURL(blob) };
  fileBlobs.set(id, out);
  return out;
}

async function hydrateFile(box) {
  const id = box.dataset.file;
  if (!FILE_ID_RE.test(id || '') || box.dataset.loaded === id || box.closest('.pdf-render')) return;
  box.dataset.loaded = id;
  const rec = await getFile(id);
  const name = box.dataset.name || rec?.name || 'archivo';
  const mime = rec?.data ? fileMime(rec) : '';
  const f = rec?.data ? fileBlob(id, rec, mime) : null;
  if (!f) {
    box.classList.add('missing');
    box.title = 'Este archivo aún no está en este dispositivo (llegará al sincronizar).';
    delete box.dataset.loaded;
    return;
  }
  box.classList.remove('missing');
  box.title = name;
  box.dataset.mime = mime;
  const label = el('span', { className: 'nf-name' }, name);
  const download = (text, cls) => {
    const b = el('button', { type: 'button', className: cls }, text);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      offerDownload(name, f.blob, mime);
    });
    return b;
  };
  if (/^audio\//.test(mime)) {
    box.className = 'note-file nf-audio';
    box.replaceChildren(label, el('audio', { controls: true, preload: 'metadata', src: f.url }));
  } else if (/^video\//.test(mime)) {
    box.className = 'note-file nf-video';
    box.replaceChildren(el('video', { controls: true, preload: 'metadata', src: f.url }), label);
  } else if (mime === 'application/pdf') {
    box.className = 'note-file nf-pdf';
    const open = el('a', { href: f.url, target: '_blank', rel: 'noopener', className: 'nf-open' }, 'Abrir PDF');
    box.replaceChildren(el('span', { className: 'nf-ico', ariaHidden: 'true' }, '📄'), label, open, download('Descargar', 'nf-dl'));
  } else {
    box.className = 'note-file nf-chip';
    box.replaceChildren(download(`📎 ${name}`, 'nf-chip-btn'));
  }
}

const FILE_SEL = '.note-file[data-file]';
function hydrateFiles(root = document) {
  root.querySelectorAll(FILE_SEL).forEach(hydrateFile);
}
new MutationObserver((records) => {
  for (const r of records) {
    r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches?.(FILE_SEL)) hydrateFile(n);
      else if (n.querySelector?.(FILE_SEL)) hydrateFiles(n);
    });
  }
}).observe(document.body, { childList: true, subtree: true });

// Una imagen de internet que no carga (p. ej. un enlace sin extensión que era una página) pasa a tarjeta con enlace.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.matches('img.note-img.ext') || !/^https?:/i.test(img.getAttribute('src') || '')) return;
  const url = img.getAttribute('src');
  const card = document.createElement('span');
  card.innerHTML = extLink(url, `🔗 ${escHtml(img.alt || urlHost(url))}`);
  img.replaceWith(card.firstChild);
}, true);
