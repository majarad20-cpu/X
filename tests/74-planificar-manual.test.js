const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-12T08:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1100, height: 800 } });
  const T = (id, title, extra = {}) => ({ id, title, tags: [], priority: 2, due: '2026-10-13', repeat: null, time: null, notes: '', projectId: null, order: 1, subtasks: [], done: false, pomodoros: 0, createdAt: 1, ...extra });
  await c.addInitScript((tasks) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks, habits: [], settings: { notesWelcome: true, planDay: { from: '09:00', to: '18:00' } }, notes: [], updatedAt: 1 })); }, [T('a', 'Informe'), T('b', 'Llamar al banco', { duration: 15 }), T('c', 'Ordenar correo')]);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  await p.evaluate(() => openPlanDay('2026-10-13')); await p.clock.runFor(100);
  check('cuadro de texto visible', await p.evaluate(() => document.getElementById('pld-hint').getBoundingClientRect().height > 30), true);
  check('por planificar', await p.$$eval('#pld-out .pld-todo li', (n) => n.length), 3);
  // Actividad nueva fuera del horario, con inicio y fin
  await p.fill('#pld-add-title', 'Gimnasio'); await p.fill('#pld-add-from', '07:00'); await p.fill('#pld-add-to', '08:00');
  await p.click('#pld-add-go');
  // Tarea existente con inicio y duración
  await p.fill('#pld-add-title', 'Informe'); await p.fill('#pld-add-from', '10:00'); await p.fill('#pld-add-dur', '45');
  await p.keyboard.press('Enter');
  // Otra al primer hueco libre con «＋»
  await p.click('#pld-out .pld-todo li:has-text("Llamar al banco") .pld-place');
  const blocks = () => p.evaluate(() => pd.blocks.map((x) => `${hm(x.start)}-${hm(x.end)} ${x.title}${x.isNew ? ' (nueva)' : ''}`));
  check('bloques', await blocks(), ['07:00-08:00 Gimnasio (nueva)', '09:00-09:15 Llamar al banco', '10:00-10:45 Informe']);
  check('sin errores marcados', await p.evaluate(() => [document.querySelectorAll('.pld-row.bad').length, document.getElementById('pld-accept').textContent]), [0, 'Aceptar (3 tareas)']);
  // Cambiar la duración en la lista
  await p.fill('.pld-row:has-text("Informe") .pld-dur', '90'); await p.press('.pld-row:has-text("Informe") .pld-dur', 'Tab');
  check('duración cambiada', (await blocks())[2], '10:00-11:30 Informe');
  // Tocar la línea de tiempo pone la hora
  await p.evaluate(() => { const tl = $('#pld-timeline'); const r = tl.getBoundingClientRect(); tl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 100, clientY: r.top + ((14 * 60 - Number(tl.dataset.h0) * 60) / 60) * PD_PX })); });
  check('hora desde la línea de tiempo', await p.inputValue('#pld-add-from'), '14:00');
  // Plan automático: conserva lo añadido a mano y coloca el resto
  await p.evaluate(() => { window.aiReady = () => false; });
  await p.evaluate(() => pdPropose()); await p.clock.runFor(50);
  const after = await blocks();
  check('plan conserva lo manual', [after.includes('07:00-08:00 Gimnasio (nueva)'), after.includes('10:00-11:30 Informe'), after.includes('09:00-09:15 Llamar al banco'), after.some((x) => x.endsWith('Ordenar correo'))], [true, true, true, true]);
  await p.click('#pld-accept'); await p.clock.runFor(100);
  check('aplicado', await p.evaluate(() => { const g = state.tasks.find((t) => t.title === 'Gimnasio'); const i = state.tasks.find((t) => t.id === 'a'); return [g && [g.due, g.time, g.duration], [i.due, i.time, i.duration]]; }), [['2026-10-13', '07:00', 60], ['2026-10-13', '10:00', 90]]);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
