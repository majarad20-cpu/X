'use strict';

// ---------- Más vistas de notas: galería y calendario ----------
//   ```galeria                       ```calendario
//   carpeta: Libros                  carpeta: Reuniones
//   #leyendo                         fecha: inicio      (por defecto fecha, date, vence o due)
//   mostrar: autor, estado           estado: !cancelada
//   tamaño: pequeño | mediano | grande
//   orden: puntuación desc           ```
//   ```
// Filtran como ```tabla (carpeta, #etiquetas, «clave: valor», orden, límite).
// QUERY_KINDS: otras vistas se registran aquí con { label, render(box, src, selfId) }; hydrateQueries las usa.
const QUERY_KINDS = {
  galeria: { label: 'Galería de notas', render: (box, src, selfId) => renderNoteGallery(box, src, selfId) },
  calendario: { label: 'Calendario de notas', render: (box, src, selfId) => renderNoteCalendar(box, src, selfId) },
};

// Opciones propias de cada vista (las demás líneas van a parseTableQuery).
function parseViewQuery(src, own) {
  const opts = {};
  const rest = src.split('\n').filter((raw) => {
    const m = raw.trim().match(/^([^\s:#]+)\s*:\s*(.*)$/u);
    const k = m && own[fold(m[1])];
    if (k) opts[k] = m[2].trim();
    return !k;
  });
  return { ...parseTableQuery(rest.join('\n')), ...opts, show: splitList(opts.show || '') };
}

function viewNotes(q, selfId) {
  const list = state.notes
    .filter((n) => n.id !== selfId && !n.enc)
    .filter((n) => !q.folder || n.path.toLowerCase().startsWith(`${q.folder.toLowerCase()}/`))
    .filter((n) => q.tags.every((tag) => boardNoteTags(n).some((x) => x === tag || x.startsWith(`${tag}/`))))
    .filter((n) => matchPropFilters(n, q.filters));
  return sortNotesBy(list, q.sort || 'nombre', q.sort ? q.desc : false);
}

// Nota nueva en la carpeta del bloque, con la propiedad dada y los filtros «clave: valor» del bloque.
function addViewNote(q, title, key, value) {
  const props = [`${key}: ${yamlScalar(value)}`];
  q.filters.filter((f) => f.op === '=' && f.key.toLowerCase() !== key.toLowerCase()).forEach((f) => props.push(`${f.key}: ${yamlScalar(f.value)}`));
  if (q.tags.length) props.push(`tags: [${q.tags.join(', ')}]`);
  const note = createNote({ folder: q.folder || '', title, body: `---\n${props.join('\n')}\n---\n`, open: false, edit: false });
  renderAll();
  return note;
}

const viewOpen = (n, e) => openNote(n, { newTab: !!(e?.ctrlKey || e?.metaKey) });

// ---------- Galería ----------
const GALLERY_SIZES = { pequeno: 's', small: 's', mediano: 'm', medium: 'm', grande: 'l', large: 'l' };
const GALLERY_COVER_KEYS = ['portada', 'cover', 'imagen', 'image'];

// Imagen de [[nombre]]: la primera de esa nota o una guardada con ese nombre (![nombre](img:ID)).
function coverFromName(name, seen) {
  const target = parseWikiInner(name).target;
  const note = findNoteByName(target);
  if (note && !seen.has(note.id)) return firstNoteImage(note, seen.add(note.id));
  const alt = target.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
  for (const n of state.notes) {
    if (n.enc) continue;
    for (const m of n.body.matchAll(/!\[([^\]\n]*)\]\(img:([a-z0-9]+)\)/gi)) if (imgSize(m[1]).alt.toLowerCase() === alt) return { img: m[2] };
  }
  return null;
}

// Un valor de portada: img:ID, https://… o [[imagen]] (también como ![](…) o ![[…]]).
function coverFrom(v, seen = new Set()) {
  const s = String(v || '').trim();
  let m;
  if ((m = s.match(/^(?:!\[[^\]\n]*\]\()?img:([a-z0-9]+)\)?$/i))) return { img: m[1] };
  if ((m = s.match(/^(?:!\[[^\]\n]*\]\()?<?(https?:\/\/[^\s)>]+)>?\)?$/i))) return { url: m[1] };
  // [[imagen]] (sin comillas, el YAML lo lee como lista y queda «[imagen]»).
  if ((m = s.match(/^!?\[\[([^\]\n]+)\]\]$/) || s.match(/^\[([^[\]\n]+)\]$/))) return coverFromName(m[1], seen);
  return null;
}

