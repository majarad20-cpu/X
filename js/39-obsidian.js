'use strict';

// ---------- Obsidian ----------
// Lo que completa la sintaxis de Obsidian en el lector (fórmulas y diagramas, que se dibujan con
// bibliotecas que solo se cargan si una nota las usa), importar y exportar una bóveda, una nota
// de guía con toda la sintaxis y «Ordenar formato», que limpia el texto de la nota.
const OBS_LIBS = {
  mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js',
  mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
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
    window.MathJax = { startup: { typeset: false }, svg: { fontCache: 'local' }, options: { enableMenu: false, enableAssistiveMml: false } };
  })
    .then(() => window.MathJax.startup.promise)
    .then(() => {
      // Estilos que necesita la salida SVG (se añaden una vez).
      if (!document.getElementById('MJX-SVG-styles')) document.head.append(window.MathJax.svgStylesheet());
    });
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
      if (!mathCache.has(key)) mathCache.set(key, (await window.MathJax.tex2svgPromise(n.dataset.tex, { display })).outerHTML);
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
    const src = decodeURIComponent(n.dataset.src);
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
  const notes = entries.filter((e) => /\.md$/i.test(e.path));
  const images = entries.filter((e) => VAULT_IMG.test(e.path));
  if (!notes.length && !images.length) return vaultMessage('No hay notas (.md) ni imágenes para importar.', true);
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

  let added = 0;
  let renamed = 0;
  for (const e of notes) {
    let body = (await e.text()).replace(/\r\n?/g, '\n');
    // ![[foto.png|300]] y ![texto](carpeta/foto.png) -> imagen guardada en la app.
    body = body
      .replace(/!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]/g, (m, ref, size) => {
        const id = VAULT_IMG.test(ref) && imageId(ref);
        return id ? `![${ref.split('/').pop().replace(/\.[^.]+$/, '')}${size ? `|${size}` : ''}](img:${id})` : m;
      })
      .replace(/!\[([^\]\n]*)\]\(<?([^)\s>]+)>?\)/g, (m, alt, ref) => {
        const id = !/^(https?:|img:|audio:|data:)/i.test(ref) && VAULT_IMG.test(ref) && imageId(ref);
        return id ? `![${alt}](img:${id})` : m;
      });
    const path = e.path.replace(/\.md$/i, '').split('/').map((p) => cleanName(p) || 'Sin título').join('/');
    const existing = state.notes.find((n) => n.path.toLowerCase() === path.toLowerCase());
    if (existing && existing.body === body) continue;
    const folder = folderOf(path);
    const note = { id: uid(), path: existing ? uniquePath(folder, `${baseName(path)} (Obsidian)`) : path, body, createdAt: e.modified || Date.now(), updatedAt: e.modified || Date.now() };
    if (existing) renamed++;
    state.notes.push(note);
    if (folder && !state.folders.includes(folder)) state.folders.push(folder);
    added++;
  }
  if (added) logEvent('note', `Importadas ${plural(added, 'nota', 'notas')} de Obsidian`);
  save();
  renderAll();
  if (images.length) scheduleFilesSync();
  const parts = [`${plural(added, 'nota importada', 'notas importadas')}`];
  if (images.length - failedImages) parts.push(plural(images.length - failedImages, 'imagen', 'imágenes'));
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
  for (const id of used) {
    const f = files.get(id);
    const ext = EXT[(f.type || '').split(';')[0]] || 'bin';
    zip.file(`adjuntos/${id}.${ext}`, f.data.split(',')[1], { base64: true });
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const ok = await offerDownload(`enfoque-boveda-${dateKey()}.zip`, blob, 'application/zip');
  if (ok) vaultMessage(`Bóveda exportada: ${plural(state.notes.length - locked, 'nota', 'notas')}${used.size ? ` y ${plural(used.size, 'adjunto', 'adjuntos')}` : ''}${locked ? ` (${locked} con contraseña no se incluyen)` : ''}. Descomprímela y ábrela en Obsidian como bóveda.`);
}

// ---------- Ordenar formato ----------
// Reglas de redacción de Obsidian (las del complemento «Linter» más comunes), solo fuera de
// bloques de código y propiedades.
function lintMarkdown(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let fenced = false;
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
    line = line
      .replace(/[ \t]+$/, '') // espacios al final
      .replace(/^(#{1,6})(?=[^\s#])/, '$1 ') // «#Título» -> «# Título»
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
Enfoque entiende la misma forma de escribir que Obsidian. Pulsa **Ctrl+Mayús+E** para ver el texto y el resultado a la vez, y **Ctrl+E** para cambiar entre edición y lectura.

## Texto

**negrita** · *cursiva* · ~~tachado~~ · ==resaltado== · \`código\` · <u>subrayado</u> · H<sub>2</sub>O · x<sup>2</sup> · <kbd>Ctrl</kbd>

\`\`\`
**negrita**  *cursiva*  ~~tachado~~  ==resaltado==  \`código\`
<u>subrayado</u>  <sub>sub</sub>  <sup>sup</sup>  <kbd>Ctrl</kbd>
\\*esto no es cursiva\\*   (la barra invertida desactiva un símbolo)
\`\`\`

## Títulos

\`\`\`
# Título 1
## Título 2
### Título 3
\`\`\`

## Enlaces e incrustaciones

- [[Guía de sintaxis#Listas y tareas|Enlace a una sección]] → \`[[Nota#Sección|texto]]\`
- Enlace a un bloque: \`[[Nota#^id-del-bloque]]\` (el bloque termina con \`^id-del-bloque\`)
- Incrustar una nota, una sección o un bloque: \`![[Nota]]\`, \`![[Nota#Sección]]\`, \`![[Nota#^id]]\`
- Enlace de Markdown a otra nota: \`[texto](Carpeta/Nota.md)\`
- Enlace web: [Obsidian](https://obsidian.md) → \`[texto](https://…)\`
- Imagen con tamaño: \`![descripción|300](…)\`

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

Un bloque de código con el lenguaje \`tareas\`, \`notas\` o \`tabla\` muestra una lista viva de tus tareas o notas (por ejemplo, las pendientes con una etiqueta).

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
