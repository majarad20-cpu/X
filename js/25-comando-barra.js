'use strict';

// ---------- Comando «/» en el editor ----------
// Al escribir / al principio de una línea o tras un espacio aparece un menú de bloques, como en Notion.
// En el texto, «‸» marca dónde queda el cursor.
const SLASH_ITEMS = [
  { icon: 'H1', label: 'Título 1', keys: 'titulo encabezado h1 heading', text: '# ‸' },
  { icon: 'H2', label: 'Título 2', keys: 'titulo encabezado h2 subtitulo', text: '## ‸' },
  { icon: 'H3', label: 'Título 3', keys: 'titulo encabezado h3', text: '### ‸' },
  { icon: '☐', label: 'Tarea', detail: 'Casilla que aparece en Tareas', keys: 'tarea casilla checkbox todo pendiente', text: '- [ ] ‸' },
  { icon: '📅', label: 'Tarea para hoy', keys: 'tarea hoy fecha', text: () => `- [ ] ‸ 📅 ${dateKey()}` },
  { icon: '📅', label: 'Tarea para mañana', keys: 'tarea manana fecha', text: () => `- [ ] ‸ 📅 ${dateKey(addDays(new Date(), 1))}` },
  { icon: '◐', label: 'Tarea en curso', keys: 'tarea en curso doing progreso', text: '- [/] ‸' },
  { icon: '•', label: 'Lista', keys: 'lista viñetas bullet', text: '- ‸' },
  { icon: '1.', label: 'Lista numerada', keys: 'lista numerada ordenada numero', text: '1. ‸' },
  { icon: '❝', label: 'Cita', keys: 'cita quote', text: '> ‸' },
  { icon: 'ℹ', label: 'Aviso', detail: 'Recuadro destacado (callout)', keys: 'aviso callout nota tip importante', text: '> [!tip] ‸\n> ' },
  { icon: '⚠', label: 'Advertencia', keys: 'advertencia aviso warning cuidado', text: '> [!warning] ‸\n> ' },
  { icon: '▦', label: 'Tabla', keys: 'tabla table columnas', text: '| ‸Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |' },
  { icon: '{}', label: 'Bloque de código', keys: 'codigo code bloque', text: '```\n‸\n```' },
  { icon: '—', label: 'Línea divisoria', keys: 'linea separador divisor hr', text: '---\n‸' },
  { icon: '==', label: 'Resaltado', keys: 'resaltar resaltado marcador highlight', text: '==‸==' },
  { icon: '[[', label: 'Enlace a nota', keys: 'enlace link nota wikilink', text: '[[‸' },
  { icon: '⧉', label: 'Incrustar nota', keys: 'incrustar embed nota', text: '![[‸' },
  { icon: '🖼', label: 'Imagen…', detail: 'Desde tu dispositivo (también puedes pegarla o arrastrarla)', keys: 'imagen foto picture image', run: () => pickImageForNote() },
  { icon: '📆', label: 'Fecha de hoy', keys: 'fecha hoy dia', text: () => `${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}‸` },
  { icon: '🕒', label: 'Hora actual', keys: 'hora ahora reloj', text: () => `${new Date().toTimeString().slice(0, 5)}‸` },
  { icon: '✓?', label: 'Consulta de tareas', detail: 'Lista de tareas que se actualiza sola', keys: 'consulta tareas query dataview', text: '```tareas\npendientes‸\n```' },
  { icon: '📝?', label: 'Consulta de notas', keys: 'consulta notas query dataview', text: '```notas\n#‸\n```' },
  { icon: '📄', label: 'Plantilla…', keys: 'plantilla template', run: () => insertTemplate() },
];

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function slashSuggest(ta, before) {
  const m = before.match(/(^|[\s(])\/([\p{L}\p{N}]{0,20})$/u);
  if (!m) return hideSuggest();
  const q = fold(m[2]);
  const items = SLASH_ITEMS.filter((it) => !q || fold(`${it.label} ${it.keys}`).split(/\s+/).some((w) => w.startsWith(q))).map((it) => ({
    icon: it.icon,
    label: it.label,
    detail: it.detail,
    run: (area, start, end) => runSlash(it, area, start - 1, end),
  }));
  if (!items.length) return hideSuggest();
  showSuggestBox(ta, items, ta.selectionStart - m[2].length);
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
  const needsLine = /^(#|- |1\. |> |\||```|---)/.test(raw) && ta.value.slice(lineStart, from).trim() !== '';
  const text = (needsLine ? '\n' : '') + raw;
  const caret = text.indexOf('‸');
  ta.setRangeText(text.replace('‸', ''), from, from, 'end');
  if (caret >= 0) ta.setSelectionRange(from + caret, from + caret);
  ta.focus();
  ta.dispatchEvent(new Event('input'));
}
