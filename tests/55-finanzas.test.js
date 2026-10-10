const { chromium, launchOptions } = require('./helpers');
const fs = require('fs');
const url = process.argv[2];
const now = new Date('2026-10-10T10:00:00').getTime();
// Almacén simulado de la nube (como en 08 y 12): una colección con onSnapshot.
const mock = (initial) => {
  const docs = new Map(Object.entries(initial || {}));
  let listener = null;
  window.__docs = docs;
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
  window.__emit = () => listener && listener(snap());
  const col = { doc: (id) => ({ async set(d) { docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { docs.delete(id); } }), onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; } };
  // Solo la colección de datos del usuario (las listas compartidas piden otras).
  const other = { doc: () => ({ async set() {}, async delete() {}, async get() { return { exists: false, data: () => null }; } }), onSnapshot() { return () => {}; } };
  window.claude = { use: async (n) => (n === 'db' ? { collection: (path) => (String(path).startsWith('data/users/') ? col : other) } : n === 'user' ? { id: async () => 'u' } : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got).replace(/\u00a0|\u202f/g, ' ') === JSON.stringify(want);
    console.log(`${label}:`, JSON.stringify(got), ok ? 'ok' : `ESPERADO ${JSON.stringify(want)}`);
    if (!ok) errs.push(`${label}: ${JSON.stringify(got)}`);
  };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'es-ES', acceptDownloads: true });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, { tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1 });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const ev = (f, a) => p.evaluate(f, a);
  const tx = () => ev(() => finLive().map((t) => [t.date, t.kind, t.categoryId, t.amount, t.note]));

  // ---- Importes ----
  const cases = ['12,50', '12.50', '1.234,56', '1,234.56', '€12', '12 €', '12€', '-8,5', '+1500', '1.234', '1 234,5', '0,99', '.5', 'EUR 3', '12,', '1.234.567', 'abc', '', '12abc', '1,2,3', '0', '0,125', '12..5', '1.23.4', '--5', '€', '12,345,67'];
  check('importes', await ev((l) => l.map((s) => finParseAmount(s)), cases), [1250, 1250, 123456, 123456, 1200, 1200, 1200, 850, 150000, 123400, 123450, 99, 50, 300, 1200, 123456700, null, null, null, null, null, null, null, null, null, null, null]);
  check('signo', await ev(() => ['+5', '-5', '5', '5-', '−5'].map(finSign)), [1, -1, 0, -1, -1]);
  check('formato', await ev(() => [finMoney(2340), finMoney(123456, 'gasto'), finPlain(1250), finCurrency()]), ['23,40 €', '−1234,56 €', '12,50', 'EUR']);
  check('texto libre', await ev(() => [finParseText('12,50 café comida'), finParseText('+1500 sueldo'), finParseText('ayer 30 gasolina transporte'), finParseText('5 otros ingresos'), finParseText('sin importe')]), [
    { cents: 1250, kind: 'gasto', categoryId: 'c-comida', note: 'café', date: null },
    { cents: 150000, kind: 'ingreso', categoryId: 'c-sueldo', note: '', date: null },
    { cents: 3000, kind: 'gasto', categoryId: 'c-transporte', note: 'gasolina', date: '2026-10-09' },
    { cents: 500, kind: 'ingreso', categoryId: 'c-otros-ingresos', note: '', date: null },
    null,
  ]);

  // ---- La sección y el alta rápida ----
  await p.click('.rib[data-view="finanzas"]'); await p.clock.runFor(100);
  check('sección', [await p.isVisible('#view-finanzas'), await p.textContent('#fin-month')], [true, 'octubre 2026']);
  for (const t of ['12,50 café comida', '+1500 sueldo', 'ayer 30 gasolina transporte']) {
    await p.fill('#fin-amount', t); await p.press('#fin-amount', 'Enter'); await p.clock.runFor(50);
  }
  // Formulario: importe solo, chip de categoría, nota y fecha.
  await p.fill('#fin-amount', '8,40');
  await p.click('#fin-chips .chip:has-text("Ocio")');
  await p.fill('#fin-note', 'cine'); await p.fill('#fin-date', '2026-10-03');
  check('vista previa', await p.textContent('#fin-preview'), '→ Gasto · 🎉 Ocio · 8,40 € · «cine» · Sábado, 3 de octubre');
  await p.press('#fin-note', 'Enter'); await p.clock.runFor(50);
  await p.fill('#fin-amount', 'tonterías'); await p.press('#fin-amount', 'Enter');
  check('rechaza basura', [await p.getAttribute('#fin-amount', 'aria-invalid'), (await tx()).length], ['true', 4]);
  await p.fill('#fin-amount', '');
  check('movimientos', await tx(), [['2026-10-10', 'gasto', 'c-comida', 1250, 'café'], ['2026-10-10', 'ingreso', 'c-sueldo', 150000, ''], ['2026-10-09', 'gasto', 'c-transporte', 3000, 'gasolina'], ['2026-10-03', 'gasto', 'c-ocio', 840, 'cine']]);

  // ---- Presupuestos y tarjetas ----
  await ev(() => { finCat('c-comida').budget = 1500; finCat('c-transporte').budget = 2500; finCat('c-ocio').budget = 10000; save(); renderAll(); });
  check('tarjetas', await p.$$eval('#fin-cards .stat', (s) => s.map((x) => `${x.querySelector('.label').textContent}=${x.querySelector('.num').textContent}`)), ['Ingresos=1500,00 €', 'Gastos=50,90 €', 'Balance=1449,10 €', 'Te queda este mes=89,10 €']);
  check('días que quedan', await p.textContent('#fin-cards .fin-c-left .delta'), '22 días · de 140,00 €');
  check('barras de presupuesto', await p.$$eval('#fin-budgets .fin-budget', (r) => r.map((x) => [x.className, x.querySelector('.fin-budget-pct').textContent.trim(), x.querySelector('.fin-meter-fill').style.width])), [['fin-budget over', '⛔ 120 %', '100%'], ['fin-budget warn', '⚠️ 83 %', '83%'], ['fin-budget ok', '8 %', '8%']]);
  check('pie de presupuesto', await p.textContent('#fin-budgets .fin-budget.over .fin-budget-foot'), 'Te has pasado 5,00 € · 22 días para acabar el mes');

  // ---- Gráficos ----
  check('gasto por categoría', await p.$$eval('#fin-chart-cats .fin-mark', (g) => g.map((x) => [x.dataset.cat, +x.dataset.value])), [['c-transporte', 3000], ['c-comida', 1250], ['c-ocio', 840]]);
  check('suma = gastos', await p.$$eval('#fin-chart-cats .fin-mark', (g) => g.reduce((s, x) => s + +x.dataset.value, 0)), 5090);
  check('6 meses', await p.$$eval('#fin-chart-months .fin-mark', (g) => g.map((x) => `${x.dataset.month}:${x.dataset.inc}/${x.dataset.exp}`)), ['2026-05:0/0', '2026-06:0/0', '2026-07:0/0', '2026-08:0/0', '2026-09:0/0', '2026-10:150000/5090']);
  check('barras con forma', await p.$$eval('#fin-chart-months .fin-bar', (b) => b.map((x) => x.getAttribute('class'))), ['fin-bar inc', 'fin-bar exp']);
  check('tabla del gráfico', await p.$$eval('#fin-chart-cats .fin-table tbody tr', (r) => r.map((x) => x.textContent)), ['🚌 Transporte30,00 €59 %', '🍽️ Comida12,50 €25 %', '🎉 Ocio8,40 €17 %']);

  // ---- Editar y eliminar (con deshacer) ----
  await p.click('#fin-list .fin-row:has-text("café")');
  await p.fill('#fin-dialog .fin-amount-in', '13,75'); await p.press('#fin-dialog .fin-amount-in', 'Enter'); await p.clock.runFor(50);
  check('editar', await ev(() => finLive().find((t) => t.note === 'café').amount), 1375);
  await p.click('#fin-list .fin-row:has-text("café")', { button: 'right' });
  check('menú', await p.$$eval('#note-menu .menu-item span', (n) => n.map((x) => x.textContent)), ['✏️ Editar', '⧉ Duplicar', '🏷️ Cambiar categoría ▸', '🗑 Eliminar']);
  await p.click('#note-menu .menu-item:has-text("Cambiar categoría")');
  await p.click('#note-menu .menu-item:has-text("Compras")'); await p.clock.runFor(50);
  check('cambiar categoría', await ev(() => finLive().find((t) => t.note === 'café').categoryId), 'c-compras');
  await p.click('#fin-list .fin-row:has-text("café")', { button: 'right' });
  await p.click('#note-menu .menu-item:has-text("Eliminar")'); await p.clock.runFor(50);
  const delId = await ev(() => fin().tx.find((t) => t.del)?.id);
  check('eliminar deja marca', [await ev(() => finLive().some((t) => t.note === 'café')), !!delId], [false, true]);
  await p.clock.runFor(1000);
  await p.click('#toast .toast-action'); await p.clock.runFor(50);
  check('deshacer', await ev((id) => { const t = fin().tx.find((x) => x.id === id); return [!t.del, t.note, t.updatedAt > Date.now() - 500]; }, delId), [true, 'café', true]);
  // Duplicar y deshacer: lo añadido queda borrado con marca (para los demás dispositivos).
  await ev(() => finTxMenu(finLive().find((t) => t.note === 'cine').id, 10, 10)[1].action());
  check('duplicar', await ev(() => finLive().filter((t) => t.note === 'cine').length), 2);
  await p.click('#toast .toast-action'); await p.clock.runFor(50);
  check('deshacer duplicar', await ev(() => [finLive().filter((t) => t.note === 'cine').length, fin().tx.filter((t) => t.del).length]), [1, 1]);

  // ---- Gastos fijos ----
  await p.click('#fin-add-rec');
  await p.fill('#fin-dialog input[placeholder^="Alquiler"]', 'Gimnasio');
  await p.fill('#fin-dialog input[placeholder="650"]', '29,90');
  await p.selectOption('#fin-dialog select >> nth=1', 'c-salud');
  await p.click('#fin-dialog button[type=submit]'); await p.clock.runFor(50);
  const recTx = () => ev(() => finLive().filter((t) => t.recurringId).map((t) => [t.id.replace(/rec-.+-(\d{4}-\d\d)$/, 'rec-*-$1'), t.date, t.amount, t.categoryId]));
  check('fijo creado hoy', await recTx(), [['rec-*-2026-10', '2026-10-10', 2990, 'c-salud']]);
  await ev(() => { fin().recurring[0].lastRun = null; finRunRecurring(); finRunRecurring(); });
  check('dos veces → uno', (await recTx()).length, 1);
  check('lista de fijos', await p.textContent('#fin-rec .fin-row-sub'), 'Día 10 · Salud · próximo: martes, 10 de noviembre');
  await p.click('#fin-rec .chip:has-text("Pausar")'); await p.clock.runFor(50);
  check('pausa', await ev(() => fin().recurring[0].active), false);
  // Otro empezado en agosto, día 31: uno por mes, el último día si el mes es más corto.
  await ev(() => { fin().recurring.push({ id: 'alq', amount: 65000, kind: 'gasto', categoryId: 'c-casa', note: 'Alquiler', day: 31, active: true, since: '2026-08-01', lastRun: null }); finRunRecurring(); });
  check('meses atrasados', await ev(() => finLive().filter((t) => t.recurringId === 'alq').map((t) => t.date).sort()), ['2026-08-31', '2026-09-30']);

  // ---- CSV ----
  const csv = await ev(() => finCsv('2026-10'));
  check('csv', csv.split('\r\n').slice(0, 3), ['﻿Fecha;Tipo;Categoría;Importe;Nota', '2026-10-03;Gasto;Ocio;8,40;cine', '2026-10-09;Gasto;Transporte;30,00;gasolina']);
  check('csv acentos', csv.includes('café') && csv.includes('Categoría'), true);
  await ev(() => finTxMenu(finLive().find((t) => t.note === 'cine').id, 0, 0)); // sin efecto
  await ev(() => { const t = finLive().find((x) => x.note === 'cine'); t.note = 'cine; "palomitas"'; save(); });
  check('csv comillas', (await ev(() => finCsv('2026-10'))).split('\r\n')[1], '2026-10-03;Gasto;Ocio;8,40;"cine; ""palomitas"""');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#fin-more').then(() => p.click('#note-menu .menu-item:has-text("Exportar CSV de")'))]);
  const bytes = fs.readFileSync(await dl.path());
  check('descarga', [dl.suggestedFilename(), [...bytes.slice(0, 3)], bytes.toString('utf8').includes('Categoría')], ['finanzas-2026-10.csv', [0xef, 0xbb, 0xbf], true]);

  // ---- Importar CSV ----
  const bank = 'Fecha;Concepto;Importe\r\n03/10/2026;"cine; ""palomitas""";-8,40\r\n05/10/2026;Mercadona;-45,10\r\n06/10/2026;Bizum de Ana;+20,00\r\n07/10/2026;Basura;abc\r\n';
  await ev((t) => finImportDialog(t, 'banco.csv'), bank);
  check('importar: resumen', await p.textContent('#fin-dialog .fin-import-sum'), '2 nuevos · 1 duplicado · 1 fila con errores');
  check('importar: columnas', await p.$$eval('#fin-dialog .fin-map select', (s) => s.map((x) => x.value)), ['0', '2', '1', '-1', '-1']);
  check('importar: botón', await p.textContent('#fin-dialog button[type=submit]'), 'Importar 2 movimientos');
  await p.click('#fin-dialog button[type=submit]'); await p.clock.runFor(50);
  check('importados', await ev(() => finLive().filter((t) => t.account === 'CSV').map((t) => [t.date, t.kind, t.amount, t.note, t.categoryId])), [['2026-10-05', 'gasto', 4510, 'Mercadona', 'c-otros'], ['2026-10-06', 'ingreso', 2000, 'Bizum de Ana', 'c-otros-ingresos']]);
  // Lo exportado se puede volver a importar: todo sale duplicado.
  await ev(() => finImportDialog(finCsv('2026-10')));
  check('reimportar lo exportado', (await p.textContent('#fin-dialog .fin-import-sum')).startsWith('0 nuevos'), true);
  await p.keyboard.press('Escape');

  // ---- Categorías: borrar una con movimientos pregunta a dónde moverlos ----
  await ev(() => finDeleteCat('c-ocio'));
  check('borrar categoría pregunta', await p.textContent('#fin-dialog h3'), 'Eliminar «Ocio»');
  await p.selectOption('#fin-dialog select', 'c-compras'); await p.click('#fin-dialog button[type=submit]'); await p.clock.runFor(50);
  check('movidos', await ev(() => [fin().categories.some((x) => x.id === 'c-ocio'), finLive().find((t) => t.note.startsWith('cine')).categoryId]), [false, 'c-compras']);

  // ---- Captura rápida: chip «Gasto» ----
  await p.click('#capture-fab');
  check('chips de captura', await p.$$eval('#capture .capture-kinds .chip', (c) => c.map((x) => x.textContent)), ['✅ Tarea', '📝 Nota', '💡 Idea', '💰 Gasto']);
  await p.click('#capture .capture-kinds .chip:has-text("Gasto")');
  check('botón de captura', await p.textContent('#capture-save'), 'Guardar');
  await p.keyboard.type('4,20 pan comida'); await p.keyboard.press('Enter'); await p.clock.runFor(50);
  check('gasto capturado', await ev(() => { const t = finLive().at(-1); return [t.amount, t.categoryId, t.note, t.date]; }), [420, 'c-comida', 'pan', '2026-10-10']);
  check('sin tareas', await ev(() => state.tasks.length), 0);

  // ---- Búsqueda global ----
  check('búsqueda', await ev(() => { const g = gsSearch('gasolina').groups.find((x) => x.type === 'finance'); return g && g.items.map((e) => [e.it.title, e.it.sub]); }), [['gasolina', '🚌 Transporte · Ayer · −30,00 €']]);
  check('busca por importe', await ev(() => gsSearch('45,10').groups.find((x) => x.type === 'finance')?.items.map((e) => e.it.title)), ['Mercadona']);
  check('busca por categoría', await ev(() => gsSearch('sueldo').groups.find((x) => x.type === 'finance')?.items.length), 1);

  // ---- Hoy ----
  await ev(() => showView('today'));
  check('línea en Hoy', [await p.isVisible('#today-fin'), await p.textContent('#today-fin')], [true, '💰 Hoy: 47,85 € · +1500,00 €']);
  await p.click('#today-fin');
  check('abre Finanzas', await ev(() => activeTab().view), 'finanzas');

  // ---- Ocultar importes ----
  await p.click('#fin-hide'); await p.clock.runFor(50);
  const blur = () => p.$eval('#fin-cards .fin-amt', (a) => getComputedStyle(a).filter);
  check('oculto', [await ev(() => document.documentElement.classList.contains('fin-hide')), (await blur()).includes('blur')], [true, true]);
  await p.click('#fin-cards .fin-amt'); await p.waitForTimeout(400);
  check('tocar enseña', await blur(), 'none');
  check('el toque no abre nada', await p.isVisible('#fin-dialog'), false);
  await ev(() => finSetHidden(false));
  check('se quita', await ev(() => document.documentElement.classList.contains('fin-hide')), false);

  // ---- Paleta de comandos ----
  check('comandos', await ev(() => commands().map((x) => x.label).filter((l) => /gasto|Finanzas|movimientos \(CSV\)/.test(l))), ['💰 Añadir gasto', '💰 Abrir Finanzas', '⬇️ Exportar movimientos (CSV)', '⬆️ Importar movimientos (CSV)', 'Ir a Finanzas']);
  check('exportación y deshacer incluyen finance', await ev(() => DATA_KEYS.includes('finance')), true);
  await p.screenshot({ path: `${process.argv[3]}/finanzas.png`, fullPage: true });
  await c.close();

  // ---- Dos dispositivos: mismo mes, se fusionan por id ----
  const meta = { categories: [], recurring: [{ id: 'gym', amount: 2990, kind: 'gasto', categoryId: 'c-salud', note: 'Gimnasio', day: 1, active: true, since: '2026-09-01', lastRun: null }], currency: 'EUR', seeded: false, edited: true };
  const cloud = { 'fin-meta': { ...meta, updatedAt: now - 5000 }, 'fin-2026-10': { items: [{ id: 'x', date: '2026-10-02', amount: 500, kind: 'gasto', categoryId: 'c-comida', note: 'común', createdAt: now - 9000, updatedAt: now - 9000 }], updatedAt: now - 5000 } };
  const device = async () => {
    const ctx = await b.newContext({ locale: 'es-ES' });
    await ctx.addInitScript(mock, cloud);
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.clock.install({ time: new Date(now) });
    await pg.goto(url); await pg.clock.runFor(2500);
    return pg;
  };
  const A = await device();
  const B = await device();
  // Una sola nube: de cada documento queda la última escritura (la de updatedAt mayor) y llega a los dos.
  const relay = async () => {
    const [da, db] = await Promise.all([A, B].map((pg) => pg.evaluate(() => Object.fromEntries([...window.__docs]))));
    const docs = { ...da };
    Object.entries(db).forEach(([k, v]) => (!docs[k] || v.updatedAt > docs[k].updatedAt) && (docs[k] = v));
    for (const pg of [A, B]) await pg.evaluate((d) => { Object.entries(d).forEach(([k, v]) => window.__docs.set(k, v)); window.__emit(); }, docs);
    for (const pg of [A, B]) await pg.clock.runFor(2500);
  };
  const live = (pg) => pg.evaluate(() => finLive().map((t) => (t.recurringId ? t.id : t.note)).sort());
  check('A al abrir', await live(A), ['común', 'rec-gym-2026-09', 'rec-gym-2026-10'].sort());
  await A.evaluate(() => finAddTx({ cents: 1000, kind: 'gasto', categoryId: 'c-comida', note: 'desde A', date: '2026-10-08' }));
  await B.clock.runFor(100);
  await B.evaluate(() => finAddTx({ cents: 2000, kind: 'gasto', categoryId: 'c-ocio', note: 'desde B', date: '2026-10-08' }));
  await A.clock.runFor(2500); await B.clock.runFor(2500);
  await relay();
  await relay();
  const want = ['común', 'desde A', 'desde B', 'rec-gym-2026-09', 'rec-gym-2026-10'].sort();
  check('A fusionado', await live(A), want);
  check('B fusionado', await live(B), want);
  check('nube', await A.evaluate(() => window.__docs.get('fin-2026-10').items.filter((t) => !t.del).length), 4);
  // Un borrado en B llega a A (y no vuelve).
  await B.evaluate(() => finDeleteTx('x')); await B.clock.runFor(2500);
  await relay();
  check('borrado llega', (await live(A)).includes('común'), false);
  await relay();
  check('y no vuelve', (await live(B)).includes('común'), false);
  console.log('errors:', errs); await b.close();
})();
