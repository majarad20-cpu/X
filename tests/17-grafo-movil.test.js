const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url);
  await p.evaluate(() => { createNote({ title: 'Uno', body: 'Ver [[Dos]] y [[Tres]]', open: false }); createNote({ title: 'Dos', body: '[[Tres]]', open: false }); openTab({ type: 'graph' }); });
  await p.waitForTimeout(5000);
  console.log('count:', await p.textContent('#graph-count'), '| overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await p.screenshot({ path: S + '/m-graph.png' });
  console.log('errors:', errs); await b.close();
})();
