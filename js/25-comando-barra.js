'use strict';

// ---------- Comando «/» en el editor ----------
// Al escribir / al principio de una línea o tras un espacio aparece un menú de bloques, como en Notion.
// En el texto, «‸» marca dónde queda el cursor.
// «group» agrupa los bloques en el menú (los que añaden otros módulos van con su vecino).
const SLASH_ITEMS = [
  { group: 'Básicos', icon: 'H1', label: 'Título 1', keys: 'titulo encabezado h1 heading', text: '# ‸' },
  { group: 'Básicos', icon: 'H2', label: 'Título 2', keys: 'titulo encabezado h2 subtitulo', text: '## ‸' },
  { group: 'Básicos', icon: 'H3', label: 'Título 3', keys: 'titulo encabezado h3', text: '### ‸' },
  { group: 'Básicos', icon: 'H4', label: 'Título 4', keys: 'titulo encabezado h4', text: '#### ‸' },
  { group: 'Básicos', icon: 'H5', label: 'Título 5', keys: 'titulo encabezado h5', text: '##### ‸' },
  { group: 'Básicos', icon: 'H6', label: 'Título 6', keys: 'titulo encabezado h6', text: '###### ‸' },
  { group: 'Básicos', icon: '☐', label: 'Tarea', detail: 'Casilla que aparece en Tareas', keys: 'tarea casilla checkbox todo pendiente', text: '- [ ] ‸' },
  { group: 'Básicos', icon: '📅', label: 'Tarea para hoy', keys: 'tarea hoy fecha', text: () => `- [ ] ‸ 📅 ${dateKey()}` },
  { group: 'Básicos', icon: '📅', label: 'Tarea para mañana', keys: 'tarea manana fecha', text: () => `- [ ] ‸ 📅 ${dateKey(addDays(new Date(), 1))}` },
  { group: 'Básicos', icon: '◐', label: 'Tarea en curso', keys: 'tarea en curso doing progreso', text: '- [/] ‸' },
  { group: 'Básicos', icon: '•', label: 'Lista', keys: 'lista viñetas bullet', text: '- ‸' },
  { group: 'Básicos', icon: '1.', label: 'Lista numerada', keys: 'lista numerada ordenada numero', text: '1. ‸' },
  { group: 'Básicos', icon: '❝', label: 'Cita', keys: 'cita quote', text: '> ‸' },
  { group: 'Básicos', icon: '—', label: 'Línea divisoria', keys: 'linea separador divisor hr', text: '---\n‸' },
  { group: 'Recuadros y secciones', icon: 'ℹ', label: 'Aviso', detail: 'Recuadro destacado (callout)', keys: 'aviso callout nota tip importante', text: '> [!tip] ‸\n> ' },
  { group: 'Recuadros y secciones', icon: '⚠', label: 'Advertencia', keys: 'advertencia aviso warning cuidado', text: '> [!warning] ‸\n> ' },
  { group: 'Recuadros y secciones', icon: '▣', label: 'Recuadro…', detail: 'Elige el tipo: nota, consejo, peligro…', keys: 'recuadro callout aviso tipo admonition', run: () => pickCallout((type, fold) => insertBlockText(`> [!${type}]${fold} ‸\n> `)) },
  { group: 'Recuadros y secciones', icon: '▸', label: 'Recuadro desplegable', detail: 'Empieza cerrado', keys: 'recuadro desplegable plegable callout fold', text: '> [!note]- ‸\n> ' },
  { group: 'Recuadros y secciones', icon: '▾', label: 'Sección desplegable', detail: 'Título que se abre y se cierra', keys: 'seccion desplegable plegable details toggle acordeon', text: '<details>\n<summary>‸</summary>\n\n</details>' },
  { group: 'Estilos', icon: '==', label: 'Resaltado', keys: 'resaltar resaltado marcador highlight', text: '==‸==' },
  { group: 'Estilos', icon: 'U', label: 'Subrayado', keys: 'subrayado underline', text: '<u>‸</u>' },
  { group: 'Estilos', icon: 'x²', label: 'Superíndice', keys: 'superindice exponente sup', text: '<sup>‸</sup>' },
  { group: 'Estilos', icon: 'x₂', label: 'Subíndice', keys: 'subindice sub', text: '<sub>‸</sub>' },
  { group: 'Estilos', icon: '⌨', label: 'Tecla', detail: 'Como <kbd>Ctrl</kbd>', keys: 'tecla teclado kbd atajo', text: '<kbd>‸</kbd>' },
  { group: 'Estilos', icon: 'a', label: 'Texto pequeño', keys: 'texto pequeno small letra', text: '<small>‸</small>' },
  { group: 'Estilos', icon: 'A', label: 'Texto grande', keys: 'texto grande letra tamano big', text: '<span style="font-size: 130%">‸</span>' },
  { group: 'Estilos', icon: '🎨', label: 'Color de texto…', keys: 'color texto letra fuente', run: () => pickColor('text', (c) => insertBlockText(`<span style="color: ${c}">‸</span>`)) },
  { group: 'Estilos', icon: '🖍', label: 'Color de resaltado…', keys: 'color resaltado fondo marcador highlight', run: () => pickColor('mark', (c) => insertBlockText(`<mark style="background: ${c}">‸</mark>`)) },
  { group: 'Estilos', icon: '↔', label: 'Centrar', keys: 'centrar centrado alinear center', text: '<p align="center">‸</p>' },
  { group: 'Estilos', icon: '→', label: 'Alinear a la derecha', keys: 'alinear derecha right', text: '<p align="right">‸</p>' },
  { group: 'Estilos', icon: '☰', label: 'Justificar', keys: 'justificar justificado alinear', text: '<p align="justify">‸</p>' },
  { group: 'Insertar', icon: '[[', label: 'Enlace a nota', keys: 'enlace link nota wikilink', text: '[[‸' },
  { group: 'Insertar', icon: '▦', label: 'Tabla', keys: 'tabla table columnas', text: '| ‸Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |' },
  { group: 'Insertar', icon: '{}', label: 'Bloque de código', keys: 'codigo code bloque', text: '```\n‸\n```' },
  { group: 'Insertar', icon: '∑', label: 'Fórmula', detail: 'Bloque de LaTeX', keys: 'formula ecuacion matematicas latex math', text: '$$\n‸\n$$' },
  { group: 'Insertar', icon: '⇄', label: 'Diagrama', detail: 'Mermaid: flujos, secuencias…', keys: 'diagrama mermaid flujo grafico', text: '```mermaid\ngraph TD\n  A[‸Inicio] --> B[Fin]\n```' },
  { group: 'Insertar', icon: '¹', label: 'Nota al pie', keys: 'nota pie footnote referencia', run: () => insertFootnote() },
  { group: 'Insertar', icon: '🖼', label: 'Imagen…', detail: 'Desde tu dispositivo (también puedes pegarla o arrastrarla)', keys: 'imagen foto picture image', run: () => pickImageForNote() },
  { group: 'Insertar', icon: '📆', label: 'Fecha de hoy', keys: 'fecha hoy dia', text: () => `${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}‸` },
  { group: 'Insertar', icon: '🕒', label: 'Hora actual', keys: 'hora ahora reloj', text: () => `${new Date().toTimeString().slice(0, 5)}‸` },
  { group: 'Insertar', icon: '📄', label: 'Plantilla…', keys: 'plantilla template', run: () => insertTemplate() },
  { group: 'Incrustar', icon: '⧉', label: 'Incrustar nota', keys: 'incrustar embed nota', text: '![[‸' },
  { group: 'Incrustar', icon: '▶', label: 'Vídeo de YouTube/Vimeo o enlace…', detail: 'Pega la dirección', keys: 'video youtube vimeo enlace web url incrustar embed audio mp4 mp3 pdf', run: () => promptEmbedUrl() },
  { group: 'Incrustar', icon: '📎', label: 'Audio, vídeo o PDF desde el dispositivo…', detail: 'Hasta 15 MB', keys: 'archivo audio video pdf adjunto fichero dispositivo subir musica', run: () => pickMediaFile() },
  { group: 'Incrustar', icon: '§', label: 'Incrustar sección de una nota…', keys: 'incrustar seccion titulo embed nota', run: () => pickEmbedSection() },
  { group: 'Incrustar', icon: '¶', label: 'Incrustar bloque…', detail: 'Un párrafo de otra nota (se le añade ^id)', keys: 'incrustar bloque parrafo embed referencia', run: () => pickEmbedBlock() },
  { group: 'Incrustar', icon: '✏', label: 'Incrustar dibujo', detail: 'Uno de tus dibujos', keys: 'incrustar dibujo excalidraw embed', run: () => pickEmbedDrawing() },
  { group: 'Consultas', icon: '✓?', label: 'Consulta de tareas', detail: 'Lista de tareas que se actualiza sola', keys: 'consulta tareas query dataview', text: '```tareas\npendientes‸\n```' },
  { group: 'Consultas', icon: '📝?', label: 'Consulta de notas', keys: 'consulta notas query dataview', text: '```notas\n#‸\n```' },
  { group: 'Consultas', icon: '▤', label: 'Tabla de notas', detail: 'Notas con sus propiedades en columnas', keys: 'tabla notas consulta propiedades dataview', text: '```tabla\ncarpeta: ‸\n```' },
  { group: 'Consultas', icon: '▥', label: 'Tablero de notas', detail: 'Notas en columnas según una propiedad', keys: 'tablero kanban notas columnas propiedades estado', text: '```tablero\ncarpeta: ‸\nagrupar: estado\n```' },
  { group: 'Consultas', icon: '▦', label: 'Galería de notas', detail: 'Notas como tarjetas con portada', keys: 'galeria galería tarjetas portada imagenes gallery cards', text: '```galeria\ncarpeta: ‸\nmostrar: autor\n```' },
  { group: 'Consultas', icon: '📅', label: 'Calendario de notas', detail: 'Notas en un mes según su fecha', keys: 'calendario mes fecha notas calendar', text: '```calendario\ncarpeta: ‸\nfecha: fecha\n```' },
];
// Bloques que empiezan línea (se colocan en una línea propia).
const SLASH_LINE_RE = /^(#|- |1\. |> |\||```|---|<details|<p |\$\$)/;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function slashSuggest(ta, before) {
  const m = before.match(/(^|[\s(])\/([\p{L}\p{N}]{0,20})$/u);
  if (!m) return hideSuggest();
  const q = fold(m[2]);
  const items = SLASH_ITEMS.filter((it) => !it.when || it.when()).filter((it) => !q || fold(`${it.label} ${it.keys}`).split(/\s+/).some((w) => w.startsWith(q))).map((it) => ({
    icon: it.icon,
    label: it.label,
    detail: it.detail,
    group: it.group,
    run: (area, start, end) => runSlash(it, area, start - 1, end),
  }));
  if (!items.length) return hideSuggest();
  showSuggestBox(ta, items, ta.selectionStart - m[2].length);
  if (!q) slashGroups(items);
}

// Sin filtro, el menú lleva un rótulo antes de cada grupo (no cuenta para moverse con las flechas).
function slashGroups(items) {
  const lis = [...$$('#link-suggest .sg-item')];
  let last = null;
  items.forEach((it, i) => {
    if (!it.group || it.group === last) return;
    last = it.group;
    lis[i]?.before(el('li', { className: 'sg-group', role: 'presentation' }, it.group));
  });
}

function runSlash(it, ta, from, to) {
  // Se quita «/consulta» del texto antes de insertar el bloque.
  ta.setRangeText('', from, to, 'end');
  if (it.run) {
    // La acción abre un selector: se recuerda dónde estaba el cursor para insertar ahí.
    ta.dataset.caret = String(from);
    ta.dispatchEvent(new Event('input'));
    it.run();
    return;
  }
  const raw = typeof it.text === 'function' ? it.text() : it.text;
  // Los bloques que empiezan línea se colocan en una línea propia.
  const lineStart = ta.value.lastIndexOf('\n', from - 1) + 1;
  const needsLine = SLASH_LINE_RE.test(raw) && ta.value.slice(lineStart, from).trim() !== '';
  const text = (needsLine ? '\n' : '') + raw;
  const caret = text.indexOf('‸');
  ta.setRangeText(text.replace('‸', ''), from, from, 'end');
  if (caret >= 0) ta.setSelectionRange(from + caret, from + caret);
  ta.focus();
  ta.dispatchEvent(new Event('input'));
}
