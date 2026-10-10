'use strict';

// ---------- Obsidian ----------
// Lo que completa la sintaxis de Obsidian en el lector (fórmulas y diagramas, que se dibujan con
// bibliotecas que solo se cargan si una nota las usa), importar y exportar una bóveda, una nota
// de guía con toda la sintaxis y «Ordenar formato», que limpia el texto de la nota.
const OBS_LIBS = {
  mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js',
  mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  lzstring: 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js',
};
const obsLoads = {};

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.append(s);
  });
}

// Una carga fallida (sin red) se puede reintentar más tarde.
function loadLib(name, setup) {
  if (!obsLoads[name]) {
    setup?.();
    obsLoads[name] = loadScript(OBS_LIBS[name]).catch((e) => {
      delete obsLoads[name];
      throw e;
    });
  }
  return obsLoads[name];
}

// ---------- Fórmulas (MathJax, salida SVG: no necesita hojas de estilo ni fuentes) ----------
const mathCache = new Map();
function loadMathJax() {
  return loadLib('mathjax', () => {
    // ui/safe filtra \href y \style; sin el paquete html no hay \class, \cssId ni \style.
    window.MathJax = {
      loader: { load: ['ui/safe'] },
      startup: { typeset: false },
      tex: { packages: { '[-]': ['html'] } },
      svg: { fontCache: 'local' },
      options: { enableMenu: false, enableAssistiveMml: false },
    };
  })
    .then(() => window.MathJax.startup.promise)
    .then(() => {
      // Estilos que necesita la salida SVG (se añaden una vez).
      if (!document.getElementById('MJX-SVG-styles')) document.head.append(window.MathJax.svgStylesheet());
    });
}

// Por si acaso: fuera enlaces que no sean http(s) o #, y estilos que tapen la página.
function safeMathSvg(node) {
  for (const x of [node, ...node.querySelectorAll('*')]) {
    for (const a of [...x.attributes]) {
      if (a.localName === 'href' && !/^(https?:|#)/i.test(a.value.trim())) x.removeAttributeNode(a);
      else if (a.name === 'style' && /position\s*:\s*fixed/i.test(a.value)) x.removeAttribute('style');
    }
  }
  return node;
}

async function hydrateMath(nodes) {
  if (!nodes.length) return;
  try {
    await loadMathJax();
  } catch {
    nodes.forEach((n) => n.classList.add('failed'));
    return;
  }
  for (const n of nodes) {
    const display = n.classList.contains('display');
    const key = `${display ? 'D' : 'I'}${n.dataset.tex}`;
    try {
      if (!mathCache.has(key)) mathCache.set(key, safeMathSvg(await window.MathJax.tex2svgPromise(n.dataset.tex, { display })).outerHTML);
      n.innerHTML = mathCache.get(key);
      n.classList.add('rendered');
      n.title = n.dataset.tex;
    } catch {
      n.classList.add('failed');
    }
  }
}

// ---------- Diagramas (Mermaid) ----------
const mermaidCache = new Map();
let mermaidSeq = 0;
const looksDark = () => {
  const [r, g, b] = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255]).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
};

async function hydrateMermaid(nodes) {
  if (!nodes.length) return;
  try {
    await loadLib('mermaid');
  } catch {
    nodes.forEach((n) => n.classList.add('failed'));
    return;
  }
  const theme = looksDark() ? 'dark' : 'default';
  window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
  for (const n of nodes) {
    const src = decodeURIComponent(n.dataset.code);
    const key = `${theme}\n${src}`;
    try {
      if (!mermaidCache.has(key)) mermaidCache.set(key, (await window.mermaid.render(`mmd-${++mermaidSeq}`, src)).svg);
      n.innerHTML = mermaidCache.get(key);
      n.classList.add('rendered');
    } catch {
      n.classList.add('failed');
      n.title = 'El diagrama tiene un error de sintaxis';
    }
  }
}

