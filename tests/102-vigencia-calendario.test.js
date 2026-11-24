const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('a', 'MATRIZ/Ganancias de Capital', '---\ntipo: concepto\nactualizada: 2025-01-10\nvigencia: "Verificado al 10-01-2025"\n---\n# Ganancias\nEl art. 107 LIR rige desde el 01-01-2026 con ingreso no renta.\n'),
  N('b', 'MATRIZ/IVA en Servicios', '---\ntipo: concepto\nactualizada: 2026-11-20\nvigencia: "Verificado al 20-11-2026"\n---\n# IVA\nTodo al día.\n'),
  N('c', 'MATRIZ/KYC Clientes', '---\ntipo: concepto\nactualizada: 2026-11-01\nvigencia: "ok 01-11-2026"\n---\n# KYC\nSegún la Circular UAF 57 el umbral es USD 15.000.\n'),
  N('d', 'MATRIZ/Obligaciones UAF', '---\ntipo: concepto\nactualizada: 2026-11-01\nvigencia: "ok 01-11-2026"\n---\n# UAF\nLa Circular UAF 62 derogó la Circular UAF 57.\n'),
  N('e', 'MATRIZ/Sin vigencia', '---\ntipo: concepto\nactualizada: 2026-11-15\n---\n# Nota\nTexto.\n'),
  N('m', 'MOCS/1.- MOC - CONTABILIDAD', '---\ntipo: MOC\n---\n# MOC\n'),
  N('al', 'MATRIZ/⏰ Alertas Normativas y Seguimiento', '# Alertas\n## 🔴 Alta\n| ✔ | Alerta | Fecha límite |\n|:--:|:--|:--|\n| [ ] | **Prórroga del diésel** | **31-12-2026** |\n\n## 🟠 Relevancia media: aparecen en la práctica\n| ✔ | Alerta | Qué hacer | Para qué | Nota afectada |\n|:--:|:--|:--|:--|:--|\n| [ ] | **Nueva Ley 19.628 desde el 15-10-2027** (Ley 21.719) | x | y | z |\n\n## 🟢 Baja\n'),
];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true, look: { ribbonLabels: 'on', ribAutoV1: true } }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  // Fecha fija: 24-11-2026
  await p.clock.install({ time: new Date('2026-11-24T10:00:00') });
  await p.goto(url); await p.clock.runFor(800);
  const shot = async (n) => out && p.screenshot({ path: `${out}/102-${n}.png` });
  check('sección Contador', await p.$$eval('.ribbon [data-group="pro"] .rib', (n) => n.map((x) => x.dataset.view || x.id)), ['radar', 'contradicciones', 'vigencia', 'calendario-trib', 'rib-pro-profile']);

  // Revisión de vigencia
  check('cola', await p.evaluate(() => vgQueue({ t: 'all' }, 6).map((x) => [x.note.id, x.reasons.map((r) => r.id)])), [['a', ['llega', 'antigua']], ['c', ['derogada']], ['e', ['sin']]]);
  await p.click('.ribbon [data-view="vigencia"]'); await p.clock.runFor(200);
  check('primera tarjeta', await p.evaluate(() => document.querySelector('#view-vigencia .vg-title').textContent), 'Ganancias de Capital');
  await shot('vigencia');
  await p.keyboard.press('1'); await p.clock.runFor(200);
  check('sigue vigente', await p.evaluate(() => [propOf(noteById('a'), 'revisada'), document.querySelector('#view-vigencia .vg-title').textContent]), ['2026-11-24', 'KYC Clientes']);
  await p.click('#view-vigencia .vg-actions button:nth-child(3)'); await p.clock.runFor(200);
  await p.keyboard.press('Enter'); await p.clock.runFor(300);
  check('alerta en la tabla 🟠', await p.evaluate(() => noteById('al').body.split('\n').filter((l) => l.includes('[[KYC Clientes]]'))), ['| [ ] | **Revisar «KYC Clientes»: cita la Circular UAF 57, derogada según otra nota** | Revisar la nota y actualizarla | Revisión de vigencia del 24-11-2026 | [[KYC Clientes]] |']);
  check('la fila va después de la última del 🟠', await p.evaluate(() => { const l = noteById('al').body.split('\n'); return l.indexOf(l.find((x) => x.includes('[[KYC Clientes]]'))) - l.findIndex((x) => x.includes('Ley 19.628')); }), 1);

  // Calendario tributario
  check('días hábiles', await p.evaluate(() => [ctShift('2026-12-20', new Set()), ctShift('2026-09-18', new Set()), ctShift('2027-01-01', new Set())]), ['2026-12-21', '2026-09-21', '2027-01-04']);
  const dec = await p.evaluate(() => ctEvents('2026-12-01', '2026-12-31').map((e) => `${e.date} ${e.kind} ${e.title}`));
  check('diciembre', dec, ['2026-12-10 obl Cotizaciones previsionales (pago no electrónico)', '2026-12-14 obl F29 (IVA, PPM y retenciones)', '2026-12-14 obl Cotizaciones previsionales (pago electrónico)', '2026-12-21 obl F29 por internet', '2026-12-31 alerta ⚠️ Prórroga del diésel']);
  check('vigencia futura', await p.evaluate(() => ctEvents('2027-10-01', '2027-10-31').filter((e) => e.kind !== 'obl').map((e) => `${e.date} ${e.kind}`)), ['2027-10-15 alerta', '2027-10-15 norma']);
  check('abril', await p.evaluate(() => ctEvents('2027-04-01', '2027-04-30').filter((e) => /F22|Contribuciones/.test(e.title)).map((e) => `${e.date} ${e.title}`)), ['2027-04-30 F22 Declaración anual de impuestos a la renta', '2027-04-30 Contribuciones de bienes raíces (cuotas)']);
  await p.click('.ribbon [data-view="calendario-trib"]'); await p.clock.runFor(200);
  check('mes y próximos', await p.evaluate(() => [document.querySelector('#view-calendario-trib .ct-month').textContent, document.querySelectorAll('#view-calendario-trib .ct-up .ct-ev').length > 3]), ['noviembre de 2026', true]);
  await shot('calendario');
  await p.click('#view-calendario-trib .gv-chip >> text="›"'); await p.clock.runFor(200);
  check('siguiente mes', await p.evaluate(() => document.querySelector('#view-calendario-trib .ct-month').textContent), 'diciembre de 2026');
  // Perfil: el calendario se agrega a la nota y manda
  await p.evaluate(() => ctEditProfile()); await p.clock.runFor(300);
  await p.evaluate(() => { const n = proProfileNote(); n.body = n.body.replace('- Anual · 31-01, 31-07 · Patente municipal · según la municipalidad', '- Anual · 15-12 · Mi obligación propia'); n.updatedAt = Date.now(); dataRev++; save(); });
  check('obligación del perfil', await p.evaluate(() => ctEvents('2026-12-01', '2026-12-31').some((e) => e.title === 'Mi obligación propia' && e.date === '2026-12-15')), true);
  const ics = await p.evaluate(async () => { let got = ''; const orig = URL.createObjectURL; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => {}; URL.createObjectURL = (b) => { b.text().then((t) => (got = t)); return 'blob:x'; }; await ctExportIcs(); await new Promise((r) => setTimeout(r, 50)); URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = click; return got; });
  check('ics', [ics.startsWith('BEGIN:VCALENDAR'), /DTSTART;VALUE=DATE:20261214/.test(ics), (ics.match(/BEGIN:VEVENT/g) || []).length > 40], [true, true, true]);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
