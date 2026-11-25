'use strict';

// ---------- Kataleya: escritura, imágenes, dibujos y visuales ----------
// 1. ✍️ Escritura sobre el texto seleccionado: un botón ✨ junto a la selección (corregir, mejorar,
//    resumir, ampliar, tono formal, a lista/tabla/checklist, explicar la norma, traducir) y
//    «Continuar escribiendo» desde el cursor. El resultado llega al panel de Kataleya como propuesta
//    con la vista de cambios; nada se guarda sin aprobar.
// 2. 📷 De imagen a texto: con una imagen a la vista (adjunta o de la nota), atajos para pasarla a nota,
//    describirla, convertirla en dibujo editable o editarla.
// 3. ✏️ Dibujos: editar un dibujo existente (listar, agregar, cambiar, borrar, mover); el original no
//    se toca: se guarda una imagen nueva y la nota apunta a ella al aprobar.
// 4. 🖼 Edición de imágenes en el navegador (canvas): recortar, girar, tamaño, brillo, contraste, grises,
//    flechas, recuadros, textos y tapar datos sensibles. Coordenadas en % de la imagen; vista previa en
//    la tarjeta. La imagen original se conserva; la editada se agrega debajo.
// 5. 🎨 Visuales nuevos: gráficos (barras, líneas, torta) e ilustraciones SVG, como imagen en una nota.
// Kataleya no genera fotos realistas: todo sale de texto (instrucciones, SVG o datos).

// =========================================================
// Utilidades
// =========================================================
const kcBlobUrl = (blob) => URL.createObjectURL(blob);
const kcLoadImg = (blob) => new Promise((resolve, reject) => {
  const url = kcBlobUrl(blob);
  const img = new Image();
  img.onload = () => resolve({ img, url });
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('No pude abrir la imagen'));
  };
  img.src = url;
});
const kcCanvasBlob = (cv, type = 'image/png') => new Promise((r) => cv.toBlob((b) => r(b), type, 0.92));
const kcPct = (v, total) => (Math.max(0, Math.min(100, Number(v) || 0)) / 100) * total;
const kcColor = (c, def = '#e03131') => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : { rojo: '#e03131', verde: '#2f9e44', azul: '#1971c2', amarillo: '#f08c00', negro: '#111111', blanco: '#ffffff', morado: '#9c36b5', naranjo: '#f76707' }[fold(String(c || ''))] || def);

// Guarda una imagen (Blob) como las de las notas y devuelve el registro.
async function kcSaveImage(blob, name, extra = {}) {
  const { data, type, width, height } = await compressImage(new File([blob], `${name || 'imagen'}.png`, { type: blob.type || 'image/png' }));
  const rec = { id: uid(), name: String(name || 'imagen').slice(0, 60), type, data, width, height, createdAt: Date.now(), ...extra };
  await putFile(rec);
  if (typeof scheduleFilesSync === 'function') scheduleFilesSync();
  return rec;
}
// Inserta una imagen en una nota: debajo de otra imagen (afterId) o al final.
function kcInsertImageRef(body, rec, afterId) {
  const ref = `![${rec.name}](img:${rec.id})`;
  if (afterId) {
    const lines = body.split('\n');
    const i = lines.findIndex((l) => l.includes(`(img:${afterId})`));
    if (i >= 0) {
      lines.splice(i + 1, 0, ref);
      return lines.join('\n');
    }
  }
  return `${body.replace(/\s+$/, '')}\n\n${ref}\n`;
}

// Las imágenes del último mensaje, en el mismo orden en que se le mostraron a Kataleya (1, 2, 3…).
kata.seen = [];

// =========================================================
// 1. ✍️ Escritura
// =========================================================
const KC_WRITE = [
  { id: 'corregir', icon: '✓', label: 'Corregir', ask: 'Corrige ortografía, puntuación y redacción sin cambiar el sentido, el tono ni los datos.' },
  { id: 'mejorar', icon: '✨', label: 'Mejorar claridad', ask: 'Reescríbelo más claro y directo, en frases cortas, sin perder información ni cambiar datos.' },
  { id: 'resumir', icon: '↘', label: 'Resumir', ask: 'Resúmelo en la mitad o menos, conservando los datos duros (normas, tasas, montos, plazos, fechas).' },
  { id: 'ampliar', icon: '↗', label: 'Ampliar', ask: 'Amplíalo con explicación y un ejemplo breve. No inventes normas, cifras ni fechas: si algo no lo sabes con certeza, márcalo «⚠️ por verificar».' },
  { id: 'formal', icon: '👔', label: 'Tono formal (cliente)', ask: 'Reescríbelo en tono profesional y cordial para un cliente, en español de Chile, sin jerga innecesaria.' },
  { id: 'lista', icon: '•', label: 'Pasar a lista', ask: 'Conviértelo en una lista con viñetas, una idea por línea.' },
  { id: 'tabla', icon: '▦', label: 'Pasar a tabla', ask: 'Conviértelo en una tabla Markdown con encabezados claros.' },
  { id: 'checklist', icon: '☑', label: 'Pasar a checklist', ask: 'Conviértelo en una checklist Markdown (- [ ]) de pasos accionables.' },
  { id: 'explicar', icon: '⚖️', label: 'Explicar (agregar debajo)', ask: 'Explícalo en palabras simples: qué dice, a quién aplica, desde cuándo rige y qué cuidar. No inventes: si la vigencia no está clara, márcalo «⚠️ por verificar».', below: true },
  { id: 'traducir', icon: '🌐', label: 'Traducir al inglés', ask: 'Tradúcelo al inglés profesional, conservando el formato Markdown.' },
];

