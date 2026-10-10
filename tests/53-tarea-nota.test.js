const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  const n = (id, path, body, at = now) => ({ id, path, body, createdAt: at, updatedAt: at });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [
      { id: 't1', title: 'Escribir informe', priority: 2, due: null, done: false, projectId: 'p1', createdAt: now, tags: [] },
      { id: 't2', title: 'Comprar papel', priority: 2, done: false, createdAt: now, tags: [] },
      { id: 't3', title: 'Reunión semanal', priority: 2, due: '2026-10-09', repeat: 'weekly', done: false, projectId: 'p1', createdAt: now, tags: [] },
      { id: 't4', title: 'Sin nota', priority: 2, done: false, createdAt: now, tags: [] },
    ],
    projects: [
      { id: 'p1', name: 'Lanzamiento', desc: '', status: 'active', deadline: null, color: 'indigo', manual: null, milestone: 0, noteId: 'np', createdAt: now },
      { id: 'p2', name: 'Otro', desc: '', status: 'active', deadline: null, color: 'blue', manual: null, milestone: 0, noteId: 'np2', createdAt: now },
    ],
    ideas: [], habits: [],
    settings: { notesWelcome: true },
    notes: [
      n('np', 'Proyectos/Lanzamiento', 'Nota del proyecto', now - 9000),
      n('np2', 'Proyectos/Otro', 'Otra nota de proyecto', now - 1000),
      n('dis', 'Proyectos/Lanzamiento/Diseño', 'Bocetos', now - 5000),
      n('men', 'Mención', 'Ver [[proyecto:p1|Lanz]]', now - 4000),
      n('mas', 'Con más', '- [ ] Llamar +Lanzamiento', now - 3500),
      n('prop', 'Prop', '---\nproyecto: Lanzamiento\n---\nTexto', now - 3000),
      n('prop2', 'Prop2', '---\nproyecto: "[[proyecto:p1|L]]"\n---\nTexto', now - 2000),
      n('aj', 'Ajena', '---\nproyecto: Otro\n---\nx', now - 100),
      n('ex', 'Existente', 'Texto suelto', now - 8000),
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const ev = (f, a) => p.evaluate(f, a);
  const check = (name, ok, got) => { console.log(`${ok ? 'ok' : 'FALLA'} ${name}:`, JSON.stringify(got)); if (!ok) errs.push(`falla: ${name}`); };
  const pick = async (text) => { await p.waitForSelector(`#note-menu .menu-item:has-text("${text}")`, { state: 'visible', timeout: 5000 }); await p.click(`#note-menu .menu-item:has-text("${text}")`); await p.clock.runFor(100); };
  const task = (id) => ev((id) => allTasks().find((t) => t.id === id) || null, id);
  const tasksView = async () => { await ev(() => { stopEditing(); showView('tasks'); }); await p.clock.runFor(100); };
  const row = (id) => `.view.active .task[data-id="${id}"]`;
  const readNote = async (id) => { await ev((id) => { setNoteMode(noteById(id), 'read'); openNote(noteById(id)); }, id); await p.clock.runFor(100); };

  // 1. Botón 📝: crea la nota (en «Tareas», con su frontmatter) y después la abre
  await tasksView();
  check('botón oculto sin ratón', (await p.$eval(`${row('t2')} .tn-btn`, (x) => getComputedStyle(x).opacity)) === '0', null);
  await p.hover(`${row('t2')} .title`); await p.clock.runFor(300);
  check('botón visible al pasar', (await p.$eval(`${row('t2')} .tn-btn`, (x) => getComputedStyle(x).opacity)) === '1', null);
  await p.click(`${row('t2')} .tn-btn`); await p.clock.runFor(200);
  let info = await ev(() => { const t = state.tasks.find((x) => x.id === 't2'); const nt = noteById(t.noteId); return { path: nt.path, body: nt.body, active: activeNote()?.id === nt.id, n: state.notes.length }; });
  check('nota creada en Tareas', info.path === 'Tareas/Comprar papel' && info.active, info.path);
  check('frontmatter', info.body.startsWith('---\ntarea: "[[tarea:t2|Comprar papel]]"\n---') && !/proyecto:/.test(info.body) && /## Notas/.test(info.body) && /## Próximos pasos/.test(info.body), info.body);
  await tasksView();
  check('botón lleno', await p.$eval(`${row('t2')} .tn-btn`, (x) => x.classList.contains('on') && getComputedStyle(x).opacity === '1'), null);
  await p.click(`${row('t2')} .tn-btn`); await p.clock.runFor(200);
  check('segundo clic abre la misma', await ev((n) => state.notes.length === n && activeNote()?.id === state.tasks.find((x) => x.id === 't2').noteId, info.n), null);

  // 2. Menú: «Crear nota para la tarea» con proyecto → carpeta del proyecto y `proyecto:`
  await tasksView();
  await p.click(`${row('t1')} .title`, { button: 'right', force: true });
  const labels = await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.textContent));
  check('menú sin nota', labels.includes('📝 Crear nota para la tarea') && labels.includes('🔗 Vincular una nota existente…') && !labels.some((l) => /Abrir la nota de la tarea/.test(l)), labels.filter((l) => /nota/i.test(l)));
  await pick('Crear nota para la tarea');
  info = await ev(() => { const nt = noteById(state.tasks.find((x) => x.id === 't1').noteId); return { path: nt.path, body: nt.body }; });
  check('carpeta del proyecto', info.path === 'Proyectos/Lanzamiento/Escribir informe', info.path);
  check('proyecto en frontmatter', /\ntarea: "\[\[tarea:t1\|Escribir informe\]\]"\nproyecto: "\[\[proyecto:p1\|Lanzamiento\]\]"\n/.test(info.body), info.body.split('\n').slice(0, 4));
  await tasksView();
  await p.click(`${row('t1')} .title`, { button: 'right', force: true });
  const labels2 = await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.textContent));
  check('menú con nota', labels2.includes('📝 Abrir la nota de la tarea') && labels2.includes('Desvincular la nota'), labels2.filter((l) => /nota/i.test(l)));
  await pick('Abrir la nota de la tarea');
  check('menú abre', await ev(() => activeNote()?.id === state.tasks.find((x) => x.id === 't1').noteId), null);
  // Duplicar no comparte la nota
  await ev(() => duplicateTask(state.tasks.find((x) => x.id === 't1')));
  check('duplicada sin nota', await ev(() => !state.tasks.at(-1).noteId && state.tasks.at(-1).title === 'Escribir informe'), null);
  await ev(() => (state.tasks.pop(), save()));

  // 3. Plantilla «Plantillas/Tarea» (desde la fila del formulario)
  await ev(() => { state.folders.push('Plantillas'); createNote({ folder: 'Plantillas', title: 'Tarea', body: '---\nestado: abierta\n---\n# {{título}}\n\n## Lista\n- [ ] ', open: false }); });
  await tasksView();
  await ev(() => startEditing('t3')); await p.clock.runFor(50);
  check('fila sin nota', /Sin nota/.test(await p.$eval('.view.active .task-edit .tn-row', (x) => x.textContent)), null);
  await p.click('.view.active .task-edit .tn-row button:has-text("+ Crear nota")'); await p.clock.runFor(200);
  info = await ev(() => { const nt = noteById(state.tasks.find((x) => x.id === 't3').noteId); return { path: nt.path, body: nt.body }; });
  check('plantilla', /^---\nestado: abierta\ntarea: "\[\[tarea:t3\|Reunión semanal\]\]"\nproyecto: "\[\[proyecto:p1\|Lanzamiento\]\]"\n---\n# Reunión semanal\n/.test(info.body) && info.path === 'Proyectos/Lanzamiento/Reunión semanal', info);

  // 4. Fila del formulario: Cambiar… y Desvincular (con Deshacer)
  await tasksView();
  await ev(() => startEditing('t2')); await p.clock.runFor(50);
  check('fila con nota', await p.$eval('.view.active .task-edit .tn-row', (x) => /Comprar papel/.test(x.textContent) && /Abrir/.test(x.textContent) && /Cambiar/.test(x.textContent) && /Desvincular/.test(x.textContent)), null);
  await p.click('.view.active .task-edit .tn-row button:has-text("Cambiar")'); await p.clock.runFor(50);
  await p.fill('#picker-input', 'Existente'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  info = await ev(() => ({ id: state.tasks.find((x) => x.id === 't2').noteId, body: noteById('ex').body }));
  check('cambiar', info.id === 'ex' && info.body.startsWith('---\ntarea: "[[tarea:t2|Comprar papel]]"\n---\nTexto suelto'), info);
  await p.click('.view.active .task-edit .tn-row button:has-text("Desvincular")'); await p.clock.runFor(50);
  check('desvincular', !(await task('t2')).noteId, null);
  await p.click('#toast .toast-action'); await p.clock.runFor(50);
  check('deshacer', (await task('t2')).noteId === 'ex', null);
  await p.clock.runFor(2000);
  check('se guarda (sincroniza)', await ev(() => JSON.parse(localStorage.getItem('enfoque:v1')).tasks.find((t) => t.id === 't2').noteId === 'ex'), null);

  // 5. Cabecera en la lectura, con casilla para completar
  const n1 = (await task('t1')).noteId;
  await readNote(n1);
  check('cabecera', await p.$eval('#note-reading > .tn-chip:first-child', (x) => x.textContent), null);
  await p.click('#note-reading .tn-chip input'); await p.clock.runFor(100);
  check('completar desde la nota', (await task('t1')).done && await p.$eval('#note-reading .tn-chip', (x) => x.classList.contains('done') && /Hecha/.test(x.textContent)), null);
  await p.click('#note-reading .tn-chip .tn-chip-name'); await p.clock.runFor(100);
  check('abre la tarea', await ev(() => editingId === 't1'), null);
  await ev(() => toggleDone(state.tasks.find((x) => x.id === 't1'), false));

  // 6. Relacionado en ambos sentidos
  check('relacionado', await ev((id) => [relatedOf('task', 't1').noteOut.some((x) => x.id === id), relatedOf('note', id).task.some((x) => x.id === 't1'), relatedOf('note', 'ex').task.some((x) => x.id === 't2')], n1).then((r) => r.every(Boolean)), null);
  await readNote(n1);
  check('panel de la nota', !!(await p.$('#rp-backlinks .rel-row[data-rel-id="t1"]')), null);
  await ev(() => startEditing('t1')); await p.clock.runFor(50);
  check('panel de la tarea', await p.$$eval('.view.active .task-edit .rel-block .rel-row.r-note .rel-name', (x) => x.map((y) => y.textContent).join('|')).then((s) => /Escribir informe/.test(s)), null);

  // 7. Nota a la papelera: la tarea la ve borrada y la recupera con el mismo id
  await ev((id) => deleteNote(noteById(id)), n1); await p.clock.runFor(100);
  await tasksView();
  check('nota borrada', (await task('t1')).noteId === n1 && await p.$eval(`${row('t1')} .tn-btn`, (x) => x.classList.contains('missing')), null);
  await ev(() => startEditing('t1')); await p.clock.runFor(50);
  check('fila borrada', await p.$eval('.view.active .task-edit .tn-row', (x) => /Escribir informe/.test(x.querySelector('s')?.textContent) && /Recuperar/.test(x.textContent) && /Crear otra/.test(x.textContent)), null);
  await tasksView();
  await p.click(`${row('t1')} .tn-btn`); await pick('Recuperar la nota de la papelera');
  check('restaurada', await ev((id) => !!noteById(id) && activeNote()?.id === id && !trashList().length, n1), null);
  await tasksView();
  check('botón otra vez lleno', await p.$eval(`${row('t1')} .tn-btn`, (x) => x.classList.contains('on')), null);

  // 8. Tarea borrada: la nota se queda y su cabecera lo dice
  await ev(() => deleteTask(state.tasks.find((x) => x.id === 't2'))); await p.clock.runFor(50);
  await readNote('ex');
  check('tarea borrada', await p.$eval('#note-reading .tn-chip', (x) => x.classList.contains('gone') && /Comprar papel/.test(x.textContent) && /tarea borrada/.test(x.textContent)), null);

  // 9. Tarea que se repite: la siguiente vez conserva la misma nota
  const n3 = (await task('t3')).noteId;
  await readNote(n3);
  await p.click('#note-reading .tn-chip input'); await p.clock.runFor(100);
  info = await task('t3');
  check('repetición conserva la nota', info.noteId === n3 && !info.done && info.due === '2026-10-16', [info.noteId === n3, info.due]);
  check('cabecera de la repetición', await p.$eval('#note-reading .tn-chip', (x) => !x.classList.contains('done') && /Reunión semanal/.test(x.textContent) && /Cada semana/.test(x.textContent)), null);

  // 10. Proyecto: todas sus notas, sin repetir, por fecha
  await ev(() => openProject('p1')); await p.clock.runFor(100);
  const rows = async () => p.$$eval('#pd-notes .pn-row', (n) => n.map((x) => `${x.querySelector('.rel-name span:last-child').textContent}=${x.querySelector('.pn-why').textContent}`));
  let got = await rows();
  const names = got.map((x) => x.split('=')[0]);
  check('fuentes', ['Lanzamiento', 'Escribir informe', 'Reunión semanal', 'Diseño', 'Mención', 'Con más', 'Prop', 'Prop2'].every((x) => names.includes(x)) && !names.some((x) => ['Otro', 'Ajena', 'Tarea', 'Existente'].includes(x)) && new Set(names).size === names.length, got);
  check('motivos', got.includes('Lanzamiento=Principal · Enlace') && got.some((x) => /^Escribir informe=Tarea · Carpeta · Enlace · Propiedad$/.test(x)) && got.includes('Prop=Propiedad') && got.includes('Prop2=Enlace · Propiedad') && got.includes('Diseño=Carpeta'), got);
  check('orden por fecha', await ev(() => { const at = [...document.querySelectorAll('#pd-notes .pn-row')].map((r) => noteById(r.dataset.relId).updatedAt); return at.every((v, i) => !i || at[i - 1] >= v); }), null);
  check('carpeta y fecha', await p.$eval('#pd-notes .pn-row[data-rel-id="dis"]', (x) => [...x.querySelectorAll('.rel-meta')].map((y) => y.textContent)), null);
  await p.click('#pd-notes .pn-row[data-rel-id="dis"] .rel-name'); await p.clock.runFor(100);
  check('abre la nota', await ev(() => activeNote()?.id === 'dis'), null);

  // 11. «+ Nueva nota del proyecto»
  await ev(() => openProject('p1')); await p.clock.runFor(100);
  await p.click('#pd-notes .pn-new'); await p.clock.runFor(200);
  info = await ev(() => { const nt = activeNote(); return { path: nt.path, body: nt.body }; });
  check('nueva nota del proyecto', info.path === 'Proyectos/Lanzamiento/Sin título' && info.body.startsWith('---\nproyecto: "[[proyecto:p1|Lanzamiento]]"\n---'), info);
  await ev(() => { flushNoteSave(); openProject('p1'); }); await p.clock.runFor(100);
  got = await rows();
  check('aparece en la lista', got.some((x) => x.startsWith('Sin título=')), got.length);
  // Otro proyecto: sus notas no se mezclan
  await ev(() => openProject('p2')); await p.clock.runFor(100);
  check('otro proyecto', (await rows()).map((x) => x.split('=')[0]).sort(), null);

  console.log('errors:', errs); await b.close();
})();
