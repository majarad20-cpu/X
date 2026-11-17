const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`);
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const now = Date.now();
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [
      { id: 'm', path: 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS/IVA', body: 'IVA', createdAt: now, updatedAt: now },
      { id: 'o', path: 'Otra/Nota', body: 'x', createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const newPath = () => p.evaluate(() => state.notes[state.notes.length - 1].path);
  // Sin elegir carpeta: como antes (junto a la nota abierta o en la raíz)
  await p.evaluate(() => createNote({ folder: plainNewFolder() }));
  check('sin carpeta: raíz', await newPath(), 'Sin título');
  // Elegir la carpeta en Ajustes
  await p.evaluate(() => VIEW_RENDER.settings());
  check('opciones', await p.evaluate(() => [...document.querySelectorAll('#note-home option')].map((o) => o.value).includes('Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS')), true);
  await p.evaluate(() => { const s = document.getElementById('note-home'); s.value = 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS'; s.dispatchEvent(new Event('change')); });
  check('guardado', await p.evaluate(() => state.settings.noteHome), 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS');
  // «Nueva nota» va siempre a esa carpeta, aunque esté abierta una nota de otra carpeta
  await p.evaluate(() => { openNote(noteById('o')); document.getElementById('new-note').click(); });
  check('nueva nota', await newPath(), 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS/Sin título');
  // Atajo Ctrl+N y enlace a una nota que no existe (sin nota de origen)
  await p.evaluate(() => commands().find((x) => x.label === 'Nueva nota').action());
  check('Ctrl+N', await newPath(), 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS/Sin título 2');
  await p.evaluate(() => openNoteByLink('Concepto nuevo'));
  check('enlace', await newPath(), 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS/Concepto nuevo');
  // Las funciones con carpeta propia no cambian
  await p.evaluate(() => createNote({ folder: 'Diario', title: '2026-11-17', open: false }));
  check('diario', await newPath(), 'Diario/2026-11-17');
  // «Nueva nota aquí» en una carpeta concreta respeta la carpeta elegida
  await p.evaluate(() => createNote({ folder: 'Otra', open: false }));
  check('nota aquí', await newPath(), 'Otra/Sin título');
  await b.close();
  console.log('errors:', fails ? [...errs, `${fails} comprobación(es) fallida(s)`] : errs);
})();
