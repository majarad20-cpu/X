const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const DAY = 864e5;
const now = new Date('2026-10-09T10:00:00').getTime();
const task = (id, title, extra) => ({ id, title, priority: 2, done: false, createdAt: now - 30 * DAY, tags: [], subtasks: [], ...extra });
// Almacén simulado (como en 08): una colección de documentos con onSnapshot.
const mock = (initial) => {
  const docs = new Map(Object.entries(initial || {}));
  let listener = null;
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
  window.__docs = docs;
  window.__emit = () => listener && listener(snap());
  const col = {
    doc: (id) => ({ async set(d) { docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; },
  };
  // Solo los datos del usuario van a este almacén (las listas compartidas tienen el suyo, mudo).
  const other = { doc: () => ({ async set() {}, async delete() {} }), onSnapshot: () => () => {} };
  window.claude = { use: async (n) => (n === 'db' ? { collection: (path) => (/^data\//.test(path) ? col : other) } : n === 'user' ? { id: async () => 'u_x' } : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(ok ? '✓' : '✗', name, JSON.stringify(got));
    if (!ok) errs.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  };
  const page = async (c) => {
    await c.route(/fonts\.g/, (r) => r.abort());
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    return p;
  };

  // ---------- 1. Tareas hechas: archivar, restaurar, eliminar ----------
  {
    const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
      tasks: [task('a', 'Hecha reciente', { done: true, completedAt: now - 2 * DAY }), task('b', 'Otra hecha', { done: true, completedAt: now - 3 * DAY }), task('p', 'Pendiente')],
      archive: [task('z', 'Archivada vieja', { done: true, completedAt: now - 20 * DAY })],
      habits: [], settings: { notesWelcome: true },
      notes: [{ id: 'n', path: 'Lista', body: '- [x] Línea hecha ✅ 2026-10-08\n- [ ] Abierta', createdAt: now, updatedAt: now }],
      updatedAt: 1,
    });
    const p = await page(c);
    await p.clock.install({ time: new Date(now) });
    await p.goto(url); await p.clock.runFor(800);
    const ids = () => p.evaluate(() => ({ tasks: state.tasks.map((t) => t.id).sort().join(''), archive: state.archive.map((t) => t.id).sort().join('') }));
    const titles = () => p.$$eval('#task-list .task .title', (n) => n.map((x) => x.textContent));
    const menu = () => p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.querySelector('span').textContent));
    const pick = async (text) => { await p.click(`#note-menu .menu-item:has-text("${text}")`); await p.clock.runFor(100); };
    await p.evaluate(() => showView('tasks'));
    check('botones en hecha', await p.$$eval('#task-list .task[data-id="a"] .done-act', (n) => n.map((x) => x.textContent)), ['🗄 Archivar', '🗑 Eliminar']);
    check('pendiente sin botones', await p.$$eval('#task-list .task[data-id="p"] .done-act', (n) => n.length), 0);
    check('barra en la lista', await p.$$eval('#done-bar button', (n) => n.map((x) => x.textContent)), ['🗄 Archivar todas las hechas (2)', 'Eliminar las hechas…']);
    await p.hover('#task-list .task[data-id="a"]');
    await p.click('#task-list .task[data-id="a"] .done-act:has-text("Archivar")');
    check('archivar ya', await ids(), { tasks: 'bp', archive: 'az' });
    check('aviso', await p.textContent('#toast span'), 'Tarea archivada');
    // Hechas: filtro Todas / Sin archivar / Archivadas
    await p.click('[data-filter=done]');
    check('filtro', await p.$$eval('#done-bar [data-done-scope]', (n) => n.map((x) => x.textContent)), ['Todas', 'Sin archivar', 'Archivadas']);
    check('hechas todas', (await titles()).sort(), ['Archivada vieja', 'Hecha reciente', 'Línea hecha', 'Otra hecha']);
    await p.click('[data-done-scope=archived]');
    check('archivadas', (await titles()).sort(), ['Archivada vieja', 'Hecha reciente']);
    check('botones archivada', await p.$$eval('#task-list .task[data-id="a"] .done-act', (n) => n.map((x) => x.textContent)), ['↩ Restaurar', '🗑 Eliminar']);
    await p.click('#task-list .task[data-id="a"] .done-act:has-text("Restaurar")');
    check('restaurar', [await ids(), await p.evaluate(() => state.tasks.find((t) => t.id === 'a').done)], [{ tasks: 'abp', archive: 'z' }, true]);
    await p.click('[data-done-scope=active]');
    check('sin archivar', (await titles()).sort(), ['Hecha reciente', 'Línea hecha', 'Otra hecha']);
    // Clic derecho
    await p.click('#task-list .task[data-id="b"] .title', { button: 'right' });
    check('menú hecha', (await menu()).filter((x) => /Archivar|Restaurar|Eliminar/.test(x)), ['🗄 Archivar', 'Eliminar']);
    await pick('🗄 Archivar');
    check('menú archivar', await ids(), { tasks: 'ap', archive: 'bz' });
    await p.click('[data-done-scope=archived]');
    await p.click('#task-list .task[data-id="z"] .title', { button: 'right' });
    check('menú archivada', (await menu()).filter((x) => /Archivar|Restaurar|Eliminar/.test(x)), ['↩ Restaurar a la lista', 'Eliminar']);
    await pick('Eliminar');
    check('menú eliminar', await ids(), { tasks: 'ap', archive: 'b' });
    await p.click('.toast-action');
    check('deshacer eliminar', await ids(), { tasks: 'ap', archive: 'bz' });
    await p.click('#task-list .task[data-id="z"] .title', { button: 'right' });
    await pick('Restaurar a la lista');
    check('menú restaurar', await ids(), { tasks: 'apz', archive: 'b' });
    // Tarea hecha de una nota: quitar la línea (con deshacer)
    await p.click('[data-done-scope=all]');
    await p.click('#task-list .task.from-note .title', { button: 'right' });
    check('menú línea', (await menu()).filter((x) => /Eliminar/.test(x)), ['🗑 Eliminar la línea']);
    await pick('Eliminar la línea');
    check('línea borrada', await p.evaluate(() => noteById('n').body), '- [ ] Abierta');
    await p.click('.toast-action');
    check('línea vuelve', await p.evaluate(() => noteById('n').body), '- [x] Línea hecha ✅ 2026-10-08\n- [ ] Abierta');
    // En bloque: eliminar pide confirmación (aviso propio) y se puede deshacer
    check('barra hechas', await p.$$eval('#done-bar > button', (n) => n.map((x) => x.textContent)), ['🗄 Archivar todas las hechas (2)', 'Eliminar las hechas…']);
    await p.click('#done-bar .done-bulk-delete');
    check('confirmar', [await p.isVisible('#pomo-alert'), await p.textContent('#pomo-alert .pomo-alert-text')], [true, '¿Eliminar 3 tareas hechas? Podrás deshacerlo unos segundos.']);
    await p.click('#pomo-alert button:has-text("Cancelar")');
    check('cancelar', await ids(), { tasks: 'apz', archive: 'b' });
    await p.click('#done-bar .done-bulk-delete');
    await p.click('#pomo-alert button:has-text("Eliminar")');
    check('eliminar hechas', [await ids(), await p.evaluate(() => noteById('n').body.includes('Línea hecha'))], [{ tasks: 'p', archive: '' }, true]);
    await p.click('.toast-action');
    check('deshacer en bloque', await ids(), { tasks: 'apz', archive: 'b' });
    await p.click('#done-bar .done-bulk-archive');
    check('archivar todas', await ids(), { tasks: 'p', archive: 'abz' });
    // Lista «Todas» sin hechas: sin barra
    await p.click('[data-filter=all]');
    check('sin barra', await p.isVisible('#done-bar'), false);
    // Ajuste: archivar al momento / nunca / 7 días
    await p.evaluate(() => document.getElementById('open-settings').click());
    check('ajuste por defecto', await p.inputValue('#set-archive-days'), '7');
    await p.selectOption('#set-archive-days', '0');
    await p.evaluate(() => showView('tasks'));
    await p.click('#task-list .task[data-id="p"] input[type=checkbox]');
    check('al momento', await ids(), { tasks: '', archive: 'abpz' });
    await p.click('[data-filter=done]'); await p.click('[data-done-scope=archived]');
    await p.click('#task-list .task[data-id="p"] .done-act:has-text("Restaurar")');
    check('restaurada no vuelve al archivo', await ids(), { tasks: 'p', archive: 'abz' });
    await p.evaluate(() => document.getElementById('open-settings').click());
    await p.selectOption('#set-archive-days', '-1');
    await p.evaluate(() => { addTask('Vieja hecha', { raw: true }); const t = state.tasks.at(-1); t.id = 'v'; t.done = true; t.completedAt = Date.now() - 100 * 864e5; archiveOldTasks(); });
    check('nunca', (await ids()).tasks, 'pv');
    await p.selectOption('#set-archive-days', '7');
    check('7 días', (await ids()).tasks, 'p');
    check('ajuste guardado', await p.evaluate(() => state.settings.archiveDays), 7);
    await c.close();
  }

  // ---------- 2. Sincronización: una archivada y luego borrada no vuelve ----------
  {
    const t0 = Date.now();
    const open = async (local, remote) => {
      const c = await b.newContext();
      if (local) await c.addInitScript((l) => localStorage.setItem('enfoque:v1', JSON.stringify(l)), local);
      await c.addInitScript(mock, remote);
      const p = await page(c);
      await p.goto(url); await p.waitForTimeout(1200);
      return p;
    };
    const dump = (p) => p.evaluate(() => JSON.parse(JSON.stringify(Object.fromEntries([...window.__docs]))));
    const A = await open({ tasks: [task('x', 'Archivar y borrar', { done: true, completedAt: t0 - 3600e3 }), task('y', 'Sigue')], habits: [], settings: { notesWelcome: true }, updatedAt: 1 }, {});
    const M = await A.evaluate(() => `archive-${archiveMonth(state.tasks.find((t) => t.id === 'x'))}`);
    await A.evaluate(() => showView('tasks'));
    await A.click('#task-list .task[data-id="x"] .done-act:has-text("Archivar")'); await A.waitForTimeout(1500);
    const cloud1 = await dump(A);
    check('nube archivada', [cloud1[M].items.map((t) => t.id), cloud1.state.tasks.map((t) => t.id)], [['x'], ['y']]);
    await A.click('[data-filter=done]');
    await A.click('#task-list .task[data-id="x"] .done-act:has-text("Eliminar")'); await A.waitForTimeout(1500);
    const cloud2 = await dump(A);
    check('nube tras borrar', [cloud2[M].items.length, cloud2[M].gone], [0, ['x']]);

    // B tenía la archivada y, sin enterarse del borrado, archiva otra del mismo mes (su copia es más reciente).
    const B = await open({ tasks: [task('w', 'De B', { done: true, completedAt: t0 - 1800e3 })], habits: [], settings: { notesWelcome: true }, updatedAt: 1 }, cloud1);
    check('B recibe', await B.evaluate(() => state.archive.map((t) => t.id)), ['x']);
    await B.evaluate(([m, doc]) => { archiveTasks(state.tasks.filter((t) => t.id === 'w')); window.__docs.set(m, doc); window.__emit(); }, [M, cloud2[M]]);
    await B.waitForTimeout(1500);
    const cloudB = await dump(B);
    check('B no la devuelve', [await B.evaluate(() => allTasks().some((t) => t.id === 'x')), cloudB[M].items.map((t) => t.id), cloudB[M].gone], [false, ['w'], ['x']]);

    // A recibe una copia vieja (con la borrada) más reciente que la suya: se queda fuera y A vuelve a subir.
    const stale = { items: [...cloud1[M].items, ...cloudB[M].items], updatedAt: Date.now() + 5000 };
    await A.evaluate(([m, doc]) => { window.__docs.set(m, doc); window.__emit(); }, [M, stale]);
    await A.waitForTimeout(1500);
    const cloudA = await dump(A);
    check('A no la devuelve', [await A.evaluate(() => state.archive.map((t) => t.id)), cloudA[M].items.map((t) => t.id), cloudA[M].gone], [['w'], ['w'], ['x']]);
    // Restaurar no es borrar: vuelve a la lista en el otro dispositivo.
    await A.evaluate(() => restoreTask(state.archive.find((t) => t.id === 'w'))); await A.waitForTimeout(1500);
    const cloudR = await dump(A);
    await B.evaluate((d) => { window.__docs.clear(); Object.entries(d).forEach(([k, v]) => window.__docs.set(k, v)); window.__emit(); }, cloudR);
    await B.waitForTimeout(300);
    check('restaurar llega', [await B.evaluate(() => state.tasks.map((t) => t.id).sort()), await B.evaluate(() => state.archive.length), cloudR[M].gone], [['w', 'y'], 0, ['x']]);
    await A.context().close(); await B.context().close();
  }

  // ---------- 3. Deshacer / rehacer en el editor ----------
  {
    const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
      tasks: [], habits: [], settings: { notesWelcome: true },
      notes: [
        { id: 'e', path: 'Escribir', body: 'Hola', createdAt: now, updatedAt: now },
        { id: 'k', path: 'Bloques', body: 'Uno\n\nDos\n\nTres', createdAt: now, updatedAt: now },
        { id: 's', path: 'Secreta', body: 'Secreto', createdAt: now, updatedAt: now },
      ],
      updatedAt: 1,
    });
    const p = await page(c);
    await p.goto(url); await p.waitForTimeout(800);
    const body = (id = 'e') => p.evaluate((id) => noteText(noteById(id)), id);
    const ta = () => p.evaluate(() => { const t = document.getElementById('note-editor'); return [t.value, t.selectionStart]; });
    const btns = () => p.evaluate(() => [!$('#note-undo-group').hidden, !$('#note-undo').disabled, !$('#note-redo').disabled]);
    await p.evaluate(() => openNote(noteById('e')));
    await p.evaluate(() => setNoteMode(noteById('e'), 'read'));
    check('botones ocultos al leer', (await btns())[0], false);
    await p.evaluate(() => setNoteMode(noteById('e'), 'edit'));
    check('botones al editar', await btns(), [true, false, false]);
    check('atajos en el título', [await p.getAttribute('#note-undo', 'title'), await p.getAttribute('#note-redo', 'title')], ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Mayús+Z o Ctrl+Y)']);
    await p.focus('#note-editor'); await p.press('#note-editor', 'Control+End');
    await p.keyboard.type(' uno dos'); await p.waitForTimeout(700);
    check('escrito', [await body(), await btns()], ['Hola uno dos', [true, true, false]]);
    await p.click('#note-undo');
    check('botón deshacer', [await body(), await ta()], ['Hola uno', ['Hola uno', 8]]);
    await p.click('#note-undo');
    check('otra vez', await body(), 'Hola');
    await p.click('#note-redo');
    check('botón rehacer', [await body(), await btns()], ['Hola uno', [true, true, true]]);
    await p.keyboard.press('Control+y');
    check('Ctrl+Y', await body(), 'Hola uno dos');
    await p.keyboard.press('Control+z');
    check('Ctrl+Z', await body(), 'Hola uno');
    await p.keyboard.press('Control+Shift+z');
    check('Ctrl+Mayús+Z', [await body(), (await btns())[2]], ['Hola uno dos', false]);
    await p.waitForTimeout(600);
    check('guardado', await p.evaluate(() => (flushLocal(), JSON.parse(localStorage.getItem('enfoque:v1')).notes.find((n) => n.id === 'e').body)), 'Hola uno dos');
    // Comando «/»: un paso propio
    await p.keyboard.type('\n/cita'); await p.waitForTimeout(100);
    await p.keyboard.press('Enter'); await p.waitForTimeout(100);
    check('slash', await body(), 'Hola uno dos\n> ');
    await p.keyboard.press('Control+z');
    check('deshacer slash', await body(), 'Hola uno dos\n/cita');
    await p.keyboard.press('Control+z');
    check('antes del slash', await body(), 'Hola uno dos');
    // Formato (editorInsert): Ctrl+B y la barra
    await p.evaluate(() => { const t = $('#note-editor'); t.setSelectionRange(5, 8); });
    await p.keyboard.press('Control+b');
    check('negrita', await body(), 'Hola **uno** dos');
    await p.keyboard.press('Control+z');
    check('deshacer negrita', await body(), 'Hola uno dos');
    await p.evaluate(() => { const t = $('#note-editor'); t.focus(); t.setSelectionRange(9, 12); showFmtBar(); });
    await p.click('#fmt-bar .fb-i');
    check('barra cursiva', await body(), 'Hola uno *dos*');
    await p.click('#note-undo');
    check('deshacer barra', await body(), 'Hola uno dos');
    // Fecha relativa que se fija al salir del editor
    await p.press('#note-editor', 'Control+End');
    await p.keyboard.type('\n- [ ] Llamar 📅 mañana');
    await p.evaluate(() => document.getElementById('note-editor').blur()); await p.waitForTimeout(100);
    const tomorrow = await p.evaluate(() => dateKey(addDays(new Date(), 1)));
    check('fecha fijada', (await body()).split('\n').pop(), `- [ ] Llamar 📅 ${tomorrow}`);
    await p.focus('#note-editor');
    await p.keyboard.press('Control+z');
    check('deshacer fecha fijada', [(await body()).split('\n').pop(), await p.inputValue('#note-editor') === await body()], ['- [ ] Llamar 📅 mañana', true]);
    await p.keyboard.press('Control+Shift+z');
    check('rehacer fecha fijada', (await body()).split('\n').pop(), `- [ ] Llamar 📅 ${tomorrow}`);
    // Clic derecho en el editor y paleta
    await p.click('#note-editor', { button: 'right' });
    const ctx = await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.querySelector('span').textContent));
    check('menú editor', ctx.filter((x) => /Deshacer|Rehacer|versiones/.test(x)), ['↶ Deshacer cambio', '↷ Rehacer', '🕘 Ver versiones anteriores…']);
    await p.click('#note-menu .menu-item:has-text("Deshacer cambio")');
    check('menú deshacer', (await body()).split('\n').pop(), '- [ ] Llamar 📅 mañana');
    check('paleta', await p.evaluate(() => commands().map((x) => x.label).filter((l) => /cambio en la nota/.test(l))), ['Deshacer cambio en la nota', 'Rehacer cambio en la nota']);
    await p.click('#note-versions'); await p.waitForTimeout(200);
    check('versiones', await p.evaluate(() => !document.getElementById('history-modal')?.hidden), true);
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);

    // Edición por bloques: el historial va sobre la nota entera
    await p.evaluate(() => { openNote(noteById('k')); setNoteMode(noteById('k'), 'edit'); });
    await p.focus('#note-editor'); await p.press('#note-editor', 'Control+End');
    await p.keyboard.type('\n\nCuatro'); await p.waitForTimeout(700);
    await p.evaluate(() => setNoteMode(noteById('k'), 'read')); await p.waitForTimeout(100);
    await p.dblclick('#note-reading p:has-text("Dos")'); await p.waitForTimeout(150);
    check('bloque abierto', [await p.evaluate(() => !!blockEdit), await btns()], [true, [true, true, false]]);
    await p.keyboard.press('End'); await p.keyboard.type(' más');
    check('bloque escrito', await body('k'), 'Uno\n\nDos más\n\nTres\n\nCuatro');
    await p.click('#note-undo');
    check('deshacer en el bloque', [await body('k'), await p.evaluate(() => [!!blockEdit, $('#note-editor').value])], ['Uno\n\nDos\n\nTres\n\nCuatro', [true, 'Dos']]);
    await p.keyboard.press('Control+Shift+z');
    check('rehacer en el bloque', [await body('k'), await p.inputValue('#note-editor')], ['Uno\n\nDos más\n\nTres\n\nCuatro', 'Dos más']);
    await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
    check('fuera del bloque', [await body('k'), await p.evaluate(() => !!blockEdit), await p.$$eval('#note-reading p', (n) => n.map((x) => x.textContent))], ['Uno\n\nDos\n\nTres', false, ['Uno', 'Dos', 'Tres']]);
    await p.dblclick('#note-reading p:has-text("Tres")'); await p.waitForTimeout(150);
    await p.keyboard.press('End'); await p.keyboard.type('!'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    check('bloque sin duplicar', await body('k'), 'Uno\n\nDos\n\nTres!');

    // Nota protegida desbloqueada: el texto vive en memoria y se vuelve a cifrar
    await p.evaluate(async () => { await protectNote(noteById('s'), 'clave123'); openNote(noteById('s')); setNoteMode(noteById('s'), 'edit'); });
    await p.waitForTimeout(200);
    const ct0 = await p.evaluate(() => noteById('s').enc.ct);
    await p.focus('#note-editor'); await p.press('#note-editor', 'Control+End');
    await p.keyboard.type(' nuevo'); await p.waitForTimeout(700);
    check('protegida escrita', [await body('s'), await p.evaluate(() => noteById('s').body)], ['Secreto nuevo', '🔒 Nota protegida con contraseña.']);
    await p.keyboard.press('Control+z'); await p.waitForTimeout(700);
    const ct1 = await p.evaluate(() => noteById('s').enc.ct);
    check('protegida deshecha', [await body('s'), await p.evaluate(() => noteById('s').body), ct1 !== ct0], ['Secreto', '🔒 Nota protegida con contraseña.', true]);
    await p.evaluate(() => lockAll()); await p.waitForTimeout(100);
    check('al bloquear se olvida', [await p.evaluate(() => noteHist.has('s')), (await btns())[0]], [false, false]);
    await c.close();
  }

  console.log('errors:', errs); await b.close();
})();
