const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
// Portátil con poca altura: la página no debe desplazarse entera y la nota sigue a la vista con Claude abierto.
const mock = () => { const sample = async (i, o = {}) => { const text = 'Respuesta larga.\n\n' + Array.from({ length: 30 }, (_, k) => `- punto ${k}`).join('\n'); o.onText && o.onText({ text }); return { text }; }; sample.limits = async () => ({ maxPromptBytes: 1e5 }); window.claude = { use: async (k) => (k === 'sample' ? sample : null) }; };
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const c = await b.newContext({ viewport: { width: 1361, height: 560 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Reunión', body: '# Reunión\n' + 'Texto de la reunión. '.repeat(40), createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.addInitScript(mock);
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready); await p.waitForTimeout(300);
  const pageScroll = () => p.evaluate(() => [window.scrollY, document.documentElement.scrollTop, document.body.scrollTop, document.querySelector('.app').scrollTop].every((v) => v === 0));
  await p.evaluate(() => showView('ask'));
  await p.fill('#ask-input', 'hola'); await p.press('#ask-input', 'Enter'); await p.waitForTimeout(500);
  console.log('page still after ask:', await pageScroll(), '| tabs visible:', await p.isVisible('#ws-tabs'), '| ask title visible:', await p.evaluate(() => document.querySelector('#view-ask .ask-head').getBoundingClientRect().top >= 0));
  console.log('ribbon scrolls inside:', await p.evaluate(() => getComputedStyle(document.querySelector('.ribbon')).overflowY));
  await p.keyboard.press('Control+o'); await p.keyboard.type('Reunión'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await p.keyboard.press('Control+j'); await p.click('[data-ai-action=summary]'); await p.waitForTimeout(400);
  const vis = (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.top < innerHeight; }, sel);
  console.log('wide: side layout', await p.evaluate(() => document.getElementById('note-pane').classList.contains('ai-side')), '| title visible', await vis('#note-title'), '| page still', await pageScroll());
  console.log('panel names note:', await p.textContent('#note-ai-note'));
  await p.setViewportSize({ width: 900, height: 560 }); await p.waitForTimeout(300);
  console.log('narrow: bottom layout', await p.evaluate(() => !document.getElementById('note-pane').classList.contains('ai-side')), '| title visible', await vis('#note-title'), '| actions visible', await vis('[data-ai-action=summary]'), '| apply visible', await vis('#note-ai-insert'));
  await p.screenshot({ path: S + '/low-screen.png' });
  console.log('errors:', errs); await b.close();
})();
