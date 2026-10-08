'use strict';

// ---------- Dibujo a mano ----------
// Un lienzo para dibujar con el dedo, el ratón o un lápiz (el grosor sigue la presión del lápiz).
// Se guarda como imagen de la nota y conserva los trazos, así que se puede volver a editar.
// Con un lápiz activo se ignoran los toques con la palma (como en Samsung Notes).
const DRAW_COLORS = ['#1f2328', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#9333ea'];
const draw = { strokes: [], redo: [], tool: 'pen', color: DRAW_COLORS[0], size: 3, current: null, penSeen: false, editing: null, w: 0, h: 0, scale: 1 };

function openDrawing(edit = null) {
  const note = activeNote();
  if (!note) return showToastMessage('Abre una nota para añadir un dibujo.');
  flushNoteSave();
  const ta = $('#note-editor');
  draw.caret = document.activeElement === ta ? ta.selectionStart : ta.dataset.caret ? Number(ta.dataset.caret) : null;
  draw.noteId = note.id;
  draw.editing = edit; // { id, strokes, w, h } al editar un dibujo existente
  draw.strokes = edit ? JSON.parse(JSON.stringify(edit.strokes)) : [];
  draw.redo = [];
  draw.history = [];
  draw.penSeen = false;
  $('#draw').hidden = false;
  requestAnimationFrame(() => {
    sizeDrawCanvas(edit);
    renderDrawTools();
    redrawAll();
  });
}

function sizeDrawCanvas(edit) {
  const wrap = $('#draw-wrap');
  const c = $('#draw-canvas');
  const dpr = window.devicePixelRatio || 1;
  // Las coordenadas de los trazos son las del primer lienzo; si el de ahora es distinto, se escala.
  draw.w = edit?.w || wrap.clientWidth;
  draw.h = edit?.h || wrap.clientHeight;
  draw.scale = Math.min(wrap.clientWidth / draw.w, wrap.clientHeight / draw.h);
  c.style.width = `${draw.w * draw.scale}px`;
  c.style.height = `${draw.h * draw.scale}px`;
  c.width = Math.round(draw.w * draw.scale * dpr);
  c.height = Math.round(draw.h * draw.scale * dpr);
  c.getContext('2d').setTransform(dpr * draw.scale, 0, 0, dpr * draw.scale, 0, 0);
}

function strokeWidth(s, p) {
  return s.tool === 'marker' ? s.size * 4 : s.size * (0.35 + (p ?? 0.5) * 1.3);
}

function paintStroke(ctx, s, from = 1) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color;
  ctx.globalAlpha = s.tool === 'marker' ? 0.35 : 1;
  const pts = s.points;
  if (pts.length === 1) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], strokeWidth(s, pts[0][2]) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = Math.max(1, from); i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1, p] = pts[i];
    ctx.lineWidth = strokeWidth(s, p);
    ctx.beginPath();
    // Curva por el punto medio para que el trazo salga suave.
    const prev = pts[i - 2];
    if (prev) {
      ctx.moveTo((prev[0] + x0) / 2, (prev[1] + y0) / 2);
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function redrawAll(ctx = $('#draw-canvas').getContext('2d'), w = draw.w, h = draw.h) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // El marcador va debajo de la tinta, como un rotulador fluorescente.
  draw.strokes.filter((s) => s.tool === 'marker').forEach((s) => paintStroke(ctx, s));
  draw.strokes.filter((s) => s.tool !== 'marker').forEach((s) => paintStroke(ctx, s));
}

function drawPoint(e) {
  const r = $('#draw-canvas').getBoundingClientRect();
  const p = e.pointerType === 'pen' ? e.pressure || 0.5 : e.pointerType === 'touch' && e.pressure ? Math.min(1, e.pressure * 1.2) : 0.5;
  return [Math.round(((e.clientX - r.left) / draw.scale) * 10) / 10, Math.round(((e.clientY - r.top) / draw.scale) * 10) / 10, Math.round(p * 100) / 100];
}

function eraseAt([x, y]) {
  const before = draw.strokes.length;
  const keep = draw.strokes.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < 12 + strokeWidth(s, 0.5) / 2));
  if (keep.length !== before) {
    draw.redo = [];
    draw.strokes = keep;
    redrawAll();
  }
}

