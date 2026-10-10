// Lienzos: JSON Canvas (exportar / importar .canvas), grupos, imágenes, enlaces, colores, etiquetas,
// dirección de las flechas desde el clic derecho, y lienzos hechos con una carpeta o con los enlaces de una nota.
const { chromium, launchOptions } = require('./helpers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const url = process.argv[2], S = process.argv[3];
const n = (id, p, body) => ({ id, path: p, body, createdAt: 1, updatedAt: 1 });
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDEgAQBJ+AIBfPUqhAAAAABJRU5ErkJggg==';
// JSZip local (para no depender de la red al exportar la bóveda).
let jszipPath = null;
for (const p of ['/opt/node-tools/node_modules/jszip/dist/jszip.min.js', () => path.join(execSync('npm root -g').toString().trim(), 'jszip/dist/jszip.min.js')]) {
  try {
    const f = typeof p === 'function' ? p() : p;
    if (fs.existsSync(f)) { jszipPath = f; break; }
  } catch {}
}

(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Proyectos'], updatedAt: 1, notes: [
      n('w', 'Proyectos/Web', '# Web\nVer [[Diseño]] y [[Textos]].'),
      n('d', 'Proyectos/Diseño', 'Vuelve a [[Web]].'),
      n('t', 'Proyectos/Textos', 'Sin enlaces.'),
      n('o', 'Otra', 'Menciona [[Web]].'),
    ] });
  await c.route(/fonts\.g/, (r) => r.abort());
  await c.route(/jszip/, (r) => (jszipPath ? r.fulfill({ path: jszipPath, contentType: 'application/javascript' }) : r.abort()));
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  const menu = () => p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.querySelector('span').textContent));
  const pick = async (text) => { await p.waitForSelector(`#note-menu .menu-item:has-text("${text}")`, { state: 'visible', timeout: 5000 }); await p.click(`#note-menu .menu-item:has-text("${text}")`); await p.waitForTimeout(120); };
  const answer = async (text) => { await p.waitForSelector('#picker:not([hidden])'); await p.fill('#picker-input', text); await p.keyboard.press('Enter'); await p.waitForTimeout(150); };
  const cards = () => p.evaluate(() => currentCanvas().cards.map((k) => ({ ...k })));
  const cardBox = async (id) => (await p.$(`#cv-world .cv-card[data-id="${id}"]`)).boundingBox();

  // --- Lienzo nuevo y clic derecho en el fondo
  await p.click('.rib[data-view=canvas]');
  await p.fill('#canvas-title', 'Pruebas'); await p.press('#canvas-title', 'Enter'); await p.waitForTimeout(300);
  const vp = await (await p.$('#cv-viewport')).boundingBox();
  await p.mouse.click(vp.x + 120, vp.y + 120, { button: 'right' });
  console.log('background menu:', await menu());
  await pick('Nuevo enlace');
  await answer('javascript:alert(1)');
  console.log('unsafe link refused:', !(await cards()).some((k) => k.type === 'link'));
  await p.mouse.click(vp.x + 120, vp.y + 120, { button: 'right' }); await pick('Nuevo enlace');
  await answer('https://www.example.com/blog/mi-primer-articulo');
  const link = (await cards()).find((k) => k.type === 'link');
  const linkCard = await p.$eval(`.cv-card[data-id="${link.id}"]`, (n) => ({ text: n.innerText.replace(/\n+/g, ' | '), href: n.querySelector('a.cv-open')?.href, target: n.querySelector('a.cv-open')?.target, rel: n.querySelector('a.cv-open')?.rel, iframe: !!n.querySelector('iframe') }));
  console.log('link card:', JSON.stringify(linkCard));

  // --- Grupo con nombre
  await p.mouse.click(vp.x + vp.width - 300, vp.y + 250, { button: 'right' }); await pick('Nuevo grupo');
  await answer('Fase 1');
  const group = (await cards()).find((k) => k.type === 'group');
  console.log('group:', group.label, group.w, group.h, '| label shown:', await p.textContent(`.cv-card[data-id="${group.id}"] .cv-group-label`));

  // --- Imagen desde el equipo (selector de archivos) y arrastrada
  await p.mouse.click(vp.x + 200, vp.y + vp.height - 150, { button: 'right' });
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), pick('Nueva imagen')]);
  await chooser.setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await p.waitForFunction(() => currentCanvas().cards.some((k) => k.type === 'image'));
  await p.waitForFunction(() => document.querySelector('.cv-card.cv-image img')?.src?.startsWith('data:image'));
  await p.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'arrastrada.png', { type: 'image/png' }));
    const r = document.getElementById('cv-viewport').getBoundingClientRect();
    document.getElementById('cv-viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: r.left + 500, clientY: r.top + 400, bubbles: true, cancelable: true }));
  }, PNG);
  await p.waitForFunction(() => currentCanvas().cards.filter((k) => k.type === 'image').length === 2);
  const imgs = (await cards()).filter((k) => k.type === 'image');
  console.log('images:', imgs.map((k) => k.name), '| stored:', await p.evaluate((ids) => Promise.all(ids.map((id) => getFile(id).then((r) => !!r?.data))), imgs.map((k) => k.imgId)));

  // --- Mover el grupo arrastra lo que tiene dentro (y no lo de fuera)
  const ids = await p.evaluate((gid) => {
    const c = currentCanvas(); const g = c.cards.find((k) => k.id === gid);
    Object.assign(g, { x: 2000, y: 2000, w: 500, h: 300 });
    const inside = addCanvasCard(c, { type: 'text', text: 'Dentro', x: 2040, y: 2060 });
    const outside = addCanvasCard(c, { type: 'text', text: 'Fuera', x: 2700, y: 2060 });
    renderCanvasBoard(); fitCanvas();
    return { inside: inside.id, outside: outside.id };
  }, group.id);
  const before = await cards();
  const lb = await (await p.$(`.cv-card[data-id="${group.id}"] .cv-group-label`)).boundingBox();
  await p.mouse.move(lb.x + 10, lb.y + 5); await p.mouse.down(); await p.mouse.move(lb.x + 60, lb.y + 45, { steps: 6 }); await p.mouse.up();
  const after = await cards();
  const delta = (id) => { const a = before.find((k) => k.id === id); const z = after.find((k) => k.id === id); return [z.x - a.x, z.y - a.y]; };
  console.log('group moved:', delta(group.id), '| child:', delta(ids.inside), '| outside:', delta(ids.outside));

  // --- Color de una tarjeta desde el clic derecho
  let box = await cardBox(ids.inside);
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  console.log('card menu:', await menu());
  await pick('Color');
  console.log('color menu:', await menu());
  await pick('Verde');
  console.log('card color:', await p.evaluate((id) => currentCanvas().cards.find((k) => k.id === id).color, ids.inside), await p.$eval(`.cv-card[data-id="${ids.inside}"]`, (n) => n.classList.contains('ic-green')));
  // Duplicar, traer al frente / enviar atrás
  box = await cardBox(ids.outside);
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' }); await pick('Duplicar');
  console.log('duplicated:', (await cards()).filter((k) => k.text === 'Fuera').length);
  await p.evaluate((id) => { const c = currentCanvas(); c.cards.find((k) => k.text === 'Fuera' && k.id !== id).y += 600; renderCanvasBoard(); }, ids.outside);
  box = await cardBox(ids.outside);
  await p.mouse.click(box.x + 10, box.y + 10, { button: 'right' }); await pick('Enviar atrás');
  console.log('sent back (first non-group):', await p.evaluate((id) => cvOrdered(currentCanvas()).find((k) => k.type !== 'group').id === id, ids.outside));
  await p.mouse.click(box.x + 10, box.y + 10, { button: 'right' }); await pick('Traer al frente');
  console.log('to front (last):', await p.evaluate((id) => currentCanvas().cards.at(-1).id === id, ids.outside));
  // Copiar y pegar desde el menú del fondo
  await p.mouse.click(box.x + 10, box.y + 10, { button: 'right' }); await pick('Copiar');
  await p.mouse.click(vp.x + 60, vp.y + vp.height - 60, { button: 'right' }); await pick('Pegar');
  console.log('pasted:', (await cards()).filter((k) => k.text === 'Fuera').length);

  // --- Flecha: etiqueta, color y dirección
  await p.evaluate(({ a, z }) => { const c = currentCanvas(); c.edges.push({ id: 'e1', from: a, to: z }); renderCanvasBoard(); }, { a: ids.inside, z: ids.outside });
  const edgePoint = () => p.evaluate(() => {
    const path = document.querySelector('#cv-edges .cv-edge[data-id="e1"] .cv-edge-hit');
    const pt = path.getPointAtLength(path.getTotalLength() * 0.4);
    const m = path.getScreenCTM();
    return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
  });
  let ep = await edgePoint();
  await p.mouse.click(ep.x, ep.y, { button: 'right' });
  console.log('edge menu:', await menu());
  await pick('Etiqueta');
  await answer('depende de');
  ep = await edgePoint();
  await p.mouse.click(ep.x, ep.y, { button: 'right' }); await pick('Color'); await pick('Rojo');
  ep = await edgePoint();
  await p.mouse.click(ep.x, ep.y, { button: 'right' }); await pick('En los dos sentidos');
  const edgeState = () => p.evaluate(() => {
    const ed = currentCanvas().edges.find((x) => x.id === 'e1');
    const line = document.querySelector('#cv-edges .cv-edge[data-id="e1"] .cv-edge-line');
    return { label: ed.label, color: ed.color, ends: cvEnds(ed), start: !!line.getAttribute('marker-start'), end: !!line.getAttribute('marker-end'), text: document.querySelector('#cv-edges .cv-edge[data-id="e1"] text')?.textContent, stroke: getComputedStyle(line).stroke };
  });
  console.log('edge after menus:', JSON.stringify(await edgeState()));
  ep = await edgePoint();
  await p.mouse.click(ep.x, ep.y, { button: 'right' }); await pick('Sin flechas');
  console.log('no arrows:', JSON.stringify(await edgeState()));
  ep = await edgePoint();
  await p.mouse.click(ep.x, ep.y, { button: 'right' }); await pick('Hacia el origen');
  console.log('reverse:', (await edgeState()).ends);
  // Doble clic edita la etiqueta
  ep = await edgePoint();
  await p.mouse.dblclick(ep.x, ep.y); await answer('necesita');
  console.log('dblclick label:', (await edgeState()).label);
  await p.click('#cv-fit');
  await p.screenshot({ path: S + '/canvas-types.png' });

  // --- Exportar a JSON Canvas: estructura según la especificación 1.0
  const json = await p.evaluate(() => canvasToJson(currentCanvas()));
  const TYPES = ['text', 'file', 'link', 'group'];
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const okColor = (c) => c === undefined || /^[1-6]$/.test(c) || /^#[0-9a-f]{3,6}$/i.test(c);
  const nodeProblems = json.nodes.filter((nd) => !(typeof nd.id === 'string' && TYPES.includes(nd.type) && [nd.x, nd.y, nd.width, nd.height].every(Number.isInteger) && okColor(nd.color)
    && (nd.type !== 'text' || typeof nd.text === 'string') && (nd.type !== 'file' || typeof nd.file === 'string') && (nd.type !== 'link' || typeof nd.url === 'string')));
  const nodeIds = new Set(json.nodes.map((nd) => nd.id));
  const edgeProblems = json.edges.filter((e) => !(typeof e.id === 'string' && nodeIds.has(e.fromNode) && nodeIds.has(e.toNode) && SIDES.includes(e.fromSide) && SIDES.includes(e.toSide)
    && [undefined, 'none', 'arrow'].includes(e.fromEnd) && [undefined, 'none', 'arrow'].includes(e.toEnd) && okColor(e.color)));
  console.log('export types:', [...new Set(json.nodes.map((nd) => nd.type))].sort().join(','), '| node problems:', nodeProblems.length, '| edge problems:', edgeProblems.length);
  console.log('export group first:', json.nodes[0].type, json.nodes[0].label, '| image file:', json.nodes.find((nd) => nd.type === 'file')?.file.replace(/adjuntos\/[a-z0-9]+/, 'adjuntos/ID'));
  console.log('export edge:', JSON.stringify(json.edges.find((e) => e.id === 'e1')), '| green card:', json.nodes.find((nd) => nd.id === ids.inside).color);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cv-export')]);
  const file = path.join(S, 'lienzo.canvas'); await dl.saveAs(file);
  const dlJson = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('download:', dl.suggestedFilename(), dlJson.nodes.length === json.nodes.length, dlJson.edges.length);

  // --- Importar un .canvas con todos los tipos (por el importador de la bóveda)
  const sample = {
    nodes: [
      { id: 'g1', type: 'group', x: -50, y: -50, width: 900, height: 500, label: 'Zona', color: '6' },
      { id: 'n1', type: 'text', x: 0, y: 0, width: 250, height: 120, text: '# Hola', color: '1' },
      { id: 'n2', type: 'file', x: 300, y: 0, width: 300, height: 200, file: 'Proyectos/Nueva.md', subpath: '#Parte' },
      { id: 'n3', type: 'file', x: 0, y: 200, width: 200, height: 200, file: 'adjuntos/dibujo.png', color: '#ff8800' },
      { id: 'n4', type: 'file', x: 650, y: 0, width: 200, height: 200, file: 'otras/falta.png' },
      { id: 'n5', type: 'file', x: 650, y: 250, width: 200, height: 100, file: 'docs/informe.pdf' },
      { id: 'n6', type: 'link', x: 300, y: 250, width: 300, height: 120, url: 'https://obsidian.md/canvas', color: '4' },
      { id: 'n7', type: 'widget', x: 1000, y: 0, width: 200, height: 100, text: 'raro' },
      { id: 'n8', type: 'file', x: 1000, y: 200, width: 300, height: 200, file: 'Proyectos/Web.md' },
    ],
    edges: [
      { id: 'a1', fromNode: 'n1', fromSide: 'right', toNode: 'n2', toSide: 'left', label: 'sigue', color: '2' },
      { id: 'a2', fromNode: 'n2', toNode: 'n6', fromEnd: 'arrow', toEnd: 'arrow' },
      { id: 'a3', fromNode: 'n6', toNode: 'n3', toEnd: 'none', color: '#00aa00' },
      { id: 'a4', fromNode: 'n1', toNode: 'nada' },
    ],
  };
  const imported = await p.evaluate(async ({ sample, png }) => {
    const bin = Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0));
    const t = (s) => async () => s;
    await importVaultEntries([
      { path: 'Boveda/Proyectos/Nueva.md', text: t('# Nueva\n## Parte\nTexto') },
      { path: 'Boveda/adjuntos/dibujo.png', blob: async () => new Blob([bin], { type: 'image/png' }) },
      { path: 'Boveda/Mapa.canvas', text: t(JSON.stringify(sample)) },
      { path: 'Boveda/Roto.canvas', text: t('{no es json') },
    ]);
    const c = state.canvases.find((x) => x.title === 'Mapa');
    const nueva = state.notes.find((n) => n.path === 'Proyectos/Nueva');
    return {
      msg: document.getElementById('vault-message')?.textContent || '',
      cards: c.cards.map((k) => [k.id, k.type, k.type === 'note' ? (k.noteId === nueva.id ? 'Nueva' : noteById(k.noteId)?.path) : k.type === 'image' ? (k.imgId ? 'img:ID' : `falta:${k.file}`) : k.type === 'link' ? k.url : k.type === 'group' ? k.label : k.text.split('\n')[0], k.color || '', k.subpath || ''].join(' ')),
      edges: c.edges.map((e) => [e.id, e.from, e.to, e.fromSide || '-', e.toSide || '-', cvEnds(e).join('/'), e.color || '-', e.label || '-'].join(' ')),
      roundtrip: canvasToJson(c).nodes.find((nd) => nd.id === 'n7'),
      colorsOut: canvasToJson(c).nodes.map((nd) => nd.color || '').join(','),
    };
  }, { sample, png: PNG });
  console.log('import msg:', imported.msg);
  console.log('imported cards:', JSON.stringify(imported.cards, null, 1));
  console.log('imported edges:', JSON.stringify(imported.edges));
  console.log('unknown round trip:', JSON.stringify(imported.roundtrip), '| colors out:', imported.colorsOut);
  await p.evaluate(() => openCanvas(state.canvases.find((x) => x.title === 'Mapa').id)); await p.waitForTimeout(400);
  console.log('imported rendered:', await p.$$eval('#cv-world .cv-card', (n) => n.map((x) => x.className.replace('cv-card ', '').split(' ')[0])).then((l) => l.join(',')), '| hex card:', await p.$eval('.cv-card[data-id="n3"]', (n) => n.style.getPropertyValue('--cv-c')));
  await p.screenshot({ path: S + '/canvas-import.png' });

  // --- Exportar la bóveda: cada lienzo en Lienzos/<nombre>.canvas
  if (jszipPath) {
    const [vz] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportVault())]);
    const zfile = path.join(S, 'boveda.zip'); await vz.saveAs(zfile);
    const JSZip = require(jszipPath.replace(/dist\/jszip\.min\.js$/, ''));
    const zip = await JSZip.loadAsync(fs.readFileSync(zfile));
    const names = Object.keys(zip.files).filter((f) => /^Lienzos\//.test(f) && !zip.files[f].dir).sort();
    const mapa = JSON.parse(await zip.file('Lienzos/Mapa.canvas').async('string'));
    const imgFile = mapa.nodes.find((nd) => nd.id === 'n3').file;
    console.log('vault canvases:', names, '| image in zip:', !!zip.file(imgFile), '| note file:', mapa.nodes.find((nd) => nd.id === 'n2').file);
  } else console.log('vault export: sin JSZip local, no se prueba');

  // --- Lienzo con las notas de una carpeta (clic derecho en el explorador)
  await p.evaluate(() => showView('notes')).catch(() => {});
  await p.evaluate(() => openNoteByLink('Web')); await p.waitForTimeout(300);
  await p.click('.tree-row.folder[title="Proyectos"]', { button: 'right', force: true });
  await pick('Crear lienzo con estas notas');
  const folderCanvas = await p.evaluate(() => { const c = currentCanvas(); return { title: c.title, notes: c.cards.map((k) => noteById(k.noteId).path.split('/').pop()), xs: [...new Set(c.cards.map((k) => k.x))].length, ys: [...new Set(c.cards.map((k) => k.y))].length, edges: c.edges.map((e) => `${noteById(c.cards.find((k) => k.id === e.from).noteId).path.split('/').pop()}${e.fromEnd === 'arrow' ? '<' : '-'}>${noteById(c.cards.find((k) => k.id === e.to).noteId).path.split('/').pop()}`) }; });
  console.log('folder canvas:', JSON.stringify(folderCanvas), '| view:', await p.isVisible('#canvas-editor'));

  // --- Lienzo con los enlaces de una nota (clic derecho en la nota del explorador)
  await p.evaluate(() => openNoteByLink('Web')); await p.waitForTimeout(300);
  await p.click('.tree-row.file[data-id="w"]', { button: 'right', force: true });
  await pick('Crear lienzo con sus enlaces');
  const linksCanvas = await p.evaluate(() => { const c = currentCanvas(); const name = (id) => noteById(c.cards.find((k) => k.id === id).noteId).path.split('/').pop(); const center = c.cards[0]; return { title: c.title, center: name(center.id), centered: Math.abs(center.x + center.w / 2) < 2 && Math.abs(center.y + center.h / 2) < 2, around: c.cards.slice(1).map((k) => name(k.id)).sort(), edges: c.edges.map((e) => `${name(e.from)}${e.fromEnd === 'arrow' ? '<' : '-'}>${name(e.to)}`).sort() }; });
  console.log('links canvas:', JSON.stringify(linksCanvas));
  // También desde el menú ⋯ de la nota
  console.log('note menu has it:', await p.evaluate(() => noteMenuItems(noteById('w')).some((i) => i?.label?.includes('Crear lienzo con sus enlaces'))));
  await p.click('#cv-fit');
  await p.screenshot({ path: S + '/canvas-links.png' });

  // --- Se guarda
  await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready);
  console.log('after reload:', await p.evaluate(() => state.canvases.map((c) => `${c.title}:${c.cards.length}/${c.edges.length}`)));
  console.log('errors:', errs); await b.close();
})();
