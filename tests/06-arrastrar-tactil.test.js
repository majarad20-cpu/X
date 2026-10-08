const { chromium, launchOptions } = require('./helpers');
(async () => {
  const b = await chromium.launch(launchOptions);
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); await p.goto(process.argv[2]); await p.evaluate(() => showView('tasks'));
  for (const t of ['A', 'B', 'C', 'D']) { await p.fill('#task-title', t); await p.click('#task-form button[type=submit]'); }
  await p.selectOption('#task-sort', 'manual');
  const h = await (await p.$('#task-list li:nth-child(1) .handle')).boundingBox();
  const last = await (await p.$('#task-list li:nth-child(4)')).boundingBox();
  const cdp = await ctx.newCDPSession(p);
  const pt = (y) => [{ x: h.x + 5, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(h.y + 5) });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(h.y + 5 + (last.y + last.height - 5 - h.y) * i / 10) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('touch final', await p.$$eval('#task-list .title', n => n.map(x => x.textContent).join('')), 'scrollY', await p.evaluate(() => scrollY));
  await b.close();
})();