// Pide a Claude solo el texto nuevo (sin herramientas).
async function kcWriteText(instruction, text, note) {
  if (!aiReady()) throw new Error('Kataleya funciona al abrir Enfoque desde Claude');
  const prompt = `Eres Kataleya, la asistente de escritura de Enfoque. Español de Chile.
Tarea: ${instruction}
Reglas: devuelve SOLO el texto resultante en Markdown, sin comillas, sin explicaciones antes o después. Conserva [[enlaces]], normas, artículos, cifras y fechas tal como están, salvo que la tarea pida cambiarlos. Nunca inventes normas ni cifras.
${note ? `Nota: «${baseName(note.path)}».` : ''}
Texto:
"""
${String(text).slice(0, 12000)}
"""`;
  const r = await ai.sample(prompt, { cache: false });
  return String(r.text || '').replace(/^\s*"""\s*\n?|\n?\s*"""\s*$/g, '').trim();
}

// Muestra en el panel de Kataleya un turno con la propuesta (o el texto, si no se puede reemplazar).
function kcWriteTurn(userText, run) {
  if (!kata.open) kataToggle();
  kata.turns.push({ role: 'user', content: userText });
  const answer = { role: 'assistant', content: '' };
  kata.turns.push(answer);
  kata.busy = true;
  kataRender();
  kataProgress('Escribiendo…');
  return Promise.resolve()
    .then(() => run(answer))
    .catch((e) => {
      answer.error = `${e?.message || aiErrorText?.(e) || 'No se pudo completar'}${e?.code ? ` (código: ${e.code})` : ''}`;
    })
    .finally(() => {
      kata.busy = false;
      kataProgress('');
      kataRender();
    });
}

// Acción sobre una selección. sel = { note, text, start?, end? } (start/end: posición en el editor).
function kcWriteAction(actionId, sel) {
  const act = KC_WRITE.find((a) => a.id === actionId);
  if (!act || !sel?.text) return;
  const short = sel.text.length > 80 ? `${sel.text.slice(0, 77)}…` : sel.text;
  return kcWriteTurn(`${act.icon} ${act.label}: «${short}»`, async (answer) => {
    const out = await kcWriteText(act.ask, sel.text, sel.note);
    if (!out) throw new Error('No obtuve texto');
    answer.content = act.below ? out : `Te propongo este texto:\n\n${out}`;
    if (!sel.note) return;
    const original = sel.text;
    const locate = (body) => {
      if (Number.isInteger(sel.start) && body.slice(sel.start, sel.end) === original) return sel.start;
      return body.indexOf(original);
    };
    if (locate(sel.note.body) < 0) {
      answer.note = 'No encontré ese texto exacto en la nota (puede tener formato). Selecciónalo en modo edición para reemplazarlo, o cópialo desde aquí.';
      return;
    }
    kata.turns.at(-1) === answer && (kata.turns.at(-1).actions ||= []);
    kataProposeEdit(sel.note, act.below ? `${act.icon} Agregar debajo la explicación` : `${act.icon} ${act.label}`, (body) => {
      const at = locate(body);
      if (at < 0) throw new Error('El texto seleccionado ya no está en la nota');
      const end = at + original.length;
      return act.below ? `${body.slice(0, end)}\n\n> [!note] Explicación\n${out.split('\n').map((l) => `> ${l}`).join('\n')}\n${body.slice(end)}` : `${body.slice(0, at)}${out}${body.slice(end)}`;
    });
  });
}

// «Continuar escribiendo» desde el cursor del editor.
function kcContinue() {
  const ta = $('#note-editor');
  const tab = activeTab();
  const note = tab?.type === 'note' ? noteById(tab.id) : null;
  if (!ta || ta.hidden || !note) return showToastMessage('Abre la nota en modo edición y deja el cursor donde quieres seguir.');
  const pos = ta.selectionEnd;
  const before = ta.value.slice(0, pos);
  const after = ta.value.slice(pos);
  return kcWriteTurn('✍️ Continuar escribiendo desde el cursor', async (answer) => {
    const out = await kcWriteText(`Continúa el texto desde donde termina, con el mismo estilo y formato (1 a 3 párrafos o los ítems que falten). Usa lo que dice la nota; si algo requiere un dato que no está, márcalo «⚠️ por verificar». Devuelve solo la continuación.`, `${before.slice(-6000)}\n[CONTINÚA AQUÍ]\n${after.slice(0, 1500)}`, note);
    if (!out) throw new Error('No obtuve texto');
    answer.content = `Te propongo seguir así:\n\n${out}`;
    const anchor = before.slice(-200);
    kataProposeEdit(note, '✍️ Continuar escribiendo', (body) => {
      const at = body.lastIndexOf(anchor, pos + 50);
      if (at < 0) throw new Error('El texto cambió; vuelve a pedirlo');
      const cut = at + anchor.length;
      const sep = /\n$/.test(body.slice(0, cut)) ? '' : body.slice(0, cut).endsWith(' ') ? '' : ' ';
      return `${body.slice(0, cut)}${sep}${out}${body.slice(cut)}`;
    });
  });
}

// Selección actual (editor o lectura) con su nota.
function kcCurrentSelection() {
  const tab = activeTab();
  const note = tab?.type === 'note' ? noteById(tab.id) : null;
  if (!note || note.enc) return null;
  const ta = $('#note-editor');
  if (ta && !ta.hidden && ta.selectionEnd > ta.selectionStart && (document.activeElement === ta || kcLastSel.from === 'editor')) {
    return { note, text: ta.value.slice(ta.selectionStart, ta.selectionEnd), start: ta.selectionStart, end: ta.selectionEnd };
  }
  const s = String(window.getSelection?.() || '').trim();
  if (s && !$('#kata-panel')?.contains(window.getSelection().anchorNode)) return { note, text: s };
  return null;
}

