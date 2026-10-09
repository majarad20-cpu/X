const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [{ id: 'r', path: 'Recados', body: 'Texto', createdAt: now - 30 * 864e5, updatedAt: now }],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  // Repetición mensual: no se desplaza tras un mes corto
  console.log('monthly:', await p.evaluate(() => {
    const t = { due: '2027-01-31', repeat: 'monthly' }; const out = [];
    for (let i = 0; i < 3; i++) { t.due = nextDue(t); out.push(t.due); }
    return out.join(' ');
  }));
  console.log('en 1 mes:', await p.evaluate(() => { const d = parseInputAt('x en 1 mes', new Date('2027-01-31T10:00:00')).due; return d; }));
  // Texto externo: literal
  console.log('raw:', await p.evaluate(() => { addTask('Factura !alta cada mes +x', { raw: true }); const t = state.tasks.at(-1); return [t.title, t.priority, t.repeat || null]; }));
  // Fechas relativas en notas: se fijan al dejar de escribir
  await p.evaluate(() => openNote(noteById('r')));
  await p.evaluate(() => setNoteMode(noteById('r'), 'edit'));
  await p.clock.runFor(100);
  await p.focus('#note-editor');
  await p.press('#note-editor', 'Control+End');
  await p.keyboard.type('\n- [ ] Llamar al banco 📅 mañana');
  await p.evaluate(() => document.getElementById('note-editor').blur());
  await p.clock.runFor(200);
  console.log('pinned:', await p.evaluate(() => noteById('r').body.split('\n').at(-1)));
  // Markdown
  const md = (s, o) => p.evaluate(([s, o]) => renderMd(s, o || {}), [s, o]);
  console.log('math inline:', (await md('$$a$$ es la fórmula\n\nOtro párrafo')).includes('Otro párrafo</p>'));
  console.log('%% in code:', (await md('Usa `%%` así.\n\nSigue visible')).includes('Sigue visible'));
  console.log('code in link:', !(await md('[`npm i`](https://npmjs.com)')).includes('\u0001'));
  console.log('ext img blocked:', !(await md('![x](https://evil.example/a.png)', { noExternalImages: true })).includes('<img'));
  // Cifrado de textos grandes
  console.log('b64 big:', await p.evaluate(() => b64(new Uint8Array(300000)).length > 0));
  console.log('errors:', errs); await b.close();
})();
