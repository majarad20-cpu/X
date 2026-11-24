const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('s1', 'ESTOICISMO/Sobre la ira', '# Sobre la ira\n> «No nos afecta lo que nos sucede, sino lo que nos decimos sobre lo que nos sucede.» — Epicteto\n\nSéneca escribe en De ira III, 36 sobre el examen de la noche.\n'),
  N('s2', 'ESTOICISMO/Meditaciones', '# Meditaciones\nMarco Aurelio, Meditaciones IV.3: retírate a ti mismo.\nSéneca, Cartas 12.\n'),
  N('a1', 'MATRIZ/Papeles de Trabajo', '# Papeles\nLa NIA 230 exige documentación de auditoría.\n'),
  N('a2', 'MATRIZ/Materialidad', '# Materialidad\nNIA 320 y NIA 230 aplican aquí.\n'),
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
  const shot = async (n) => out && p.screenshot({ path: `${out}/103-${n}.png` });

  // Menús
  await p.click('[data-group="vistas"] .tb-head'); await p.waitForTimeout(100);
  check('menú Vistas', await p.$$eval('[data-group="vistas"] .tb-sec', (n) => n.map((x) => x.textContent)), ['Visualizar', 'Organizar', 'Crear', 'Estudiar']);
  await shot('menu-vistas');
  await p.click('[data-group="vistas"] .rib[data-view="tableros"]'); await p.waitForTimeout(150);
  check('abre desde el menú y lo marca', await p.evaluate(() => [activeTab().view, document.querySelector('[data-group="vistas"] .tb-head').classList.contains('has-active')]), ['tableros', true]);
  await p.click('[data-group="especialidades"] .tb-head'); await p.waitForTimeout(100);
  await shot('menu-especialidades');

  // Panel estoico
  await p.click('[data-group="especialidades"] .rib >> text=Panel estoico'); await p.waitForTimeout(200);
  check('panel estoico', await p.evaluate(() => [document.querySelector('#view-especialidad .gv-title').textContent, gvSrcLabel(specProfile(specById('estoicismo')).src)]), ['🏛️ Estoicismo', '📁 ESTOICISMO']);
  check('fuentes estoicas', await p.$$eval('#view-especialidad .spec-src .pro-row', (n) => n.slice(0, 3).map((x) => [x.querySelector('strong').textContent, x.querySelector('.pro-num').textContent])), [['Séneca', '2 notas'], ['Epicteto', '1 nota'], ['Marco Aurelio', '1 nota']]);
  check('calendario de hoy', await p.$$eval('#view-especialidad .spec-ev.today strong', (n) => n.map((x) => x.textContent)), ['Premeditatio malorum', 'Examen de la noche']);
  await shot('panel-estoico');

  // Dicotomía
  await p.evaluate(() => showView('dicotomia')); await p.waitForTimeout(150);
  await p.fill('#view-dicotomia .dic-sit', 'Reunión difícil');
  await p.fill('#view-dicotomia .dic-col.mine textarea', 'Preparar bien\nMi tono');
  await p.fill('#view-dicotomia .dic-col:nth-child(2) textarea', 'Lo que diga el cliente');
  await p.click('#view-dicotomia .gv-bar .primary'); await p.waitForTimeout(200);
  const dic = await p.evaluate(() => state.notes.find((n) => n.path.startsWith('ESTOICISMO/Dicotomía/')));
  check('dicotomía guardada', [!!dic, /## ✅ Depende de mí\n- Preparar bien\n- Mi tono/.test(dic?.body || ''), /# Reunión difícil/.test(dic?.body || '')], [true, true, true]);

  // Virtudes
  await p.evaluate(() => showView('virtudes')); await p.waitForTimeout(150);
  await p.click('#view-virtudes .virt-btn >> text=Coraje'); await p.waitForTimeout(150);
  check('virtud marcada', await p.evaluate(() => [state.settings.virtues[dateKey()], document.querySelectorAll('#view-virtudes .virt-cell.v1').length >= 1, document.querySelectorAll('#view-virtudes .virt-grid .virt-cell').length > 360]), [['coraje'], true, true]);
  await shot('virtudes');

  // Nueva especialidad
  await p.evaluate(() => specNew()); await p.waitForTimeout(100);
  await p.keyboard.type('Auditor'); await p.waitForTimeout(100); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check('especialidad creada', await p.evaluate(() => [specCfg().custom.map((x) => [x.id, x.icon]), !!findNoteByName('Sistema/Especialidad - Auditor'), activeTab().view, [...document.querySelectorAll('[data-group="especialidades"] .tb-sec')].map((x) => x.textContent)]), [[['x-auditor', '🔎']], true, 'especialidad', ['🧾 Contador', '🏛️ Estoicismo', '🔎 Auditor']]);
  await p.evaluate(() => { const n = findNoteByName('Sistema/Especialidad - Auditor'); n.body = n.body.replace('- carpeta: Auditor', '- carpeta: MATRIZ').replace('## Fuentes\nAutores, normas u obras que el panel cuenta en tus notas (una por línea).\n- ', '## Fuentes\nAutores, normas u obras.\n- NIA 230\n- NIA 320'); n.updatedAt = Date.now(); dataRev++; save(); renderAll(); });
  await p.waitForTimeout(150);
  check('panel del auditor', await p.$$eval('#view-especialidad .spec-src .pro-row', (n) => n.map((x) => [x.querySelector('strong').textContent, x.querySelector('.pro-num').textContent])), [['NIA 230', '2 notas'], ['NIA 320', '1 nota']]);

  // Ajustes: ocultar Estoicismo
  await p.evaluate(() => showView('settings')); await p.waitForTimeout(150);
  check('lista en Ajustes', await p.$$eval('#spec-settings .spec-row label', (n) => n.map((x) => x.textContent.trim())), ['🧾 Contador', '🏛️ Estoicismo', '🔎 Auditor']);
  await p.click('#spec-settings .spec-row:nth-child(2) input'); await p.waitForTimeout(100);
  check('estoicismo oculto', await p.$$eval('[data-group="especialidades"] .tb-sec', (n) => n.map((x) => x.textContent)), ['🧾 Contador', '🔎 Auditor']);

  // Pestañas
  await p.evaluate(() => { openNote(noteById('s1'), { newTab: true }); openNote(noteById('a1'), { newTab: true }); });
  await p.waitForTimeout(150);
  const idxA1 = await p.evaluate(() => ws.tabs.findIndex((t) => t.id === 'a1'));
  await p.evaluate((i) => tabMenuItems(i).find((x) => x.label === '📌 Fijar pestaña').action(), idxA1); await p.waitForTimeout(100);
  check('fijada primero', await p.evaluate(() => [ws.tabs[0].id, ws.tabs[0].pinned, document.querySelector('#ws-tabs .ws-tab').classList.contains('pinned')]), ['a1', true, true]);
  await p.evaluate(() => { ws.active = 0; renderWorkspace(); openNote(noteById('a2')); }); await p.waitForTimeout(100);
  check('no reemplaza la fijada', await p.evaluate(() => [ws.tabs[0].id, activeTab().id]), ['a1', 'a2']);
  await p.evaluate(() => { const i = ws.active; ws.tabs[i].color = 'green'; saveTabs(); renderWorkspace(); }); await p.waitForTimeout(50);
  check('color', await p.evaluate(() => document.querySelector('#ws-tabs .ws-tab.active').dataset.color), 'green');
  await p.evaluate(() => tabMenuItems(ws.active).find((x) => x.label.startsWith('Cerrar las demás')).action()); await p.waitForTimeout(100);
  check('cerrar las demás respeta la fijada', await p.evaluate(() => ws.tabs.map((t) => t.id || t.view)), ['a1', 'a2']);
  // Vista dividida
  await p.evaluate(() => splitSet('radar')); await p.waitForTimeout(200);
  check('vista dividida', await p.evaluate(() => { const n = document.querySelector('#note-pane').getBoundingClientRect(); const v = document.querySelector('#views-pane').getBoundingClientRect(); return [document.querySelector('.ws-panes').classList.contains('split'), document.querySelector('#view-radar').classList.contains('active'), n.width > 200 && v.width > 200 && v.left >= n.right - 2]; }), [true, true, true]);
  await shot('vista-dividida');
  await p.evaluate(() => splitSet(null)); await p.waitForTimeout(100);
  check('sin vista dividida', await p.evaluate(() => [document.querySelector('.ws-panes').classList.contains('split'), document.querySelector('#views-pane').hidden]), [false, true]);
  await p.click('#ws-tab-list'); await p.waitForTimeout(100);
  check('lista de pestañas', await p.evaluate(() => document.querySelectorAll('#picker .pk-item').length), 2);
  await p.keyboard.press('Escape');

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
