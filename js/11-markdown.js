'use strict';

// ---------- Markdown ----------
// Lector propio y pequeño: todo el texto se escapa, así que una nota nunca puede inyectar HTML.
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescHtml = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
const WIKILINK_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;

// "Nota#Sección|texto" -> { target, heading, alias }
function parseWikiInner(inner) {
  const [left, alias] = inner.split('|');
  const [target, heading] = left.split('#');
  return { target: target.trim(), heading: (heading || '').trim(), alias: (alias || '').trim() };
}

function wikiLinkHtml(rawInner) {
  const { target, heading, alias } = parseWikiInner(rawInner);
  const note = target ? findNoteByName(target) : null;
  const label = alias || (heading ? (target ? `${target} › ${heading}` : heading) : target);
  return `<a href="#" class="wikilink${note || !target ? '' : ' unresolved'}" data-target="${escHtml(target)}" data-heading="${escHtml(heading)}" title="${escHtml(note ? note.path : `Crear «${target}»`)}">${escHtml(label)}</a>`;
}

function inlineMd(text) {
  const tokens = [];
  const hold = (html) => `\u0001${tokens.push(html) - 1}\u0001`;
  let s = text
    .replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${escHtml(c)}</code>`))
    .replace(/!?\[\[([^\]\n]+?)\]\]/g, (_, inner) => hold(wikiLinkHtml(inner)))
    .replace(/!?\[([^\]\n]*)\]\((\S+?)\)/g, (m, label, url) =>
      /^(https?:|mailto:)/i.test(url) ? hold(`<a href="${escHtml(url)}" class="external" target="_blank" rel="noopener noreferrer">${escHtml(label || url)}</a>`) : m)
    .replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, (_, pre, url) => pre + hold(`<a href="${escHtml(url)}" class="external" target="_blank" rel="noopener noreferrer">${escHtml(url)}</a>`))
    .replace(/(^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (_, pre, tag) => pre + hold(`<a href="#" class="tag-link" data-tag="${escHtml(tag.toLowerCase())}">#${escHtml(tag)}</a>`));
  s = escHtml(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>')
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>');
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => tokens[i]);
}

const BLOCK_START = /^(\s*([-*+]|\d+[.)])\s|#{1,6}\s|>|```|(-{3,}|\*{3,}|_{3,})\s*$|!\[\[[^\]]+\]\]\s*$)/;
const CALLOUT_ICONS = { note: 'ℹ️', info: 'ℹ️', tip: '💡', hint: '💡', important: '❗', warning: '⚠️', caution: '⚠️', danger: '⛔', success: '✅', check: '✅', done: '✅', question: '❓', quote: '❝', example: '📋', todo: '☑️' };