// Primera imagen del texto de la nota (fuera de los bloques de código).
function firstNoteImage(note, seen = new Set()) {
  const body = note.body.replace(/^```[\s\S]*?^```/gm, '');
  const re = /!\[([^\]\n]*)\]\((img:[a-z0-9]+|https?:\/\/[^\s)]+)\)|!\[\[([^\]\n]+)\]\]/gi;
  for (const m of body.matchAll(re)) {
    if (m[2] && /^https?:/i.test(m[2]) && mediaHtml(m[1], m[2]).indexOf('<img') < 0) continue; // vídeo, audio o enlace
    const c = m[2] ? coverFrom(m[2], seen) : coverFromName(m[3], seen);
    if (c) return c;
  }
  return null;
}

function noteCover(n) {
  const f = noteFields(n);
  for (const k of GALLERY_COVER_KEYS) {
    const c = f.get(k) && coverFrom(f.get(k).value);
    if (c) return c;
  }
  return firstNoteImage(n);
}

function renderNoteGallery(box, src, selfId) {
  const q = parseViewQuery(src, { mostrar: 'show', show: 'show', tamano: 'size', size: 'size' });
  const size = GALLERY_SIZES[fold(q.size || '')] || 'm';
  const notes = viewNotes(q, selfId);
  const shown = notes.slice(0, q.limit);
  const card = (n) => {
    const name = baseName(n.path);
    const c = noteCover(n);
    const cover = c ? el('img', { className: 'vg-img', alt: '', loading: 'lazy', ...(c.url ? { src: c.url, referrerPolicy: 'no-referrer' } : {}) }) : el('span', { className: 'vg-letter', ariaHidden: 'true' }, name.charAt(0).toUpperCase() || '·');
    if (c?.img) cover.dataset.img = c.img; // 26-imagenes.js la rellena
    const props = q.show.map((k) => [k, propValues(n, k).join(', ')]).filter(([, v]) => v);
    const tags = boardNoteTags(n);
    const a = el('a', { href: '#', className: 'vg-card', title: n.path }, [
      el('div', { className: `vg-cover${c ? '' : ' empty'}` }, cover),
      el('div', { className: 'vg-body' }, [
        el('div', { className: 'vg-name' }, name),
        props.length ? el('div', { className: 'vg-props' }, props.map(([k, v]) => el('div', {}, [el('span', { className: 'muted' }, `${k}: `), v]))) : '',
        tags.length ? el('div', { className: 'nb-tags vg-tags' }, tags.slice(0, 6).map((t) => el('span', { className: 'nb-tag' }, `#${t}`))) : '',
      ]),
    ]);
    a.dataset.id = n.id;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      viewOpen(n, e);
    });
    return a;
  };
  const head = el('div', { className: 'query-head' }, `Galería de notas${q.folder ? ` · ${q.folder}` : ''} · ${plural(notes.length, 'nota', 'notas')}`);
  box.replaceChildren(
    head,
    shown.length ? el('div', { className: `vg-grid vg-${size}` }, shown.map(card)) : el('p', { className: 'muted' }, 'Ninguna nota cumple esta galería.'),
    notes.length > shown.length ? el('p', { className: 'muted' }, `Se muestran ${shown.length} de ${notes.length}`) : ''
  );
}

// ---------- Calendario ----------
const CAL_DATE_KEYS = ['fecha', 'date', 'vence', 'due'];
const calMonth = new Map(); // mes visible por bloque (mientras dura la sesión)
const ISO_DAY = /^(\d{4}-\d{2}-\d{2})/;

// Fecha de la nota (AAAA-MM-DD) y la propiedad de la que sale.
function calNoteDate(n, key) {
  for (const k of key ? [key] : CAL_DATE_KEYS) {
    const v = propValues(n, k)[0] || '';
    const m = v.match(ISO_DAY);
    if (m) return { date: m[1], key: noteFields(n).get(k.toLowerCase())?.key || k, value: v };
  }
  return null;
}

// Cambia la fecha (conserva la hora si la había: 2026-10-09T10:00).
function moveCalendarNote(note, key, date) {
  if (!note || note.enc) return false;
  const cur = propOf(note, key);
  const next = ISO_DAY.test(cur) ? date + cur.slice(10) : date;
  if (cur === next) return false;
  setProp(note, key, next);
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note);
  renderAll();
  return true;
}

