'use strict';

// ---------- Texto de una imagen (con Claude) ----------
// Claude lee la imagen (una foto de una pizarra, un documento, notas a mano…) y su texto se añade a
// la nota, justo debajo de la imagen. Desde el visor («📝 Sacar texto») o con «/texto de imagen».
const OCR_PROMPT = `Transcribe todo el texto que se ve en esta imagen, tal cual, en su idioma original. Respeta los saltos de línea, las listas y las tablas (usa Markdown para listas y tablas). Si hay texto escrito a mano, transcríbelo igual. No añadas comentarios, títulos ni explicaciones. Si no hay texto legible, responde solo «(sin texto)».`;

async function imageLimits() {
  if (!aiReady()) return null;
  const caps = await ai.sample.limits?.().catch(() => null);
  return caps?.images || null;
}

// La imagen guardada, en un formato que Claude acepte (si no, se convierte a JPEG).
async function imageBlobFor(id, mediaTypes = []) {
  const rec = await getFile(id);
  if (!rec?.data?.startsWith('data:image/')) return null;
  let blob = await (await fetch(rec.data)).blob();
  if (mediaTypes.length && !mediaTypes.includes(blob.type)) {
    const img = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  }
  return blob;
}

async function extractImageText(id) {
  const note = activeNote();
  if (!note || note.enc || !note.body.includes(`(img:${id})`)) return;
  const limits = await imageLimits();
  if (!limits) return showToastMessage('Para leer imágenes hace falta abrir la app desde Claude y permitirle ver imágenes.');
  const blob = await imageBlobFor(id, limits.mediaTypes || []);
  if (!blob) return showToastMessage('Esta imagen aún no está en este dispositivo.');
  if (limits.maxInputBytes && blob.size > limits.maxInputBytes) return showToastMessage('La imagen es demasiado grande para enviarla a Claude.');
  showToastMessage('Claude está leyendo la imagen…');
  let text;
  try {
    ({ text } = await ai.sample(OCR_PROMPT, { images: [blob] }));
  } catch (e) {
    const status = { textContent: '' };
    handleAIError(e, status);
    return showToastMessage(status.textContent);
  }
  text = cleanAIText(text);
  if (!text || /^\(sin texto\)$/i.test(text)) return showToastMessage('Claude no encontró texto en la imagen.');
  await snapshotNote(note, { force: true });
  // El texto va en un aviso plegado bajo la línea de la imagen.
  const lines = note.body.split('\n');
  const i = lines.findIndex((l) => l.includes(`(img:${id})`));
  const block = ['', '> [!note] Texto de la imagen', ...text.split('\n').map((l) => `> ${l}`), ''];
  lines.splice(i + 1, 0, ...block);
  note.body = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  note.updatedAt = Date.now();
  save();
  await snapshotNote(note, { force: true });
  if (isEditing(note.id)) {
    $('#note-editor').value = note.body;
    autosize($('#note-editor'));
  }
  renderAll();
  showToastMessage('Texto añadido debajo de la imagen');
}

// En el visor: botón para sacar el texto de una imagen de la nota abierta.
async function updateViewerOcr(img) {
  const btn = $('#image-viewer-ocr');
  btn.hidden = true;
  const id = img?.dataset.img;
  const note = activeNote();
  if (!id || !note || note.enc || !note.body.includes(`(img:${id})`) || !(await imageLimits())) return;
  btn.hidden = false;
  btn.onclick = () => {
    $('#image-viewer').hidden = true;
    extractImageText(id);
  };
}
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('img.note-img');
  if (img && !img.closest('#image-viewer')) updateViewerOcr(img);
});

// «/texto de imagen»: elegir una foto, añadirla a la nota y sacar su texto.
function pickImageForText() {
  const input = $('#note-ocr-input');
  input.value = '';
  input.click();
}
$('#note-ocr-input').addEventListener('change', async (e) => {
  const ids = await insertImages(e.target.files);
  flushNoteSave();
  for (const id of ids) await extractImageText(id);
});

SLASH_ITEMS.splice(SLASH_ITEMS.findIndex((it) => it.label === 'Imagen…') + 1, 0, {
  when: () => aiReady() && !activeNote()?.enc,
  icon: '🔤',
  label: 'Texto de una imagen…',
  detail: 'Claude transcribe una foto, documento o pizarra',
  keys: 'texto imagen foto ocr escanear documento pizarra transcribir',
  run: () => pickImageForText(),
});
