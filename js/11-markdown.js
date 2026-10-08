'use strict';

// ---------- Markdown ----------
// Lector propio y pequeño: todo el texto se escapa, así que una nota nunca puede inyectar HTML.
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescHtml = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
const WIKILINK_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;

// "Nota#Sección|texto" -> { target, heading, alias }
function parseWikiInner(inner) {
  const [left, alias] = inner.replace(/\\\|/g, '|').split('|');
  const [target, heading] = left.split('#');
  return { target: target.trim(), heading: (heading || '').trim(), alias: (alias || '').trim() };
}

function wikiLinkHtml(rawInner) {
  const { target, heading, alias } = parseWikiInner(rawInner);
  const note = target ? findNoteByName(target) : null;
  const label = alias || (heading ? (target ? `${target} › ${heading}` : heading) : target);
  return `<a href="#" class="wikilink${note || !target ? '' : ' unresolved'}" data-target="${escHtml(target)}" data-heading="${escHtml(heading)}" title="${escHtml(note ? note.path : `Crear «${target}»`)}">${escHtml(label)}</a>`;
}

// Tamaño al estilo Obsidian en el texto alternativo: ![foto|300](…) o ![foto|300x200](…).
function imgSize(alt) {
  const m = alt.match(/^(.*?)\|\s*(\d+)(?:x(\d+))?\s*$/);
  if (!m) return { alt, style: '' };
  return { alt: m[1].trim(), style: ` style="width:${Math.min(+m[2], 4000)}px${m[3] ? `;height:${Math.min(+m[3], 4000)}px;object-fit:contain` : ''}"` };
}

// Fórmula LaTeX: se muestra el texto hasta que carga el motor de fórmulas (39-obsidian.js).
const mathHtml = (tex, display) => `<span class="math${display ? ' display' : ''}" data-tex="${escHtml(tex.trim())}">${escHtml(tex.trim())}</span>`;

// Notas al pie de la nota que se está dibujando (las crea renderMd en su llamada exterior).
let mdNotes = null;
let mdNotesSeq = 0;
function footnoteRef(def) {
  const f = mdNotes;
  let n = f.order.indexOf(def) + 1;
  const first = !n;
  if (first) n = f.order.push(def);
  return `<sup class="fn-ref"${first ? ` id="${f.pre}r${n}"` : ''}><a href="#" data-go="${f.pre}d${n}" title="${escHtml(typeof def === 'string' ? def : f.defs.get(def.id) || '')}">${n}</a></sup>`;
}

// Etiquetas HTML sencillas que Obsidian también admite (sin atributos, así que no hay riesgo).
const SAFE_TAGS = /&lt;(\/?)(u|sub|sup|kbd|mark|small|s|b|i|ins|br)\s*\/?&gt;/gi;