function renderNoteCalendar(box, src, selfId) {
  const q = parseViewQuery(src, { fecha: 'date', date: 'date', mostrar: 'show', show: 'show' });
  const stateKey = `${selfId}|${src}`;
  const today = dateKey();
  const month = calMonth.get(stateKey) || today.slice(0, 7);
  const [y, mo] = month.split('-').map(Number);
  const byDay = new Map();
  let inMonth = 0;
  viewNotes(q, selfId).forEach((n) => {
    const d = calNoteDate(n, q.date);
    if (!d) return;
    if (!byDay.has(d.date)) byDay.set(d.date, []);
    byDay.get(d.date).push({ n, ...d });
    if (d.date.startsWith(month)) inMonth++;
  });
  const go = (delta) => {
    const d = new Date(y, mo - 1 + delta, 1);
    calMonth.set(stateKey, delta ? dateKey(d).slice(0, 7) : today.slice(0, 7));
    renderNoteCalendar(box, src, selfId);
  };
  const nav = (label, title, delta) => {
    const b = el('button', { className: 'chip vc-nav', title, ariaLabel: title }, label);
    b.addEventListener('click', () => go(delta));
    return b;
  };
  const title = new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const head = el('div', { className: 'query-head vc-head' }, [
    el('span', {}, `Calendario de notas${q.folder ? ` · ${q.folder}` : ''} · ${plural(inMonth, 'nota', 'notas')}`),
    el('span', { className: 'vc-bar' }, [nav('‹', 'Mes anterior', -1), el('strong', { className: 'vc-title' }, title.charAt(0).toUpperCase() + title.slice(1)), nav('›', 'Mes siguiente', 1), nav('Hoy', 'Este mes', 0)]),
  ]);
  const newKey = q.date || 'fecha';
  const chip = (it) => {
    const name = baseName(it.n.path);
    const props = q.show.map((k) => propValues(it.n, k).join(', ')).filter(Boolean);
    const c = el('button', { className: 'vc-chip', title: `${it.n.path}${props.length ? ` · ${props.join(' · ')}` : ''}\nArrastra a otro día (o Alt + flechas)` }, name);
    c.dataset.id = it.n.id;
    let pt = '';
    c.addEventListener('pointerdown', (e) => {
      pt = e.pointerType;
      if (e.pointerType !== 'mouse') return; // con el dedo, tocar abre (la página se sigue desplazando)
      e.preventDefault();
      cardDrag(e, c, {
        targets: '.vc-day',
        onDrop: (day) => day.closest('.vc-grid') === c.closest('.vc-grid') && moveCalendarNote(it.n, it.key, day.dataset.date),
        onClick: () => viewOpen(it.n, e),
      });
    });
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail === 0 || (pt && pt !== 'mouse')) viewOpen(it.n, e);
    });
    c.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!e.altKey || !step) return;
      e.preventDefault();
      if (moveCalendarNote(it.n, it.key, dateKey(addDays(new Date(`${it.date}T12:00`), step)))) $(`.vc-chip[data-id="${CSS.escape(it.n.id)}"]`)?.focus();
    });
    return c;
  };
  // Semanas de lunes a domingo que cubren el mes.
  const first = new Date(y, mo - 1, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(y, mo, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => dateKey(addDays(start, i)));
  const dows = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const grid = el('div', { className: 'vc-grid' }, [
    ...dows.map((d) => el('div', { className: 'vc-dow', ariaHidden: 'true' }, d)),
    ...days.map((key) => {
      const items = (byDay.get(key) || []).sort((a, b) => baseName(a.n.path).localeCompare(baseName(b.n.path), 'es', { numeric: true }));
      const cell = el('div', { className: `vc-day${key.startsWith(month) ? '' : ' out'}${key === today ? ' today' : ''}`, title: items.length ? '' : 'Toca para crear una nota este día' }, [
        el('span', { className: 'vc-num' }, String(Number(key.slice(8)))),
        el('div', { className: 'vc-chips' }, items.map(chip)),
      ]);
      cell.dataset.date = key;
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.vc-chip')) return;
        promptText({ placeholder: `Nota nueva el ${key} (${newKey}: ${key})`, action: 'Crear nota', onSubmit: (name) => addViewNote(q, name, newKey, key) });
      });
      return cell;
    }),
  ]);
  box.replaceChildren(head, el('div', { className: 'vc-wrap' }, grid));
}
