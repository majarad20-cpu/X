const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('a', 'MATRIZ/Ganancias de Capital', '# Ganancias\nEl mayor valor del art. 107 LIR paga un impuesto único de 10 %.\nEra exento según el art. 107 LIR original (0 %).\nDesde 2027 el art. 107 LIR es ingreso no renta (Ley 21.850).\n'),
  N('b', 'MATRIZ/Planificación Financiera', '# Planificación\nLas acciones con presencia bursátil (art. 107 LIR) tributan con 15 % sobre la ganancia.\n'),
  N('c', 'MATRIZ/Obligaciones UAF', '# UAF\nLa Circular UAF 62 derogó la Circular UAF 57 desde el 01-06-2025.\nLa nueva Ley 19.628 rige desde el 15-10-2027 (Ley 21.719, postergada por la Ley 21.855).\n'),
  N('d', 'MATRIZ/KYC Clientes', '# KYC\nSegún la Circular UAF 57 el umbral es USD 15.000.\nEl art. 53 CT fija el interés penal; ver también el Código Tributario.\n'),
  N('e', 'MATRIZ/Ley 21.719 - Datos Personales', '# Ley 21.719\nFicha de la ley.\n'),
  N('f', 'MATRIZ/⏰ Alertas Normativas y Seguimiento', '# Alertas\n| ✔ | Alerta |\n|:--:|:--|\n| [ ] | **Nueva Ley 19.628 desde el 15-10-2027** (Ley 21.719) |\n| [x] | Ley 18.010 cerrada |\n'),
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
  await p.goto(url); await p.waitForTimeout(800);

  check('sección Contador', await p.$$eval('[data-group="especialidades"] .tb-col:first-child .rib', (n) => n.map((x) => x.dataset.view || x.id)), ['radar', 'contradicciones', 'vigencia', 'calendario-trib', 'rib-pro-profile']);
  check('Finanzas oculta por defecto', await p.evaluate(() => [getComputedStyle(document.querySelector('.prodbar .rib[data-view="finanzas"]')).display]), ['none']);
  check('reconocer normas', await p.evaluate(() => proNormsIn('La Circular SII N° 53 de 2025, la Res. Ex. 88/2026, el DL 824, la ley 21713, NIC 12, el Oficio 278 de 2026 y el art. 85 ter CT', proProfile()).map((x) => x.key)), ['Circular SII 53/2025', 'Res. Ex. 88/2026', 'DL 824', 'Ley 21.713', 'NIC 12', 'Oficio 278/2026', 'DL 830']);

  // Radar
  await p.evaluate(() => document.querySelector('.rib[data-view="radar"]').click()); await p.waitForTimeout(200);
  const keys = await p.$$eval('#view-radar .pro-key strong', (n) => n.map((x) => x.textContent));
  check('normas del radar', keys.includes('DL 824') && keys.includes('Circular UAF 57') && keys.includes('Ley 21.719'), true);
  const idx = await p.evaluate(() => { const { norms } = proIndex(); const e = (k) => norms.get(k); return { lir: [e('DL 824').notes.size, [...e('DL 824').arts.keys()]], uaf57: [...e('Circular UAF 57').signals.keys()], l21719: [e('Ley 21.719').future.map((f) => f.date)[0], e('Ley 21.719').alerts.length], ficha: proFicha('Ley 21.719')?.id, ley19628: [...e('Ley 19.628').signals.keys()] }; });
  check('índice', idx, { lir: [2, ['107']], uaf57: ['derogada'], l21719: ['2027-10-15', 1], ficha: 'e', ley19628: [] });
  await p.fill('#view-radar .gv-search', '21.719'); await p.waitForTimeout(400);
  await p.click('#view-radar .pro-row'); await p.waitForTimeout(150);
  check('detalle con señales', await p.evaluate(() => [...document.querySelectorAll('#view-radar .pro-badge')].map((x) => x.textContent)), ['⏸ postergada · 1', '🔜 15-10-2027', '⚠️ alerta · 1']);
  await shot();
  async function shot(name = 'radar') { if (out) await p.screenshot({ path: `${out}/101-${name}.png` }); }
  await p.click('#view-radar .pro-line'); await p.waitForTimeout(200);
  check('abre la nota en la línea', await p.evaluate(() => !!activeNote()), true);

  // Contradicciones
  await p.evaluate(() => document.querySelector('.rib[data-view="contradicciones"]').click()); await p.waitForTimeout(200);
  const contra = await p.evaluate(() => proContradictions().map((x) => [x.type, x.subject, x.type === 'dato' ? x.notes.map((n) => [n.note.id, [...n.values]]) : x.plain.map((q) => q.note.id)]));
  check('contradicciones', contra, [['derogada', 'Circular UAF 57', ['d']], ['dato', 'art. 107 DL 824', [['a', ['10']], ['b', ['15']]]]]);
  await shot('contradicciones');
  await p.click('#view-contradicciones .pro-card >> text=Revisado'); await p.waitForTimeout(150);
  check('marcar revisado', await p.evaluate(() => proContradictions().length), 1);

  // Perfil: se crea como nota y cambia el reconocimiento
  await p.evaluate(() => document.querySelector('#rib-pro-profile').click()); await p.waitForTimeout(200);
  check('perfil creado', await p.evaluate(() => activeNote()?.path), 'Sistema/Perfil - Contador Chile');
  await p.evaluate(() => { const n = activeNote(); n.body = n.body.replace('- [x] Leyes', '- [ ] Leyes'); n.updatedAt = Date.now(); dataRev++; save(); });
  check('perfil sin leyes', await p.evaluate(() => proNormsIn('Ley 21.713 y DL 824', proProfile()).map((x) => x.key)), ['DL 824']);

  // Ajustes
  await p.evaluate(() => showView('settings')); await p.waitForTimeout(150);
  await p.click('#set-g-tareas label:has-text("Finanzas") input'); await p.waitForTimeout(100);
  check('mostrar Finanzas', await p.evaluate(() => [state.settings.hiddenViews.includes('finanzas'), getComputedStyle(document.querySelector('.prodbar .rib[data-view="finanzas"]')).display !== 'none']), [false, true]);
  await p.click('#pro-on'); await p.waitForTimeout(100);
  check('apagar especialidad', await p.evaluate(() => [...document.querySelectorAll('[data-group="especialidades"] .tb-sec')].map((x) => x.textContent)), ['🏛️ Estoicismo']);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