// Botón flotante ✨ junto a la selección.
const kcLastSel = { from: '', x: 0, y: 0, sel: null };
let kcFab = null;
function kcHideFab() {
  if (kcFab) kcFab.hidden = true;
}
function kcShowFab(x, y) {
  if (!aiReady()) return;
  if (!kcFab) {
    kcFab = el('button', { id: 'kc-sel-fab', className: 'kc-sel-fab', title: 'Kataleya: corregir, mejorar, resumir… el texto seleccionado', ariaLabel: 'Acciones de Kataleya sobre la selección' }, '✨');
    kcFab.addEventListener('mousedown', (e) => e.preventDefault());
    kcFab.addEventListener('click', (e) => {
      const sel = kcLastSel.sel;
      kcHideFab();
      if (!sel) return;
      showMenu({ x: e.clientX, y: e.clientY }, [
        ...KC_WRITE.map((a) => ({ label: `${a.icon} ${a.label}`, action: () => kcWriteAction(a.id, sel) })),
        { sep: true },
        { label: '💬 Preguntarle a Kataleya…', action: () => {
          if (!kata.open) kataToggle();
          setTimeout(() => {
            const inp = $('#kata-input');
            if (inp) {
              inp.value = `Sobre este texto: «${sel.text.slice(0, 400)}»\n`;
              inp.focus();
            }
          }, 60);
        } },
      ]);
    });
    document.body.append(kcFab);
  }
  kcFab.style.left = `${Math.min(window.innerWidth - 44, x + 8)}px`;
  kcFab.style.top = `${Math.max(8, y - 40)}px`;
  kcFab.hidden = false;
}
document.addEventListener('mouseup', (e) => {
  if (e.target.closest?.('#kc-sel-fab, #note-menu, #kata-panel')) return;
  setTimeout(() => {
    const ta = $('#note-editor');
    kcLastSel.from = e.target === ta ? 'editor' : 'lectura';
    const sel = kcCurrentSelection();
    if (sel && sel.text.trim().length >= 3) {
      kcLastSel.sel = sel;
      kcShowFab(e.clientX, e.clientY);
    } else kcHideFab();
  }, 10);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') kcHideFab();
});
document.addEventListener('scroll', kcHideFab, true);

// Paleta de comandos.
if (typeof COMMANDS_EXTRA !== 'undefined') {
  COMMANDS_EXTRA.push((note) => (note && !note.enc && aiReady() ? [
    { label: 'Kataleya: continuar escribiendo desde el cursor', action: () => kcContinue() },
    { label: 'Kataleya: corregir el texto seleccionado', action: () => { const s = kcCurrentSelection(); s ? kcWriteAction('corregir', s) : showToastMessage('Selecciona un texto primero.'); } },
  ] : []));
}