// Devuelve el HTML de una nota. `ctx.noteId` identifica la nota (para marcar casillas),
// `ctx.depth` limita las notas incrustadas y `ctx.lineOffset` corrige los números de línea.
function renderMd(src, ctx = {}) {
  const depth = ctx.depth || 0;
  const offset = ctx.lineOffset || 0;
  const lines = src.replace(/\r/g, '').split('\n');
  const ids = new Map();
  let html = '';
  let i = 0;

  // Propiedades al principio (--- clave: valor ---).
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      const props = lines.slice(1, end).map((l) => l.match(/^([\w\p{L} -]+):\s*(.*)$/u)).filter(Boolean);
      if (props.length) html += `<dl class="props">${props.map((m) => `<dt>${escHtml(m[1])}</dt><dd>${inlineMd(m[2])}</dd>`).join('')}</dl>`;
      i = end + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Bloque de código
    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const lang = fence[1].toLowerCase();
      if (['tareas', 'tasks', 'notas', 'notes'].includes(lang)) {
        html += `<div class="query" data-kind="${lang.startsWith('t') ? 'tareas' : 'notas'}" data-src="${encodeURIComponent(body.join('\n'))}"></div>`;
        continue;
      }
      html += `<pre class="code"><code${fence[1] ? ` data-lang="${escHtml(fence[1])}"` : ''}>${escHtml(body.join('\n'))}</code></pre>`;
      continue;
    }
    // Título
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const text = h[2];
      let id = `h-${slugify(text) || 'seccion'}`;
      const n = ids.get(id) || 0;
      ids.set(id, n + 1);
      if (n) id += `-${n}`;
      html += `<h${h[1].length} id="${id}" data-line="${i + offset}">${inlineMd(text)}</h${h[1].length}>`;
      i++;
      continue;
    }
    // Línea horizontal
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html += '<hr>';
      i++;
      continue;
    }
    // Nota incrustada ![[Nota]] o ![[Nota#Sección]]
    const emb = line.match(/^!\[\[([^\]]+)\]\]\s*$/);
    if (emb) {
      html += embedHtml(emb[1], depth);
      i++;
      continue;
    }
    // Cita o aviso (> [!tip] Título)
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      const call = body[0].match(/^\[!(\w+)\][+-]?\s*(.*)$/);
      if (call) {
        const type = call[1].toLowerCase();
        html += `<div class="callout callout-${escHtml(type)}"><div class="callout-title"><span aria-hidden="true">${CALLOUT_ICONS[type] || 'ℹ️'}</span> ${inlineMd(call[2] || type.charAt(0).toUpperCase() + type.slice(1))}</div><div class="callout-body">${renderMd(body.slice(1).join('\n'), { depth, noTasks: true })}</div></div>`;
      } else {
        html += `<blockquote>${renderMd(body.join('\n'), { depth, noTasks: true })}</blockquote>`;
      }
      continue;
    }
    // Tabla
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      html += `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inlineMd(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    // Lista (con casillas y anidación por sangría)
    const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE);
        if (m) {
          items.push({ indent: m[1].replace(/\t/g, '    ').length, type: /\d/.test(m[2]) ? 'ol' : 'ul', task: m[3], text: m[4], line: i + offset });
          i++;
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          items[items.length - 1].text += `\n${lines[i].trim()}`;
          i++;
        } else break;
      }
      const stack = [];
      for (const it of items) {
        if (!stack.length || it.indent > stack[stack.length - 1].indent) {
          html += `<${it.type}>`;
          stack.push({ indent: it.indent, type: it.type });
        } else {
          while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().type}>`;
          html += '</li>';
        }
        const content = it.text.split('\n').map(inlineMd).join('<br>');
        if (it.task !== undefined) {
          const done = it.task.toLowerCase() === 'x';
          const box = ctx.noTasks ? `<input type="checkbox" disabled${done ? ' checked' : ''}>` : `<input type="checkbox" class="task-check" data-line="${it.line}"${done ? ' checked' : ''} aria-label="Completar">`;
          html += `<li class="task-item${done ? ' done' : ''}">${box}<span>${content}</span>`;
        } else {
          html += `<li>${content}`;
        }
      }
      while (stack.length) html += `</li></${stack.pop().type}>`;
      continue;
    }
    // Párrafo: un salto de línea simple se respeta.
    const para = [];
    while (i < lines.length && lines[i].trim() && (!BLOCK_START.test(lines[i]) || !para.length)) {
      if (para.length && BLOCK_START.test(lines[i])) break;
      para.push(lines[i++]);
    }
    html += `<p>${para.map(inlineMd).join('<br>')}</p>`;
  }
  return html;
}

// Sección de una nota: desde el título hasta el siguiente del mismo nivel o superior.
function sectionOf(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => {
    const m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    return m && m[2].toLowerCase() === heading.toLowerCase();
  });
  if (start < 0) return null;
  const level = lines[start].match(/^#+/)[0].length;
  let end = start + 1;
  while (end < lines.length && !(lines[end].match(/^(#{1,6})\s/) && lines[end].match(/^#+/)[0].length <= level)) end++;
  return { text: lines.slice(start, end).join('\n'), offset: start };
}

function embedHtml(inner, depth) {
  const { target, heading } = parseWikiInner(inner);
  const note = findNoteByName(target);
  if (!note || depth >= 2) return `<div class="embed missing">${wikiLinkHtml(inner)} ${note ? '(demasiadas incrustaciones)' : '— la nota no existe todavía'}</div>`;
  const sec = heading ? sectionOf(note.body, heading) : { text: note.body, offset: 0 };
  return `<div class="embed" data-note="${note.id}"><div class="embed-title">${wikiLinkHtml(inner)}</div>${renderMd(sec ? sec.text : `*No hay una sección «${heading}».*`, { depth: depth + 1, noteId: note.id, lineOffset: sec ? sec.offset : 0 })}</div>`;
}