const RICH_SEL = '.math:not([data-done]), .mermaid-box:not([data-done])';
let richPending = new Set();
let richTimer = null;
function hydrateRich(root = document) {
  root.querySelectorAll?.(RICH_SEL).forEach((n) => richPending.add(n));
  if (root.matches?.(RICH_SEL)) richPending.add(root);
  if (!richPending.size || richTimer) return;
  richTimer = setTimeout(() => {
    richTimer = null;
    const list = [...richPending].filter((n) => n.isConnected);
    richPending = new Set();
    list.forEach((n) => (n.dataset.done = '1'));
    hydrateMath(list.filter((n) => n.classList.contains('math')));
    hydrateMermaid(list.filter((n) => n.classList.contains('mermaid-box')));
  }, 30);
}

new MutationObserver((records) => {
  for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && hydrateRich(n));
}).observe(document.body, { childList: true, subtree: true });

// Notas al pie: del número al texto y vuelta.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-go]');
  if (!a) return;
  e.preventDefault();
  const target = document.getElementById(a.dataset.go);
  if (!target) return;
  reveal(target, { block: 'center', smooth: true });
  target.classList.remove('flash');
  void target.offsetWidth;
  target.classList.add('flash');
});

// ---------- Guardar archivos ----------
async function offerDownload(filename, data, type) {
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        return true;
      } catch (e) {
        if (e?.code !== 'declined') showToastMessage('No se pudo guardar el archivo aquí.');
        return false;
      }
    }
  }
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

const vaultMessage = (text, isError = false) => {
  const node = $('#vault-message');
  if (!node) return showToastMessage(text);
  node.textContent = text;
  node.classList.toggle('error', isError);
};

// ---------- Importar una bóveda ----------
const VAULT_IMG = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const VAULT_SKIP = /(^|\/)(\.[^/]*|node_modules)(\/|$)/; // .obsidian, .trash, .git…
const VAULT_DRAW = /\.excalidraw(\.md)?$/i; // dibujos del complemento Excalidraw