// =========================================================
// 4. 🖼 Edición de imágenes (canvas)
// =========================================================
// ops: [{op: recortar|girar|tamano|brillo|contraste|grises|flecha|recuadro|texto|tapar, ...}] en % de la imagen.
async function kcEditImage(blob, ops) {
  const { img, url } = await kcLoadImg(blob);
  let cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  let cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const fresh = (w, h) => {
    const n = document.createElement('canvas');
    n.width = Math.max(1, Math.round(w));
    n.height = Math.max(1, Math.round(h));
    return n;
  };
  const filters = [];
  for (const o of (ops || []).slice(0, 40)) {
    const op = fold(String(o.op || o.operacion || ''));
    const W = cv.width;
    const H = cv.height;
    if (op === 'recortar') {
      const x = kcPct(o.x, W);
      const y = kcPct(o.y, H);
      const w = Math.min(W - x, kcPct(o.ancho ?? 100, W));
      const h = Math.min(H - y, kcPct(o.alto ?? 100, H));
      if (w < 4 || h < 4) continue;
      const n = fresh(w, h);
      n.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, w, h);
      cv = n;
    } else if (op === 'girar') {
      const g = ((Math.round((Number(o.grados) || 90) / 90) * 90) % 360 + 360) % 360;
      if (!g) continue;
      const n = g === 180 ? fresh(W, H) : fresh(H, W);
      const nx = n.getContext('2d');
      nx.translate(n.width / 2, n.height / 2);
      nx.rotate((g * Math.PI) / 180);
      nx.drawImage(cv, -W / 2, -H / 2);
      cv = n;
    } else if (op === 'tamano' || op === 'tamaño') {
      const w = Math.max(16, Math.min(4000, Number(o.ancho) || W));
      const n = fresh(w, (H * w) / W);
      n.getContext('2d').drawImage(cv, 0, 0, n.width, n.height);
      cv = n;
    } else if (op === 'brillo') filters.push(`brightness(${100 + Math.max(-90, Math.min(200, Number(o.valor) || 0))}%)`);
    else if (op === 'contraste') filters.push(`contrast(${100 + Math.max(-90, Math.min(200, Number(o.valor) || 0))}%)`);
    else if (op === 'grises' || op === 'blanco y negro') filters.push('grayscale(100%)');
    else {
      if (filters.length) {
        const n = fresh(W, H);
        const nx = n.getContext('2d');
        nx.filter = filters.splice(0).join(' ');
        nx.drawImage(cv, 0, 0);
        cv = n;
      }
      cx = cv.getContext('2d');
      const lw = Math.max(3, Math.round(Math.min(cv.width, cv.height) / 200));
      const color = kcColor(o.color);
      if (op === 'recuadro' || op === 'tapar') {
        const x = kcPct(o.x, cv.width);
        const y = kcPct(o.y, cv.height);
        const w = kcPct(o.ancho, cv.width);
        const h = kcPct(o.alto, cv.height);
        if (op === 'tapar') {
          cx.fillStyle = kcColor(o.color, '#111111');
          cx.fillRect(x, y, w, h);
        } else {
          cx.strokeStyle = color;
          cx.lineWidth = lw;
          cx.strokeRect(x, y, w, h);
        }
      } else if (op === 'flecha') {
        const x1 = kcPct(o.x1, cv.width);
        const y1 = kcPct(o.y1, cv.height);
        const x2 = kcPct(o.x2, cv.width);
        const y2 = kcPct(o.y2, cv.height);
        const a = Math.atan2(y2 - y1, x2 - x1);
        const head = lw * 5;
        cx.strokeStyle = color;
        cx.fillStyle = color;
        cx.lineWidth = lw;
        cx.lineCap = 'round';
        cx.beginPath();
        cx.moveTo(x1, y1);
        cx.lineTo(x2, y2);
        cx.stroke();
        cx.beginPath();
        cx.moveTo(x2, y2);
        cx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
        cx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
        cx.closePath();
        cx.fill();
      } else if (op === 'texto') {
        const size = Math.max(12, Math.round((Number(o.tamano || o['tamaño']) || 4) / 100 * cv.height));
        cx.font = `600 ${size}px system-ui, sans-serif`;
        cx.textBaseline = 'top';
        const x = kcPct(o.x, cv.width);
        const y = kcPct(o.y, cv.height);
        const t = String(o.texto || '').slice(0, 200);
        cx.lineWidth = Math.max(3, size / 6);
        cx.strokeStyle = o.fondo === false ? 'transparent' : '#ffffff';
        cx.strokeText(t, x, y);
        cx.fillStyle = color;
        cx.fillText(t, x, y);
      }
    }
  }
  if (filters.length) {
    const n = fresh(cv.width, cv.height);
    const nx = n.getContext('2d');
    nx.filter = filters.join(' ');
    nx.drawImage(cv, 0, 0);
    cv = n;
  }
  return kcCanvasBlob(cv);
}

// =========================================================
// 3. ✏️ Editar un dibujo existente
// =========================================================
async function kcDrawingOf(note, n = 1) {
  const ids = [...String(note.body).matchAll(/!\[[^\]\n]*\]\(img:([a-z0-9]+)\)/gi)].map((m) => m[1]);
  let k = 0;
  for (const id of ids) {
    const rec = await getFile(id);
    if (rec?.drawing) {
      k++;
      if (k === Math.max(1, Number(n) || 1)) return rec;
    }
  }
  return null;
}
function kcDrawingSummary(scene) {
  const els = (scene.elements || []).filter((e) => !e.isDeleted);
  const textOf = (id) => els.find((t) => t.type === 'text' && t.containerId === id)?.originalText || '';
  return els.filter((e) => e.type !== 'text' || !e.containerId).map((e) => ({
    id: e.id,
    forma: { rectangle: 'rectangulo', ellipse: 'elipse', diamond: 'rombo', text: 'texto', arrow: 'flecha', line: 'linea', freedraw: 'trazo' }[e.type] || e.type,
    texto: e.type === 'text' ? e.originalText || e.text : textOf(e.id),
    x: Math.round(e.x), y: Math.round(e.y), ancho: Math.round(e.width), alto: Math.round(e.height),
    fondo: e.backgroundColor, borde: e.strokeColor,
    ...(e.type === 'arrow' ? { desde: e.startBinding?.elementId || null, hasta: e.endBinding?.elementId || null } : {}),
  }));
}
function kcApplyDrawingOps(scene, ops) {
  const els = JSON.parse(JSON.stringify(scene.elements || [])).filter((e) => !e.isDeleted);
  const byId = (id) => els.find((e) => e.id === id);
  const map = { rectangulo: 'rectangle', 'rectángulo': 'rectangle', elipse: 'ellipse', rombo: 'diamond', texto: 'text' };
  const added = [];
  const setText = (shape, txt) => {
    const t = els.find((e) => e.type === 'text' && e.containerId === shape.id);
    if (shape.type === 'text') {
      shape.text = shape.originalText = String(txt);
      return;
    }
    if (t) {
      t.text = t.originalText = String(txt);
      return;
    }
    const made = kataShape('text', shape.x + XD_PAD, shape.y, shape.width - 2 * XD_PAD, shape.height, String(txt));
    made[0].containerId = shape.id;
    (shape.boundElements ||= []).push({ id: made[0].id, type: 'text' });
    els.push(made[0]);
  };
  for (const o of (ops || []).slice(0, 60)) {
    const op = fold(String(o.op || o.operacion || ''));
    if (op === 'agregar') {
      const made = kataShape(map[fold(String(o.forma || 'rectangulo'))] || 'rectangle', Number(o.x) || 0, Number(o.y) || 0, Number(o.ancho) || 220, Number(o.alto) || 90, String(o.texto || ''), { bg: kcColor(o.fondo, 'transparent'), stroke: kcColor(o.borde, '#1e1e1e') });
      els.push(...made);
      added.push(made[0]);
    } else if (op === 'flecha') {
      const pick = (v) => (typeof v === 'number' || /^\+\d+$/.test(String(v)) ? added[Number(String(v).replace('+', ''))] : byId(v));
      const a = pick(o.desde);
      const b = pick(o.hasta);
      if (a && b && a.type !== 'text' && b.type !== 'text') {
        a.boundElements ||= [];
        b.boundElements ||= [];
        els.push(kataArrow(a, b));
      }
    } else {
      const e = byId(o.id);
      if (!e) continue;
      if (op === 'cambiar') {
        if (o.texto != null) setText(e, o.texto);
        if (o.fondo) e.backgroundColor = kcColor(o.fondo, e.backgroundColor);
        if (o.borde) e.strokeColor = kcColor(o.borde, e.strokeColor);
        if (o.ancho) e.width = Number(o.ancho);
        if (o.alto) e.height = Number(o.alto);
      } else if (op === 'mover') {
        const dx = (o.x != null ? Number(o.x) : e.x) - e.x;
        const dy = (o.y != null ? Number(o.y) : e.y) - e.y;
        els.filter((t) => t === e || t.containerId === e.id).forEach((t) => {
          t.x += dx;
          t.y += dy;
        });
      } else if (op === 'borrar') {
        const gone = new Set([e.id, ...els.filter((t) => t.containerId === e.id).map((t) => t.id), ...els.filter((t) => t.type === 'arrow' && (t.startBinding?.elementId === e.id || t.endBinding?.elementId === e.id)).map((t) => t.id)]);
        for (let i = els.length - 1; i >= 0; i--) if (gone.has(els[i].id)) els.splice(i, 1);
        els.forEach((t) => t.boundElements && (t.boundElements = t.boundElements.filter((b) => !gone.has(b.id))));
      }
    }
  }
  // Las flechas siguen a sus figuras.
  els.filter((a) => a.type === 'arrow' && a.startBinding && a.endBinding).forEach((a) => {
    const s = byId(a.startBinding.elementId);
    const t = byId(a.endBinding.elementId);
    if (!s || !t) return;
    const fresh = kataArrow({ ...s, boundElements: [] }, { ...t, boundElements: [] });
    Object.assign(a, { x: fresh.x, y: fresh.y, width: fresh.width, height: fresh.height, points: fresh.points });
  });
  return els.map((e) => xdNormalize(e));
}