function inlineMd(text) {
  const tokens = [];
  const hold = (html) => `\u0001${tokens.push(html) - 1}\u0001`;
  let s = text
    .replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${escHtml(c)}</code>`))
    .replace(/(^|[^\\$])\$\$([^$\n]+?)\$\$/g, (_, pre, tex) => pre + hold(mathHtml(tex, true)))
    .replace(/(^|[^\\$])\$(?=[^\s$])([^$\n]*?[^\s\\$])\$(?![\d$])/g, (_, pre, tex) => pre + hold(mathHtml(tex, false)))
    .replace(/!?\[\[([^\]\n]+?)\]\]/g, (_, inner) => hold(wikiLinkHtml(inner)))
    .replace(/\\([\\`*_{}\[\]()#+\-.!|~=$%^<>])/g, (_, c) => hold(escHtml(c)))
    // Notas al pie: [^id] (definida al final) y ^[texto] (en línea), numeradas por orden de aparición.
    .replace(/\^\[([^\]\n]+)\]|\[\^([^\]\s]+)\]/g, (m, note, id) => {
      if (!mdNotes || (id && !mdNotes.defs.has(id))) return m;
      return hold(footnoteRef(note ?? (mdNotes.refs.get(id) || mdNotes.refs.set(id, { id }).get(id))));
    })
    // Imagen guardada en la app: ![descripción](img:ID). Se carga después (26-imagenes.js).
    .replace(/!\[([^\]\n]*)\]\(img:([a-z0-9]+)\)/gi, (_, raw, id) => {
      const { alt, style } = imgSize(raw);
      return hold(`<img class="note-img" data-img="${escHtml(id)}" alt="${escHtml(alt)}" loading="lazy"${style}>`);
    })
    // Imagen de internet: ![descripción|300](https://…).
    .replace(/!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/gi, (_, raw, url) => {
      const { alt, style } = imgSize(raw);
      return hold(`<img class="note-img ext" src="${escHtml(url)}" alt="${escHtml(alt)}" loading="lazy" referrerpolicy="no-referrer"${style}>`);
    })
    // Nota de voz: ![🎤 Nota de voz · 0:42](audio:ID).
    .replace(/!\[([^\]\n]*)\]\(audio:([a-z0-9]+)\)/gi, (_, label, id) => hold(`<span class="note-audio"><span class="na-label">${escHtml(label || '🎤 Nota de voz')}</span><audio controls preload="metadata" data-audio="${escHtml(id)}"></audio></span>`))
    .replace(/(!?)\[([^\]\n]*)\]\((\S+?)\)/g, (m, bang, label, url) => {
      if (/^(https?:|mailto:)/i.test(url)) return hold(`<a href="${escHtml(url)}" class="external" target="_blank" rel="noopener noreferrer">${escHtml(label || url)}</a>`);
      // Enlace de Markdown a otra nota: [texto](Carpeta/Nota.md#Sección) o [texto](#Sección).
      if (bang || /^(img|audio|data|javascript):/i.test(url)) return m;
      let target = url;
      try {
        target = decodeURIComponent(url.replace(/^<|>$/g, ''));
      } catch {
        // Se usa tal cual.
      }
      const [path, heading = ''] = target.split('#');
      if (!path && heading) return hold(wikiLinkHtml(`#${heading}|${label || heading}`));
      if (/\.md$/i.test(path) || findNoteByName(path)) return hold(wikiLinkHtml(`${path.replace(/\.md$/i, '')}${heading ? `#${heading}` : ''}|${label || path}`));
      return m;
    })
    .replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, (_, pre, url) => pre + hold(`<a href="${escHtml(url)}" class="external" target="_blank" rel="noopener noreferrer">${escHtml(url)}</a>`))
    .replace(/(^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (_, pre, tag) => pre + hold(`<a href="#" class="tag-link" data-tag="${escHtml(tag.toLowerCase())}">#${escHtml(tag)}</a>`));
  s = escHtml(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>')
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>')
    .replace(SAFE_TAGS, '<$1$2>');
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => tokens[i]);
}

const BLOCK_START = /^(\s*([-*+]|\d+[.)])\s|#{1,6}\s|>|```|\$\$|(-{3,}|\*{3,}|_{3,})\s*$|!\[\[[^\]]+\]\]\s*$)/;
const CALLOUT_ICONS = { note: 'ℹ️', info: 'ℹ️', abstract: '📋', tip: '💡', hint: '💡', important: '❗', warning: '⚠️', caution: '⚠️', danger: '⛔', failure: '❌', bug: '🐞', success: '✅', check: '✅', done: '✅', question: '❓', quote: '❝', example: '📑', todo: '☑️' };
// Nombres alternativos de los avisos de Obsidian -> tipo base (para el color y el icono).
const CALLOUT_ALIAS = { summary: 'abstract', tldr: 'abstract', help: 'question', faq: 'question', attention: 'warning', fail: 'failure', missing: 'failure', error: 'danger', cite: 'quote' };
// Estados de tarea extra de Obsidian (y de muchos temas): se muestran, pero no se marcan con un toque.
const TASK_STATES = { '-': ['cancelled', '✕', 'Cancelada'], '>': ['forwarded', '➜', 'Pospuesta'], '<': ['scheduled', '📅', 'Programada'], '!': ['important', '!', 'Importante'], '?': ['question', '?', 'Pregunta'], '*': ['star', '★', 'Destacada'] };
// Identificador de bloque al final de un párrafo o elemento: «texto ^mi-id».
const BLOCK_ID_RE = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;
const blockAttr = (text) => {
  const m = text.match(BLOCK_ID_RE);
  return m ? { text: text.slice(0, m.index), attr: ` id="b-${m[1]}" data-block="${m[1]}"` } : { text, attr: '' };
};

