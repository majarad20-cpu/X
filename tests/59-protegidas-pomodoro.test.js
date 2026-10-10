// Notas protegidas y Pomodoro: bloqueo automático editando un bloque, sincronización al proteger,
// avisos de la papelera de Drive, saltos de línea CRLF al traer de Drive, borrar sin perder lo
// último escrito, una sola pestaña lleva el Pomodoro y la racha de pomodoros que vuelve a empezar.
const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const now = new Date('2026-10-09T10:00:00').getTime();
const MIN = 60e3;
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${info}`}`); };

const visMock = () => {
  let hidden = false;
  Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  window.__setHidden = (h) => { hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
};

// Drive simulado (como en 34-boveda-drive.test.js).
const driveMock = () => {
  const files = [];
  window.__files = files;
  const FOLDER = 'application/vnd.google-apps.folder';
  const live = () => files.filter((f) => !f.trashed);
  const mcp = {
    callTool: async (server, tool, input) => {
      if (server !== 'Google Drive') throw { code: 'tool_error', message: 'no' };
      if (tool === 'search_files') {
        const q = input.query;
        const t = q.match(/title = '([^']+)'/);
        const since = q.match(/modifiedTime > '([^']+)'/);
        const parents = [...q.matchAll(/parentId = '([^']+)'/g)].map((m) => m[1]);
        let o = live();
        if (t) o = o.filter((f) => f.title === t[1]);
        if (parents.length) o = o.filter((f) => parents.includes(f.parentId));
        if (since) o = o.filter((f) => f.modifiedTime > since[1]);
        if (/mimeType = 'application\/vnd.google-apps.folder'/.test(q)) o = o.filter((f) => f.mimeType === FOLDER);
        return { payload: { files: o.map(({ text, trashed, ...f }) => f) } };
      }
      if (tool === 'create_file') {
        const f = { id: 'f' + files.length, title: input.title, mimeType: input.contentMimeType, parentId: input.parentId, modifiedTime: new Date().toISOString(), text: input.textContent };
        files.push(f);
        const { text, ...meta } = f;
        return { payload: meta };
      }
      if (tool === 'trash_file') {
        const f = files.find((x) => x.id === input.fileId);
        if (f) f.trashed = true;
        return { payload: {} };
      }
      if (tool === 'download_file_content') {
        const f = files.find((x) => x.id === input.fileId);
        return { payload: { id: f.id, content: btoa(String.fromCharCode(...new TextEncoder().encode(f.text))) } };
      }
      throw { code: 'tool_error', message: 'no' };
    },
  };
  window.claude = { use: async (n) => (n === 'mcp' ? mcp : null) };
};

const seedNotes = {
  tasks: [], habits: [], settings: { notesWelcome: true, logVersion: 1 },
  notes: [
    { id: 'p', path: 'Secreto', body: 'Primer párrafo\n\nSegundo párrafo', createdAt: now, updatedAt: now },
    { id: 'q', path: 'Otra', body: 'Texto de la otra', createdAt: now, updatedAt: now },
    { id: 'v', path: 'En Drive', body: 'Texto en claro', createdAt: now, updatedAt: now },
    { id: 'z', path: 'Para borrar', body: 'Inicio', createdAt: now, updatedAt: now },
  ],
  updatedAt: 1,
};

