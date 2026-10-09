'use strict';

// ---------- Imágenes en las notas ----------
// Se pegan, se arrastran o se eligen con «/imagen». Se reducen (máx. 1600 px, WebP o JPEG) para que
// cada una quepa en un bloque de la nube (256 KB), se guardan en IndexedDB (almacén «files») y en
// el texto quedan como ![descripción](img:ID). Fuera de IndexedDB solo viven en memoria.
const FILE_MAX_CHARS = 240 * 1024;
const files = { cache: new Map(), memory: new Map(), count: 0, bytes: 0 };

function fileStore(mode) {
  return idb.db.transaction('files', mode).objectStore('files');
}

const isImageData = (d) => typeof d === 'string' && /^data:image\/(webp|jpeg|png|gif);base64,/.test(d);
// También las notas de voz (35-voz.js) se guardan aquí.
const isAudioData = (d) => typeof d === 'string' && /^data:audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;[\w=.-]+)*;base64,/.test(d);
const isMediaData = (d) => isImageData(d) || isAudioData(d);

function putFile(rec) {
  if (!rec?.id || !isMediaData(rec.data)) return Promise.resolve(false);
  files.cache.set(rec.id, rec.data);
  if (!idb.ok) {
    files.memory.set(rec.id, rec);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    try {
      const tx = idb.db.transaction('files', 'readwrite');
      tx.objectStore('files').put(rec);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  }).then((ok) => {
    updateFileStats();
    return ok;
  });
}

function getFile(id) {
  if (files.memory.has(id)) return Promise.resolve(files.memory.get(id));
  if (!idb.ok) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = fileStore().get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function allFiles() {
  if (!idb.ok) return Promise.resolve([...files.memory.values()]);
  return new Promise((resolve) => {
    try {
      const req = fileStore().getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function updateFileStats() {
  allFiles().then((list) => {
    files.count = list.length;
    files.bytes = list.reduce((n, f) => n + (f.data?.length || 0), 0);
  });
}

// Reduce la imagen hasta que quepa en un bloque.
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('imagen no válida'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    const webp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    const type = webp ? 'image/webp' : 'image/jpeg';
    let max = 1600;
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // las transparencias quedan sobre blanco en JPEG
      if (!webp) ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.72, 0.6]) {
        const data = canvas.toDataURL(type, q);
        if (data.length <= FILE_MAX_CHARS) return { data, type, width: canvas.width, height: canvas.height };
      }
      max = Math.round(max * 0.75);
    }
    throw new Error('demasiado grande');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const imageName = (file) => cleanName((file.name || 'imagen').replace(/\.[a-z0-9]+$/i, '')).slice(0, 60) || 'imagen';

// Inserta las imágenes en el editor de la nota abierta, en la posición del cursor.
async function insertImages(list, at = null) {
  const ta = $('#note-editor');
  const note = activeNote();
  const images = [...list].filter((f) => f.type.startsWith('image/'));
  const ids = [];
  if (!note || !ta || !images.length) return ids;
  if (note.enc) {
    showToastMessage('Las notas con contraseña no admiten imágenes.');
    return ids;
  }
  showToastMessage(images.length > 1 ? `Añadiendo ${images.length} imágenes…` : 'Añadiendo imagen…');
  let pos = at ?? (document.activeElement === ta || !ta.dataset.caret ? ta.selectionStart : Number(ta.dataset.caret));
  for (const file of images) {
    try {
      const { data, type, width, height } = await compressImage(file);
      const rec = { id: uid(), name: imageName(file), type, data, width, height, createdAt: Date.now() };
      await putFile(rec);
      // Mientras se preparaba la imagen se cambió de nota: no se inserta en otra.
      if (activeNote() !== note) return ids;
      pos = Math.min(pos, ta.value.length);
      const before = ta.value.slice(0, pos);
      const text = `${before && !before.endsWith('\n') ? '\n' : ''}![${rec.name}](img:${rec.id})\n`;
      ta.setRangeText(text, pos, pos, 'end');
      pos += text.length;
      ids.push(rec.id);
      ta.dispatchEvent(new Event('input'));
      scheduleFilesSync();
    } catch {
      showToastMessage(`No se pudo añadir «${file.name || 'la imagen'}»: formato no compatible o imagen demasiado grande.`);
      return ids;
    }
  }
  showToastMessage(images.length > 1 ? `${images.length} imágenes añadidas` : 'Imagen añadida');
  return ids;
}

function pickImageForNote() {
  const input = $('#note-image-input');
  input.value = '';
  input.click();
}

$('#note-image-input').addEventListener('change', (e) => insertImages(e.target.files));
$('#note-editor').addEventListener('paste', (e) => {
  const list = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  e.preventDefault();
  insertImages(list);
});
$('#note-editor').addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault();
});
$('#note-editor').addEventListener('drop', (e) => {
  const list = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  e.preventDefault();
  $('#note-editor').focus();
  insertImages(list);
});

// Cualquier <img data-img> que aparezca en la página se rellena con su imagen guardada.
async function hydrateImage(img) {
  const audio = img.tagName === 'AUDIO';
  const id = audio ? img.dataset.audio : img.dataset.img;
  if (img.dataset.loaded === id) return;
  img.dataset.loaded = id;
  let data = files.cache.get(id);
  if (!data) {
    const rec = await getFile(id);
    data = rec?.data;
    if (data) files.cache.set(id, data);
  }
  if (audio ? isAudioData(data) : isImageData(data)) {
    img.src = data;
    img.classList.remove('missing');
    if (!audio) img.title = img.alt;
  } else {
    img.classList.add('missing');
    img.title = `${audio ? 'Esta grabación' : 'Esta imagen'} aún no está en este dispositivo (llegará al sincronizar).`;
    delete img.dataset.loaded;
  }
}

const MEDIA_SEL = 'img[data-img], audio[data-audio]';
function hydrateImages(root = document) {
  root.querySelectorAll(MEDIA_SEL).forEach(hydrateImage);
}

new MutationObserver((records) => {
  for (const r of records) {
    r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches?.(MEDIA_SEL)) hydrateImage(n);
      else if (n.querySelector?.(MEDIA_SEL)) hydrateImages(n);
    });
  }
}).observe(document.body, { childList: true, subtree: true });