// Comentarios de Obsidian (%% … %%): no se ven al leer. Se conservan las líneas (los números de
// línea de casillas y títulos siguen apuntando al texto real) y no se tocan los bloques de código.
function stripComments(src) {
  if (!src.includes('%%')) return src;
  let fenced = false;
  let open = false;
  return src
    .split('\n')
    .map((line) => {
      if (!open && /^\s*```/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      let out = '';
      let rest = line;
      for (;;) {
        const k = rest.indexOf('%%');
        if (k < 0) {
          if (!open) out += rest;
          break;
        }
        if (!open) out += rest.slice(0, k);
        open = !open;
        rest = rest.slice(k + 2);
      }
      return out;
    })
    .join('\n');
}

// Propiedades del principio (YAML sencillo): «clave: valor», listas «[a, b]» o con guiones.
function parseFrontmatter(lines) {
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const props = [];
  const clean = (v) => v.trim().replace(/^(["'])(.*)\1$/, '$2');
  for (let k = 1; k < end; k++) {
    const m = lines[k].match(/^([\w\p{L} -]+):\s*(.*)$/u);
    if (!m) continue;
    let value = m[2].trim();
    if (/^\[.*\]$/.test(value)) value = value.slice(1, -1).split(',').map(clean).filter(Boolean);
    else if (!value) {
      const items = [];
      while (k + 1 < end && /^\s*-\s+/.test(lines[k + 1])) items.push(clean(lines[++k].replace(/^\s*-\s+/, '')));
      value = items.length ? items : '';
    } else value = clean(value);
    props.push([m[1].trim(), value]);
  }
  return { props, end };
}

// Alias de una nota (propiedad «aliases» o «alias»), para que [[Alias]] la encuentre.
function noteAliases(body) {
  if (!body?.startsWith('---')) return [];
  const fm = parseFrontmatter(body.split('\n', 60));
  const v = fm?.props.find(([k]) => /^alias(es)?$/i.test(k))?.[1];
  return !v ? [] : Array.isArray(v) ? v : v.split(',').map((x) => x.trim()).filter(Boolean);
}

function propValueHtml(key, value) {
  const list = Array.isArray(value) ? value : null;
  if (/^tags?$/i.test(key)) {
    const tags = list || String(value).split(/[,\s]+/).filter(Boolean);
    return tags.map((t) => t.replace(/^#/, '')).map((t) => `<a href="#" class="tag-link" data-tag="${escHtml(t.toLowerCase())}">#${escHtml(t)}</a>`).join(' ');
  }
  return list ? list.map((v) => `<span class="prop-chip">${inlineMd(v)}</span>`).join(' ') : inlineMd(value);
}

// Devuelve el HTML de una nota. `ctx.noteId` identifica la nota (para marcar casillas),
// `ctx.depth` limita las notas incrustadas y `ctx.lineOffset` corrige los números de línea.
function renderMd(src, ctx = {}) {
  const outer = !mdNotes;
  if (outer) mdNotes = { defs: new Map(), refs: new Map(), order: [], pre: `fn${++mdNotesSeq}-` };
  try {
    const html = renderBlocks(src, ctx);
    return outer ? html + footnotesHtml() : html;
  } finally {
    if (outer) mdNotes = null;
  }
}

function footnotesHtml() {
  const f = mdNotes;
  if (!f.order.length) return '';
  let items = '';
  // El texto de una nota al pie puede citar otra: la lista crece mientras se recorre.
  for (let k = 0; k < f.order.length; k++) {
    const def = f.order[k];
    const text = typeof def === 'string' ? def : f.defs.get(def.id) || '';
    items += `<li id="${f.pre}d${k + 1}">${inlineMd(text)} <a href="#" class="fn-back" data-go="${f.pre}r${k + 1}" title="Volver al texto" aria-label="Volver al texto">↩</a></li>`;
  }
  return `<section class="footnotes"><ol>${items}</ol></section>`;
}

function renderBlocks(src, ctx) {
  const depth = ctx.depth || 0;
  const offset = ctx.lineOffset || 0;
  const lines = stripComments(src.replace(/\r/g, '')).split('\n');
  const ids = new Map();
  let html = '';
  let i = 0;

  // Propiedades al principio (--- clave: valor ---).
  const fm = parseFrontmatter(lines);
  if (fm) {
    if (fm.props.length) html += `<dl class="props"${ctx.blocks ? ` data-src="${offset}-${fm.end + offset}"` : ''}>${fm.props.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${propValueHtml(k, v)}</dd>`).join('')}</dl>`;
    i = fm.end + 1;
  }

  // Definiciones de notas al pie ([^id]: texto, con líneas siguientes sangradas): se guardan y se quitan.
  let fenced = false;
  for (let k = i; k < lines.length; k++) {
    if (/^\s*```/.test(lines[k])) fenced = !fenced;
    const m = !fenced && lines[k].match(/^\[\^([^\]\s]+)\]:\s?(.*)$/);
    if (!m) continue;
    let text = m[2];
    lines[k] = '';
    while (k + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[k + 1])) {
      text += ` ${lines[k + 1].trim()}`;
      lines[++k] = '';
    }
    mdNotes.defs.set(m[1], text);
  }

  // Cada bloque de primer nivel guarda de qué líneas sale (data-src="desde-hasta"), para poder
  // editar solo ese bloque desde la vista de lectura (40-edicion-bloques.js).
  const block = () => {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      return;
    }
    // Identificador de bloque suelto en su propia línea (tras una tabla o una cita).
    if (/^\^[A-Za-z0-9-]+\s*$/.test(line)) {
      html += `<span class="block-anchor" id="b-${line.trim().slice(1)}" data-block="${line.trim().slice(1)}"></span>`;
      i++;
      return;
    }
    // Fórmula en bloque: $$ … $$
    if (/^\s*\$\$/.test(line)) {
      const start = i;
      let tex = line.trim().slice(2);
      if (tex.endsWith('$$') && tex.length >= 2) tex = tex.slice(0, -2);
      else {
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) tex += `\n${lines[i++]}`;
        if (i < lines.length) tex += `\n${lines[i].trim().slice(0, -2)}`;
      }
      i++;
      html += `<div class="math-block" data-line="${start + offset}">${mathHtml(tex, true)}</div>`;
      return;
    }
    // Bloque de código
    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const lang = fence[1].toLowerCase();
      if (lang === 'math' || lang === 'latex') {
        html += `<div class="math-block">${mathHtml(body.join('\n'), true)}</div>`;
        return;
      }
      if (lang === 'mermaid') {
        html += `<div class="mermaid-box" data-src="${encodeURIComponent(body.join('\n'))}"><pre class="code"><code data-lang="mermaid">${escHtml(body.join('\n'))}</code></pre></div>`;
        return;
      }
      if (['tareas', 'tasks', 'notas', 'notes', 'tabla', 'table'].includes(lang)) {
        const kind = lang.startsWith('tab') ? 'tabla' : lang.startsWith('ta') ? 'tareas' : 'notas';
        html += `<div class="query" data-kind="${kind}" data-src="${encodeURIComponent(body.join('\n'))}"></div>`;
        return;
      }
      html += `<pre class="code"><code${fence[1] ? ` data-lang="${escHtml(fence[1])}"` : ''}>${escHtml(body.join('\n'))}</code></pre>`;
      return;
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
      return;
    }
    // Línea horizontal
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html += '<hr>';
      i++;
      return;
    }
    // Nota incrustada ![[Nota]] o ![[Nota#Sección]]
    const emb = line.match(/^!\[\[([^\]]+)\]\]\s*$/);
    if (emb) {
      html += embedHtml(emb[1], depth);
      i++;
      return;
    }
    // Cita o aviso (> [!tip] Título)
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      const call = body[0].match(/^\[!([\w-]+)\]([+-]?)\s*(.*)$/);
      if (call) {
        const type = call[1].toLowerCase();
        const base = CALLOUT_ALIAS[type] || type;
        const title = `<span aria-hidden="true">${CALLOUT_ICONS[type] || CALLOUT_ICONS[base] || 'ℹ️'}</span> ${inlineMd(call[3] || type.charAt(0).toUpperCase() + type.slice(1))}`;
        const inner = body.slice(1).join('\n').trim() ? `<div class="callout-body">${renderMd(body.slice(1).join('\n'), { depth, noTasks: true })}</div>` : '';
        const cls = `callout callout-${escHtml(type)}${base !== type ? ` callout-${escHtml(base)}` : ''}`;
        // [!tipo]- empieza plegado y [!tipo]+ desplegado; los dos se pueden abrir y cerrar.
        html += call[2]
          ? `<details class="${cls} foldable"${call[2] === '+' ? ' open' : ''}><summary class="callout-title">${title}</summary>${inner}</details>`
          : `<div class="${cls}"><div class="callout-title">${title}</div>${inner}</div>`;
      } else {
        html += `<blockquote>${renderMd(body.join('\n'), { depth, noTasks: true })}</blockquote>`;
      }
      return;
    }
    // Tabla
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      html += `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inlineMd(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      return;
    }
    // Lista (con casillas y anidación por sangría)
    const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX/\-<>!?*])\]\s+)?(.*)$/;
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
        const { text, attr } = blockAttr(it.text);
        const content = text.split('\n').map(inlineMd).join('<br>');
        const at = ` data-line="${it.line}"${attr}`;
        if (it.task !== undefined && TASK_STATES[it.task]) {
          const [cls, glyph, label] = TASK_STATES[it.task];
          html += `<li class="task-item task-${cls}"${at}><span class="task-glyph" title="${label}" aria-label="${label}">${glyph}</span><span>${content}</span>`;
        } else if (it.task !== undefined) {
          const done = it.task.toLowerCase() === 'x';
          const box = ctx.noTasks ? `<input type="checkbox" disabled${done ? ' checked' : ''}>` : `<input type="checkbox" class="task-check" data-line="${it.line}"${done ? ' checked' : ''} aria-label="Completar">`;
          const doing = it.task === '/' ? ' doing' : '';
          html += `<li class="task-item${done ? ' done' : ''}${doing}"${at}>${box}<span>${doing ? '<span class="doing-badge" title="En curso">◐</span> ' : ''}${content}</span>`;
        } else {
          html += `<li${at}>${content}`;
        }
      }
      while (stack.length) html += `</li></${stack.pop().type}>`;
      return;
    }
    // Párrafo: un salto de línea simple se respeta.
    const para = [];
    const start = i;
    while (i < lines.length && lines[i].trim() && (!BLOCK_START.test(lines[i]) || !para.length)) {
      if (para.length && BLOCK_START.test(lines[i])) break;
      para.push(lines[i++]);
    }
    const { text, attr } = blockAttr(para.join('\n'));
    if (!text.trim() && attr) {
      html += `<span class="block-anchor"${attr}></span>`;
      return;
    }
    html += `<p data-line="${start + offset}"${attr}>${text.split('\n').map(inlineMd).join('<br>')}</p>`;
  };
  while (i < lines.length) {
    const from = i;
    const mark = html.length;
    block();
    if (ctx.blocks && html.length > mark) html = html.slice(0, mark) + html.slice(mark).replace(/^<([a-z][\w-]*)/, `<$1 data-src="${from + offset}-${i - 1 + offset}"`);
  }
  return html;
}

// Sección de una nota: desde el título hasta el siguiente del mismo nivel o superior.
function sectionOf(body, heading) {
  if (heading.startsWith('^')) return blockOf(body, heading.slice(1));
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

// Línea donde está el bloque «^id» (o la anterior, si el id va solo en su línea).
function blockLine(body, id) {
  const lines = body.split('\n');
  const re = new RegExp(`(?:^|\\s)\\^${id.replace(/[^A-Za-z0-9-]/g, '')}\\s*$`);
  return lines.findIndex((l) => re.test(l));
}

// Bloque «^id» de una nota: el párrafo o elemento de lista que lo lleva.
function blockOf(body, id) {
  const lines = body.split('\n');
  let end = blockLine(body, id);
  if (end < 0) return null;
  // Id suelto en su propia línea: el bloque es el de encima (una tabla, una cita…).
  if (/^\^[A-Za-z0-9-]+\s*$/.test(lines[end].trim()) && end > 0) end--;
  if (/^\s*([-*+]|\d+[.)])\s/.test(lines[end])) return { text: lines[end].replace(/^\s+/, ''), offset: end };
  let start = end;
  while (start > 0 && lines[start - 1].trim() && !/^#{1,6}\s/.test(lines[start - 1])) start--;
  return { text: lines.slice(start, end + 1).join('\n'), offset: start };
}

function embedHtml(inner, depth) {
  const { target, heading } = parseWikiInner(inner);
  const note = findNoteByName(target);
  if (!note || depth >= 2) return `<div class="embed missing">${wikiLinkHtml(inner)} ${note ? '(demasiadas incrustaciones)' : '— la nota no existe todavía'}</div>`;
  const sec = heading ? sectionOf(note.body, heading) : { text: note.body, offset: 0 };
  // La nota incrustada lleva sus propias notas al pie.
  const saved = mdNotes;
  mdNotes = null;
  try {
    return `<div class="embed" data-note="${note.id}"><div class="embed-title">${wikiLinkHtml(inner)}</div>${renderMd(sec ? sec.text : `*No hay ${heading.startsWith('^') ? 'un bloque' : 'una sección'} «${heading}».*`, { depth: depth + 1, noteId: note.id, lineOffset: sec ? sec.offset : 0 })}</div>`;
  } finally {
    mdNotes = saved;
  }
}