// =========================================================
// 5. 🎨 Gráficos e ilustraciones
// =========================================================
const KC_PALETTE = ['#4c6ef5', '#12b886', '#fab005', '#fa5252', '#7950f2', '#15aabf', '#fd7e14', '#868e96'];
const kcEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function kcChartSvg({ titulo = '', tipo = 'barras', etiquetas = [], series = [], unidad = '' }) {
  const W = 960;
  const H = 560;
  const L = 90;
  const R = 30;
  const T = 70;
  const B = 90;
  const labels = (etiquetas || []).map(String).slice(0, 40);
  const ser = (series || []).slice(0, 8).map((s, i) => ({ name: String(s.nombre || `Serie ${i + 1}`), vals: (s.valores || []).map(Number).slice(0, labels.length), color: KC_PALETTE[i % KC_PALETTE.length] }));
  const fmt = (v) => `${Number(v).toLocaleString('es-CL', { maximumFractionDigits: 2 })}${unidad ? ` ${unidad}` : ''}`;
  let body = '';
  if (fold(tipo).startsWith('tort') || tipo === 'pie') {
    const vals = ser[0]?.vals || [];
    const tot = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let a0 = -Math.PI / 2;
    const cx = 330;
    const cy = (H + T - 20) / 2;
    const r = 200;
    vals.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / tot) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      body += `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="${KC_PALETTE[i % KC_PALETTE.length]}" stroke="#fff" stroke-width="2"/>`;
      body += `<rect x="600" y="${T + 10 + i * 34}" width="18" height="18" rx="3" fill="${KC_PALETTE[i % KC_PALETTE.length]}"/><text x="626" y="${T + 24 + i * 34}" font-size="17">${kcEsc(labels[i] || '')} · ${kcEsc(fmt(v))} (${Math.round((Math.max(0, v) / tot) * 100)} %)</text>`;
      a0 = a1;
    });
  } else {
    const all = ser.flatMap((s) => s.vals).filter(Number.isFinite);
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    const span = max - min || 1;
    const pw = W - L - R;
    const ph = H - T - B;
    const y = (v) => T + ph - ((v - min) / span) * ph;
    for (let k = 0; k <= 5; k++) {
      const v = min + (span * k) / 5;
      body += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e9ecef"/><text x="${L - 10}" y="${y(v) + 5}" font-size="14" text-anchor="end" fill="#495057">${kcEsc(Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }))}</text>`;
    }
    const step = pw / Math.max(1, labels.length);
    labels.forEach((l, i) => (body += `<text x="${L + step * i + step / 2}" y="${H - B + 24}" font-size="14" text-anchor="middle" fill="#343a40">${kcEsc(l.length > 14 ? `${l.slice(0, 13)}…` : l)}</text>`));
    if (fold(tipo).startsWith('line')) {
      ser.forEach((s) => {
        const pts = s.vals.map((v, i) => `${L + step * i + step / 2},${y(v)}`).join(' ');
        body += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="4" stroke-linejoin="round"/>`;
        s.vals.forEach((v, i) => (body += `<circle cx="${L + step * i + step / 2}" cy="${y(v)}" r="5" fill="${s.color}"/>`));
      });
    } else {
      const bw = (step * 0.75) / Math.max(1, ser.length);
      ser.forEach((s, si) => s.vals.forEach((v, i) => {
        const x = L + step * i + step * 0.125 + bw * si;
        body += `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw - 2}" height="${Math.abs(y(v) - y(0))}" fill="${s.color}" rx="3"/>`;
        if (ser.length === 1 && labels.length <= 12) body += `<text x="${x + bw / 2}" y="${Math.min(y(v), y(0)) - 6}" font-size="13" text-anchor="middle" fill="#343a40">${kcEsc(Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }))}</text>`;
      }));
    }
    body += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#868e96"/>`;
    if (ser.length > 1) ser.forEach((s, i) => (body += `<rect x="${L + i * 170}" y="${H - 34}" width="16" height="16" rx="3" fill="${s.color}"/><text x="${L + 22 + i * 170}" y="${H - 21}" font-size="15">${kcEsc(s.name.slice(0, 18))}</text>`));
    if (unidad) body += `<text x="${L}" y="${T - 14}" font-size="14" fill="#868e96">${kcEsc(unidad)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif"><rect width="${W}" height="${H}" fill="#ffffff"/><text x="${W / 2}" y="40" font-size="24" font-weight="700" text-anchor="middle" fill="#212529">${kcEsc(titulo)}</text>${body}</svg>`;
}
// SVG escrito por Kataleya: se limpia (sin scripts, eventos ni enlaces externos) antes de dibujarlo.
function kcCleanSvg(svg) {
  const doc = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg' || doc.querySelector('parsererror')) throw new Error('El SVG no es válido');
  root.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, image, use').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => {
    if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !/^#/.test(a.value)) || /url\(\s*['"]?(?!#)/i.test(a.value)) n.removeAttribute(a.name);
  }));
  [...root.attributes].forEach((a) => /^on/i.test(a.name) && root.removeAttribute(a.name));
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (!root.getAttribute('width')) root.setAttribute('width', String(vb[2] || 800));
  if (!root.getAttribute('height')) root.setAttribute('height', String(vb[3] || 600));
  return new XMLSerializer().serializeToString(root);
}
async function kcSvgToPng(svg, maxW = 1600) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const { img, url } = await kcLoadImg(blob);
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 600;
  const k = Math.min(2, maxW / w);
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, cv.width, cv.height);
  cx.drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(url);
  return kcCanvasBlob(cv);
}