const drawCanvas = $('#draw-canvas');
drawCanvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'pen') draw.penSeen = true;
  else if (draw.penSeen && e.pointerType === 'touch') return; // la palma, mientras se usa el lápiz
  e.preventDefault();
  try {
    drawCanvas.setPointerCapture(e.pointerId);
  } catch {
    // Puntero ya liberado: el trazo sigue igual.
  }
  const pt = drawPoint(e);
  if (draw.tool === 'eraser') {
    draw.erasing = { before: draw.strokes };
    eraseAt(pt);
    return;
  }
  draw.current = { tool: draw.tool, color: draw.color, size: draw.size, points: [pt] };
  draw.redo = [];
});
drawCanvas.addEventListener('pointermove', (e) => {
  if (draw.erasing) return eraseAt(drawPoint(e));
  if (!draw.current) return;
  const ctx = drawCanvas.getContext('2d');
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const pt = drawPoint(ev);
    const last = draw.current.points[draw.current.points.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.8) continue;
    draw.current.points.push(pt);
    if (draw.current.tool !== 'marker') paintStroke(ctx, draw.current, draw.current.points.length - 1);
  }
  if (draw.current.tool === 'marker') {
    redrawAll();
    paintStroke(ctx, draw.current);
  }
});
const endStroke = () => {
  if (draw.erasing) {
    // Borrar es un solo paso de deshacer.
    if (draw.erasing.before.length !== draw.strokes.length) draw.history = [...(draw.history || []), { erase: draw.erasing.before }];
    draw.erasing = null;
    renderDrawTools();
    return;
  }
  if (!draw.current) return;
  draw.strokes.push(draw.current);
  draw.history = [...(draw.history || []), { add: true }];
  draw.current = null;
  redrawAll();
  renderDrawTools();
};
drawCanvas.addEventListener('pointerup', endStroke);
drawCanvas.addEventListener('pointercancel', endStroke);

function drawUndo() {
  const last = (draw.history || []).pop();
  if (!last) return;
  if (last.add) draw.redo.push({ add: draw.strokes.pop() });
  else if (last.erase) {
    draw.redo.push({ erase: draw.strokes });
    draw.strokes = last.erase;
  } else if (last.clear) {
    draw.redo.push({ clear: true });
    draw.strokes = last.clear;
  }
  redrawAll();
  renderDrawTools();
}

function drawRedo() {
  const next = draw.redo.pop();
  if (!next) return;
  if (next.add) {
    draw.strokes.push(next.add);
    draw.history.push({ add: true });
  } else if (next.erase) {
    draw.history.push({ erase: draw.strokes });
    draw.strokes = next.erase;
  } else if (next.clear) {
    draw.history.push({ clear: draw.strokes });
    draw.strokes = [];
  }
  redrawAll();
  renderDrawTools();
}

function renderDrawTools() {
  $$('#draw [data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === draw.tool);
    b.ariaPressed = String(b.dataset.tool === draw.tool);
  });
  $('#draw-colors').replaceChildren(
    ...DRAW_COLORS.map((c, i) => {
      const b = el('button', { className: `draw-color${c === draw.color ? ' on' : ''}`, ariaLabel: ['Negro', 'Azul', 'Rojo', 'Verde', 'Amarillo', 'Morado'][i], ariaPressed: String(c === draw.color) });
      b.style.background = c;
      b.addEventListener('click', () => {
        draw.color = c;
        if (draw.tool === 'eraser') draw.tool = 'pen';
        renderDrawTools();
      });
      return b;
    })
  );
  $('#draw-undo').disabled = !(draw.history || []).length;
  $('#draw-redo').disabled = !draw.redo.length;
  $('#draw-save').disabled = !draw.strokes.length;
}

