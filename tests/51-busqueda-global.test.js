const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
// Sin reloj falso: la prueba de velocidad mide tiempo real.
const now = Date.now();
const day = 864e5;
const seed = {
  settings: { notesWelcome: true },
  notes: [
    { id: 'a', path: 'Ana', body: 'Contacto', createdAt: now - 90 * day, updatedAt: now - 90 * day },
    { id: 'r', path: 'Reunión con Ana', body: 'Hablar del presupuesto\n#trabajo', createdAt: now - 9 * day, updatedAt: now - 9 * day },
    { id: 'pr', path: 'Trabajo/Presupuesto 2027', body: 'Revisar con Ana las cifras\nOtra línea', createdAt: now, updatedAt: now },
    { id: 'an', path: 'Anatomía', body: 'Varias', createdAt: now - 200 * day, updatedAt: now - 200 * day },
    { id: 's', path: 'Secreto bancario', body: 'clave del banco', enc: { v: 1, salt: 'AA==', iv: 'AA==', ct: 'AA==' }, createdAt: now, updatedAt: now },
  ],
  tasks: [
    { id: 't1', title: 'Llamar a Ana', done: false, priority: 3, due: '2030-01-15', projectId: 'p1', tags: [], createdAt: now - day },
    { id: 't2', title: 'Comprar pan', done: false, priority: 2, due: null, projectId: null, tags: [], createdAt: now - 2 * day },
  ],
  projects: [{ id: 'p1', name: 'Mudanza', desc: '', status: 'active', deadline: null, color: 'blue', manual: null, milestone: 0, createdAt: now }],
  ideas: [{ id: 'i1', text: 'App de recetas\nCon fotos de Ana', tags: ['app'], pinned: false, createdAt: now, updatedAt: now }],
  habits: [{ id: 'h1', name: 'Leer en el café', goal: 7, log: {} }],
  journal: [{ id: 'j1', date: '2026-10-08', kind: 'free', text: 'Día con Ana en el parque', createdAt: now - day, updatedAt: now - day }],
  canvases: [{ id: 'c1', title: 'Plan Ana', cards: [], edges: [], createdAt: now, updatedAt: now }],
  updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  const isOpen = () => p.evaluate(() => !document.getElementById('gs').hidden);
  const type = async (q) => { await p.fill('#gs-input', q); await p.waitForTimeout(120); };
  const groups = () => p.evaluate(() => gs.last.groups.map((g) => g.type));
  const titles = (t) => p.evaluate((t) => gs.last.groups.find((g) => g.type === t)?.items.map((e) => e.it.title) || [], t);
  const cur = () => p.evaluate(() => { const t = activeTab(); return t.type === 'note' ? noteById(t.id).path : t.view || t.type; });

  // Atajo fuera de los campos de texto
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Control+k');
  check('Ctrl+K fuera abre', await isOpen(), true);
  check('foco en el cuadro', await p.evaluate(() => document.activeElement.id), 'gs-input');
  await p.keyboard.press('Escape');
  check('Esc cierra', await isOpen(), false);
  // Dentro del editor, Ctrl+K inserta un enlace; Ctrl+Mayús+K abre la búsqueda
  await p.evaluate(() => { openNote(noteById('a')); setNoteMode(noteById('a'), 'edit'); });
  await p.waitForTimeout(80);
  await p.focus('#note-editor');
  await p.keyboard.press('Control+k');
  check('Ctrl+K en el editor no abre', await isOpen(), false);
  check('Ctrl+K en el editor = enlace', await p.evaluate(() => document.getElementById('note-editor').value.includes('](')), true);
  await p.keyboard.press('Control+Shift+K');
  check('Ctrl+Mayús+K en el editor abre', await isOpen(), true);
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const n = noteById('a'); n.body = 'Contacto'; setNoteMode(n, 'read'); showView('today'); });
  // Otro campo de texto (formulario de tareas): Ctrl+K no; Ctrl+Mayús+K sí
  await p.focus('#task-title').catch(() => {});
  await p.evaluate(() => { showView('tasks'); document.getElementById('task-title').focus(); });
  await p.keyboard.press('Control+k');
  check('Ctrl+K en un campo no abre', await isOpen(), false);
  await p.keyboard.press('Control+Shift+K');
  check('Ctrl+Mayús+K en un campo abre', await isOpen(), true);
  await p.keyboard.press('Escape');

  // Botón de la barra de pestañas y comando de la paleta
  await p.click('#gs-open');
  check('botón abre', await isOpen(), true);
  await p.keyboard.press('Escape');
  check('comando en la paleta', await p.evaluate(() => commands().some((c) => /Buscar en todo/.test(c.label) && c.kbd === 'Ctrl+K')), true);
  await p.evaluate(() => { openPalette(); document.getElementById('picker-input').value = 'buscar en todo'; document.getElementById('picker-input').dispatchEvent(new Event('input')); });
  await p.keyboard.press('Enter'); await p.waitForTimeout(50);
  check('paleta abre', await isOpen(), true);

  // Agrupar y orden de los grupos
  await type('ana');
  check('grupos en orden', await groups(), ['note', 'task', 'idea', 'journal', 'canvas', 'view']); // «Revisión sem-ana-l»
  check('cabeceras con cuenta', await p.evaluate(() => [...document.querySelectorAll('#gs-list .gs-group')].map((g) => g.textContent)), ['Notas4', 'Tareas1', 'Ideas1', 'Diario1', 'Lienzos1', 'Secciones1']);
  // Orden: título igual > empieza por > contiene > contenido
  check('ranking notas', await titles('note'), ['Ana', 'Anatomía', 'Reunión con Ana', 'Presupuesto 2027']);
  check('fragmento: línea que coincide', await p.evaluate(() => [...document.querySelectorAll('#gs-list .gs-item')].find((n) => n.textContent.includes('Presupuesto 2027')).querySelector('.gs-snip').textContent), 'Revisar con Ana las cifras');
  check('tarea: proyecto, fecha y prioridad', await p.evaluate(() => [...document.querySelectorAll('#gs-list .gs-item')].find((n) => n.textContent.includes('Llamar a Ana')).querySelector('.gs-snip').textContent.replace(/📅 [^·]+/, '📅 X')), '📁 Mudanza · 📅 X· !alta');
  check('chip de tipo', await p.evaluate(() => [...document.querySelectorAll('#gs-list .gs-type')].map((n) => n.textContent).slice(3, 6)), ['Nota', 'Tarea', 'Idea']);
  check('lo reciente sube (empate de nivel)', await p.evaluate(() => { const r = gsSearch('presupuesto').groups[0].items.map((e) => e.it.title); return r; }), ['Presupuesto 2027', 'Reunión con Ana']);

  // Sin tildes
  await type('reunion');
  check('sin tildes', await titles('note'), ['Reunión con Ana']);
  check('resalta sin tildes', await p.evaluate(() => document.querySelector('#gs-list .gs-title').innerHTML), '<mark>Reunión</mark> con Ana');
  await type('CAFE');
  check('hábito sin tildes ni mayúsculas', await titles('habit'), ['Leer en el café']);

  // Filtros: chips, Tab y prefijos
  await type('ana');
  await p.click('#gs [data-gs-filter="task"]');
  check('chip Tareas', await groups(), ['task']);
  check('chip activo', await p.evaluate(() => document.querySelector('#gs .gs-filter.active').dataset.gsFilter), 'task');
  await p.keyboard.press('Tab');
  check('Tab → Proyectos', await p.evaluate(() => document.querySelector('#gs .gs-filter.active').dataset.gsFilter), 'project');
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab');
  check('Mayús+Tab → Notas', await groups(), ['note']);
  await p.click('#gs [data-gs-filter="all"]');
  for (const [pre, want] of [['t: ana', ['task']], ['n:ana', ['note']], ['i: ana', ['idea']], ['p: mud', ['project']], ['h: leer', ['habit']]]) {
    await type(pre);
    check(`prefijo ${pre}`, await groups(), want);
  }

  // Operadores de 49-busqueda.js en las notas
  await type('tag:trabajo');
  check('tag:', await titles('note'), ['Reunión con Ana']);
  await type('path:trabajo ana');
  check('path: + palabra', await titles('note'), ['Presupuesto 2027']);
  await type('ana -reunión');
  check('-excluir', (await titles('note')).includes('Reunión con Ana'), false);

  // Notas protegidas: solo por el título
  await type('secreto');
  check('protegida por título', await titles('note'), ['Secreto bancario']);
  await type('clave banco');
  check('protegida no por contenido', await titles('note'), []);

  // Teclado: ↑↓ y Enter abren cada tipo
  await type('ana');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  check('↓ mueve', await p.evaluate(() => [gs.index, document.querySelector('#gs-list .gs-item.active').dataset.i, document.getElementById('gs-input').getAttribute('aria-activedescendant')]), [2, '2', 'gs-o2']);
  await p.keyboard.press('ArrowUp');
  check('↑ mueve', await p.evaluate(() => gs.index), 1);
  await p.keyboard.press('Enter');
  check('Enter abre nota', [await isOpen(), await cur()], [false, 'Anatomía']);
  const openBy = async (q, keys = 'Enter') => {
    await p.evaluate(() => openGlobalSearch());
    await type(q);
    await p.keyboard.press(keys); await p.waitForTimeout(80);
  };
  const tabs0 = await p.evaluate(() => ws.tabs.length);
  await openBy('n: reunion', 'Control+Enter');
  check('Ctrl+Enter: pestaña nueva', [await cur(), await p.evaluate(() => ws.tabs.length)], ['Reunión con Ana', tabs0 + 1]);
  await openBy('comprar pan');
  check('Enter abre tarea', await p.evaluate(() => [activeTab().view, editingId, !!document.querySelector('.view.active .task-edit')]), ['tasks', 't2', true]);
  await p.evaluate(() => stopEditing());
  await p.evaluate(() => openGlobalSearch());
  await type('mudanza');
  check('elige el mejor aunque su grupo vaya detrás', await p.evaluate(() => [gs.last.groups.map((g) => g.type), gs.rows[gs.index].p.type]), [['task', 'project'], 'project']);
  await p.keyboard.press('Escape');
  await openBy('mudanza');
  check('Enter abre proyecto', await p.evaluate(() => [activeTab().view, openProjectId]), ['projects', 'p1']);
  await openBy('recetas');
  check('Enter abre idea', await cur(), 'ideas');
  await openBy('h: leer');
  check('Enter abre hábito', await cur(), 'habits');
  await openBy('parque');
  check('Enter abre diario', [await cur(), await p.evaluate(() => expandedEntries.has('j1'))], ['journal', true]);
  await openBy('plan ana');
  check('Enter abre lienzo', [await cur(), await p.evaluate(() => cv.id)], ['canvas', 'c1']);
  await openBy('pomodoro');
  check('Enter abre sección', await cur(), 'timer');

  // Recientes: historial de navegación + notas y tareas cambiadas hace poco
  await p.evaluate(() => openGlobalSearch());
  const rec = await p.evaluate(() => gs.last.groups.map((g) => [g.label, g.items.map((e) => e.it.title)]));
  check('Recientes', rec[0][0], 'Recientes');
  check('Recientes: lo último visitado primero', rec[0][1].slice(0, 3), ['Lienzos', 'Diario', 'Hábitos']);
  check('Recientes: incluye notas y tareas', ['Anatomía', 'Reunión con Ana', 'Presupuesto 2027', 'Llamar a Ana'].every((t) => rec[0][1].includes(t)), true);

  // Acciones: menú con ⋯ o clic derecho
  await type('t: llamar');
  await p.click('#gs-list .gs-item', { button: 'right' });
  const acts = await p.evaluate(() => [...document.querySelectorAll('#note-menu .menu-item')].map((n) => n.textContent));
  check('acciones de tarea', acts.map((a) => a.replace(/Enter|Ctrl\+Enter/, '')).slice(0, 2), ['Abrir', 'Marcar hecha']);
  check('enlace tipado (60)', acts[2], 'Copiar enlace [[tarea:t1|Llamar a Ana]]');
  await p.click('#note-menu .menu-item:nth-child(2)');
  check('Marcar hecha', await p.evaluate(() => state.tasks.find((t) => t.id === 't1').done), true);
  check('sigue abierto y tachada', await p.evaluate(() => [!document.getElementById('gs').hidden, document.querySelector('#gs-list .gs-item').classList.contains('done')]), [true, true]);
  await type('n: reunion');
  await p.click('#gs-list .gs-item .gs-act', { force: true });
  check('acciones de nota', await p.evaluate(() => [...document.querySelectorAll('#note-menu .menu-item span:first-child')].map((n) => n.textContent)), ['Abrir', 'Abrir en pestaña nueva', 'Copiar enlace [[Reunión con Ana]]', 'Añadir a marcadores']);
  await p.click('#note-menu .menu-item:nth-child(4)');
  check('añadido a marcadores', await p.evaluate(() => !!bmFind('note', 'r')), true);
  await type('reunion');
  check('marcador en su grupo', (await groups()).includes('bookmark'), true);
  await p.keyboard.press('Escape');
  check('cerrado', await isOpen(), false);

  // Velocidad: 3.000 notas + 3.000 tareas
  const perf = await p.evaluate(() => {
    const words = ['casa', 'trabajo', 'proyecto', 'reunión', 'cliente', 'informe', 'viaje', 'compra', 'lectura', 'código', 'música', 'jardín'];
    const w = (i) => words[i % words.length];
    for (let i = 0; i < 3000; i++) {
      state.notes.push({ id: `pn${i}`, path: `Carpeta ${i % 30}/Nota ${w(i)} ${i}`, body: `# Nota ${i}\n\n${Array.from({ length: 12 }, (_, k) => `Línea ${k} sobre ${w(i + k)} y ${w(i * 7 + k)} con más texto de relleno para que pese.`).join('\n')}`, createdAt: Date.now() - i * 1e6, updatedAt: Date.now() - i * 1e6 });
      state.tasks.push({ id: `pt${i}`, title: `Tarea ${w(i + 3)} número ${i}`, done: i % 5 === 0, priority: 1 + (i % 3), due: null, projectId: null, tags: [w(i)], createdAt: Date.now() - i * 1e5 });
    }
    dataRev++;
    openGlobalSearch();
    const inp = document.getElementById('gs-input');
    const t0 = performance.now();
    inp.value = 'r'; gsRender();
    const cold = performance.now() - t0;
    const times = [];
    for (const q of ['re', 'reu', 'reun', 'reunio', 'reunion', 'informe cliente', 'c', 'co', 'cod', 'codigo', 't: viaje', 'tag:trabajo', 'zzz']) {
      const t = performance.now();
      inp.value = q; gsRender();
      times.push(performance.now() - t);
    }
    const groups = gs.last.groups.length;
    inp.value = 'nota'; gsRender();
    const capped = [gs.last.groups[0].total, gs.last.groups[0].items.length, document.querySelectorAll('#gs-list .gs-more').length];
    return { cold: Math.round(cold), max: Math.round(Math.max(...times)), avg: Math.round(times.reduce((a, b) => a + b) / times.length), groups, capped };
  });
  console.log(`tiempo 3000+3000: primera ${perf.cold} ms (índice), por tecla máx ${perf.max} ms, media ${perf.avg} ms`);
  check('por tecla < 150 ms', perf.max < 150, true);
  check('primera búsqueda < 600 ms', perf.cold < 600, true);
  check('máximo 50 por grupo y «Ver más»', perf.capped, [3000, 50, 1]);
  await p.click('#gs-list .gs-more');
  check('Ver más añade 50', await p.evaluate(() => gs.last.groups[0].items.length), 100);
  await p.keyboard.press('Escape');

  // Móvil: pantalla completa y botón en la barra
  const m = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  await m.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await m.route(/fonts\.g/, (r) => r.abort());
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errs.push(e.message));
  await mp.goto(url); await mp.waitForTimeout(800);
  check('botón móvil visible', await mp.isVisible('#gs-open-m'), true);
  check('botón de la barra de pestañas oculto en el móvil', await mp.isVisible('#gs-open'), false);
  await mp.tap('#gs-open-m');
  const box = await mp.evaluate(() => { const r = document.querySelector('#gs .gs').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  check('pantalla completa', box, [390, 800]);
  await mp.fill('#gs-input', 'ana'); await mp.waitForTimeout(120);
  await mp.tap('#gs-list .gs-item');
  check('toque abre', await mp.evaluate(() => [document.getElementById('gs').hidden, noteById(activeTab().id)?.path]), [true, 'Ana']);
  await mp.tap('#gs-open-m');
  await mp.tap('#gs .gs-close');
  check('✕ cierra', await mp.evaluate(() => document.getElementById('gs').hidden), true);

  console.log('errors:', errs); await b.close();
})();