(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text())); };

  // ================= Notas protegidas =================
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seedNotes);
  await c.addInitScript(visMock);
  await c.addInitScript(driveMock);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); watch(p);
  await p.goto(url); await p.waitForTimeout(800);
  const ev = (f, a) => p.evaluate(f, a);

  // ---- 2) Proteger marca la nota como pendiente de subir (no como primera vez) ----
  let r = await ev(async () => {
    state.syncMeta.sent['note-p'] = '{"note":"en claro"}';
    await protectNote(noteById('p'), 'clave');
    const a = state.syncMeta.sent['note-p'];
    await protectNote(noteById('q'), 'clave');
    return { a, q: 'note-q' in state.syncMeta.sent };
  });
  check('proteger: sent queda vacío (pendiente), no se borra', r.a === '' && r.q === false, JSON.stringify(r));

  // ---- 1) Bloqueo automático mientras se edita un bloque ----
  await ev(() => { noteMode.set('p', 'read'); openNote(noteById('p')); });
  await p.waitForTimeout(200);
  await p.dblclick('#note-reading > [data-src^="0-"]');
  await p.waitForTimeout(100);
  await p.keyboard.press('End');
  await p.keyboard.type(' más');
  r = await ev(() => ({ be: !!blockEdit, focus: document.activeElement === $('#note-editor'), text: unlockedNotes.get('p') }));
  check('bloque en edición', r.be && r.focus && r.text.startsWith('Primer párrafo más'), JSON.stringify(r));
  await ev(() => { window.__setHidden(true); hiddenSince = Date.now() - 6 * 60e3; window.__setHidden(false); });
  await p.waitForTimeout(300);
  r = await ev(() => ({
    be: blockEdit, locked: !unlockedNotes.has('p'), lockShown: !$('#note-lock').hidden,
    ed: $('#note-editor').value, edHidden: $('#note-editor').hidden, reading: $('#note-reading').textContent,
    focus: document.activeElement === $('#note-editor'),
  }));
  check('bloqueo: se cierra el bloque y no queda texto en claro', r.be === null && r.locked && r.lockShown && r.ed === '' && r.edHidden && !r.reading.includes('párrafo') && !r.focus, JSON.stringify(r));
  await p.keyboard.type('xyz');
  r = await ev(() => ({ body: noteById('p').body, locked: LOCKED_BODY, plain: unlockedNotes.has('p') }));
  check('bloqueo: lo tecleado después no va a la nota', r.body === r.locked && !r.plain, JSON.stringify(r));
  r = await ev(async () => (await unlockNote(noteById('p'), 'clave')) && unlockedNotes.get('p'));
  check('bloqueo: lo escrito antes quedó cifrado', r === 'Primer párrafo más\n\nSegundo párrafo', JSON.stringify(r));
  check('blockEditKeeps: falso con la nota bloqueada', await ev(() => {
    const n = noteById('p');
    blockEdit = { noteId: 'p', from: 0, to: 0, before: '', after: '', last: '', expect: '' };
    unlockedNotes.delete('p');
    $('#note-editor').focus();
    const k = blockEditKeeps(n);
    return k === false && blockEdit === null;
  }));

  // ---- 5) Borrar una nota protegida desbloqueada sin perder lo último escrito ----
  r = await ev(async () => {
    const n = noteById('z');
    await protectNote(n, 'clave');
    openNote(n);
    setNoteMode(n, 'edit');
    const ta = $('#note-editor');
    ta.value = 'Inicio y lo último';
    ta.dispatchEvent(new Event('input'));
    deleteNote(n); // antes de los 300 ms del cifrado
    await new Promise((res) => setTimeout(res, 600));
    const it = state.trash.find((t) => t.id === 'z');
    const key = await deriveKey('clave', Uint8Array.from(atob(it.note.enc.salt), (ch) => ch.charCodeAt(0)));
    const text = await decryptWith(key, it.note.enc);
    // Y si se deshace, la nota recuperada también lo tiene.
    $('#toast .toast-action').click();
    const back = noteById('z');
    const key2 = await deriveKey('clave', Uint8Array.from(atob(back.enc.salt), (ch) => ch.charCodeAt(0)));
    return { text, back: await decryptWith(key2, back.enc), plain: it.note.body };
  });
  check('papelera: la copia cifrada lleva lo último escrito', r.text === 'Inicio y lo último' && r.plain === await ev(() => LOCKED_BODY), JSON.stringify(r));
  check('papelera: «Deshacer» también', r.back === 'Inicio y lo último', JSON.stringify(r));

  // ---- 3 y 4) Bóveda de Drive ----
  for (let i = 0; i < 20 && !(await ev(() => gAvailable())); i++) await p.waitForTimeout(300);
  await ev(() => { const i = document.getElementById('gvault-on'); i.checked = true; i.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1500);
  r = await ev(() => ({ files: window.__files.filter((f) => !f.trashed && /\.md$/.test(f.title)).map((f) => f.title).sort(), note: $('.gvault-trash-note')?.textContent || '' }));
  check('bóveda: no sube notas protegidas', r.files.includes('En Drive.md') && !r.files.includes('Secreto.md') && !r.files.some((f) => f.includes('Para borrar')), JSON.stringify(r.files));
  check('bóveda: el texto de ajustes avisa de la papelera de Drive', r.note.includes('papelera de Drive') && r.note.includes('sin cifrar'), r.note);
  await ev(() => { openNote(noteById('v')); startProtect(noteById('v')); });
  await p.waitForTimeout(100);
  await p.fill('#note-lock input >> nth=0', 'clave');
  await p.fill('#note-lock input >> nth=1', 'clave');
  await p.click('#note-lock button[type=submit]');
  for (let i = 0; i < 30 && !(await ev(() => !!noteById('v').enc)); i++) await p.waitForTimeout(100);
  await p.waitForTimeout(100);
  r = await ev(() => $('#toast').textContent);
  check('bóveda: aviso al proteger una nota que estaba en Drive', r.includes('La versión sin cifrar sigue en la papelera de Drive; vacíala desde Drive si quieres borrarla'), r);
  await ev(() => syncVault({ manual: true }));
  await p.waitForTimeout(800);
  r = await ev(() => ({ v: window.__files.find((f) => f.title === 'En Drive.md'), mapped: 'v' in vaultMap().files, enc: window.__files.some((f) => /Secreto|🔒/.test(f.text || '')) }));
  check('bóveda: el archivo de la nota protegida va a la papelera y no se sube cifrada', r.v.trashed && !r.mapped && !r.enc, JSON.stringify(r));

  // CRLF desde Drive
  await ev(() => {
    const m = vaultMap();
    window.__files.push({ id: 'crlf', title: 'Windows.md', mimeType: 'text/markdown', parentId: m.root, modifiedTime: new Date(Date.now() + 1000).toISOString(), text: '---\r\nestado: hecho\r\n---\r\nLínea uno\r\nLínea dos\rtres' });
  });
  await ev(() => syncVault({ manual: true }));
  await p.waitForTimeout(800);
  r = await ev(() => { const n = state.notes.find((x) => x.path === 'Windows'); return n && { body: n.body, props: typeof noteProps === 'function' ? noteProps(n) : null }; });
  check('bóveda: CRLF se normaliza al traer de Drive', r && r.body === '---\nestado: hecho\n---\nLínea uno\nLínea dos\ntres', JSON.stringify(r));
  await p.screenshot({ path: `${out}/59-protegidas.png` });
  await c.close();

  // ================= Pomodoro en dos pestañas =================
  const c2 = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await c2.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, { tasks: [], habits: [], settings: { notesWelcome: true, logVersion: 1, focus: 1, short: 1, long: 1, pomo: { sys: false, sound: false, ask: false } }, focusLog: [], updatedAt: 1 });
  await c2.route(/fonts\.g/, (r) => r.abort());
  await c2.clock.install({ time: new Date(now) });
  // Cada pestaña lleva su reloj simulado: se avanza a pasos cortos para que vayan a la par.
  const step = async (ms) => { for (let t = 0; t < ms; t += 2000) await c2.clock.runFor(Math.min(2000, ms - t)); };
  const a = await c2.newPage(); watch(a);
  await a.goto(url); await c2.clock.runFor(800);
  await a.evaluate(() => { showView('timer'); startTimer(); });
  await c2.clock.runFor(2000);
  const bb = await c2.newPage(); watch(bb);
  await bb.goto(url); await c2.clock.runFor(1500);
  r = await bb.evaluate(() => ({ following: pomoFollowing, endsAt: timer.endsAt, btn: $('#timer-start').textContent }));
  const endsA = await a.evaluate(() => timer.endsAt);
  check('dos pestañas: la segunda sigue el temporizador sin llevarlo', r.following && r.endsAt === endsA && r.btn === 'Pausar', JSON.stringify(r));
  await step(MIN);
  r = { a: await a.evaluate(() => state.focusLog.map((x) => x.id)), b: await bb.evaluate(() => state.focusLog.map((x) => x.id)), start: await a.evaluate(() => state.focusLog[0]?.start) };
  check('dos pestañas: se registra una sola vez', r.a.length === 1 && r.b.length === 0 && r.a[0] === `f-${r.start}`, JSON.stringify(r));
  r = await bb.evaluate(() => ({ mode: timer.mode, endsAt: timer.endsAt }));
  check('dos pestañas: la segunda ve la pausa', r.mode === 'short' && !r.endsAt, JSON.stringify(r));

  // Pausar desde la segunda: pasa a llevarlo ella.
  await bb.evaluate(() => { setMode('focus'); startTimer(); });
  await c2.clock.runFor(1500);
  r = { a: await a.evaluate(() => ({ f: pomoFollowing, endsAt: timer.endsAt })), b: await bb.evaluate(() => ({ f: pomoFollowing, endsAt: timer.endsAt })) };
  check('dos pestañas: la que actúa pasa a llevarlo', !r.b.f && r.a.f && r.a.endsAt === r.b.endsAt, JSON.stringify(r));
  // Si se cierra la dueña, la otra toma el relevo y registra.
  await bb.close();
  await step(MIN + 2000);
  r = await a.evaluate(() => ({ f: pomoFollowing, n: state.focusLog.length, mode: timer.mode }));
  check('dos pestañas: relevo al cerrar la dueña', !r.f && r.n === 2 && r.mode === 'short', JSON.stringify(r));

  // Id fijo: la misma sesión no se registra dos veces.
  r = await a.evaluate(() => {
    timer.startedAt = 12345;
    const x = recordFocus({ completed: true, end: 12345 + 25 * 60e3, ms: 25 * 60e3 });
    const y = recordFocus({ completed: true, end: 12345 + 25 * 60e3, ms: 25 * 60e3 });
    timer.startedAt = null;
    return { same: x === y, n: state.focusLog.filter((r) => r.id === 'f-12345').length };
  });
  check('id fijo: un duplicado se fusiona', r.same && r.n === 1, JSON.stringify(r));

  // ================= 7) La racha vuelve a empezar =================
  r = await a.evaluate(() => {
    pomoAlertHide?.();
    setMode('focus');
    timer.focusCount = 2;
    timer.lastDay = '2026-10-08';
    saveRun();
    renderTimer();
    return $('#timer-round').textContent;
  });
  check('racha: otro día empieza en 1', r.startsWith('Pomodoro 1 de 4'), r);
  // Guardado antiguo sin lastDay: se mira el último pomodoro registrado.
  await a.evaluate(() => {
    const run = JSON.parse(localStorage.getItem(POMO_RUN_KEY));
    delete run.lastDay;
    run.focusCount = 3;
    localStorage.setItem(POMO_RUN_KEY, JSON.stringify(run));
    state.focusLog = [{ id: 'old', start: Date.now() - 864e5 - 25 * 60e3, end: Date.now() - 864e5, date: '2026-10-08', minutes: 25, kind: 'focus', ctx: { type: 'free' }, completed: true }];
    save(); flushLocal();
  });
  await c2.clock.runFor(500);
  await a.reload(); await c2.clock.runFor(1500);
  r = await a.evaluate(() => $('#timer-round').textContent);
  check('racha: guardado antiguo de otro día empieza en 1', r.startsWith('Pomodoro 1 de 4'), r);
  // Pausa larga elegida a mano: al terminar, la racha vuelve a cero.
  r = await a.evaluate(() => {
    setMode('focus');
    timer.focusCount = 2;
    timer.lastDay = dateKey();
    setMode('long');
    startTimer();
    return timer.focusCount;
  });
  await step(MIN + 1000);
  r = await a.evaluate(() => ({ c: timer.focusCount, mode: timer.mode, txt: $('#timer-round').textContent }));
  check('racha: tras una pausa larga manual vuelve a 1', r.c === 0 && r.mode === 'focus' && r.txt.startsWith('Pomodoro 1 de 4'), JSON.stringify(r));
  r = await a.evaluate(() => { timer.focusCount = 3; timer.lastDay = dateKey(); setMode('long'); finishSession(false); return timer.focusCount; });
  check('racha: también al saltar la pausa larga', r === 0, String(r));
  await a.screenshot({ path: `${out}/59-pomodoro.png` });

  console.log(fails ? `${fails} fallos` : 'todo bien');
  if (fails) errs.push(`${fails} comprobaciones fallidas`);
  console.log('errors:', errs);
  await b.close();
})();
