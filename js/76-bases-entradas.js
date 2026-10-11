'use strict';

// ---------- Bases: más plantillas y las entradas a mano ----------
// En una base, tocar una entrada abre su ficha (título, campos y contenido) sin salir de la base;
// Ctrl+clic la abre como nota. Clic derecho (o mantener pulsado) en cualquier entrada: editar,
// abrir como nota, renombrar, duplicar, crear una nota vinculada, mover a otra base o carpeta,
// copiar el enlace o eliminar.

// ---------- Más plantillas ----------
const tblT = (folder, cols, totals = []) => qbEmit({ ...qbModel('tabla'), folder, columns: ['Nota', ...cols], totals: totals.map((col) => ({ col, fn: 'suma' })) });
BASE_TEMPLATES.push(
  { icon: '🎮', name: 'Videojuegos', folder: 'Videojuegos', props: { plataforma: '', estado: 'Pendiente', puntuacion: '', horas: '' }, sample: { title: 'Zelda: Breath of the Wild', plataforma: 'Switch', estado: 'Terminado', puntuacion: '5', horas: '90' },
    views: (f) => [['Por estado', brd(f, 'estado', 'Pendiente, Jugando, Terminado', ['plataforma'])], ['Tabla', tblT(f, ['plataforma', 'estado', 'puntuacion', 'horas'], ['horas'])]] },
  { icon: '🎧', name: 'Podcasts y música', folder: 'Podcasts y música', props: { tipo: 'Podcast', autor: '', estado: 'Por escuchar', puntuacion: '' }, sample: { title: 'Un episodio que me recomendaron', tipo: 'Podcast', autor: '', estado: 'Por escuchar', puntuacion: '' },
    views: (f) => [['Por estado', brd(f, 'estado', 'Por escuchar, Escuchando, Escuchado', ['tipo', 'autor'])], ['Tabla', tbl(f, ['tipo', 'autor', 'estado', 'puntuacion'])]] },
  { icon: '📰', name: 'Artículos y lecturas', folder: 'Artículos', props: { autor: '', fuente: '', tema: '', estado: 'Por leer', enlace: '' }, sample: { title: 'Un artículo interesante', autor: '', fuente: '', tema: 'Productividad', estado: 'Por leer', enlace: '' },
    views: (f) => [['Por leer', brd(f, 'estado', 'Por leer, Leído', ['tema'])], ['Tabla', tbl(f, ['autor', 'fuente', 'tema', 'estado'])]] },
  { icon: '🗣️', name: 'Citas y frases', folder: 'Citas', props: { autor: '', fuente: '', tema: '' }, sample: { title: 'La calma es la cuna del poder', autor: 'J. G. Holland', fuente: '', tema: 'Calma' },
    views: (f) => [['Tarjetas', gal(f, ['autor', 'tema'])], ['Tabla', tbl(f, ['autor', 'fuente', 'tema'])]] },
  { icon: '🏠', name: 'Inventario del hogar', folder: 'Inventario', props: { categoria: '', ubicacion: '', valor: '', garantia: '' }, sample: { title: 'Televisor del salón', categoria: 'Electrónica', ubicacion: 'Salón', valor: '450', garantia: '' },
    views: (f) => [['Inventario', tblT(f, ['categoria', 'ubicacion', 'valor', 'garantia'], ['valor'])], ['Garantías', calv(f, 'garantia', ['categoria'])]] },
  { icon: '💳', name: 'Suscripciones', folder: 'Suscripciones', props: { precio: '', frecuencia: 'Mensual', renovacion: '', estado: 'Activa' }, sample: { title: 'Música en streaming', precio: '10.99', frecuencia: 'Mensual', renovacion: '', estado: 'Activa' },
    views: (f) => [['Todas', tblT(f, ['precio', 'frecuencia', 'renovacion', 'estado'], ['precio'])], ['Renovaciones', calv(f, 'renovacion', ['precio'])], ['Por estado', brd(f, 'estado', 'Activa, En prueba, Cancelada', ['precio'])]] },
  { icon: '🌱', name: 'Plantas', folder: 'Plantas', props: { ubicacion: '', riego: 'Semanal', luz: 'Media', ultimo_riego: '' }, sample: { title: 'Monstera', ubicacion: 'Salón', riego: 'Semanal', luz: 'Indirecta', ultimo_riego: '' },
    views: (f) => [['Galería', gal(f, ['ubicacion', 'riego'])], ['Riegos', calv(f, 'ultimo_riego', ['riego'])], ['Tabla', tbl(f, ['ubicacion', 'riego', 'luz', 'ultimo_riego'])]] },
  { icon: '🏋️', name: 'Ejercicios', folder: 'Ejercicios', props: { grupo: '', series: '', repeticiones: '', peso: '' }, sample: { title: 'Sentadilla', grupo: 'Piernas', series: '4', repeticiones: '10', peso: '60' },
    views: (f) => [['Por grupo', brd(f, 'grupo', 'Piernas, Espalda, Pecho, Hombros, Brazos, Core', ['series', 'repeticiones'])], ['Tabla', tbl(f, ['grupo', 'series', 'repeticiones', 'peso'])]] },
  { icon: '🤝', name: 'Clientes (CRM)', folder: 'Clientes', props: { empresa: '', estado: 'Contacto', valor: '', proximo_paso: '' }, sample: { title: 'Laura Gómez', empresa: 'Acme', estado: 'Propuesta', valor: '1200', proximo_paso: '' },
    views: (f) => [['Embudo', brd(f, 'estado', 'Contacto, Propuesta, Negociación, Cliente, Perdido', ['empresa', 'valor'])], ['Tabla', tblT(f, ['empresa', 'estado', 'valor', 'proximo_paso'], ['valor'])], ['Seguimientos', calv(f, 'proximo_paso', ['empresa'])]] },
  { icon: '💼', name: 'Búsqueda de empleo', folder: 'Empleo', props: { empresa: '', puesto: '', estado: 'Por enviar', fecha: '', enlace: '' }, sample: { title: 'Diseñador UX en Acme', empresa: 'Acme', puesto: 'Diseñador UX', estado: 'Enviado', fecha: '', enlace: '' },
    views: (f) => [['Candidaturas', brd(f, 'estado', 'Por enviar, Enviado, Entrevista, Oferta, Rechazado', ['empresa'])], ['Tabla', tbl(f, ['empresa', 'puesto', 'estado', 'fecha'])], ['Calendario', calv(f, 'fecha', ['empresa'])]] },
  { icon: '🍽️', name: 'Restaurantes y lugares', folder: 'Lugares', props: { ciudad: '', tipo: '', estado: 'Por ir', puntuacion: '' }, sample: { title: 'La taberna del puerto', ciudad: '', tipo: 'Restaurante', estado: 'Por ir', puntuacion: '' },
    views: (f) => [['Por ir / visitados', brd(f, 'estado', 'Por ir, Visitado, Favorito', ['ciudad', 'tipo'])], ['Tabla', tbl(f, ['ciudad', 'tipo', 'estado', 'puntuacion'])]] },
  { icon: '🎁', name: 'Regalos', folder: 'Regalos', props: { persona: '', ocasion: '', precio: '', estado: 'Idea' }, sample: { title: 'Libro de cocina', persona: 'Mamá', ocasion: 'Cumpleaños', precio: '25', estado: 'Idea' },
    views: (f) => [['Por estado', brd(f, 'estado', 'Idea, Comprado, Entregado', ['persona', 'ocasion'])], ['Tabla', tblT(f, ['persona', 'ocasion', 'precio', 'estado'], ['precio'])]] },
  { icon: '🎯', name: 'Metas', folder: 'Metas', props: { area: '', estado: 'Por empezar', fecha: '' }, sample: { title: 'Correr una media maratón', area: 'Salud', estado: 'En curso', fecha: '' },
    views: (f) => [['Kanban', brd(f, 'estado', 'Por empezar, En curso, Logrado', ['area'])], ['Por área', brd(f, 'area', 'Salud, Trabajo, Finanzas, Personal, Relaciones', ['estado'])], ['Fechas', calv(f, 'fecha', ['area'])]] },
  { icon: '🛒', name: 'Lista de deseos', folder: 'Deseos', props: { precio: '', prioridad: 'Media', estado: 'Quiero', enlace: '' }, sample: { title: 'Auriculares con cancelación de ruido', precio: '199', prioridad: 'Alta', estado: 'Ahorrando', enlace: '' },
    views: (f) => [['Por estado', brd(f, 'estado', 'Quiero, Ahorrando, Comprado', ['precio', 'prioridad'])], ['Tabla', tblT(f, ['precio', 'prioridad', 'estado'], ['precio'])]] }
);

