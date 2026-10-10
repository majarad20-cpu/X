'use strict';

// ---------- Búsqueda con operadores (como en Obsidian) ----------
//   palabra  "frase exacta"  -excluir  a OR b  /expresión/
//   file:nombre  path:carpeta  content:texto  line:(a b)  tag:#etiqueta  #etiqueta
//   task:texto  task-todo:texto  task-done:texto  [propiedad]  [propiedad:valor]
const SEARCH_OPS = ['file', 'path', 'content', 'line', 'tag', 'task', 'task-todo', 'task-done'];
const SEARCH_TOKEN_RE = /(-?)(?:([a-z][\w-]*):)?("([^"]*)"|\(([^)]*)\)|\[([^\]]*)\]|\/((?:\\.|[^/\s])(?:\\.|[^/])*)\/|(\S*))/gi;

function parseSearch(q) {
  const groups = [[]];
  for (const m of q.matchAll(SEARCH_TOKEN_RE)) {
    const [, neg, rawOp, , quoted, paren, prop, regex, word] = m;
    if (!neg && !rawOp && word === 'OR') {
      if (groups.at(-1).length) groups.push([]);
      continue;
    }
    let op = rawOp?.toLowerCase() || '';
    if (op && !SEARCH_OPS.includes(op)) {
      // «hora:10» no es un operador: se busca tal cual.
      groups.at(-1).push({ neg: !!neg, op: '', value: m[0].replace(/^-/, '').toLowerCase() });
      continue;
    }
    let value = (quoted ?? paren ?? word ?? '').toLowerCase();
    const clause = { neg: !!neg, op, value };
    if (prop !== undefined && !op) {
      const i = prop.indexOf(':');
      Object.assign(clause, { op: 'prop', key: (i < 0 ? prop : prop.slice(0, i)).trim().toLowerCase(), value: i < 0 ? null : prop.slice(i + 1).trim().replace(/^"(.*)"$/, '$1').toLowerCase() });
    } else if (regex !== undefined && !op) {
      try {
        clause.re = new RegExp(regex, 'i');
      } catch {
        clause.value = `/${regex}/`.toLowerCase();
      }
    } else if (!op && value.startsWith('#') && value.length > 1) {
      Object.assign(clause, { op: 'tag', value: value.slice(1) });
    } else if (op === 'tag') clause.value = value.replace(/^#/, '');
    if (paren !== undefined) clause.words = value.split(/\s+/).filter(Boolean);
    if (clause.value === '' && !clause.re && !['task', 'task-todo', 'task-done'].includes(clause.op)) continue;
    groups.at(-1).push(clause);
  }
  return groups.filter((g) => g.length);
}

// Etiquetas de las propiedades (tags: [a, b]), que en Obsidian cuentan como etiquetas de la nota.
function fmTags(body) {
  if (!body.startsWith('---')) return [];
  const v = parseFrontmatter(body.split('\n', 200))?.props.find(([k]) => /^tags?$/i.test(k))?.[1];
  return (Array.isArray(v) ? v : String(v || '').split(/[,\s]+/)).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
}

const searchTaskLines = (body, state) =>
  body.split('\n').filter((l) => {
    const m = l.match(/^\s*[-*+]\s+\[([ xX/])\]\s/);
    return m && (state === 'any' || (state === 'done') === /[xX]/.test(m[1]));
  });

function noteMatchesClause(n, c) {
  const has = (hay) => (c.re ? c.re.test(hay) : (c.words || [c.value]).every((w) => hay.toLowerCase().includes(w)));
  switch (c.op) {
    case 'file': return has(baseName(n.path));
    case 'path': return has(n.path);
    case 'content': return has(n.body);
    case 'line': return n.body.split('\n').some(has);
    case 'tag': return [...tagsIn(n.body), ...fmTags(n.body)].some((t) => t === c.value || t.startsWith(`${c.value}/`));
    case 'task':
    case 'task-todo':
    case 'task-done': {
      const lines = searchTaskLines(n.body, c.op === 'task' ? 'any' : c.op === 'task-done' ? 'done' : 'todo');
      return !c.value ? lines.length > 0 : lines.some(has);
    }
    case 'prop': {
      const found = noteFields(n).get(c.key); // propiedades y campos en línea (autor:: …)
      if (!found) return false;
      if (c.value === null) return true;
      const v = found.items || [found.value];
      return v.some((x) => String(x).toLowerCase().includes(c.value));
    }
    default: return has(`${n.path}\n${n.body}`);
  }
}

const noteMatchesSearch = (n, groups) => groups.some((g) => g.every((c) => noteMatchesClause(n, c) !== c.neg));

// Palabras que se resaltan en los resultados (las positivas y de texto).
const searchHighlights = (groups) => groups.flat().filter((c) => !c.neg && !c.re && ['', 'content', 'line', 'task', 'task-todo', 'task-done', 'file'].includes(c.op)).flatMap((c) => c.words || [c.value]).filter(Boolean);

// Líneas que se enseñan bajo cada resultado.
function searchPreviewLines(n, groups) {
  const flat = groups.flat().filter((c) => !c.neg);
  const words = searchHighlights(groups);
  const taskOp = flat.find((c) => c.op.startsWith('task'));
  const lines = n.body.split('\n');
  const pick = taskOp ? searchTaskLines(n.body, taskOp.op === 'task' ? 'any' : taskOp.op === 'task-done' ? 'done' : 'todo').filter((l) => !taskOp.value || l.toLowerCase().includes(taskOp.value))
    : flat.some((c) => c.re) ? lines.filter((l) => flat.some((c) => c.re?.test(l)))
    : lines.filter((l) => words.some((w) => l.toLowerCase().includes(w)));
  return pick.slice(0, 3);
}
