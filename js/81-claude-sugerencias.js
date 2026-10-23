'use strict';

// ---------- Claude en la nota: sugerencias ----------
// «💡 Sugerencias»: Claude revisa la nota (con el contexto de la bóveda) y propone mejoras concretas
// —secciones que faltan, enlaces a notas que existen, redacción, etiquetas, estado y notas nuevas—
// en una lista con casillas. Solo se aplica lo marcado, de una vez y con la versión anterior en el historial.
const SG_STATES = ['pendiente', 'borrador', 'revisada'];
const SG_LABELS = { seccion: '➕ Sección', enlace: '🔗 Enlace', redaccion: '✏️ Redacción', etiqueta: '🏷 Etiqueta', estado: '📌 Estado', nota_nueva: '📝 Nota nueva' };

NOTE_AI_ACTIONS.suggest = {
  label: 'Sugerencias',
  vault: true,
  quiet: 'Claude está revisando la nota…',
  ask: (t, ctx) => `Revisa la nota «${ctx.title}»${ctx.folder ? ` (carpeta «${ctx.folder}»)` : ''} de una bóveda personal de notas (estilo Obsidian, un «segundo cerebro») y propón entre 3 y 8 mejoras concretas, las que más la mejoren primero.

Devuelve SOLO JSON válido, sin texto alrededor ni bloque de código, con esta forma: {"sugerencias":[…]}. Cada sugerencia es de uno de estos tipos:
- {"tipo":"seccion","titulo":"…","contenido":"Markdown de la sección, sin el título","motivo":"…"}: una sección que le falta.
- {"tipo":"enlace","texto":"palabra o frase exacta que aparece en la nota","nota":"Nombre de una nota existente","motivo":"…"}: enlazar una mención a otra nota.
- {"tipo":"redaccion","buscar":"fragmento exacto de la nota (1 a 3 frases)","reemplazar":"versión mejorada o corregida","motivo":"…"}
- {"tipo":"etiqueta","etiqueta":"sin #","motivo":"…"}
- {"tipo":"estado","valor":"pendiente | borrador | revisada","motivo":"…"}: si el estado actual no refleja cómo está la nota.
- {"tipo":"nota_nueva","titulo":"…","motivo":"…"}: una nota que conviene crear y enlazar desde esta.

Reglas: «texto» y «buscar» se copian literalmente de la nota. «nota» sale solo de la lista de notas existentes. No propongas lo que la nota ya tiene. No inventes cifras ni normas. «motivo» es una frase corta en español.${t.trim() ? '' : ' La nota está vacía: propón sobre todo secciones.'}

<nota>
${t}
</nota>${ctx.vault}`,
  after: (note) => {
    noteAI.suggestions = sgParse(noteAI.result, note);
    noteAI.picked = new Set(noteAI.suggestions.map((_, i) => i));
    if (!noteAI.suggestions.length) noteAI.error = 'Claude no encontró mejoras que se puedan aplicar. Prueba «Otra vez».';
  },
  render: () => {
    const list = noteAI.suggestions || [];
    $('#note-ai-result').replaceChildren(
      ...list.map((s, i) => {
        const box = el('input', { type: 'checkbox', checked: noteAI.picked.has(i) });
        box.addEventListener('change', () => {
          box.checked ? noteAI.picked.add(i) : noteAI.picked.delete(i);
          renderNoteAI();
        });
        return el('label', { className: 'sg-item' }, [box, el('span', {}, [el('strong', {}, `${SG_LABELS[s.tipo]} · `), sgSummary(s), s.motivo ? el('span', { className: 'muted' }, ` — ${s.motivo}`) : ''])]);
      })
    );
    $('#note-ai-result').classList.add('sg-list');
    $('#note-ai-insert').textContent = `Aplicar las marcadas (${noteAI.picked.size})`;
    $('#note-ai-insert').disabled = !noteAI.picked.size;
  },
  apply: (note) => sgApply(note, (noteAI.suggestions || []).filter((_, i) => noteAI.picked.has(i))),
};

