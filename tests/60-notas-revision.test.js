// Revisión de notas y editor: fechas en tareas, casillas y extraer con un bloque abierto, propiedades
// de varias líneas, notas protegidas, enlaces rotos y alias, enlaces con nombre repetido, renombrar,
// líneas de tareas que se mueven, números de línea en citas, caracteres de control, foco del menú y
// cambios que llegan con el editor abierto.
const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime(); // viernes
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], projects: [], settings: { notesWelcome: true },
    notes: [
      { id: 'a', path: 'A/Dup', body: 'Nota A', createdAt: now, updatedAt: now },
      { id: 'b', path: 'B/Dup', body: 'Nota B', createdAt: now, updatedAt: now },
      { id: 't', path: 'Tareas', body: '- [ ] Llamar 📅 mañana a Juan [[B/Dup]]\n- [ ] Comprar 📅 viernes leche\n- [ ] Cita 📅 15 de octubre con el médico\n- [ ] Ya fijada 📅 2026-10-20 resto', createdAt: now, updatedAt: now },
      { id: 'k', path: 'Bloques', body: 'Primer párrafo.\n\nSegundo párrafo.\n\n- [ ] Tarea uno\n- [ ] Tarea dos', createdAt: now, updatedAt: now },
      { id: 'x', path: 'Extraer', body: 'Uno.\n\nDos.\n\nTres bloque.', createdAt: now, updatedAt: now },
      { id: 'y', path: 'Yaml', body: '---\ndesc: |\n  línea 1\n  línea 2\nmeta:\n  a: 1\n  b: 2\nestado: hecho\n---\nTexto.', createdAt: now, updatedAt: now },
      { id: 'o', path: 'Old', body: '# Sec\nTexto viejo.', createdAt: now, updatedAt: now },
      { id: 'r', path: 'Refs', body: 'Ver [[Old.md]], [[Old]], [ver](Old.md), [sec](Old.md#Sec) y [web](https://x.com/Old.md).', createdAt: now, updatedAt: now },
      { id: 'e', path: 'Editor', body: 'uno\ndos\ntres\ncuatro\ncinco', createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const check = (name, ok, info = '') => { console.log(`${ok ? 'ok' : 'FALLA'} ${name}${info ? ` · ${info}` : ''}`); if (!ok) errs.push(`falla: ${name} ${info}`); };
  const body = (id) => p.evaluate((id) => noteById(id).body, id);

  // ---- 1. Fijar fechas relativas sin borrar el resto de la línea ----
  let r = await p.evaluate(() => {
    const n = noteById('t');
    const before = noteTasks().filter((t) => t.noteId === 't').map((t) => `${t.title}|${t.due}`);
    pinNoteDates(n);
    const after = noteTasks().filter((t) => t.noteId === 't').map((t) => `${t.title}|${t.due}`);
    return { lines: n.body.split('\n'), before, after };
  });
  check('fechas: mañana conserva el resto', r.lines[0] === '- [ ] Llamar 📅 2026-10-10 a Juan [[B/Dup]]', r.lines[0]);
  check('fechas: viernes conserva el resto', r.lines[1] === '- [ ] Comprar 📅 2026-10-09 leche', r.lines[1]);
  check('fechas: varias palabras', r.lines[2] === '- [ ] Cita 📅 2026-10-15 con el médico', r.lines[2]);
  check('fechas: ya fijada no cambia', r.lines[3] === '- [ ] Ya fijada 📅 2026-10-20 resto', r.lines[3]);
  check('fechas: al leer, título y fecha', r.before[0] === 'Llamar a Juan B/Dup|2026-10-10' && r.before[1] === 'Comprar leche|2026-10-09' && r.before[3] === 'Ya fijada resto|2026-10-20', r.before.join(' ; '));
  check('fechas: igual antes y después de fijar', r.before.join() === r.after.join(), r.after.join(' ; '));

  // ---- 9. Ayudante findNoteTaskLine y acciones que comprueban la línea ----
  r = await p.evaluate(() => {
    const n = noteById('t');
    const t = noteTasks().find((x) => x.noteId === 't' && x.title === 'Comprar leche');
    n.body = `Línea nueva arriba\n${n.body}`;
    dataRev++;
    const moved = findNoteTaskLine('t', t.line, t.title);
    const same = findNoteTaskLine('t', moved, t.title);
    const gone = findNoteTaskLine('t', t.line, 'No existe');
    const any = findNoteTaskLine('t', 0);
    toggleNoteTask('t', t.line, true, t.title);
    const lines = n.body.split('\n');
    return { line: t.line, moved, same, gone, any, ticked: lines[2], other: lines[1] };
  });
  check('ayudante: encuentra la línea movida', r.moved === r.line + 1 && r.same === r.moved && r.gone === -1 && r.any === -1, JSON.stringify(r));
  check('casilla: marca la tarea movida, no la de su antiguo sitio', /^- \[x\] Comprar/.test(r.ticked) && /^- \[ \] Llamar/.test(r.other), `${r.ticked} | ${r.other}`);
  r = await p.evaluate(() => {
    const t = noteTasks().find((x) => x.noteId === 't' && x.title === 'Comprar leche');
    const n = noteById('t');
    n.body = n.body.replace('Línea nueva arriba\n', '');
    dataRev++;
    deleteNoteTaskLine(t);
    return n.body;
  });
  check('borrar línea: sigue a la tarea movida', !r.includes('Comprar') && r.includes('Llamar') && r.includes('Cita'), JSON.stringify(r));

  // ---- 2. Casilla durante la edición de un bloque ----
  await p.evaluate(() => { const n = noteById('k'); noteMode.set('k', 'read'); openNote(n); });
  await p.clock.runFor(200);
  await p.evaluate(() => {
    const blk = $('#note-reading > [data-src="0-0"]');
    startBlockEdit(noteById('k'), 0, 0, blk);
    const ta = $('#note-editor');
    ta.value = 'Primer párrafo.\nOtra línea.\nY otra más.';
    ta.dispatchEvent(new Event('input'));
  });
  await p.click('#note-reading input.task-check >> nth=0');
  await p.clock.runFor(500);
  r = (await body('k')).split('\n');
  check('bloque: la casilla marca la tarea correcta', /^- \[x\] Tarea uno/.test(r[6]) && /^- \[ \] Tarea dos/.test(r[7]) && r[1] === 'Otra línea.', JSON.stringify(r));

  // ---- 3. Extraer un bloque tras editar otro ----
  await p.evaluate(() => { const n = noteById('x'); noteMode.set('x', 'read'); openNote(n); });
  await p.clock.runFor(200);
  r = await p.evaluate(() => {
    const blk = $('#note-reading > [data-src="0-0"]');
    const last = $('#note-reading > [data-src="4-4"]');
    startBlockEdit(noteById('x'), 0, 0, blk);
    const ta = $('#note-editor');
    ta.value = 'Uno.\nUno bis.';
    ta.dispatchEvent(new Event('input'));
    const items = CTX_MENU_EXTRA.flatMap((f) => f('block', { note: noteById('x'), block: last }) || []);
    items.find((it) => /dejar solo un enlace/.test(it.label)).action();
    return $('#picker-input').value;
  });
  check('extraer: propone el bloque correcto', r === 'Tres bloque', r);
  await p.keyboard.press('Enter'); await p.clock.runFor(300);
  r = await p.evaluate(() => ({ body: noteById('x').body, made: state.notes.find((n) => n.path === 'Tres bloque')?.body }));
  check('extraer: mueve las líneas correctas', r.body === 'Uno.\nUno bis.\n\nDos.\n\n[[Tres bloque]]' && r.made === 'Tres bloque.\n', JSON.stringify(r));
  r = await p.evaluate(() => {
    const n = noteById('x');
    let made = null;
    extractBlock(n, 0, 0, false, 'Nueva', 'otro texto');
    made = state.notes.some((m) => m.path === 'Nueva');
    return { made, body: n.body };
  });
  check('extraer: si el texto cambió no se toca', !r.made && r.body.startsWith('Uno.\nUno bis.'), JSON.stringify(r));

  // ---- 4. Renombrar una propiedad de varias líneas o anidada ----
  await p.evaluate(() => { const n = noteById('y'); noteMode.set('y', 'read'); openNote(n); });
  await p.clock.runFor(300);
  await p.fill('#note-reading .pe-row[data-key="desc"] .pe-key', 'resumen');
  await p.press('#note-reading .pe-row[data-key="desc"] .pe-key', 'Enter');
  await p.clock.runFor(200);
  await p.fill('#note-reading .pe-row[data-key="meta"] .pe-key', 'datos');
  await p.press('#note-reading .pe-row[data-key="meta"] .pe-key', 'Enter');
  await p.clock.runFor(200);
  r = await body('y');
  check('propiedades: renombrar conserva el contenido', r === '---\nresumen: |\n  línea 1\n  línea 2\ndatos:\n  a: 1\n  b: 2\nestado: hecho\n---\nTexto.', JSON.stringify(r));
  r = await p.evaluate(() => { const ro = peRenameKey(noteById('y'), 'resumen', 'estado'); return [ro, noteById('y').body.includes('resumen: |')]; });
  check('propiedades: no repite una clave', r[0] === false && r[1], r.join());

  // ---- 5. Extraer de una nota protegida ----
  r = await p.evaluate(async () => {
    const n = createNote({ title: 'Secreta', body: 'Texto secreto que no debe salir', edit: true });
    await protectNote(n, 'clave1234');
    noteMode.set(n.id, 'edit');
    openNote(n);
    const ta = $('#note-editor');
    ta.focus();
    ta.setSelectionRange(0, 5);
    const ctx = CTX_MENU_EXTRA.flatMap((f) => f('editor', ta) || []).filter((it) => /Extraer/.test(it.label || ''));
    const cmds = COMMANDS_EXTRA.flatMap((f) => f(n) || []).filter((it) => /Extraer/.test(it.label || ''));
    const count = state.notes.length;
    extractSelection(ta, false, 'Fuga');
    const fmt = FMT_BUTTONS.find((x) => x[3] === 'fb-extract');
    fmt[2](ta);
    return { enc: !!n.enc, ctx: ctx.length, cmds: cmds.length, made: state.notes.length - count, leak: state.notes.some((m) => !m.enc && m.body.includes('secreto')), menu: !$('#note-menu').hidden };
  });
  check('protegida: sin extraer en menús ni comandos', r.enc && r.ctx === 0 && r.cmds === 0 && !r.menu, JSON.stringify(r));
  check('protegida: extraer se niega', r.made === 0 && !r.leak, JSON.stringify(r));
  await p.evaluate(() => { const n = state.notes.find((m) => m.path === 'Secreta'); lockNote(n.id); openNote(noteById('a')); });

  // ---- 6. Enlaces rotos y alias: sin recorrer la bóveda cada vez ----
  r = await p.evaluate(() => {
    const extra = [];
    for (let i = 0; i < 5000; i++) extra.push({ id: `p${i}`, path: `Montón/N${i}`, body: `---\nestado: x${i % 7}\n---\nTexto ${i}`, createdAt: 1, updatedAt: 1 });
    extra.push({ id: 'al', path: 'Con alias', body: '---\naliases: [Apodo, Otro]\n---\nHola', createdAt: 1, updatedAt: 1 });
    state.notes.push(...extra);
    dataRev++;
    const names = Array.from({ length: 200 }, (_, i) => `No existe ${i}`);
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) names.forEach((x) => findNoteByName(x));
    const ms = performance.now() - t0;
    const cached = names.every((x) => notesIndexed().resolved.has(x));
    const alias = findNoteByName('apodo')?.id;
    const n = noteById('al');
    n.body = n.body.replace('Otro', 'Nuevo');
    dataRev++;
    const fresh = findNoteByName('Nuevo')?.id;
    const old = findNoteByName('Otro');
    const t1 = performance.now();
    peKnownCache = null;
    peKnown();
    const props1 = performance.now() - t1;
    return { ms, cached, alias, fresh, old, props1 };
  });
  check('enlaces rotos: rápido y en caché', r.ms < 600 && r.cached, `${r.ms.toFixed(0)} ms`);
  check('alias: se encuentran y siguen al texto', r.alias === 'al' && r.fresh === 'al' && r.old === null, JSON.stringify(r));
  r = await p.evaluate(() => {
    const ta = $('#note-editor');
    noteMode.set('e', 'edit'); openNote(noteById('e')); ta.focus();
    peKnown();
    const rev = dataRev;
    dataRev++;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) peKnown();
    const ms = performance.now() - t0;
    return { ms, same: peKnownCache.rev === rev };
  });
  check('propiedades conocidas: sin releer al escribir', r.same && r.ms < 50, `${r.ms.toFixed(1)} ms`);
  await p.evaluate(() => { state.notes = state.notes.filter((n) => !/^(p\d+|al)$/.test(n.id)); dataRev++; save(); });

  // ---- 7. Enlaces a notas con el mismo nombre ----
  r = await p.evaluate(async () => {
    const sg = relSuggest('dup', null).filter((x) => x.icon === '📝').map((x) => x.insert).sort();
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
    await copyText('x', '');
    await copyNoteLink(noteById('b'));
    const first = findNoteByName('Dup').id;
    const { link } = extractTo(createNote({ folder: 'C', title: 'Src', open: false }), 'texto', 'Dup', false);
    return { sg, copied, first, link };
  });
  check('mismo nombre: [[ sugiere la ruta', r.sg.join() === 'A/Dup,B/Dup' || r.sg.includes(r.first === 'a' ? 'B/Dup' : 'A/Dup'), r.sg.join());
  check('mismo nombre: copiar enlace con ruta', r.copied === (r.first === 'b' ? '[[Dup]]' : '[[B/Dup]]'), r.copied);
  check('mismo nombre: extraer enlaza con ruta', r.link === '[[C/Dup]]', r.link);

  // ---- 8. Renombrar actualiza [[X.md]], [texto](X.md) y notas protegidas desbloqueadas ----
  r = await p.evaluate(async () => {
    const s = createNote({ title: 'Prot', body: 'Enlace a [[Old]] y [a](Old.md)', open: false });
    await protectNote(s, 'clave1234');
    const unlocked = unlockedNotes.has(s.id);
    renameNote(noteById('o'), 'Nuevo nombre');
    return { refs: noteById('r').body, prot: unlockedNotes.get(s.id), unlocked, pending: encryptTimers.has(s.id), id: s.id };
  });
  check('renombrar: [[Old.md]] y [[Old]]', r.refs.includes('[[Nuevo nombre.md]]') && r.refs.includes('[[Nuevo nombre]]'), r.refs);
  check('renombrar: enlaces de Markdown', r.refs.includes('[ver](Nuevo%20nombre.md)') && r.refs.includes('[sec](Nuevo%20nombre.md#Sec)') && r.refs.includes('[web](https://x.com/Old.md)'), r.refs);
  check('renombrar: nota protegida desbloqueada', r.unlocked && r.prot === 'Enlace a [[Nuevo nombre]] y [a](Nuevo%20nombre.md)' && r.pending, JSON.stringify(r));
  r = await p.evaluate(() => [...document.createRange().createContextualFragment(renderMd('[ver](Nuevo%20nombre.md)')).querySelectorAll('a.wikilink')].map((a) => a.dataset.target).join());
  check('renombrar: el enlace de Markdown sigue resolviendo', /Nuevo nombre/.test(r), r);
  await p.clock.runFor(1000);

  // ---- 10. Números de línea en citas, avisos e incrustaciones ----
  r = await p.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = renderMd('Uno\n\n> cita\n> - [ ] en cita\n\n> [!tip] Título\n> dentro\n\n## Final', { blocks: true });
    return [...host.querySelectorAll('[data-line]')].map((n) => `${n.tagName}:${n.dataset.line}`).join(' ');
  });
  check('líneas: citas y avisos', r.includes('P:2') && r.includes('LI:3') && r.includes('P:6') && r.includes('H2:8'), r);
  r = await p.evaluate(() => {
    const n = createNote({ title: 'Con incrustada', body: 'Arriba\n\n![[Nuevo nombre]]\n\nAbajo', open: false });
    noteMode.set(n.id, 'split'); openNote(n);
    const ta = $('#note-editor');
    ta.setSelectionRange(3, 3);
    const h = $('#note-reading .embed h1');
    h.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const caret = ta.selectionStart;
    const bm = CTX_MENU_EXTRA.flatMap((f) => f('heading', { note: n, el: h }) || []).filter((it) => /marcadores/.test(it.label || ''));
    return { caret, bm: bm.length };
  });
  check('incrustada: el clic no mueve el cursor', r.caret === 3, JSON.stringify(r));
  check('incrustada: su título no se marca como de esta nota', r.bm === 0, JSON.stringify(r));

  // ---- 11. Caracteres de control en el texto ----
  r = await p.evaluate(() => {
    const html = inlineMd('[[A/Dup|\u00010\u0001]] y \u00021\u0002 [x](https://e.com "\u00010\u0001")') + renderMd('Hola \u00010\u0001 [[A/Dup]]');
    const host = document.createElement('div');
    host.innerHTML = html;
    return { ctl: /[\u0001\u0002]/.test(html), links: host.querySelectorAll('a').length, bad: [...host.querySelectorAll('a')].some((a) => [...a.attributes].some((x) => /<|"/.test(x.value))) };
  });
  check('control: no se cuelan en el HTML', !r.ctl && !r.bad && r.links >= 2, JSON.stringify(r));

  // ---- 12. Foco del menú ----
  r = await p.evaluate(() => {
    const anchor = $('#note-more');
    showMenu(anchor, [{ label: 'Primera', disabled: true, action() {} }, { label: 'Segunda', action() {} }]);
    return document.activeElement.textContent;
  });
  check('menú: foco en la primera opción activa', r === 'Segunda', r);
  await p.keyboard.press('Tab');
  check('menú: Tab lo cierra', await p.evaluate(() => $('#note-menu').hidden));

  // ---- 13. Cambios que llegan con el editor abierto ----
  await p.evaluate(() => { noteMode.set('e', 'edit'); openNote(noteById('e')); });
  await p.click('#note-editor');
  await p.evaluate(() => { const ta = $('#note-editor'); ta.setSelectionRange(ta.value.length, ta.value.length); });
  await p.keyboard.type(' 5');
  await p.clock.runFor(800);
  r = await p.evaluate(() => {
    // Sin cambios propios: llega otra versión y el editor la toma (cursor en su sitio).
    const ta = $('#note-editor');
    ta.setSelectionRange(2, 2);
    const n = noteById('e');
    n.body = `cero\n${n.body}`;
    renderAll();
    return { value: ta.value, sel: ta.selectionStart, focus: document.activeElement === ta };
  });
  check('remoto: el editor sin cambios se actualiza', r.value === 'cero\nuno\ndos\ntres\ncuatro\ncinco 5' && r.sel === 7 && r.focus, JSON.stringify(r));
  // Cambio que llega sin redibujar y luego se escribe: se juntan los dos.
  r = await p.evaluate(() => {
    const n = noteById('e');
    n.body = n.body.replace('tres', 'TRES (remoto)');
    const ta = $('#note-editor');
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return true;
  });
  await p.keyboard.type('!');
  r = await p.evaluate(() => [noteById('e').body, $('#note-editor').value]);
  check('remoto: al escribir se juntan', r[0] === 'cero\nuno\ndos\nTRES (remoto)\ncuatro\ncinco 5!' && r[1] === r[0], JSON.stringify(r));
  // Cambios propios sin guardar y otro cambio en la misma línea: se queda lo propio y lo otro va aparte.
  r = await p.evaluate(() => {
    const ta = $('#note-editor');
    ta.value = ta.value.replace('dos', 'dos (mío)'); // como si aún no hubiera llegado el «input»
    const n = noteById('e');
    n.body = n.body.replace('dos', 'dos (suyo)');
    renderAll();
    const conflict = state.notes.find((m) => m.path === 'Editor (conflicto)');
    return { body: n.body, value: ta.value, conflict: conflict?.body };
  });
  check('remoto: conflicto conserva los dos', r.body.includes('dos (mío)') && r.value === r.body && r.conflict && r.conflict.includes('dos (suyo)'), JSON.stringify(r));
  r = await p.evaluate(() => {
    const ta = $('#note-editor');
    ta.value = ta.value.replace('uno', 'uno (mío)');
    const n = noteById('e');
    n.body = n.body.replace('cuatro', 'cuatro (suyo)');
    renderAll();
    return [n.body, ta.value, state.notes.filter((m) => /conflicto/.test(m.path)).length];
  });
  check('remoto: cambios en líneas distintas se juntan al redibujar', r[0] === r[1] && r[0].includes('uno (mío)') && r[0].includes('cuatro (suyo)') && r[2] === 1, JSON.stringify(r));
  check('remoto: mergeLines3', await p.evaluate(() => mergeLines3('a\nb\nc', 'a\nB\nc', 'a\nb\nC') === 'a\nB\nC' && mergeLines3('a\nb', 'a\nX', 'a\nY') === null && mergeLines3('a', 'a\nb', 'a') === 'a\nb'));

  console.log('errors:', errs);
  await b.close();
})();