// ---------- La entrada de la que se habla ----------
// Tabla y lista: un enlace a la nota; tablero, galería y calendario: data-id.
function entryOf(target) {
  const withId = target.closest('[data-id]');
  if (withId && noteById(withId.dataset.id)) return noteById(withId.dataset.id);
  const a = target.closest('a.wikilink[data-target]') || target.closest('tr')?.querySelector('a.wikilink[data-target]');
  return a ? findNoteByName(a.dataset.target) : null;
}
const currentBase = () => (bases.open ? noteById(bases.open) : null);

// ---------- Ficha de la entrada ----------
function entryModal() {
  let back = $('#entry-modal');
  if (back) return back;
  back = el('div', { id: 'entry-modal', className: 'modal-back', role: 'dialog', ariaLabel: 'Ficha de la entrada', hidden: true });
  back.addEventListener('click', (e) => e.target === back && (back.hidden = true));
  back.addEventListener('keydown', (e) => e.key === 'Escape' && (back.hidden = true));
  document.body.append(back);
  return back;
}

function openEntry(note) {
  const text = noteText(note);
  if (text === null) return showToastMessage('Esta entrada tiene contraseña: desbloquéala abriéndola como nota.');
  const base = currentBase();
  const { props, end } = parseProps(text);
  const body = text.split('\n').slice(end > 0 ? end + 1 : 0).join('\n').replace(/^\n+/, '');
  // Campos: los de la entrada y los que la base pide para todas.
  const fields = String(base ? propOf(base, 'campos') || '' : '').split(',').map((x) => x.trim()).filter(Boolean);
  const rows = props.map((p) => ({ key: p.key, list: Array.isArray(p.value), value: Array.isArray(p.value) ? p.value.join(', ') : String(p.value ?? '') }));
  fields.forEach((k) => rows.some((r) => r.key.toLowerCase() === k.toLowerCase()) || rows.push({ key: k, list: false, value: '' }));
  const back = entryModal();
  const title = el('input', { type: 'text', className: 'entry-title', value: baseName(note.path), ariaLabel: 'Nombre de la entrada', maxLength: 120 });
  const fieldBox = el('div', { className: 'entry-fields' });
  const drawFields = () => fieldBox.replaceChildren(...rows.map((r, i) => {
    const input = el('input', { type: /fecha|date|cumplea|renovacion|garantia|riego|proximo/i.test(r.key) && !r.list ? 'text' : 'text', value: r.value, placeholder: r.list ? 'Valores separados por comas' : '', ariaLabel: r.key });
    input.addEventListener('input', () => (r.value = input.value));
    const del = el('button', { type: 'button', className: 'icon-link', title: `Quitar el campo «${r.key}»`, ariaLabel: `Quitar ${r.key}` }, '✕');
    del.addEventListener('click', () => {
      rows.splice(i, 1);
      drawFields();
    });
    return el('label', { className: 'entry-field' }, [el('span', { className: 'entry-key' }, r.key), input, del]);
  }));
  drawFields();
  const addField = el('button', { type: 'button', className: 'link' }, '＋ Campo');
  addField.addEventListener('click', () => promptText({ placeholder: 'Nombre del campo nuevo (p. ej. enlace)', action: 'Añadir', onSubmit: (k) => {
    rows.push({ key: k.trim().replace(/\s+/g, '_'), list: false, value: '' });
    drawFields();
    fieldBox.lastChild?.querySelector('input')?.focus();
  } }));
  const content = el('textarea', { className: 'notes entry-body', rows: 8, value: body, placeholder: 'Notas, reseña, enlaces, lo que quieras… (Markdown)', ariaLabel: 'Contenido' });
  const save = el('button', { className: 'primary' }, 'Guardar');
  const cancel = el('button', {}, 'Cancelar');
  save.addEventListener('click', () => {
    saveEntry(note, title.value, rows, content.value);
    back.hidden = true;
  });
  cancel.addEventListener('click', () => (back.hidden = true));
  [title, content].forEach((x) => x.addEventListener('keydown', (e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && save.click()));
  const act = (label, fn, cls = 'link') => {
    const b = el('button', { className: cls }, label);
    b.addEventListener('click', () => {
      back.hidden = true;
      fn();
    });
    return b;
  };
  back.replaceChildren(el('div', { className: 'modal entry-card' }, [
    el('div', { className: 'entry-head' }, [el('span', { className: 'muted' }, base ? `${propOf(base, 'icono') || '📇'} ${baseName(base.path)} · ${folderOf(note.path)}` : folderOf(note.path)), el('span', { className: 'spacer' }), act('📝 Abrir como nota', () => openNote(note))]),
    title,
    fieldBox,
    addField,
    content,
    el('div', { className: 'row entry-actions' }, [save, cancel, el('span', { className: 'spacer' }), act('⧉ Duplicar', () => duplicateEntry(note)), act('➕ Nota vinculada', () => linkedNote(note)), act('🗑 Eliminar', () => deleteEntry(note), 'link danger-link')]),
  ]));
  back.hidden = false;
  title.focus();
  title.select();
}

function saveEntry(note, title, rows, body) {
  const yaml = rows.filter((r) => r.key.trim()).flatMap((r) => peLines(r.key.trim(), r.list ? 'list' : 'text', r.list ? r.value : r.value.trim()));
  const text = `${yaml.length ? `---\n${yaml.join('\n')}\n---\n` : ''}${body.trim() ? `\n${body.replace(/\s+$/, '')}\n` : ''}`;
  qbEdit(note, (lines) => lines.splice(0, lines.length, ...text.split('\n')));
  const name = cleanName(title);
  if (name && name !== baseName(note.path)) renameNote(note, name);
  showToastMessage('Entrada guardada');
  renderBases();
}

function duplicateEntry(note) {
  const copy = createNote({ folder: folderOf(note.path), title: `${baseName(note.path)} (copia)`, body: noteText(note) ?? note.body, open: false, log: false });
  renderBases();
  openEntry(copy);
}

function linkedNote(note) {
  promptText({
    placeholder: 'Título de la nota vinculada',
    initial: `Notas sobre ${baseName(note.path)}`,
    action: 'Crear nota',
    onSubmit: (q) => {
      const n = createNote({ title: q, body: `Sobre [[${linkNameOf(note)}]]\n\n`, open: false });
      openNote(n, { newTab: true });
    },
  });
}

// A la papelera, con «Deshacer» (deleteNote).
function deleteEntry(note) {
  deleteNote(note);
  renderBases();
}

function moveEntry(note) {
  const targets = [
    ...allBases().flatMap((b) => baseViews(b).map(viewFolder).filter(Boolean).map((f) => ({ f, label: `${propOf(b, 'icono') || '📇'} ${baseName(b.path)} (${f})` }))),
    ...allFolders().filter((f) => f !== BASE_FOLDER).map((f) => ({ f, label: `📁 ${f}` })),
  ].filter((x, i, a) => x.f !== folderOf(note.path) && a.findIndex((y) => y.f === x.f) === i);
  pickFrom('Mover la entrada a…', targets.map((t) => ({ label: t.label, action: () => {
    moveNoteToFolder(note, t.f);
    showToastMessage(`Movida a «${t.f}»`);
    renderBases();
  } })));
}

function entryMenuItems(note) {
  return [
    { label: '✏️ Editar ficha', action: () => openEntry(note) },
    { label: '📝 Abrir como nota', kbd: 'Ctrl+clic', action: () => openNote(note) },
    { label: '↗ Abrir en pestaña nueva', action: () => openNote(note, { newTab: true }) },
    { label: '🏷 Renombrar…', action: () => promptText({ placeholder: 'Nuevo nombre', initial: baseName(note.path), action: 'Renombrar', onSubmit: (q) => {
      renameNote(note, cleanName(q));
      renderBases();
    } }) },
    { label: '⧉ Duplicar', action: () => duplicateEntry(note) },
    { label: '➕ Crear nota vinculada…', action: () => linkedNote(note) },
    { label: '📂 Mover a otra base o carpeta…', action: () => moveEntry(note) },
    { label: '🔗 Copiar enlace', action: () => copyText(`[[${linkNameOf(note)}]]`, 'Enlace copiado') },
    { sep: true },
    { label: '🗑 Eliminar', danger: true, action: () => deleteEntry(note) },
  ];
}

// Tablero, galería y calendario preguntan aquí antes de abrir la nota (53 y 55).
function viewEntryOpen(n, e) {
  if (e?.ctrlKey || e?.metaKey || !e?.target?.closest?.('#view-bases .base-content')) return false;
  openEntry(n);
  return true;
}

// En la base: un toque abre la ficha; Ctrl+clic, la nota. Clic derecho: el menú de la entrada.
document.addEventListener('click', (e) => {
  const content = e.target.closest?.('#view-bases .base-content');
  if (!content || e.ctrlKey || e.metaKey || e.button !== 0) return;
  const hit = e.target.closest('a.wikilink[data-target], .nb-title, a.vg-card, .vc-chip, .vg-card');
  if (!hit) return;
  const note = entryOf(hit);
  if (!note) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openEntry(note);
}, true);
document.addEventListener('contextmenu', (e) => {
  const content = e.target.closest?.('#view-bases .base-content');
  if (!content) return;
  const note = entryOf(e.target);
  if (!note) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  showMenu({ x: e.clientX, y: e.clientY }, entryMenuItems(note));
}, true);