// Propone poner una imagen nueva en una nota (destino) o en una nota nueva de «carpeta».
function kcProposeImage(label, blob, name, { note = null, afterId = null, folder = 'Imágenes', title = '' } = {}) {
  const preview = kcBlobUrl(blob);
  const id = kataPropose(label, note ? `en [[${baseName(note.path)}]]${afterId ? ' (debajo de la original, que no se toca)' : ''}` : `nota nueva en «${folder}»`, async () => {
    const rec = await kcSaveImage(blob, name);
    let target = note ? noteById(note.id) : null;
    if (target) kataWriteNote(target, kcInsertImageRef(target.body, rec, afterId));
    else {
      if (!state.folders.includes(folder)) state.folders.push(folder);
      target = createNote({ folder, title: String(title || name).slice(0, 80), body: `Hecho por Kataleya el ${dateKey()}.\n\n![${rec.name}](img:${rec.id})\n`, open: false, edit: false, log: false });
    }
    renderAll();
    return { texto: 'Imagen guardada', abrir: () => openNote(target) };
  });
  const a = kata.pending.get(id.propuesta);
  if (a) a.preview = preview;
  kataRender();
  return id;
}

// =========================================================
// Herramienta para Kataleya: «imagenes»
// =========================================================
const kcTargetNote = (t) => {
  if (t) return kataNote(t);
  const tab = activeTab();
  const n = tab?.type === 'note' ? noteById(tab.id) : null;
  if (!n) throw new Error('Indica la nota (nota: «título») o abre una');
  if (n.enc) throw new Error('Esa nota está protegida con contraseña');
  return n;
};
function kcTool() {
  return {
    name: 'imagenes',
    description: 'Imágenes y dibujos (todo queda como propuesta con vista previa). accion: «editar_imagen» (imagen: número de la imagen que viste en este mensaje; operaciones: [{op: recortar|girar|tamano|brillo|contraste|grises|flecha|recuadro|texto|tapar, …}] con x, y, ancho, alto, x1, y1, x2, y2 en % de la imagen (0-100), grados, valor (-90 a 200), texto, tamano (% de la altura), color); la original no se toca y la editada va debajo. «ver_dibujo» (nota, numero): lista sus figuras con id. «editar_dibujo» (nota, numero, operaciones: agregar {forma, x, y, ancho, alto, texto, fondo, borde}, flecha {desde, hasta: id o «+N» = N-ésima agregada}, cambiar {id, texto, fondo, borde, ancho, alto}, mover {id, x, y}, borrar {id}). «grafico» (titulo, tipo_grafico barras|lineas|torta, etiquetas, series [{nombre, valores}], unidad, nota opcional). «ilustracion» (titulo, svg: un SVG simple con viewBox, sin scripts ni imágenes externas; nota opcional).',
    inputSchema: { type: 'object', properties: {
      accion: { type: 'string', enum: ['editar_imagen', 'ver_dibujo', 'editar_dibujo', 'grafico', 'ilustracion'] },
      imagen: { type: 'number' }, nota: { type: 'string' }, numero: { type: 'number' },
      operaciones: { type: 'array', items: { type: 'object' } },
      titulo: { type: 'string' }, tipo_grafico: { type: 'string', enum: ['barras', 'lineas', 'torta'] }, etiquetas: { type: 'array', items: { type: 'string' } },
      series: { type: 'array', items: { type: 'object' } }, unidad: { type: 'string' }, svg: { type: 'string' },
    }, required: ['accion'] },
    execute: async (i = {}) => {
      const a = String(i.accion || '');
      if (a === 'editar_imagen') {
        const k = Math.max(1, Number(i.imagen) || 1);
        const src = kata.seen[k - 1];
        if (!src) throw new Error(kata.seen.length ? `Solo vi ${kata.seen.length} imagen(es) en este mensaje` : 'No veo ninguna imagen en este mensaje: pide a la persona que abra la nota o la adjunte con 📎');
        kataProgress('Editando la imagen…');
        const blob = await kcEditImage(src.blob, i.operaciones || []);
        const note = src.noteId ? noteById(src.noteId) : (() => { try { return kcTargetNote(i.nota); } catch { return null; } })();
        return kcProposeImage(`🖼 Imagen editada (${(i.operaciones || []).length} cambios)`, blob, `${src.name || 'imagen'} (editada)`, { note, afterId: src.imgId || null, title: `${src.name || 'Imagen'} editada` });
      }
      if (a === 'ver_dibujo' || a === 'editar_dibujo') {
        const note = kcTargetNote(i.nota);
        const rec = await kcDrawingOf(note, i.numero);
        if (!rec) throw new Error(`«${baseName(note.path)}» no tiene ese dibujo editable`);
        if (a === 'ver_dibujo') return { nota: baseName(note.path), figuras: kcDrawingSummary(rec.drawing).slice(0, 80) };
        kataProgress('Editando el dibujo…');
        const els = kcApplyDrawingOps(rec.drawing, i.operaciones || []);
        if (!els.length) throw new Error('El dibujo quedaría vacío');
        await xdLoadFont();
        const blob = await xdRenderBlob(els, rec.drawing.appState?.viewBackgroundColor || '#ffffff');
        const preview = kcBlobUrl(blob);
        const id = kataPropose(`✏️ Editar el dibujo (${(i.operaciones || []).length} cambios)`, `[[${baseName(note.path)}]] · el original queda en el historial de la nota`, async () => {
          const { data, type, width, height } = await compressImage(new File([blob], 'dibujo.png', { type: 'image/png' }));
          const scene = { ...rec.drawing, elements: JSON.parse(JSON.stringify(els)) };
          const nrec = { id: uid(), name: rec.name || 'Dibujo', type, data, width, height, createdAt: Date.now(), drawing: scene };
          await putFile(nrec);
          xdDrawingIds.add(nrec.id);
          const cur = noteById(note.id);
          if (!cur?.body.includes(`(img:${rec.id})`)) throw new Error('El dibujo ya no está en la nota');
          kataWriteNote(cur, cur.body.split(`(img:${rec.id})`).join(`(img:${nrec.id})`));
          if (typeof scheduleFilesSync === 'function') scheduleFilesSync();
          renderAll();
          return { texto: 'Dibujo actualizado', abrir: () => openNote(cur) };
        });
        const p = kata.pending.get(id.propuesta);
        if (p) p.preview = preview;
        kataRender();
        return id;
      }
      if (a === 'grafico') {
        if (!(i.etiquetas || []).length || !(i.series || []).length) throw new Error('Faltan etiquetas o series');
        const blob = await kcSvgToPng(kcChartSvg({ titulo: i.titulo, tipo: i.tipo_grafico || 'barras', etiquetas: i.etiquetas, series: i.series, unidad: i.unidad }));
        let note = null;
        try { note = i.nota ? kcTargetNote(i.nota) : null; } catch { note = null; }
        return kcProposeImage(`📊 Gráfico «${i.titulo || 'sin título'}»`, blob, i.titulo || 'Gráfico', { note, folder: 'Gráficos', title: i.titulo || 'Gráfico' });
      }
      if (a === 'ilustracion') {
        const blob = await kcSvgToPng(kcCleanSvg(i.svg));
        let note = null;
        try { note = i.nota ? kcTargetNote(i.nota) : null; } catch { note = null; }
        return kcProposeImage(`🎨 Ilustración «${i.titulo || 'sin título'}»`, blob, i.titulo || 'Ilustración', { note, folder: 'Imágenes', title: i.titulo || 'Ilustración' });
      }
      throw new Error('accion no válida');
    },
  };
}

