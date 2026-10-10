const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
// Sin sintaxis: formulario de vistas, ⚙ en cada vista, clic derecho (Insertar…, estilo del párrafo,
// vistas), Propiedades… del explorador y «Ver como…» de una carpeta.
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const now = Date.now();
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Libros', 'Proyectos'], updatedAt: 1,
    projects: [{ id: 'pw', name: 'Web nueva', color: '#888', createdAt: 1 }],
    notes: [
      { id: 'l1', path: 'Libros/Dune', body: '---\nautor: Herbert\nestado: pendiente\npuntuación: 9\ntags: [clasico]\n---\nTexto #clasico', createdAt: now - 3e8, updatedAt: now - 3e7 },
      { id: 'l2', path: 'Libros/Rayuela', body: '---\nautor: Cortázar\nestado: leído\npuntuación: 7\n---\nOtro', createdAt: now - 2e8, updatedAt: now - 2e7 },
      { id: 'p1', path: 'Proyectos/App', body: '---\nestado: en curso\n---\n', createdAt: now, updatedAt: now },
      { id: 'r', path: 'Ficha', body: '---\nautor: Ana\n---\nFicha', createdAt: now, updatedAt: now },
      { id: 'q', path: 'Vistas de prueba', body: 'Intro', createdAt: now, updatedAt: now },
    ],
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${label}:`, JSON.stringify(got), ok ? 'ok' : `ESPERADO ${JSON.stringify(want)}`);
    if (!ok) errs.push(`${label}: ${JSON.stringify(got)}`);
  };
  const wait = (ms = 80) => p.waitForTimeout(ms);
  const body = (id = 'q') => p.evaluate((id) => noteById(id).body, id);
  const show = async (text, id = 'q') => { await p.evaluate(([t, id]) => { const n = noteById(id); n.body = t; noteMode.set(id, 'read'); openNote(n); renderAll(); }, [text, id]); await wait(); };
  const pick = async (label) => { await p.click(`#note-menu .menu-item:has-text("${label}")`); await wait(); };
  const menu = () => p.$$eval('#note-menu:not([hidden]) .menu-item span:first-child', (n) => n.map((x) => x.textContent));
  const f = (qbf) => `#qb-form [data-qbf="${qbf}"]`;
  const src = () => p.textContent('#qb-src');
  const kind = async (k) => { await p.click(f(`kind:${k}`)); await wait(40); };

  // ---------- 1. Formulario: insertar cada tipo ----------
  await show('Intro');
  await p.click('#note-reading > p', { button: 'right' }); await wait();
  const m1 = await menu();
  check('menú lectura', ['＋ Insertar…', '▤ Insertar vista de notas…', '¶ Estilo de párrafo ▸', '▣ Convertir en recuadro…', '▾ Convertir en sección desplegable'].every((x) => m1.includes(x)), true);
  await pick('Insertar vista de notas…');
  check('diálogo abierto', await p.isVisible('#qb'), true);
  check('tipos', await p.$$eval('#qb-form .qb-kinds .chip', (n) => n.map((x) => x.dataset.kind)), ['notas', 'tabla', 'tablero', 'tareas', 'galeria', 'calendario']);
  // Tabla
  await kind('tabla');
  await p.selectOption(f('folder'), 'Libros');
  await p.click(f('tag:clasico'));
  await p.click(f('addfilter'));
  await p.selectOption(f('fk0'), 'estado'); await p.selectOption(f('fo0'), '!'); await p.fill(f('fv0'), 'leído');
  await p.selectOption(f('sort'), 'puntuación'); await p.selectOption(f('desc'), 'desc');
  await p.check(f('cb:autor'));
  await p.fill(f('limit'), '10');
  const tabla = '```tabla\ncarpeta: Libros\n#clasico\nestado: !leído\norden: puntuación desc\ncolumnas: Nota, autor\nlímite: 10\n```';
  check('tabla código', await src(), tabla);
  check('vista previa', await p.$$eval('#qb-preview .note-table tbody tr', (r) => r.map((x) => x.children[0].textContent)), ['Dune']);
  await p.click('#qb-ok'); await wait();
  check('tabla insertada tras el párrafo', await body(), `Intro\n\n${tabla}`);
  check('diálogo cerrado', await p.isVisible('#qb'), false);

  // Lista de notas (en el editor, en el cursor)
  const openFresh = async (k) => { await p.evaluate(() => qbOpen({ target: { mode: 'insert', note: noteById('q') } })); await wait(40); await kind(k); };
  await openFresh('notas');
  await p.selectOption(f('folder'), 'Libros');
  await p.click(f('addfilter')); await p.selectOption(f('fk0'), 'puntuación'); await p.selectOption(f('fo0'), '>'); await p.fill(f('fv0'), '8');
  await p.click(f('addfilter')); await p.selectOption(f('fk1'), 'autor'); await p.selectOption(f('fo1'), 'has');
  await p.check(f('cb:autor')); await p.selectOption(f('sort'), 'nombre');
  check('notas código', await src(), '```notas\ncarpeta: Libros\npuntuación: >8\nautor: *\norden: nombre\nmostrar: autor\n```');
  // Tablero
  await kind('tablero');
  check('tablero (lo común se conserva)', await src(), '```tablero\ncarpeta: Libros\nagrupar: estado\npuntuación: >8\nautor: *\norden: nombre\nmostrar: autor\n```');
  await p.fill(f('boardCols'), 'pendiente, leído');
  check('tablero columnas', (await src()).includes('agrupar: estado\ncolumnas: pendiente, leído\n'), true);
  check('tablero vista previa', await p.$$eval('#qb-preview .nb-col-title', (n) => n.map((x) => x.textContent)), ['pendiente', 'leído', 'Sin estado']);
  // Tareas
  await kind('tareas');
  await p.selectOption(f('project'), 'Webnueva'); await p.selectOption(f('status'), 'all'); await p.selectOption(f('when'), 'week');
  check('tareas código', await src(), '```tareas\ncarpeta: Libros\n+Webnueva\ntodas\nsemana\n```');
  // Galería y calendario (55-vistas.js)
  await kind('galeria');
  await p.selectOption(f('size'), 'grande');
  check('galería código', (await src()).split('\n').filter((l) => /^(```|tamaño|mostrar)/.test(l)), ['```galeria', 'mostrar: autor', 'tamaño: grande', '```']);
  await kind('calendario');
  await p.selectOption(f('dateProp'), 'puntuación');
  check('calendario código', (await src()).split('\n')[2], 'fecha: puntuación');
  await p.keyboard.press('Escape'); await wait();
  check('Esc cierra', await p.isVisible('#qb'), false);

  // En edición: se inserta en el cursor
  await p.evaluate(() => setNoteMode(noteById('q'), 'edit')); await wait();
  await p.evaluate(() => { const t = document.getElementById('note-editor'); t.focus(); t.setSelectionRange(5, 5); });
  await p.click('#note-editor', { button: 'right', position: { x: 10, y: 8 } }); await wait();
  check('menú editor', (await menu()).includes('＋ Insertar…'), true);
  await p.evaluate(() => { const t = document.getElementById('note-editor'); t.setSelectionRange(5, 5); t.dataset.caret = '5'; });
  await pick('Insertar vista de notas…');
  await kind('tareas'); await p.click('#qb-ok'); await wait();
  check('en el cursor', (await body()).startsWith('Intro\n```tareas\npendientes\n```\n'), true);

  // ---------- 2. ⚙ en una vista: editar el bloque ----------
  const doc = 'Arriba\n\n```tabla\ncarpeta: Libros\ncolumnas: autor\ntotales: puntuación=suma\nrara: *\nalgo raro\n```\n\nAbajo';
  await show(doc);
  check('⚙ visible', await p.$$eval('#note-reading .query > .qb-gear', (n) => n.length), 1);
  await p.click('#note-reading .query .qb-gear'); await wait();
  check('prefill carpeta', await p.inputValue(f('folder')), 'Libros');
  check('prefill columnas', [await p.isChecked(f('cb:autor')), await p.isChecked(f('cb:Modificada'))], [true, true]);
  check('prefill filtro', [await p.inputValue(f('fk0')), await p.inputValue(f('fo0'))], ['rara', 'has']);
  await p.selectOption(f('folder'), 'Proyectos');
  await p.click('#qb-ok'); await wait();
  check('bloque reemplazado', await body(), 'Arriba\n\n```tabla\ncarpeta: Proyectos\nrara: *\ncolumnas: Nota, autor, Modificada\ntotales: puntuación=suma\nalgo raro\n```\n\nAbajo');
  // Dentro de un recuadro
  await show('> [!note] Lista\n> ```notas\n> carpeta: Libros\n> ```\n\nFin');
  await p.click('#note-reading .query .qb-gear'); await wait();
  await p.fill(f('limit'), '3'); await p.click('#qb-ok'); await wait();
  check('en recuadro', await body(), '> [!note] Lista\n> ```notas\n> carpeta: Libros\n> límite: 3\n> ```\n\nFin');

  // ---------- 3. Clic derecho en una vista ----------
  await show('Uno\n\n```tabla\ncarpeta: Libros\ncolumnas: autor\n```\n\nDos');
  await p.click('#note-reading .query .query-head', { button: 'right' }); await wait();
  const m3 = await menu();
  check('menú vista', ['⚙ Configurar la vista…', '▥ Cambiar a tablero', '📝 Cambiar a lista de notas', 'Copiar como texto', 'Quitar el bloque'].every((x) => m3.includes(x)), true);
  await pick('Cambiar a tablero');
  check('cambiar a tablero', await body(), 'Uno\n\n```tablero\ncarpeta: Libros\nagrupar: estado\nmostrar: autor\n```\n\nDos');
  await p.click('#note-reading .query .query-head', { button: 'right' }); await wait();
  await pick('Quitar el bloque');
  check('quitado', await body(), 'Uno\n\nDos');
  await p.click('#toast .toast-action'); await wait();
  check('deshacer', (await body()).includes('```tablero'), true);

  // ---------- 4. Insertar… y estilo del párrafo en la lectura ----------
  await show('Primero\n\nSegundo');
  await p.click('#note-reading > p >> nth=0', { button: 'right' }); await wait();
  await pick('Insertar…');
  check('grupos', (await p.$$eval('#picker-list .pk-label', (n) => n.map((x) => x.textContent))).slice(0, 3), ['▤ Vista de notas (lista, tabla, tablero…)…', 'Básicos ▸', 'Recuadros y secciones ▸']);
  await p.click('#picker-list .pk-item:has-text("Recuadros y secciones")'); await wait();
  await p.click('#picker-list .pk-item:has-text("Recuadro…")'); await wait();
  await p.keyboard.type('consejo'); await p.keyboard.press('Enter'); await wait();
  await p.keyboard.press('Enter'); await wait();
  check('recuadro insertado', await p.inputValue('#note-editor'), 'Primero\n\n> [!tip] \n> \n\nSegundo');
  check('cursor en el recuadro', await p.evaluate(() => { const t = document.getElementById('note-editor'); return t.value.slice(0, t.selectionStart); }), 'Primero\n\n> [!tip] ');
  // Buscando: «advertencia»
  await show('Uno');
  await p.click('#note-reading > p', { button: 'right' }); await wait(); await pick('Insertar…');
  await p.keyboard.type('advertencia'); await wait(); await p.keyboard.press('Enter'); await wait();
  check('advertencia', await body(), 'Uno\n\n> [!warning] \n> ');
  // Estilo de párrafo y conversiones
  await show('Hola\n\nMundo');
  await p.click('#note-reading > p >> nth=0', { button: 'right' }); await wait();
  await pick('Estilo de párrafo');
  await pick('H2 Título 2');
  check('título 2', await body(), '## Hola\n\nMundo');
  await p.click('#note-reading > p', { button: 'right' }); await wait();
  await pick('Convertir en sección desplegable');
  check('sección', await body(), '## Hola\n\n<details>\n<summary>Mundo</summary>\n\n</details>');
  await p.click('#note-reading > h2', { button: 'right' }); await wait();
  await pick('Convertir en recuadro…');
  await p.keyboard.type('peligro'); await p.keyboard.press('Enter'); await wait(); await p.keyboard.press('Enter'); await wait();
  check('recuadro', (await body()).split('\n').slice(0, 2), ['> [!danger] Hola', '> ']);

  // ---------- 5. Propiedades… y carpetas en el explorador ----------
  await p.evaluate(() => { showLeftPane?.('files'); renderAll(); }); await wait();
  await p.click('.tree-row.file[data-id="r"]', { button: 'right' }); await wait();
  await pick('Propiedades…');
  check('modal propiedades', [await p.isVisible('#qb-props'), await p.$$eval('#qbp-body .pe-row', (n) => n.map((x) => x.dataset.key))], [true, ['autor']]);
  await p.fill('#qbp-body .pe-row[data-key="autor"] .pe-value', 'Beatriz'); await p.press('#qbp-body .pe-row[data-key="autor"] .pe-value', 'Enter'); await wait();
  check('propiedad cambiada', await body('r'), '---\nautor: Beatriz\n---\nFicha');
  check('modal sigue', await p.$eval('#qbp-body .pe-row[data-key="autor"] .pe-value', (x) => x.value), 'Beatriz');
  await p.click('#qbp-body .pe-addbtn'); await p.keyboard.type('estado'); await p.keyboard.press('Enter'); await wait();
  await p.keyboard.type('hecho'); await p.keyboard.press('Enter'); await wait();
  check('propiedad nueva', await body('r'), '---\nautor: Beatriz\nestado: hecho\n---\nFicha');
  await p.click('#qbp-title'); await p.keyboard.press('Escape'); await wait();
  check('modal cerrado', await p.isVisible('#qb-props'), false);
  await p.click('.tree-row.folder[title="Libros"]', { button: 'right' }); await wait();
  await pick('Ver como lista / tabla / tablero / galería…');
  check('carpeta elegida', await p.inputValue(f('folder')), 'Libros');
  await p.click('#qb-ok'); await wait();
  check('nota de vista', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Vistas/Libros (tabla)'); return n && n.body.includes('```tabla\ncarpeta: Libros\n```'); }), true);

  // ---------- 6. Paleta de comandos ----------
  await show('```notas\ncarpeta: Libros\n```');
  const cmds = await p.evaluate(() => commands().map((x) => x.label));
  check('comandos', ['Insertar vista de notas (lista, tabla, tablero…)…', 'Insertar… (todos los bloques, sin escribir código)', 'Configurar una vista de esta nota…', 'Propiedades de la nota…', 'Ver una carpeta como lista, tabla o tablero…'].every((x) => cmds.includes(x)), true);
  await p.evaluate(() => commands().find((x) => x.label === 'Configurar una vista de esta nota…').action()); await wait();
  check('configurar desde la paleta', await p.inputValue(f('folder')), 'Libros');
  await p.keyboard.press('Escape');

  console.log('errors:', errs); await b.close();
})();