// Convierte la lista de archivos (de una carpeta, un .zip o sueltos) en notas e imágenes.
// entries: [{ path: 'Carpeta/Nota.md', text?: () => Promise<string>, blob?: () => Promise<Blob> }]
async function importVaultEntries(entries) {
  entries = entries.filter((e) => !VAULT_SKIP.test(e.path));
  // Si todo cuelga de una sola carpeta (el nombre de la bóveda), esa carpeta se quita.
  const firsts = new Set(entries.map((e) => (e.path.includes('/') ? e.path.split('/')[0] : '')));
  if (firsts.size === 1 && !firsts.has('')) {
    const cut = [...firsts][0].length + 1;
    entries.forEach((e) => (e.path = e.path.slice(cut)));
  }
  const drawings = entries.filter((e) => VAULT_DRAW.test(e.path));
  const notes = entries.filter((e) => /\.md$/i.test(e.path) && !VAULT_DRAW.test(e.path));
  const images = entries.filter((e) => VAULT_IMG.test(e.path));
  const canvasFiles = entries.filter((e) => /\.canvas$/i.test(e.path)); // lienzos (JSON Canvas)
  if (!notes.length && !images.length && !drawings.length && !canvasFiles.length) return vaultMessage('No hay notas (.md), imágenes, dibujos ni lienzos para importar.', true);
  vaultMessage(`Importando ${plural(notes.length, 'nota', 'notas')}${images.length ? ` y ${plural(images.length, 'imagen', 'imágenes')}` : ''}…`);

  // Imágenes: se guardan como las pegadas en una nota y se recuerdan por nombre y por ruta.
  const imgIds = new Map();
  let failedImages = 0;
  for (const e of images) {
    try {
      const blob = await e.blob();
      const file = new File([blob], e.path.split('/').pop(), { type: blob.type || `image/${e.path.split('.').pop().toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml')}` });
      const { data, type, width, height } = await compressImage(file);
      const rec = { id: uid(), name: imageName(file), type, data, width, height, createdAt: Date.now() };
      await putFile(rec);
      imgIds.set(e.path.toLowerCase(), rec.id);
      imgIds.set(e.path.split('/').pop().toLowerCase(), rec.id);
    } catch {
      failedImages++;
    }
  }
  const imageId = (ref) => {
    let r = ref.trim();
    try {
      r = decodeURIComponent(r);
    } catch {
      // Tal cual.
    }
    r = r.replace(/^\.?\//, '').toLowerCase();
    return imgIds.get(r) || imgIds.get(r.split('/').pop());
  };

  // Dibujos de Excalidraw: se convierten en dibujos de la app (imagen + escena editable) y cada uno
  // queda en una nota con su nombre; ![[Dibujo.excalidraw]] en otras notas pasa a mostrarlo.
  const drawingNotes = [];
  let failedDrawings = 0;
  for (const e of drawings) {
    try {
      const text = await e.text();
      const json = await xdParseScene(text);
      const embedded = new Map([...text.matchAll(/^([0-9a-f]{6,}):\s*\[\[([^\]|]+)/gim)].map((m) => [m[1], m[2]]));
      const els = await xdSceneToElements(json, (fid) => embedded.has(fid) && imageId(embedded.get(fid)));
      await xdLoadFont();
      const bg = json.appState?.viewBackgroundColor || '#ffffff';
      const blob = await xdWithScene(els, () => {
        xdRefitTexts();
        return xdRenderBlob(els, bg);
      });
      if (!blob) continue;
      const { data, type, width, height } = await compressImage(new File([blob], 'dibujo.png', { type: 'image/png' }));
      const scene = { type: 'excalidraw', version: 2, elements: els, appState: { viewBackgroundColor: bg, gridSize: null } };
      const name = e.path.split('/').pop().replace(VAULT_DRAW, '');
      const rec = { id: uid(), name, type, data, width, height, createdAt: Date.now(), drawing: JSON.stringify(scene).length < 600 * 1024 ? scene : null };
      await putFile(rec);
      xdDrawingIds.add(rec.id);
      const lower = e.path.toLowerCase();
      for (const k of [lower, lower.replace(/\.md$/, ''), lower.split('/').pop(), lower.split('/').pop().replace(/\.md$/, '')]) imgIds.set(k, rec.id);
      drawingNotes.push({ path: e.path.replace(VAULT_DRAW, ''), body: `![${name}](img:${rec.id})\n`, modified: e.modified });
    } catch {
      failedDrawings++;
    }
  }

  let added = 0;
  let renamed = 0;
  const pathIds = new Map(); // ruta en la bóveda (sin .md) -> nota, para los lienzos
  for (const e of [...notes, ...drawingNotes.map((d) => ({ ...d, text: async () => d.body, drawing: true }))]) {
    let body = (await e.text()).replace(/\r\n?/g, '\n');
    // ![[foto.png|300]] y ![texto](carpeta/foto.png) -> imagen guardada en la app.
    body = body
      .replace(/!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]/g, (m, ref, size) => {
        const id = (VAULT_IMG.test(ref) || VAULT_DRAW.test(ref)) && imageId(ref);
        return id ? `![${ref.split('/').pop().replace(VAULT_DRAW, '').replace(/\.[^.]+$/, '')}${size ? `|${size}` : ''}](img:${id})` : m;
      })
      .replace(/!\[([^\]\n]*)\]\(<?([^)\s>]+)>?\)/g, (m, alt, ref) => {
        const id = !/^(https?:|img:|audio:|data:)/i.test(ref) && VAULT_IMG.test(ref) && imageId(ref);
        return id ? `![${alt}](img:${id})` : m;
      });
    const path = (e.drawing ? e.path : e.path.replace(/\.md$/i, '')).split('/').map((p) => cleanName(p) || 'Sin título').join('/');
    const existing = state.notes.find((n) => n.path.toLowerCase() === path.toLowerCase());
    const vaultPath = (e.drawing ? e.path : e.path.replace(/\.md$/i, '')).toLowerCase();
    if (existing && existing.body === body) {
      pathIds.set(vaultPath, existing.id);
      continue;
    }
    const folder = folderOf(path);
    const note = { id: uid(), path: existing ? uniquePath(folder, `${baseName(path)} (Obsidian)`) : path, body, createdAt: e.modified || Date.now(), updatedAt: e.modified || Date.now() };
    if (existing) renamed++;
    pathIds.set(vaultPath, note.id);
    state.notes.push(note);
    if (folder && !state.folders.includes(folder)) state.folders.push(folder);
    added++;
  }
  // Lienzos: las tarjetas de archivo pasan a ser la nota o la imagen importada con esa ruta.
  let canvasCount = 0;
  let failedCanvases = 0;
  for (const e of canvasFiles) {
    try {
      const resolve = (file) => {
        const f = file.replace(/^\.?\//, '');
        if (VAULT_IMG.test(f)) {
          const id = imageId(f);
          return id ? { imgId: id } : null;
        }
        const id = pathIds.get(f.replace(/\.md$/i, '').toLowerCase());
        return id ? { noteId: id } : cvResolveFile(f);
      };
      canvasFromJson(await e.text(), e.path.split('/').pop().replace(/\.canvas$/i, ''), resolve);
      canvasCount++;
    } catch {
      failedCanvases++;
    }
  }
  if (added) logEvent('note', `Importadas ${plural(added, 'nota', 'notas')} de Obsidian`);
  save();
  renderAll();
  if (images.length || drawings.length) scheduleFilesSync();
  const parts = [`${plural(added, 'nota importada', 'notas importadas')}`];
  if (images.length - failedImages) parts.push(plural(images.length - failedImages, 'imagen', 'imágenes'));
  if (drawings.length - failedDrawings) parts.push(plural(drawings.length - failedDrawings, 'dibujo de Excalidraw', 'dibujos de Excalidraw'));
  if (canvasCount) parts.push(plural(canvasCount, 'lienzo', 'lienzos'));
  if (failedCanvases) parts.push(`${failedCanvases} ${failedCanvases === 1 ? 'lienzo no se pudo' : 'lienzos no se pudieron'} leer`);
  if (failedDrawings) parts.push(`${failedDrawings} ${failedDrawings === 1 ? 'dibujo no se pudo' : 'dibujos no se pudieron'} abrir`);
  if (renamed) parts.push(`${renamed} con otro nombre porque ya existían`);
  if (failedImages) parts.push(`${failedImages} ${failedImages === 1 ? 'imagen no se pudo' : 'imágenes no se pudieron'} leer`);
  vaultMessage(`Listo: ${parts.join(' · ')}.`);
  showToastMessage(`Obsidian: ${parts[0]}`);
}