// =========================================================
// 2. 📷 Atajos con imágenes a la vista
// =========================================================
const KC_IMG_QUICK = [
  { label: '📝 Pasar a nota', ask: 'Transcribe la imagen a una nota ordenada en Markdown (títulos, listas, tablas y fórmulas cuando corresponda). Marca «⚠️ ilegible» lo que no se lea bien; no adivines. Si es un apunte con normas o cifras, márcalas «⚠️ por verificar» si pueden estar desactualizadas. Luego propón crear la nota con proponer › nota (carpeta «Bandeja IA» si es material de estudio).' },
  { label: '🔍 Describir', ask: 'Describe la imagen: qué muestra, el texto que se lee y qué datos importantes tiene.' },
  { label: '✏️ A dibujo editable', ask: 'Convierte este bosquejo o esquema de la imagen en un dibujo editable de la app con crear_visual › dibujo libre: cajas, rombos para decisiones, textos y flechas en las mismas posiciones relativas (coordenadas en píxeles, unos 1000 de ancho).' },
  { label: '🖼 Editar…', ask: '' },
];
// Se agregan junto al cuadro de texto cuando hay imágenes adjuntas o la nota abierta tiene imágenes.
function kcImageQuick() {
  if (!aiReady()) return '';
  const tab = activeTab();
  const note = tab?.type === 'note' ? noteById(tab.id) : null;
  const hasNoteImg = !!note && !note.enc && /\]\(img:[a-z0-9]+\)/i.test(note.body);
  if (!kata.attach.length && !hasNoteImg) return '';
  const whose = kata.attach.length ? 'la imagen adjunta' : 'la imagen de esta nota';
  return el('div', { className: 'kata-quick kc-img-quick' }, KC_IMG_QUICK.map((q) => {
    const b = el('button', { className: 'kata-chip', title: q.ask ? `${q.label} (${whose})` : 'Escribe qué cambiar: recortar, girar, marcar con una flecha, tapar un RUT…' }, q.label);
    b.addEventListener('click', () => {
      if (!q.ask) {
        const inp = $('#kata-input');
        if (inp) {
          inp.value = `Edita la imagen: `;
          inp.focus();
        }
        return;
      }
      kataSend(`${q.label.replace(/^\S+\s/, '')} (imagen): ${q.ask}`);
    });
    return b;
  }));
}