$$('#draw [data-tool]').forEach((b) =>
  b.addEventListener('click', () => {
    draw.tool = b.dataset.tool;
    renderDrawTools();
  })
);
$('#draw-size').addEventListener('input', (e) => (draw.size = Number(e.target.value)));
$('#draw-undo').addEventListener('click', drawUndo);
$('#draw-redo').addEventListener('click', drawRedo);
$('#draw-clear').addEventListener('click', () => {
  if (!draw.strokes.length) return;
  draw.history = [...(draw.history || []), { clear: draw.strokes }];
  draw.strokes = [];
  draw.redo = [];
  redrawAll();
  renderDrawTools();
});
const closeDrawing = () => {
  $('#draw').hidden = true;
  draw.history = [];
};
$('#draw-cancel').addEventListener('click', closeDrawing);
document.addEventListener('keydown', (e) => {
  if ($('#draw').hidden) return;
  if (e.key === 'Escape') closeDrawing();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) drawRedo();
    else drawUndo();
  }
});

$('#draw-save').addEventListener('click', async () => {
  const note = noteById(draw.noteId);
  if (!note || !draw.strokes.length) return closeDrawing();
  // Se exporta recortado a lo dibujado, con un margen.
  const xs = draw.strokes.flatMap((s) => s.points.map((p) => p[0]));
  const ys = draw.strokes.flatMap((s) => s.points.map((p) => p[1]));
  const pad = 24;
  const x0 = Math.max(0, Math.min(...xs) - pad);
  const y0 = Math.max(0, Math.min(...ys) - pad);
  const x1 = Math.min(draw.w, Math.max(...xs) + pad);
  const y1 = Math.min(draw.h, Math.max(...ys) + pad);
  const out = document.createElement('canvas');
  const k = 2; // el doble de resolución para que se vea nítido
  out.width = Math.max(1, Math.round((x1 - x0) * k));
  out.height = Math.max(1, Math.round((y1 - y0) * k));
  const ctx = out.getContext('2d');
  ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  redrawAll(ctx, draw.w, draw.h);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  try {
    const { data, type, width, height } = await compressImage(new File([blob], 'dibujo.png', { type: 'image/png' }));
    const strokes = JSON.stringify(draw.strokes);
    const rec = { id: uid(), name: 'Dibujo', type, data, width, height, createdAt: Date.now(), drawing: strokes.length < 150 * 1024 ? { strokes: draw.strokes, w: draw.w, h: draw.h } : null };
    await putFile(rec);
    const editingId = draw.editing?.id;
    closeDrawing();
    if (editingId && note.body.includes(`(img:${editingId})`)) {
      // Al editar, la nota pasa a apuntar al dibujo nuevo (así se sincroniza como imagen nueva).
      note.body = note.body.split(`(img:${editingId})`).join(`(img:${rec.id})`);
      note.updatedAt = Date.now();
      save();
      renderAll();
    } else {
      if (!isEditing(note.id)) setNoteMode(note, preferredEditMode());
      const ta = $('#note-editor');
      const pos = draw.caret ?? ta.value.length;
      const before = ta.value.slice(0, pos);
      ta.setRangeText(`${before && !before.endsWith('\n') ? '\n' : ''}![Dibujo](img:${rec.id})\n`, pos, pos, 'end');
      ta.dispatchEvent(new Event('input'));
    }
    scheduleFilesSync();
    showToastMessage('Dibujo guardado en la nota');
  } catch {
    showToastMessage('No se pudo guardar el dibujo: es demasiado grande. Prueba a simplificarlo.');
  }
});

// En el visor de imágenes, un dibujo de la nota abierta se puede volver a editar.
async function updateViewerEdit(img) {
  const btn = $('#image-viewer-edit');
  btn.hidden = true;
  const id = img?.dataset.img;
  if (!id) return;
  const rec = await getFile(id);
  const note = activeNote();
  if (rec?.drawing && note && !note.enc && note.body.includes(`(img:${id})`)) {
    btn.hidden = false;
    btn.onclick = () => {
      $('#image-viewer').hidden = true;
      openDrawing({ id, ...rec.drawing });
    };
  }
}
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('img.note-img');
  if (img && !img.closest('#image-viewer')) updateViewerEdit(img);
});

NOTE_MENU_EXTRA.push((note) => (note.enc ? null : { label: '✏️ Nuevo dibujo…', action: () => openDrawing() }));
SLASH_ITEMS.splice(SLASH_ITEMS.findIndex((it) => it.label === 'Imagen…') + 1, 0, { icon: '✏️', label: 'Dibujo…', detail: 'Dibuja con el dedo, el ratón o un lápiz', keys: 'dibujo dibujar boceto lapiz mano sketch', run: () => openDrawing() });
