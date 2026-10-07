const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url);
  await p.screenshot({ path: S + '/m-today.png' });
  await p.tap('#toggle-left'); await p.waitForTimeout(300);
  await p.screenshot({ path: S + '/m-drawer.png' });
  await p.tap('.tree-row.file'); await p.waitForTimeout(300);
  console.log('drawer closed:', !(await p.evaluate(() => document.body.classList.contains('left-open'))), '| title:', await p.textContent('#mobile-title'));
  await p.screenshot({ path: S + '/m-note.png' });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('h-overflow:', overflow, 'errors:', errs); await b.close();
})();
