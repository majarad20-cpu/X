const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready === '1');
  // Abrir la sección: máxima del día y tarjetas de práctica
  await p.evaluate(() => document.querySelector('.rib[data-view="stoa"]').click());
  await p.waitForTimeout(300);
  const shown = await p.evaluate(() => { const v = document.getElementById('view-stoa'); return [v.classList.contains('active'), !!v.querySelector('.stoa-maxim'), v.querySelectorAll('.stoa-card').length > 0]; });
  console.log('vista:', JSON.stringify(shown));
  if (JSON.stringify(shown) !== '[true,true,true]') errs.push('la sección no se dibujó');
  // En «Hoy» también aparece la máxima
  await p.evaluate(() => document.querySelector('.rib[data-view="today"]')?.click());
  await p.waitForTimeout(300);
  console.log('hoy:', await p.evaluate(() => !document.getElementById('today-stoa').hidden));
  console.log('errors:', errs); await b.close();
})();