const sgClip = (t, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
function sgSummary(s) {
  if (s.tipo === 'seccion') return `«${s.titulo}»`;
  if (s.tipo === 'enlace') return `«${sgClip(s.texto, 40)}» → [[${s.nota}]]`;
  if (s.tipo === 'redaccion') return `«${sgClip(s.buscar)}» → «${sgClip(s.reemplazar)}»`;
  if (s.tipo === 'etiqueta') return `#${s.etiqueta}`;
  if (s.tipo === 'estado') return s.valor;
  return `[[${s.titulo}]]`;
}

const sgTags = (body) => new Set([...tagsIn(body), ...(parseProps(body).props.find((p) => /^tags?$/i.test(p.key))?.items || peSplit('tags', parseProps(body).props.find((p) => /^tags?$/i.test(p.key))?.value || ''))].map((x) => String(x).replace(/^#/, '').toLowerCase()));

// Lo que Claude devuelve se comprueba contra la nota: un fragmento que no está, una nota que no
// existe o algo que ya tiene se descarta antes de mostrarlo.
function sgParse(text, note) {
  let data;
  try {
    const t = String(text || '');
    data = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return [];
  }
  const body = note.body;
  const estado = parseProps(body).props.find((p) => p.key.toLowerCase() === 'estado')?.value?.toLowerCase();
  const tags = sgTags(body);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const seen = new Set();
  return (Array.isArray(data?.sugerencias) ? data.sugerencias : [])
    .map((s) => {
      const tipo = str(s?.tipo).toLowerCase().replace(/[\s-]/g, '_');
      const motivo = str(s?.motivo);
      if (tipo === 'seccion' && str(s.titulo) && str(s.contenido)) return { tipo, titulo: str(s.titulo).replace(/^#+\s*/, ''), contenido: str(s.contenido).replace(/^#{1,6}\s+.*\n/, (h) => (h.replace(/^#+\s*/, '').trim().toLowerCase() === str(s.titulo).replace(/^#+\s*/, '').toLowerCase() ? '' : h)).trim(), motivo };
      if (tipo === 'enlace' && str(s.texto) && body.includes(str(s.texto))) {
        const target = findNoteByName(str(s.nota));
        if (target && target.id !== note.id && !target.enc) return { tipo, texto: str(s.texto), nota: baseName(target.path), motivo };
      }
      if (tipo === 'redaccion' && str(s.buscar) && body.includes(str(s.buscar)) && str(s.reemplazar) && str(s.reemplazar) !== str(s.buscar)) return { tipo, buscar: str(s.buscar), reemplazar: str(s.reemplazar), motivo };
      if (tipo === 'etiqueta') {
        const tag = str(s.etiqueta).replace(/^#/, '').replace(/\s+/g, '-');
        if (/^[\p{L}\p{N}_\-/]+$/u.test(tag) && !tags.has(tag.toLowerCase())) return { tipo, etiqueta: tag, motivo };
      }
      if (tipo === 'estado' && SG_STATES.includes(str(s.valor).toLowerCase()) && str(s.valor).toLowerCase() !== estado) return { tipo, valor: str(s.valor).toLowerCase(), motivo };
      if (tipo === 'nota_nueva' && str(s.titulo) && !findNoteByName(str(s.titulo)) && cleanName(str(s.titulo))) return { tipo, titulo: cleanName(str(s.titulo)), motivo };
      return null;
    })
    .filter((s) => {
      if (!s) return false;
      const key = `${s.tipo}|${s.titulo || s.texto || s.buscar || s.etiqueta || s.valor}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function sgSetProp(body, key, type, value) {
  const lines = body.split('\n');
  const { props, end } = parseProps(body);
  const found = props.find((p) => p.key.toLowerCase() === key.toLowerCase());
  const rows = peLines(found?.key || key, type, value);
  if (found) lines.splice(found.line, found.to - found.line + 1, ...rows);
  else if (end > 0) lines.splice(end, 0, ...rows);
  else lines.unshift('---', ...rows, '---');
  return lines.join('\n');
}

// Añade una sección antes de «## Fuentes» (si la hay) o al final.
function sgAddSection(body, block) {
  const lines = body.replace(/\s*$/, '').split('\n');
  const at = lines.findIndex((l) => /^##\s+Fuentes\s*$/i.test(l));
  if (at < 0) return `${lines.join('\n')}${lines.join('').trim() ? '\n\n' : ''}${block}\n`;
  const before = lines.slice(0, at).join('\n').replace(/\s*$/, '');
  return `${before}${before ? '\n\n' : ''}${block}\n\n${lines.slice(at).join('\n')}\n`;
}

async function sgApply(note, list) {
  if (!list.length) return;
  if (blockEdit?.noteId === note.id) endBlockEdit({ render: false });
  flushNoteSave();
  await snapshotNote(note, { force: true });
  let body = note.body;
  for (const s of list.filter((x) => x.tipo === 'redaccion')) {
    const at = body.indexOf(s.buscar);
    if (at >= 0) body = body.slice(0, at) + s.reemplazar + body.slice(at + s.buscar.length);
  }
  for (const s of list.filter((x) => x.tipo === 'enlace')) {
    let done = false;
    const link = s.texto.toLowerCase() === s.nota.toLowerCase() ? `[[${s.texto}]]` : `[[${s.nota}|${s.texto}]]`;
    // Fuera de las propiedades y de los enlaces que ya hay.
    const { end } = parseProps(body);
    const lines = body.split('\n');
    const head = lines.slice(0, end + 1);
    const rest = lines.slice(end + 1).join('\n').split(/(!?\[\[[^\]\n]+?\]\])/).map((p, k) => {
      if (done || k % 2) return p;
      const at = p.indexOf(s.texto);
      if (at < 0) return p;
      done = true;
      return p.slice(0, at) + link + p.slice(at + s.texto.length);
    });
    body = [...head, rest.join('')].join('\n');
  }
  for (const s of list.filter((x) => x.tipo === 'seccion')) body = sgAddSection(body, `## ${s.titulo}\n${s.contenido}`);
  const fresh = list.filter((x) => x.tipo === 'nota_nueva');
  const folder = folderOf(note.path);
  const made = fresh.map((s) => createNote({ folder, title: s.titulo, body: `# ${s.titulo}\n`, open: false, log: false }));
  if (made.length) {
    const items = made.map((n) => `- [[${baseName(n.path)}]]`).join('\n');
    const lines = body.replace(/\s*$/, '').split('\n');
    const at = lines.findIndex((l) => /^##\s+Notas relacionadas\s*$/i.test(l));
    if (at < 0) body = sgAddSection(body, `## Notas relacionadas\n${items}`);
    else {
      let k = at + 1;
      while (k < lines.length && !/^#{1,6}\s/.test(lines[k])) k++;
      while (k > at + 1 && !lines[k - 1].trim()) k--;
      lines.splice(k, 0, items);
      body = `${lines.join('\n')}\n`;
    }
  }
  const tags = list.filter((x) => x.tipo === 'etiqueta').map((x) => x.etiqueta);
  if (tags.length) {
    const prop = parseProps(body).props.find((p) => /^tags?$/i.test(p.key));
    body = sgSetProp(body, prop?.key || 'tags', 'list', [...peSplit('tags', prop?.items || prop?.value || ''), ...tags]);
  }
  const estado = list.find((x) => x.tipo === 'estado');
  if (estado) body = sgSetProp(body, 'estado', 'text', estado.valor);
  note.body = body;
  note.updatedAt = Date.now();
  save();
  await snapshotNote(note, { force: true });
  closeNoteAI();
  if (isEditing(note.id)) {
    const ta = $('#note-editor');
    ta.value = note.body;
    autosize(ta);
  }
  renderAll();
  showToastMessage(`${plural(list.length, 'mejora aplicada', 'mejoras aplicadas')}${made.length ? ` y ${plural(made.length, 'nota nueva', 'notas nuevas')}` : ''}. Lo anterior queda en el historial de versiones.`);
}
