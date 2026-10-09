const { chromium, launchOptions } = require('./helpers');
const fs = require('fs');
const path = require('path');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cdnjs/, (r) => r.abort());
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'a', path: 'Diagrama', body: 'Arquitectura:\n', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Diagrama'); openDrawing(); }); await p.waitForTimeout(400);
  const drag = async (x1, y1, x2, y2, opts = {}) => { await p.mouse.move(x1, y1); if (opts.shift) await p.keyboard.down('Shift'); if (opts.alt) await p.keyboard.down('Alt'); await p.mouse.down(); await p.mouse.move(x2, y2, { steps: 8 }); await p.mouse.up(); if (opts.shift) await p.keyboard.up('Shift'); if (opts.alt) await p.keyboard.up('Alt'); };
  const els = () => p.evaluate(() => xd.elements.map(e => ({ t: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), a: +(e.angle || 0).toFixed(2), g: e.groupIds.length, n: e.points?.length })));

  // Rectángulo con Mayús: cuadrado; vuelve a «Seleccionar»
  await p.keyboard.press('2'); await drag(300, 300, 420, 360, { shift: true });
  console.log('square:', JSON.stringify((await els())[0]), '| tool:', await p.evaluate(() => xd.tool));
  // Cambiar tamaño desde la esquina inferior derecha
  const h = await p.evaluate(() => xdHandles().list.find(x => x.dir === 'se'));
  await drag(h.x, h.y, h.x + 60, h.y + 20);
  console.log('resized:', JSON.stringify((await els())[0]));
  // Girar con el tirador (Mayús: de 15° en 15°)
  const r = await p.evaluate(() => xdHandles().list.find(x => x.kind === 'rotate'));
  await drag(r.x, r.y, r.x + 200, r.y + 120, { shift: true });
  console.log('rotated:', (await els())[0].a);
  // Alt+arrastrar duplica
  await drag(360, 360, 600, 360, { alt: true });
  console.log('duplicated:', (await els()).length);
  // Seleccionar todo y agrupar; Ctrl+C / Ctrl+V pega una copia del grupo
  await p.keyboard.press('Control+a'); await p.keyboard.press('Control+g');
  console.log('grouped:', (await els()).map(e => e.g).join(','));
  await p.mouse.click(700, 700); await p.mouse.click(321, 372);
  console.log('click selects group:', await p.evaluate(() => xd.selected.size));
  await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v');
  console.log('pasted:', (await els()).length, '| selected:', await p.evaluate(() => xd.selected.size));
  await p.keyboard.press('Delete');
  console.log('deleted:', (await els()).length);
  // Línea de varios puntos: clic, clic, clic, Enter
  await p.keyboard.press('6'); await p.mouse.click(200, 600); await p.mouse.move(300, 650); await p.mouse.click(300, 650); await p.mouse.move(420, 600); await p.mouse.click(420, 600); await p.keyboard.press('Enter');
  console.log('polyline:', (await els()).find(e => e.t === 'line')?.n, '| tool:', await p.evaluate(() => xd.tool));
  // Rombo con trazo limpio, discontinuo y relleno sólido
  await p.keyboard.press('3'); await drag(900, 200, 1050, 320);
  await p.click('#xd-props .xd-opt[aria-label="Arquitecto (limpio)"]');
  await p.click('#xd-props .xd-opt[aria-label="Discontinuo"]');
  await p.click('#xd-props .xd-sw[title="#b2f2bb"]');
  await p.click('#xd-props .xd-opt[aria-label="Sólido"]');
  console.log('diamond style:', JSON.stringify(await p.evaluate(() => { const d = xd.elements.find(e => e.type === 'diamond'); return [d.roughness, d.strokeStyle, d.backgroundColor, d.fillStyle]; })));
  // Texto suelto con doble clic, y cambiar tamaño de letra
  await p.keyboard.press('Escape'); await p.mouse.dblclick(700, 520); await p.keyboard.type('Servidor\nBase de datos'); await p.keyboard.press('Control+Enter');
  await p.click('#xd-props .xd-opt[aria-label="28 px"]');
  console.log('text:', JSON.stringify(await p.evaluate(() => { const t = xd.elements.find(e => e.type === 'text'); return [t.text, t.fontSize, t.height > 60]; })));
  // Capas: al fondo
  await p.click('#xd-props .xd-opt[aria-label^="Al fondo"]');
  console.log('text at back:', await p.evaluate(() => xd.elements[0].type));
  // Zoom y encajar
  await p.click('#xd-zoom-in'); await p.click('#xd-zoom-in');
  console.log('zoom:', await p.textContent('#xd-zoom-reset'));
  await p.click('#xd-fit');
  console.log('fit zoom <= 100%:', await p.evaluate(() => xd.view.zoom <= 1));
  // Abrir un archivo .excalidraw (se añade junto a lo que hay)
  await p.evaluate(() => xdImportText(JSON.stringify({ type: 'excalidraw', version: 2, elements: [
    { id: 'x1', type: 'ellipse', x: 0, y: 0, width: 100, height: 60, strokeColor: '#e03131', backgroundColor: 'transparent', fillStyle: 'hachure', strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [], seed: 5 },
    { id: 'x2', type: 'text', x: 10, y: 80, width: 80, height: 25, text: 'Importado', originalText: 'Importado', fontSize: 20, fontFamily: 5, textAlign: 'left', groupIds: [] },
    { id: 'x3', type: 'rectangle', x: 0, y: 0, width: 5, height: 5, isDeleted: true },
  ], appState: { viewBackgroundColor: '#fdf8e7' } })));
  await p.waitForTimeout(300);
  console.log('imported:', JSON.stringify(await p.evaluate(() => [xd.elements.filter(e => e.strokeColor === '#e03131').length, xd.elements.some(e => e.text === 'Importado' && e.fontFamily === 1), xd.bg])));
  // Exportar: formato de Excalidraw
  const scene = await p.evaluate(async () => { const s = await xdSceneJson(); return [s.type, s.version, s.elements.length, typeof s.files]; });
  console.log('export:', JSON.stringify(scene));
  await p.screenshot({ path: S + '/excalidraw.png' });
  await p.click('#draw-save'); await p.waitForTimeout(1200);
  console.log('note:', await p.evaluate(() => activeNote().body.replace(/img:\w+/, 'img:ID')).then(JSON.stringify));
  // Deshacer todo el camino hasta vacío
  console.log('errors:', errs); await b.close();
})();