async function importVaultFiles(fileList) {
  const list = [...fileList];
  const entries = [];
  for (const f of list) {
    if (/\.zip$/i.test(f.name)) {
      try {
        await loadLib('jszip');
        const zip = await window.JSZip.loadAsync(f);
        zip.forEach((path, z) => {
          if (!z.dir) entries.push({ path, modified: z.date?.getTime(), text: () => z.async('string'), blob: () => z.async('blob') });
        });
      } catch {
        return vaultMessage('No se pudo abrir el .zip (hace falta conexión la primera vez). Prueba con «Importar carpeta».', true);
      }
    } else {
      entries.push({ path: f.webkitRelativePath || f.name, modified: f.lastModified, text: () => f.text(), blob: async () => f });
    }
  }
  await importVaultEntries(entries);
}

// ---------- Exportar como bóveda ----------
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
async function exportVault() {
  try {
    await loadLib('jszip');
  } catch {
    return vaultMessage('No se pudo preparar el .zip: hace falta conexión a internet.', true);
  }
  const zip = new window.JSZip();
  const files = new Map((await allFiles()).map((f) => [f.id, f]));
  const used = new Set();
  let locked = 0;
  for (const note of state.notes) {
    if (note.enc) {
      locked++;
      continue;
    }
    const body = note.body
      .replace(/!\[([^\]\n]*)\]\((img|audio):([a-z0-9]+)\)/gi, (m, alt, kind, id) => {
        const f = files.get(id);
        if (!f) return m;
        used.add(id);
        const name = `adjuntos/${id}.${EXT[(f.type || '').split(';')[0]] || (kind === 'img' ? 'png' : 'webm')}`;
        return kind === 'img' ? `![${alt}](${name})` : `![[${name}]]`;
      });
    zip.file(`${note.path}.md`, body, { date: new Date(note.updatedAt || Date.now()) });
  }
  for (const folder of state.folders) zip.folder(folder);
  // Lienzos como .canvas (JSON Canvas), con sus imágenes en adjuntos/.
  const canvasNames = new Set();
  for (const c of state.canvases) {
    const base = cleanName(c.title) || 'Lienzo';
    let name = base;
    for (let i = 2; canvasNames.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    canvasNames.add(name.toLowerCase());
    const json = canvasToJson(c, (id) => {
      const f = files.get(id);
      if (!f) return null;
      used.add(id);
      return cvAttachPath(id, f);
    });
    zip.file(`Lienzos/${name}.canvas`, JSON.stringify(json, null, '\t'), { date: new Date(c.updatedAt || Date.now()) });
  }
  for (const id of used) {
    const f = files.get(id);
    const ext = EXT[(f.type || '').split(';')[0]] || 'bin';
    zip.file(`adjuntos/${id}.${ext}`, f.data.split(',')[1], { base64: true });
    // Los dibujos van también como .excalidraw, para abrirlos con Excalidraw en Obsidian.
    if (f.drawing?.elements) {
      const scene = { ...f.drawing, source: 'Enfoque', files: {} };
      for (const im of f.drawing.elements.filter((x) => x.type === 'image' && files.get(x.fileId))) {
        const r = files.get(im.fileId);
        scene.files[im.fileId] = { mimeType: r.type, id: im.fileId, dataURL: r.data, created: r.createdAt || Date.now() };
      }
      zip.file(`Dibujos/${f.name && f.name !== 'Dibujo' ? f.name : id}.excalidraw`, JSON.stringify(scene, null, 2));
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const ok = await offerDownload(`enfoque-boveda-${dateKey()}.zip`, blob, 'application/zip');
  if (ok) vaultMessage(`Bóveda exportada: ${plural(state.notes.length - locked, 'nota', 'notas')}${state.canvases.length ? `, ${plural(state.canvases.length, 'lienzo', 'lienzos')}` : ''}${used.size ? ` y ${plural(used.size, 'adjunto', 'adjuntos')}` : ''}${locked ? ` (${locked} con contraseña no se incluyen)` : ''}. Descomprímela y ábrela en Obsidian como bóveda.`);
}

// ---------- Ordenar formato ----------
// Reglas de redacción de Obsidian (las del complemento «Linter» más comunes), solo fuera de
// bloques de código y propiedades.
function lintMarkdown(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let fenced = false;
  let math = false;
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      out.push(...lines.slice(0, end + 1).map((l) => l.replace(/\s+$/, '')));
      i = end + 1;
      out.push('');
    }
  }
  const blank = () => out.length && out[out.length - 1] !== '';
  for (; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*```/.test(line)) {
      if (!fenced && blank() && !/^\s/.test(line)) out.push('');
      fenced = !fenced;
      out.push(line.replace(/\s+$/, ''));
      if (!fenced && lines[i + 1]?.trim()) out.push('');
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }
    // Las fórmulas $$ … $$ de varias líneas se dejan como están, igual que el código.
    const dollars = (line.match(/\$\$/g) || []).length % 2;
    if (math || (dollars && /^\s*\$\$/.test(line))) {
      if (dollars) math = !math;
      out.push(line);
      continue;
    }
    // Una línea solo de etiquetas (#proyecto #urgente) no es un título.
    const tagsOnly = /^#[\p{L}\p{N}_/-]+(?:\s+#[\p{L}\p{N}_/-]+)*\s*$/u.test(line);
    line = line.replace(/[ \t]+$/, ''); // espacios al final
    if (!tagsOnly) line = line.replace(/^(#{1,6})(?=[^\s#])/, '$1 '); // «#Título» -> «# Título»
    line = line
      .replace(/^(\s*)[*+](\s+)/, '$1-$2') // viñetas siempre con «-»
      .replace(/^(\s*-\s+)\[\]/, '$1[ ]') // «[]» -> «[ ]»
      .replace(/^(\s*-\s+)\[X\]/, '$1[x]')
      .replace(/^(#{1,6}\s.*?)\s+#+$/, '$1'); // «## Título ##» -> «## Título»
    if (!line.trim()) {
      if (blank()) out.push('');
      continue;
    }
    // Una línea en blanco antes y después de cada título.
    if (/^#{1,6}\s/.test(line)) {
      if (blank()) out.push('');
      out.push(line);
      if (lines[i + 1]?.trim()) out.push('');
      continue;
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  while (out.length && out[0] === '') out.shift();
  return out.length ? `${out.join('\n')}\n` : '';
}

async function lintActiveNote() {
  const note = activeNote();
  if (!note) return showToastMessage('Abre una nota para ordenar su formato.');
  if (note.enc) return showToastMessage('Las notas con contraseña no se pueden ordenar.');
  flushNoteSave();
  const ta = $('#note-editor');
  const current = isEditing(note.id) && ta.dataset.note === note.id ? ta.value : note.body;
  const next = lintMarkdown(current);
  if (next === current || next === `${current}\n`) return showToastMessage('El formato ya está en orden');
  await snapshotNote(note, { force: true });
  note.body = next;
  note.updatedAt = Date.now();
  save();
  if (isEditing(note.id)) {
    const pos = Math.min(ta.selectionStart, next.length);
    ta.value = next;
    ta.setSelectionRange(pos, pos);
    autosize(ta);
  }
  renderAll();
  showToastMessage('Formato ordenado (puedes volver atrás en el historial de versiones)');
}

// ---------- Guía de sintaxis ----------
const SYNTAX_GUIDE_NAME = 'Guía de sintaxis';
const SYNTAX_GUIDE = `---
tags: [guía, markdown]
aliases: [Sintaxis, Markdown]
---
Enfoque entiende la misma forma de escribir que Obsidian.

## Cómo editar

- **Doble clic** sobre un párrafo, una estrofa, una lista o un título: solo ese trozo se vuelve texto editable y el resto sigue viéndose normal. **Esc**, **Ctrl+Enter** o un clic fuera lo cierran (se guarda solo).
- Doble clic debajo del final de la nota: escribes un bloque nuevo al final.
- **Ctrl+E** edita la nota entera de una vez.

Al escribir:

| Atajo | Hace |
| --- | --- |
| \`[[\` | Abre la lista de notas para enlazar (se cierra sola con \`]]\`). Si la nota no existe, se crea al abrir el enlace |
| Ctrl+B · Ctrl+I · Ctrl+U | **Negrita** · *cursiva* · <u>subrayado</u> |
| Ctrl+Mayús+X · Ctrl+Mayús+H | ~~Tachado~~ · ==resaltado== |
| Ctrl+Mayús+C · Ctrl+Mayús+M | \`código\` · fórmula $x$ |
| Ctrl+K · Ctrl+L | Enlace web · casilla de tarea (otra vez: marcada) |
| Seleccionar y escribir \`*\` \`=\` \`~\` \`[\` | Envuelve la selección (dos veces: \`**…**\`, \`[[…]]\`) |
| \`/\` al empezar una línea | Menú de bloques: títulos, recuadros, estilos, tablas, imágenes, vídeos, archivos… |

Al seleccionar texto aparece también una barra con estos formatos; **Aa** añade subíndice, superíndice, tecla, tamaño y colores, y **¶** (o el clic derecho en el editor) cambia el párrafo a título, cita, recuadro, lista o sección desplegable, o lo alinea.

## Texto

**negrita** · *cursiva* · ~~tachado~~ · ==resaltado== · \`código\` · <u>subrayado</u> · H<sub>2</sub>O · x<sup>2</sup> · <kbd>Ctrl</kbd>

<small>texto pequeño</small> · <span style="font-size: 130%">texto grande</span> · <span style="color: #1c7ed6">texto en color</span> · <mark style="background: #69db7c66">resaltado verde</mark>

\`\`\`
**negrita**  *cursiva*  ~~tachado~~  ==resaltado==  \`código\`
<u>subrayado</u>  <sub>sub</sub>  <sup>sup</sup>  <kbd>Ctrl</kbd>  <small>pequeño</small>
<span style="font-size: 130%">grande</span>  <span style="color: #e5484d">rojo</span>
<mark style="background: #ffd43b66">resaltado de color</mark>
\\*esto no es cursiva\\*   (la barra invertida desactiva un símbolo)
\`\`\`

<p align="center">Párrafo centrado</p>

\`\`\`
<p align="center">centrado</p>   <p align="right">a la derecha</p>   <p align="justify">justificado</p>
\`\`\`

## Títulos

\`\`\`
# Título 1
## Título 2
### Título 3
#### Título 4 (hasta ###### Título 6)
\`\`\`

En la lectura, cada título se puede plegar y desplegar (con lo que hay debajo).

## Enlaces e incrustaciones

- [[Guía de sintaxis#Listas y tareas|Enlace a una sección]] → \`[[Nota#Sección|texto]]\`
- Enlace a un bloque: \`[[Nota#^id-del-bloque]]\` (el bloque termina con \`^id-del-bloque\`)
- Incrustar una nota, una sección o un bloque: \`![[Nota]]\`, \`![[Nota#Sección]]\`, \`![[Nota#^id]]\`
- Enlace de Markdown a otra nota: \`[texto](Carpeta/Nota.md)\`
- Enlace web: [Obsidian](https://obsidian.md) → \`[texto](https://…)\`
- Imagen con tamaño: \`![descripción|300](…)\`
- Vídeo de YouTube o Vimeo (se reproduce en la nota): \`![título](https://www.youtube.com/watch?v=…)\`; con ancho: \`![título|400](…)\`
- Un \`.mp4\` o \`.mp3\` de la web se reproduce: \`![](https://…/clip.mp4)\`. Un PDF u otra web se ve como una tarjeta con «Abrir ↗»
- Audio, vídeo o PDF de tu dispositivo (\`/archivo\`, o pegarlo o arrastrarlo): \`![nombre.pdf](file:ID)\`. Hasta 15 MB; los de más de 250 KB se quedan solo en este dispositivo (no se sincronizan). Los PDF se ven como tarjeta con «Abrir PDF» y «Descargar»

Este párrafo se puede citar desde otra nota con [[Guía de sintaxis#^ejemplo-bloque]]. ^ejemplo-bloque

## Listas y tareas

- Viñeta
    - Viñeta anidada (sangría con Tab)
1. Numerada
2. Numerada

- [ ] Pendiente
- [/] En curso
- [x] Hecha
- [-] Cancelada
- [>] Pospuesta
- [!] Importante
- [?] Pregunta
- [*] Destacada

## Citas y avisos

> Una cita normal.

> [!tip] Consejo
> Avisos: note, info, tip, success, question, warning, failure, danger, bug, example, quote, abstract, todo.

> [!warning]- Aviso plegado (pulsa para abrirlo)
> Con \`-\` empieza cerrado; con \`+\`, abierto.

## Secciones desplegables

<details>
<summary>Pulsa para ver más</summary>

Contenido escondido: **Markdown** normal, listas, imágenes…
</details>

\`\`\`
<details>
<summary>Título</summary>

Contenido
</details>
\`\`\`

Cada etiqueta va en su propia línea.

## Tablas

| Sintaxis | Resultado |
| --- | --- |
| \`**negrita**\` | **negrita** |
| \`[[Nota\\|alias]]\` | enlace con otro texto |

## Fórmulas

En línea: $E = mc^2$, y en bloque:

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

## Diagramas

\`\`\`mermaid
graph LR
  Idea --> Borrador --> Nota
  Nota --> Proyecto
\`\`\`

## Notas al pie y comentarios

Una afirmación con nota al pie[^1] y otra en línea^[La nota se escribe aquí mismo.].

[^1]: El texto de la nota al pie va al final.

%% Esto es un comentario: solo se ve al editar. %%

## Propiedades

Al principio de la nota, entre dos líneas \`---\`:

\`\`\`
---
tags: [proyecto, idea]
aliases: [Otro nombre]
estado: en curso
---
\`\`\`

Con \`aliases\`, \`[[Otro nombre]]\` también lleva a la nota.

## Consultas de Enfoque

Un bloque de código con el lenguaje \`tareas\`, \`notas\`, \`tabla\` o \`tablero\` muestra una lista viva de tus tareas o notas (por ejemplo, las pendientes con una etiqueta).

En \`notas\`, \`tabla\` y \`tablero\` cualquier línea \`clave: valor\` filtra por esa propiedad:

| Línea | Qué notas salen |
| --- | --- |
| \`estado: pendiente\` | Con ese valor (sin distinguir mayúsculas; en una lista, si lo contiene) |
| \`estado: !leído\` | Sin ese valor |
| \`puntuación: >7\` | Mayor que 7 (también \`>=\`, \`<\`, \`<=\`; números o fechas, \`hoy\` vale como fecha) |
| \`autor: *\` | Que tienen la propiedad |
| \`autor: -\` | Que no la tienen |

Además: \`orden: puntuación desc\` (o \`nombre\`, \`creada\`, \`modificada\`) y \`mostrar: autor, estado\` en \`notas\`; \`columnas: Nota, autor, Carpeta, Creada\` en \`tabla\` (Carpeta, Creada y Modificada son de la nota y no se editan).

Un tablero (bloque \`tablero\`) con estas líneas:

\`\`\`
carpeta: Proyectos
agrupar: estado
columnas: pendiente, en curso, hecho
mostrar: autor
\`\`\`

pone una columna por valor (más «Sin estado»); arrastrar una tarjeta cambia la propiedad y el «+» crea una nota con ese valor.

En \`tabla\`, \`totales: precio=suma, puntuación=promedio\` añade una fila de totales (\`suma\`, \`promedio\`, \`mín\`, \`máx\`, \`recuento\`, \`vacíos\`, \`rellenos\`; también se eligen en el pie de cada columna) y \`agrupar: estado\` agrupa las filas en grupos plegables.

\`\`\`
carpeta: Libros
mostrar: autor
tamaño: grande
\`\`\`

Un bloque \`galeria\` muestra tarjetas con portada: la propiedad \`portada\` (o \`cover\`, \`imagen\`: \`img:ID\`, una URL o \`[[imagen]]\`) o la primera imagen de la nota. Un bloque \`calendario\` (con \`fecha: inicio\`; por defecto \`fecha\`, \`date\`, \`vence\` o \`due\`) pone las notas en el mes: arrastra una a otro día para cambiar su fecha o toca un día vacío para crear una. Ambos admiten los filtros de \`tabla\`.

## Campos en línea

\`autor:: Frank Herbert\` en su propia línea, o \`[autor:: Frank Herbert]\` dentro del texto, cuenta como la propiedad «autor» si no está entre los \`---\`: sale en tablas, filtros, tableros y en la búsqueda \`[autor:herbert]\`.

## Etiquetas y otros

#etiqueta · #proyecto/subetiqueta · \`---\` para una línea horizontal.
`;

function openSyntaxGuide() {
  const existing = findNoteByName(SYNTAX_GUIDE_NAME);
  if (existing && existing.path === SYNTAX_GUIDE_NAME) {
    noteMode.set(existing.id, 'read');
    return openNote(existing);
  }
  createNote({ title: SYNTAX_GUIDE_NAME, body: SYNTAX_GUIDE, edit: false, log: false });
}

// ---------- Interfaz ----------
$('#vault-folder')?.addEventListener('change', async (e) => {
  await importVaultFiles(e.target.files);
  e.target.value = '';
});
$('#vault-files')?.addEventListener('change', async (e) => {
  await importVaultFiles(e.target.files);
  e.target.value = '';
});
$('#vault-export')?.addEventListener('click', exportVault);
$('#vault-guide')?.addEventListener('click', openSyntaxGuide);

NOTE_MENU_EXTRA.push((note) => (note.enc ? null : { label: '🧹 Ordenar formato', action: lintActiveNote }));
COMMANDS_EXTRA.push((note) => [
  ...(note && !note.enc ? [{ label: 'Ordenar formato de la nota', action: lintActiveNote }] : []),
  { label: 'Abrir la guía de sintaxis', action: openSyntaxGuide },
  { label: 'Importar una bóveda de Obsidian', action: () => {
    showView('settings');
    setTimeout(() => reveal($('#vault-card'), { block: 'center', smooth: true }), 50);
  } },
  { label: 'Exportar como bóveda de Obsidian (.zip)', action: exportVault },
]);
