'use strict';

// ---------- Vista «Dibujos» ----------
// Galería de todos los dibujos (al estilo Excalidraw, 31-dibujo.js) que hay en las notas: cada uno
// con su miniatura, la nota donde está y su fecha. Tocarlo abre el dibujo para editarlo (en su nota);
// «＋ Nuevo dibujo» crea una nota en «Dibujos» y abre la pizarra; «En una nota…» lo añade a una nota
// que ya existe. Los dibujos siguen guardándose como imágenes de su nota (se sincronizan igual).

const DRAW_FOLDER = 'Dibujos';
const gvDraw = { recs: new Map(), q: '', loading: false };
const GV_IMG_RE = /!\[[^\]]*\]\(img:([\w-]+)\)/g;

// Dibujos de las notas: [{ id, note }] (cada imagen una vez, en la primera nota que la usa).
function gvDrawingRefs() {
  const out = [];
  const seen = new Set();
  gvLive().forEach((n) => {
    if (!n.body.includes('(img:')) return;
    for (const m of n.body.matchAll(GV_IMG_RE)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: m[1], note: n });
    }
  });
  return out;
}

async function gvLoadDrawings(refs) {
  const missing = refs.filter((r) => !gvDraw.recs.has(r.id));
  if (!missing.length || gvDraw.loading) return false;
  gvDraw.loading = true;
  try {
    for (const r of missing) gvDraw.recs.set(r.id, (await getFile(r.id).catch(() => null)) || null);
  } finally {
    gvDraw.loading = false;
  }
  return true;
}

function gvNewDrawingNote() {
  if (!state.folders.includes(DRAW_FOLDER)) state.folders.push(DRAW_FOLDER);
  const d = new Date();
  const title = `Dibujo ${dateKey(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  const note = createNote({ folder: DRAW_FOLDER, title, body: '', open: true, edit: false, log: false });
  requestAnimationFrame(() => openDrawing());
  return note;
}

function gvDrawInNote() {
  openPicker({
    placeholder: 'Añadir un dibujo a la nota…',
    hint: '<kbd>Enter</kbd> abrir la pizarra · <kbd>Esc</kbd> cerrar',
    items: (typed) => gvLive().filter((n) => fold(baseName(n.path)).includes(fold(typed))).slice(0, 80).map((n) => ({
      label: baseName(n.path),
      detail: folderOf(n.path),
      action: () => {
        openNote(n);
        requestAnimationFrame(() => openDrawing());
      },
    })),
  });
}

async function gvEditDrawing(ref, e) {
  openNote(ref.note, { newTab: !!(e?.ctrlKey || e?.metaKey) });
  const ok = await openDrawingFile(ref.id);
  if (!ok) showToastMessage('Este dibujo es una imagen que no se puede editar (era demasiado grande); se abrió su nota.');
}

function renderDibujos() {
  const box = $('#view-dibujos');
  if (!box) return;
  const refs = gvDrawingRefs();
  const q = fold(gvDraw.q.trim());
  // Solo cuentan las imágenes que son dibujos (las fotos de las notas no).
  const known = refs.filter((r) => gvDraw.recs.get(r.id)?.drawing || xdDrawingIds.has(r.id));
  const list = known
    .filter((r) => !q || fold(baseName(r.note.path)).includes(q))
    .sort((a, b) => (gvDraw.recs.get(b.id)?.createdAt || 0) - (gvDraw.recs.get(a.id)?.createdAt || 0));
  const search = el('input', { type: 'search', className: 'gv-search', placeholder: 'Buscar por nota…', value: gvDraw.q, ariaLabel: 'Buscar dibujos por nota' });
  let t = 0;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      gvDraw.q = search.value;
      renderDibujos();
      const s = $('#view-dibujos .gv-search');
      s?.focus();
      s?.setSelectionRange(s.value.length, s.value.length);
    }, 200);
  });
  const bar = el('div', { className: 'gv-bar' }, [
    gvBtn('＋ Nuevo dibujo', () => gvNewDrawingNote(), 'primary', 'Crear una nota en «Dibujos» y abrir la pizarra'),
    gvBtn('＋ En una nota…', () => gvDrawInNote(), 'gv-chip', 'Añadir un dibujo a una nota que ya existe'),
    search,
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'muted gv-count' }, plural(known.length, 'dibujo', 'dibujos')),
  ]);
  const grid = el('div', { className: 'gvd-grid gv-fill' }, list.map((r) => {
    const rec = gvDraw.recs.get(r.id);
    const img = el('img', { className: 'gvd-thumb', alt: `Dibujo de ${baseName(r.note.path)}`, loading: 'lazy' });
    if (rec?.data) img.src = rec.data;
    const card = el('button', { className: 'card gvd-card', title: 'Editar el dibujo (clic derecho: más opciones)' }, [
      el('div', { className: 'gvd-frame' }, img),
      el('span', { className: 'gvd-name' }, baseName(r.note.path)),
      el('span', { className: 'muted gvd-date' }, rec?.createdAt ? new Date(rec.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''),
    ]);
    card.addEventListener('click', (e) => gvEditDrawing(r, e));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu({ x: e.clientX, y: e.clientY }, [
        { label: '✏️ Editar el dibujo', action: () => gvEditDrawing(r) },
        { label: '📝 Abrir la nota', action: () => openNote(r.note) },
        { label: 'Abrir la nota en otra pestaña', action: () => openNote(r.note, { newTab: true }) },
      ]);
    });
    return card;
  }));
  const empty = el('div', { className: 'card gvs-done' }, [
    el('p', { className: 'gvs-big' }, gvDraw.loading ? 'Buscando dibujos…' : q ? 'Ningún dibujo en notas con ese nombre.' : 'Aún no hay dibujos.'),
    gvDraw.loading || q ? '' : el('p', { className: 'muted' }, 'Crea uno con «＋ Nuevo dibujo»: rectángulos, flechas, texto y trazo a mano, como en Excalidraw. Se guarda en su nota como imagen y se vuelve a abrir para editarlo.'),
  ]);
  box.replaceChildren(gvHead('dibujos', 'Todos los dibujos de tus notas. Toca uno para editarlo; clic derecho para abrir su nota. Cada dibujo vive en una nota (los nuevos, en la carpeta «Dibujos»).'), bar, list.length ? grid : empty);
  gvLoadDrawings(refs).then((changed) => changed && activeTab()?.view === 'dibujos' && renderDibujos());
}

Object.assign(VIEW_RENDER, { dibujos: renderDibujos });