// =========================================================
// Integración con Kataleya (95-kataleya.js)
// =========================================================
// 1) Herramienta nueva, antes de «comando» (si hay que recortar por el límite, se pierde «comando»).
{
  const prevTools = kataTools;
  // eslint-disable-next-line no-global-assign
  kataTools = function kataToolsCreativa(max = 20) {
    const list = prevTools(99);
    const at = list.findIndex((t) => t.name === 'comando');
    list.splice(at < 0 ? list.length : at, 0, kcTool());
    return list.slice(0, Math.max(1, max));
  };
}
// 2) Recordar qué imágenes vio en el mensaje (para «imagen: N»).
{
  const prevCollect = kataCollectImages;
  // eslint-disable-next-line no-global-assign
  kataCollectImages = async function kataCollectImagesCreativa(q, limits) {
    const attach = kata.attach.slice();
    const tab = activeTab();
    const note = tab?.type === 'note' ? noteById(tab.id) : null;
    const res = await prevCollect(q, limits);
    const seen = [];
    const max = res.blobs.length;
    attach.slice(0, max).forEach((a) => seen.push({ blob: a.blob, name: a.name, noteId: null, imgId: null }));
    if (seen.length < max && note) {
      const ids = [];
      const set = new Set();
      for (const m of String(note.body).matchAll(/!\[([^\]\n]*)\]\(img:([a-z0-9]+)\)/gi)) if (!set.has(m[2]) && set.add(m[2])) ids.push({ name: m[1] || 'imagen', id: m[2] });
      res.blobs.slice(seen.length).forEach((blob, k) => seen.push({ blob, name: ids[k]?.name || 'imagen', noteId: note.id, imgId: ids[k]?.id || null }));
    }
    kata.seen = seen;
    return res;
  };
}
// 3) Reglas: lo que ahora sabe hacer.
{
  const prevRules = kataRules;
  // eslint-disable-next-line no-global-assign
  kataRules = function kataRulesCreativa() {
    return prevRules().replace('- Si la persona te cuenta algo que valga la pena recordar', `- Con imágenes y dibujos usa la herramienta imagenes: editar_imagen (recortar, girar, marcar con flechas o recuadros, escribir, tapar datos sensibles como RUT o montos; coordenadas en % de lo que ves), ver_dibujo y editar_dibujo (primero ver_dibujo para conocer los id), grafico (barras, líneas o torta con datos que te den o de una nota; no inventes cifras) e ilustracion (SVG simple). Para pasar un bosquejo a dibujo editable usa crear_visual › dibujo libre. No puedes crear fotos realistas: dilo si te las piden.
- Si la persona te cuenta algo que valga la pena recordar`);
  };
}
// 4) Vista previa en las tarjetas y atajos de imagen en el panel.
{
  const prevRender = kataRender;
  // eslint-disable-next-line no-global-assign
  kataRender = function kataRenderCreativa() {
    prevRender();
    const panel = $('#kata-panel');
    if (!panel || panel.hidden) return;
    // Vistas previas: cada tarjeta con imagen nueva la muestra.
    const turns = kata.turns.filter((t) => t.role === 'assistant');
    const cards = [...panel.querySelectorAll('.kata-msg.assistant')];
    turns.forEach((t, k) => (t.actions || []).forEach((id, j) => {
      const a = kata.pending.get(id);
      const card = cards[k]?.querySelectorAll('.kata-act')[j];
      if (a?.preview && card && !card.querySelector('.kc-preview')) card.insertBefore(el('img', { className: 'kc-preview', src: a.preview, alt: 'Vista previa' }), card.children[1] || null);
    }));
    // Atajos con imágenes, sobre el cuadro de texto.
    const foot = panel.querySelector('.kata-foot');
    const quick = kcImageQuick();
    if (foot && quick && !kata.busy) foot.insertBefore(quick, foot.querySelector('.kata-compose'));
    // «Continuar escribiendo» junto al micrófono.
    const compose = panel.querySelector('.kata-compose');
    if (compose && aiReady() && !compose.querySelector('.kc-continue')) {
      const b = el('button', { className: 'kata-icon kc-continue', title: 'Continuar escribiendo en la nota desde el cursor', ariaLabel: 'Continuar escribiendo' }, '✍️');
      b.addEventListener('click', kcContinue);
      compose.insertBefore(b, compose.querySelector('.kata-send'));
    }
  };
}
