const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const S = process.argv[3];
const now = Date.now();
const notes = [
  { id: 'a', path: 'Proyectos/Alfa', body: '# Alfa\n\nVer [[Beta]] y **más**.', createdAt: now - 9e6, updatedAt: now - 9e6 },
  { id: 'b', path: 'Beta', body: 'Texto de **Beta**', createdAt: now - 8e6, updatedAt: now - 8e6 },
  { id: 'c', path: 'Carpeta/Sub/Gamma', body: 'Gamma', createdAt: now - 7e6, updatedAt: now - 7e6 },
  { id: 'd', path: 'Carpeta/Delta', body: 'Delta', createdAt: now - 6e6, updatedAt: now - 6e6 },
  { id: 'e', path: 'Secreta', body: '🔒 Nota protegida con contraseña.', enc: { v: 1, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y3Q=' }, createdAt: now - 5e6, updatedAt: now - 5e6 },
  { id: 'f', path: 'Fusionar', body: 'Para fusionar', createdAt: now - 4e6, updatedAt: now - 4e6 },
];
// Almacén simulado (como en 08 y 12): cada dispositivo tiene su copia de la nube.
const mock = (initial) => {
  const docs = new Map(Object.entries(initial || {}));
  let listener = null;
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
  window.__docs = docs;
  window.__emit = () => listener && listener(snap());
  const col = { doc: (id) => ({ async set(d) { docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; } };
  // Las listas compartidas (37) usan otra colección: no deben quedarse con el listener.
  const other = { onSnapshot() { return () => {}; }, doc: () => ({ async set() {}, async delete() {} }) };
  window.claude = { use: async (n) => n === 'db' ? { collection: (path) => (path.startsWith('data/') ? col : other) } : n === 'user' ? { id: async () => 'u' } : null };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const open = async (local, remote, sync = false) => {
    const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
    if (local) await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, local);
    if (sync) await c.addInitScript(mock, remote);
    await c.route(/fonts\.g/, r => r.abort());
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await p.goto(url); await p.waitForTimeout(sync ? 1200 : 500);
    return p;
  };
  const base = { tasks: [], habits: [], projects: [{ id: 'p1', name: 'Casa', status: 'active', color: 'teal', createdAt: now }], settings: { notesWelcome: true, bookmarks: [{ id: 'bm', type: 'note', ref: 'b' }] }, notes, folders: ['Carpeta'], updatedAt: 1 };
  const p = await open(base);
  const ev = (f, a) => p.evaluate(f, a);

  // ---- Papelera ----
  await ev(() => deleteNote(noteById('b')));
  console.log('trash after delete:', await ev(() => [state.trash.map(t => [t.id, t.from]), !!noteById('b'), noteById('a').body.includes('[[Beta]]')]), '| toast:', await p.textContent('#toast span'));
  await p.click('#toast .toast-action');
  console.log('undo:', await ev(() => [!!noteById('b'), state.trash.length]));

  await ev(() => deleteNote(noteById('b')));
  await ev(() => showView('trash'));
  console.log('trash rows:', await p.$$eval('#view-trash .trash-name', n => n.map(x => x.textContent)), '| preview:', await p.innerHTML('#view-trash .trash-preview-body'), '| entry count:', await p.textContent('#trash-entry .tree-count'));
  await p.click('#view-trash .trash-row:has-text("Beta") button:has-text("Restaurar")');
  console.log('restored:', await ev(() => [noteById('b')?.path, findNoteByName('Beta')?.id, bmLabel(state.settings.bookmarks[0]), bmMissing(state.settings.bookmarks[0]), state.trash.length]));

  // Carpeta entera: va a la papelera y al restaurar se crea de nuevo.
  await ev(() => deleteFolder('Carpeta'));
  console.log('folder trashed:', await ev(() => [state.trash.map(t => t.from).sort(), allFolders().filter(f => f.startsWith('Carpeta'))]));
  await ev(() => restoreFromTrash('c'));
  console.log('folder restored:', await ev(() => [noteById('c')?.path, allFolders().filter(f => f.startsWith('Carpeta'))]));
  await ev(() => createNote({ folder: 'Carpeta', title: 'Delta', open: false }));
  await ev(() => restoreFromTrash('d'));
  console.log('path taken:', await ev(() => [noteById('d')?.path, state.trash.length]));

  // Protegida: sigue cifrada en la papelera.
  await ev(() => deleteNote(noteById('e')));
  console.log('enc in trash:', await ev(() => [!!state.trash[0].note.enc, state.trash[0].note.body]));
  await ev(() => showView('trash'));
  console.log('enc preview:', await p.textContent('#view-trash .trash-preview-body'));
  // Clic derecho sobre una fila.
  await p.click('#view-trash .trash-row', { button: 'right' });
  console.log('ctx menu:', await p.$$eval('#note-menu .menu-item span', n => n.map(x => x.textContent)));
  await p.click('#note-menu .menu-item:has-text("Eliminar definitivamente")');
  console.log('forever:', await ev(() => [state.trash.length, !!noteById('e')]));
  await p.click('#toast .toast-action');
  console.log('forever undo:', await ev(() => state.trash.length));

  // Fusionar: la nota que desaparece va a la papelera.
  await ev(() => mergeNotes(noteById('a'), noteById('f')));
  console.log('merge trash:', await ev(() => state.trash.map(t => t.id).sort()));
  await ev(() => showView('trash'));
  await p.click('#view-trash button:has-text("Vaciar papelera")');
  console.log('emptied:', await ev(() => state.trash.length), '| empty text:', await p.textContent('#view-trash .empty'));
  // Caducidad: lo que lleva más de 30 días se borra.
  await ev(() => { deleteNote(noteById('d')); deleteNote(noteById('c')); state.trash.find(t => t.id === 'd').deletedAt = Date.now() - 31 * 864e5; renderAll(); });
  console.log('expired:', await ev(() => state.trash.map(t => t.id)));
  // Copia de seguridad: imágenes de las notas en la papelera.
  console.log('backup keeps trash files:', await ev(async () => { await putFile({ id: 'img1', type: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' }); state.trash[0].note.body += '\n![x](img:img1)'; return (await backupFiles()).map(f => f.id); }));
  await p.screenshot({ path: S + '/papelera.png' });

  // ---- Captura rápida ----
  await ev(() => showView('today'));
  console.log('fab visible:', await p.isVisible('#capture-fab'));
  await p.click('#capture-fab');
  console.log('modal:', await p.isVisible('#capture'), '| default kind:', await p.textContent('#capture .capture-kinds .chip.active'));
  await p.keyboard.type('Llamar a Ana mañana !alta');
  await p.keyboard.press('Enter');
  console.log('task:', await ev(() => { const t = state.tasks.at(-1); return [t.title, t.tags, t.priority, t.due === dateKey(addDays(new Date(), 1))]; }), '| closed:', !(await p.isVisible('#capture')));
  // Atajo, también desde el editor de una nota.
  await ev(() => openNote(noteById('a'))); await ev(() => setNoteMode(noteById('a'), 'edit')); await p.focus('#note-editor');
  await p.keyboard.press('Control+Shift+Space');
  await p.click('#capture .capture-kinds .chip:has-text("Nota")');
  await p.keyboard.type('Apunte suelto'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('segunda línea'); await p.keyboard.press('Enter');
  console.log('note bullet:', await ev(() => findNoteByName('Bandeja de entrada').body.split('\n').slice(-3)));
  await p.keyboard.press('Control+Shift+Space');
  await p.click('#capture .capture-kinds .chip:has-text("Idea")');
  await p.keyboard.type('Libro sobre hábitos #lectura'); await p.keyboard.press('Enter');
  console.log('idea:', await ev(() => [state.ideas.at(-1).text, state.ideas.at(-1).tags]));
  await p.keyboard.press('Control+Shift+Space'); await p.keyboard.press('Escape');
  console.log('esc closes:', !(await p.isVisible('#capture')));
  // Clic derecho en el botón: elegir el tipo.
  await p.click('#capture-fab', { button: 'right' });
  console.log('fab menu:', await p.$$eval('#note-menu .menu-item span', n => n.map(x => x.textContent)));
  await p.keyboard.press('Escape');
  await ev(() => { captureItem('task', 'Revisar caldera'); captureItem('task', 'Comprar pan'); captureItem('task', 'Tirar esto'); captureItem('note', 'Pasar a tarea'); captureItem('note', 'Borrar este'); captureItem('idea', 'Idea a tarea'); });
  console.log('count:', await ev(() => inboxCount()), '| badge:', await p.textContent('.rib[data-view="inbox"] .rib-badge'), '| hoy:', await p.textContent('#today-inbox'));
  await ev(() => showView('review'));
  console.log('review row:', await p.textContent('#review-body .rv-inbox strong'));
  await p.click('#review-body .rv-inbox');
  console.log('inbox tab:', await p.textContent('.ws-tab.active'), '| rows:', await p.$$eval('#view-inbox .inbox-text', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/bandeja.png' });

  // ---- Procesar ----
  await p.click('#view-inbox .inbox-row:has-text("Llamar a Ana") button:has-text("Fecha")');
  await p.click('#note-menu .menu-item:has-text("Para hoy")');
  await p.click('#view-inbox .inbox-row:has-text("Revisar caldera") button:has-text("Proyecto")');
  await p.click('#note-menu .menu-item:has-text("Casa")');
  await p.click('#view-inbox .inbox-row:has-text("Comprar pan") button:has-text("Hecha")');
  await p.click('#view-inbox .inbox-row:has-text("Tirar esto") button:has-text("Borrar")');
  console.log('tasks:', await ev(() => ['Llamar a Ana', 'Revisar caldera', 'Comprar pan', 'Tirar esto'].map(x => { const t = state.tasks.find(t => t.title === x) || state.archive.find(t => t.title === x); return t ? [t.tags.includes('bandeja'), t.due === dateKey() ? 'hoy' : t.due, t.projectId, t.done] : 'borrada'; })));
  await p.click('#view-inbox .inbox-row:has-text("Apunte suelto") button:has-text("Mover a una nota")');
  await p.fill('#picker-input', 'Alfa'); await p.keyboard.press('Enter');
  console.log('moved:', await ev(() => [noteById('a').body.split('\n').slice(-3), findNoteByName('Bandeja de entrada').body.includes('Apunte suelto')]));
  await p.click('#view-inbox .inbox-row:has-text("Pasar a tarea") button:has-text("Convertir en tarea")');
  await p.click('#view-inbox .inbox-row:has-text("Borrar este") button:has-text("Borrar")');
  console.log('bullets:', await ev(() => [inboxBullets().length, state.tasks.some(t => t.title === 'Pasar a tarea' && !t.tags.includes('bandeja'))]));
  // Clic derecho sobre una idea.
  await p.click('#view-inbox .inbox-row:has-text("Idea a tarea")', { button: 'right' });
  console.log('idea ctx:', await p.$$eval('#note-menu .menu-item span', n => n.map(x => x.textContent)));
  await p.click('#note-menu .menu-item:has-text("→ Tarea")');
  console.log('idea → task:', await ev(() => [state.ideas.some(i => i.text === 'Idea a tarea'), state.tasks.some(t => t.title === 'Idea a tarea')]));
  await p.click('#view-inbox .inbox-row:has-text("Libro sobre hábitos") button:has-text("Abrir en Ideas")');
  console.log('idea open:', await p.textContent('.ws-tab.active'), await ev(() => state.ideas.find(i => i.text.startsWith('Libro')).tags));
  console.log('final count:', await ev(() => inboxCount()), '| badge hidden:', await p.isHidden('.rib[data-view="inbox"] .rib-badge'));
  await ev(() => showView('review'));
  console.log('review row gone:', await p.$$eval('#review-body .rv-inbox', n => n.length));

  // Móvil: el botón no tapa la barra de abajo y se ve.
  await p.setViewportSize({ width: 390, height: 760 });
  await ev(() => showView('inbox')); await p.waitForTimeout(400);
  console.log('mobile fab:', await p.evaluate(() => { const r = document.getElementById('capture-fab').getBoundingClientRect(); return [r.right <= innerWidth, r.bottom <= innerHeight - 20]; }));
  await p.screenshot({ path: S + '/bandeja-movil.png' });

  // ---- Sincronización de la papelera entre dos dispositivos ----
  const syncNotes = [{ id: 'n1', path: 'Viaje/Plan', body: 'Plan', createdAt: now - 1e6, updatedAt: now - 1e6 }, { id: 'n2', path: 'Otra', body: 'Ver [[Plan]]', createdAt: now - 1e6, updatedAt: now - 1e6 }];
  const A = await open({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: syncNotes, updatedAt: now }, {}, true);
  await A.evaluate(() => deleteNote(noteById('n1')));
  await A.waitForTimeout(1500);
  const cloud = await A.evaluate(() => Object.fromEntries([...window.__docs]));
  console.log('cloud after A delete:', Object.keys(cloud).filter(k => /^(note|trash)-/.test(k)).sort());
  const B = await open(null, cloud, true);
  console.log('B trash:', await B.evaluate(() => [state.trash.map(t => t.id), !!noteById('n1'), !!noteById('n2')]));
  await B.evaluate(() => restoreFromTrash('n1'));
  await B.waitForTimeout(1500);
  const cloud2 = await B.evaluate(() => Object.fromEntries([...window.__docs]));
  console.log('cloud after B restore:', Object.keys(cloud2).filter(k => /^(note|trash)-/.test(k)).sort());
  await A.evaluate((d) => { window.__docs.clear(); Object.entries(d).forEach(([k, v]) => window.__docs.set(k, v)); window.__emit(); }, cloud2);
  await A.waitForTimeout(1500);
  console.log('A after restore:', await A.evaluate(() => [noteById('n1')?.path, state.trash.length, findNoteByName('Plan')?.id, [...window.__docs.keys()].filter(k => /^(note|trash)-/.test(k)).sort()]));

  console.log('errors:', errs); await b.close();
})();