// Visor: al tocar una imagen se ve a pantalla completa.
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('img.note-img');
  if (!img || !img.src || img.closest('#image-viewer')) return;
  $('#image-viewer-img').src = img.src;
  $('#image-viewer-img').alt = img.alt;
  $('#image-viewer-caption').textContent = img.alt;
  $('#image-viewer').hidden = false;
  $('#image-viewer-close').focus();
});
const closeViewer = () => ($('#image-viewer').hidden = true);
$('#image-viewer').addEventListener('click', (e) => {
  if (e.target.id !== 'image-viewer-img') closeViewer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#image-viewer').hidden) closeViewer();
});

// ---------- Sincronización de imágenes ----------
// Cada imagen es un bloque «file-<id>» que no cambia nunca: se sube una vez y se descarga una vez.
let filesSyncTimer = null;
function scheduleFilesSync() {
  clearTimeout(filesSyncTimer);
  filesSyncTimer = setTimeout(pushFiles, 1500);
}

async function pushFiles() {
  if (!sync.col) return;
  const sent = (state.syncMeta.files ||= {});
  const pending = (await allFiles()).filter((f) => !sent[f.id]);
  let changed = false;
  for (const f of pending) {
    try {
      await sync.col.doc(`file-${f.id}`).set({ file: f, updatedAt: Date.now() });
      sent[f.id] = 1;
      changed = true;
    } catch (e) {
      if (e?.code === 'invalid_argument') {
        sent[f.id] = 'big';
        changed = true;
      } else break;
    }
  }
  if (changed) saveLocal();
}

function receiveFile(name, body) {
  const f = body?.file;
  const sent = (state.syncMeta.files ||= {});
  if (!f?.id || !isMediaData(f.data)) return;
  const known = sent[f.id];
  sent[f.id] = 1;
  if (known && files.cache.has(f.id)) return;
  getFile(f.id).then((rec) => {
    if (rec) return;
    putFile(f).then(() => document.querySelectorAll(`img[data-img="${CSS.escape(f.id)}"], audio[data-audio="${CSS.escape(f.id)}"]`).forEach(hydrateImage));
  });
}

// ---------- Copia de seguridad ----------
async function backupFiles() {
  const used = new Set();
  state.notes.forEach((n) => n.body.replace(/\((?:img|audio):([a-z0-9]+)\)/gi, (_, id) => used.add(id)));
  return (await allFiles()).filter((f) => used.has(f.id));
}

async function restoreFiles(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const f of list) {
    if (f?.id && isMediaData(f.data)) {
      await putFile(f);
      n++;
    }
  }
  hydrateImages();
  return n;
}
