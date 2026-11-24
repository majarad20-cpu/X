'use strict';

// ---------- Especialidad (fase 2): Revisión de vigencia y Calendario tributario ----------
// 🩺 Revisión de vigencia: una cola de notas por revisar, una a una, con el motivo:
//    📅 llega (o ya llegó) una fecha de vigencia que la nota menciona · ⛔ cita una norma que otra nota da
//    por derogada · ⏳ no se revisa hace más de N meses (la fecha más reciente entre «actualizada»,
//    «revisada» y la que diga «vigencia») · ❔ no tiene «vigencia». Acciones: «Sigue vigente» (pone
//    `revisada: hoy`, sin tocar el texto), «Actualizar» (abre la nota), «Crear alerta» (añade una fila a
//    ⏰ Alertas Normativas) y «Saltar».
// 📅 Calendario tributario: las obligaciones del perfil (sección «Calendario de obligaciones»; si falta,
//    las de fábrica), las fechas de las alertas abiertas y las vigencias futuras de las normas, en un mes
//    con ‹ › y una franja de próximos vencimientos. Un vencimiento «hábil» que cae en sábado, domingo o
//    feriado (los fijos y los del perfil) pasa al siguiente día hábil. Cada uno se puede añadir a Google
//    Calendar, y «⤓ .ics» descarga los próximos 12 meses para cualquier calendario.

// =========================================================
// 🩺 Revisión de vigencia
// =========================================================
const VG_SKIP_TIPOS = /^(moc|perfil|registro|ensayo|herramienta|diario|plantilla|proyecto)$/i;
const vgState = { months: 6, skipped: new Set(), key: '' };

const vgDate = (v) => gvDatesIn(String(v || '')).map((d) => d.date).sort().pop() || '';
// Última revisión: la fecha más reciente entre actualizada, revisada y la que diga vigencia.
function vgLast(n) {
  const ds = ['actualizada', 'revisada', 'vigencia'].map((k) => vgDate(propOf(n, k))).filter(Boolean);
  return ds.sort().pop() || '';
}
const vgMonthsAgo = (iso) => (iso ? (Date.now() - Date.parse(iso)) / (30.44 * 864e5) : Infinity);

function vgQueue(src, months) {
  return gvCached(`vg:${JSON.stringify(src)}:${months}`, () => {
    const today = dateKey();
    const soon = dateKey(new Date(Date.now() + 30 * 864e5));
    const gone = new Map();
    if (typeof proContradictions === 'function') proContradictions().filter((c) => c.type === 'derogada').forEach((c) => c.plain.forEach((p) => gone.set(p.note.id, c.subject)));
    const out = [];
    gvNotes(src).forEach((n) => {
      if (VG_SKIP_TIPOS.test(propOf(n, 'tipo')) || gvIsMoc(n) || /alertas normativas/i.test(baseName(n.path)) || /^personal\b/i.test(n.path) || (typeof proExcluded === 'function' && proExcluded(n))) return;
      const last = vgLast(n);
      const reasons = [];
      // Fechas de vigencia que la nota menciona y llegan (o llegaron) después de su última revisión.
      const { end } = parseProps(n.body);
      const lines = n.body.split('\n');
      for (let i = end + 1; i < lines.length; i++) {
        const l = lines[i];
        if (!/\b(rige|regir[áa]|vigencia|vigente|entra|entrar[áa]|desde|a partir)(?![\wáéíóúñ])/i.test(l)) continue;
        const d = gvDatesIn(l).map((x) => x.date).find((x) => x <= soon && x > (last || '0000') && x >= dateKey(new Date(Date.now() - 365 * 864e5)));
        if (d) {
          reasons.push({ id: 'llega', icon: '📅', text: d <= today ? `ya llegó el ${d.split('-').reverse().join('-')}, después de su última revisión` : `llega el ${d.split('-').reverse().join('-')}`, line: i });
          break;
        }
      }
      if (gone.has(n.id)) reasons.push({ id: 'derogada', icon: '⛔', text: `cita la ${gone.get(n.id)}, derogada según otra nota` });
      const age = vgMonthsAgo(last);
      if (age > months) reasons.push({ id: 'antigua', icon: '⏳', text: last ? `sin revisar desde el ${last.split('-').reverse().join('-')}` : 'sin fecha de revisión' });
      if (!propOf(n, 'vigencia')) reasons.push({ id: 'sin', icon: '❔', text: 'no tiene «vigencia»' });
      if (reasons.length) out.push({ note: n, reasons, last, rank: ['llega', 'derogada', 'antigua', 'sin'].indexOf(reasons[0].id) });
    });
    return out.sort((a, b) => a.rank - b.rank || (a.last || '').localeCompare(b.last || ''));
  });
}

function vgDone(note) {
  gvSetProps(note, [['revisada', dateKey()]]);
  showToastMessage(`«${baseName(note.path)}» queda revisada hoy.`);
}

const vgAlertsNote = () => gvLive().find((n) => /alertas normativas/i.test(baseName(n.path)));

// Añade una fila a la tabla 🟠 de ⏰ Alertas Normativas (o una casilla al final si no la encuentra).
function vgAddAlert(note, text) {
  const al = vgAlertsNote();
  const day = dateKey().split('-').reverse().join('-');
  const name = baseName(note.path);
  if (!al) {
    navigator.clipboard?.writeText(`${text} [[${name}]]`).catch(() => {});
    return showToastMessage('No encontré la nota «⏰ Alertas Normativas»: copié la alerta al portapapeles.');
  }
  const lines = al.body.split('\n');
  const h = lines.findIndex((l) => /^##\s+🟠/.test(l));
  let at = -1;
  if (h >= 0) {
    let i = h + 1;
    while (i < lines.length && !/^\s*\|/.test(lines[i]) && !/^##\s/.test(lines[i])) i++;
    while (i < lines.length && /^\s*\|/.test(lines[i])) i++;
    if (i > h + 1 && /^\s*\|/.test(lines[i - 1])) at = i;
  }
  const cell = (s) => s.replace(/\|/g, '/');
  if (at > 0) lines.splice(at, 0, `| [ ] | **${cell(text)}** | Revisar la nota y actualizarla | Revisión de vigencia del ${day} | [[${name}]] |`);
  else lines.push('', `- [ ] ⚠️ **${text}** · revisión de vigencia del ${day} · [[${name}]]`);
  al.body = lines.join('\n');
  al.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(al);
  renderAll();
  showToastMessage('Alerta añadida a «⏰ Alertas Normativas».');
}

function renderVigencia() {
  const box = $('#view-vigencia');
  if (!box) return;
  const src = gvOpt('vigencia', 'src', { t: 'all' });
  const months = gvOpt('vigencia', 'months', 6);
  const all = vgQueue(src, months);
  const key = `${JSON.stringify(src)}|${months}`;
  if (vgState.key !== key) {
    vgState.key = key;
    vgState.skipped = new Set();
  }
  const queue = all.filter((x) => !vgState.skipped.has(x.note.id));
  const count = (id) => all.filter((x) => x.reasons.some((r) => r.id === id)).length;
  const bar = el('div', { className: 'gv-bar' }, [
    gvSourceButton(src, (s) => gvSetOpt('vigencia', { src: s })),
    gvSeg([[3, 'más de 3 meses'], [6, 'más de 6 meses'], [12, 'más de 12 meses']], months, (v) => gvSetOpt('vigencia', { months: v })),
    el('span', { className: 'gv-spacer' }),
    el('span', { className: 'pro-badge s-futura' }, `📅 ${count('llega')}`),
    el('span', { className: 'pro-badge s-derogada' }, `⛔ ${count('derogada')}`),
    el('span', { className: 'pro-badge s-modificada' }, `⏳ ${count('antigua')}`),
    el('span', { className: 'pro-badge' }, `❔ ${count('sin')}`),
  ]);
  const item = queue[0];
  if (!item) {
    box.replaceChildren(gvHead('vigencia', 'Las notas que conviene revisar, una a una, con el motivo.'), bar,
      el('div', { className: 'card gvs-done' }, [el('p', { className: 'gvs-big' }, all.length ? '🎉 Revisaste toda la cola de esta sesión' : '✅ Todas las notas están al día'), all.length ? gvBtn('Volver a empezar', () => { vgState.skipped = new Set(); renderVigencia(); }) : '']));
    return;
  }
  const n = item.note;
  const next = () => {
    vgState.skipped.add(n.id);
    renderVigencia();
  };
  const preview = el('div', { className: 'md vg-preview gv-fill' });
  preview.innerHTML = renderMd(gvBodyText(n).split('\n').slice(0, 120).join('\n'));
  const meta = ['vigencia', 'actualizada', 'revisada'].map((k) => [k, propOf(n, k)]).filter(([, v]) => v);
  const actions = el('div', { className: 'vg-actions' }, [
    gvBtn([el('strong', {}, '✅ Sigue vigente'), el('span', { className: 'muted' }, 'revisada: hoy · 1')], () => { vgDone(n); next(); }, 'gvs-g g3', 'Pone «revisada» con la fecha de hoy (no cambia el texto)'),
    gvBtn([el('strong', {}, '✏️ Actualizar'), el('span', { className: 'muted' }, 'abrir la nota · 2')], (e) => { vgState.skipped.add(n.id); openNote(n, { newTab: e.ctrlKey || e.metaKey }); }, 'gvs-g g2'),
    gvBtn([el('strong', {}, '⚠️ Crear alerta'), el('span', { className: 'muted' }, 'en Alertas · 3')], () => promptText({ placeholder: 'Texto de la alerta', initial: `Revisar «${baseName(n.path)}»: ${item.reasons[0].text}`, action: 'Crear alerta', onSubmit: (t) => { if (t.trim()) { vgAddAlert(n, t.trim()); next(); } } }), 'gvs-g g1'),
    gvBtn([el('strong', {}, '⏭ Saltar'), el('span', { className: 'muted' }, 'por ahora · 4')], next, 'gvs-g'),
  ]);
  box.replaceChildren(
    gvHead('vigencia', 'Una nota a la vez, con el motivo para revisarla: fechas de vigencia que llegan, normas derogadas, mucho tiempo sin revisar o sin «vigencia». «Sigue vigente» solo pone revisada: hoy.'),
    bar,
    el('div', { className: 'card vg-card' }, [
      el('div', { className: 'vg-head' }, [
        el('div', {}, [el('h3', { className: 'vg-title' }, baseName(n.path)), el('span', { className: 'muted' }, folderOf(n.path))]),
        el('span', { className: 'gv-spacer' }),
        el('span', { className: 'muted' }, `Quedan ${queue.length} de ${all.length}`),
      ]),
      el('div', { className: 'vg-reasons' }, item.reasons.map((r) => {
        const b = el(r.line != null ? 'button' : 'span', { className: `pro-badge vg-r-${r.id}`, title: r.line != null ? 'Ver la línea' : '' }, `${r.icon} ${r.text}`);
        if (r.line != null) b.addEventListener('click', (e) => openNoteAtLine(n.id, r.line, { newTab: e.ctrlKey || e.metaKey }));
        return b;
      })),
      meta.length ? el('div', { className: 'vg-meta' }, meta.map(([k, v]) => el('span', {}, [el('span', { className: 'muted' }, `${k}: `), v]))) : '',
      actions,
    ]),
    preview
  );
}

document.addEventListener('keydown', (e) => {
  if (activeTab()?.type !== 'view' || activeTab().view !== 'vigencia') return;
  if (e.target.closest?.('input, textarea, [contenteditable="true"], .picker, dialog') || e.ctrlKey || e.metaKey || e.altKey || !/^[1-4]$/.test(e.key)) return;
  const btn = $$('#view-vigencia .vg-actions button')[Number(e.key) - 1];
  if (!btn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  btn.click();
}, true);

// =========================================================
// 📅 Calendario tributario
// =========================================================
const CT_DEFAULT = `## Calendario de obligaciones
Cada línea: \`frecuencia · cuándo · hábil (opcional) · obligación · detalle\`. «hábil»: si cae en sábado, domingo o feriado, pasa al siguiente día hábil. Revisa estas fechas con el calendario del SII de cada año.
- Mensual · día 12 · hábil · F29 (IVA, PPM y retenciones) · sin facturación electrónica o declaración en papel
- Mensual · día 20 · hábil · F29 por internet · contribuyentes que facturan electrónicamente
- Mensual · día 10 · hábil · Cotizaciones previsionales (pago no electrónico)
- Mensual · día 13 · hábil · Cotizaciones previsionales (pago electrónico)
- Anual · 01-03 · Declaraciones juradas de renta · las fechas de cada DJ están en el suplemento de vencimientos del SII
- Anual · 30-04 · hábil · F22 Declaración anual de impuestos a la renta
- Anual · 30-04, 30-06, 30-09, 30-11 · Contribuciones de bienes raíces (cuotas)
- Anual · 31-01, 31-07 · Patente municipal · según la municipalidad

## Feriados
Fechas que no son hábiles además de los feriados fijos (los móviles de cada año: Semana Santa, Pueblos Indígenas, San Pedro y San Pablo, Encuentro de Dos Mundos, Iglesias Evangélicas…). Formato AAAA-MM-DD.
`;
// Feriados de fecha fija en Chile (los móviles van en el perfil).
const CT_FIXED_HOLIDAYS = ['01-01', '05-01', '05-21', '07-16', '08-15', '09-18', '09-19', '11-01', '12-08', '12-25'];
const ctState = { ym: '', show: { obl: true, alerta: true, norma: true } };

function ctProfile() {
  const note = typeof proProfileNote === 'function' ? proProfileNote() : null;
  const text = note && !note.enc && /^##\s+Calendario de obligaciones/m.test(note.body) ? note.body : CT_DEFAULT;
  return gvCached(`ct-profile:${note?.id || 'base'}`, () => {
    const section = (title) => {
      const m = text.match(new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
      return m ? m[1].split('\n') : [];
    };
    const items = [];
    section('Calendario de obligaciones').forEach((l) => {
      if (!/^\s*-\s/.test(l)) return;
      const parts = l.replace(/^\s*-\s*/, '').split('·').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 3) return;
      const freq = fold(parts[0]);
      const when = parts[1];
      const habil = /^h[aá]bil$/i.test(parts[2]);
      const rest = parts.slice(habil ? 3 : 2);
      const title = rest[0];
      if (!title) return;
      const detail = rest.slice(1).join(' · ');
      if (freq.startsWith('mens')) {
        const d = Number((when.match(/\d{1,2}/) || [])[0]);
        if (d >= 1 && d <= 31) items.push({ kind: 'mensual', day: d, habil, title, detail });
      } else {
        const dates = [...when.matchAll(/(\d{1,2})-(\d{1,2})/g)].map((m) => [Number(m[1]), Number(m[2])]).filter(([d, mo]) => d >= 1 && d <= 31 && mo >= 1 && mo <= 12);
        if (dates.length) items.push({ kind: 'anual', dates, habil, title, detail });
      }
    });
    const holidays = new Set(section('Feriados').flatMap((l) => gvDatesIn(l).map((d) => d.date)));
    return { items, holidays };
  });
}

function ctIsWorkday(iso, holidays) {
  const d = new Date(`${iso}T12:00:00`);
  const wd = d.getDay();
  return wd !== 0 && wd !== 6 && !CT_FIXED_HOLIDAYS.includes(iso.slice(5)) && !holidays.has(iso);
}
function ctShift(iso, holidays) {
  let d = new Date(`${iso}T12:00:00`);
  for (let i = 0; i < 10 && !ctIsWorkday(dateKey(d), holidays); i++) d = new Date(d.getTime() + 864e5);
  return dateKey(d);
}
const ctIso = (y, m, d) => {
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

// Eventos entre dos fechas: { date, kind: 'obl'|'alerta'|'norma', title, detail, note?, line?, shifted? }.
function ctEvents(from, to) {
  return gvCached(`ct:${from}:${to}`, () => {
    const { items, holidays } = ctProfile();
    const out = [];
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
      items.forEach((it) => {
        const raw = it.kind === 'mensual' ? [ctIso(y, m, it.day)] : it.dates.filter(([, mo]) => mo === m).map(([d]) => ctIso(y, m, d));
        raw.forEach((r) => {
          const date = it.habil ? ctShift(r, holidays) : r;
          const prev = new Date(y, m - 2, 1);
          const period = it.kind === 'mensual' ? ` · período ${GV_MON[prev.getMonth()]} ${prev.getFullYear()}` : '';
          out.push({ date, kind: 'obl', title: it.title, detail: `${it.detail || ''}${period}`.replace(/^ · /, ''), shifted: date !== r ? r : '' });
        });
      });
    }
    // Alertas abiertas con fecha, y vigencias futuras de las normas.
    const al = vgAlertsNote();
    if (al) {
      al.body.split('\n').forEach((l, i) => {
        if (!/^\s*\|\s*\[ \]/.test(l)) return;
        const cells = l.split('|').map((c) => c.trim());
        const title = plainText(cells[2] || '').slice(0, 90);
        // La fecha en que se creó la alerta desde la revisión no es un vencimiento.
        gvDatesIn(l.replace(/Revisi[oó]n de vigencia del \d{2}-\d{2}-\d{4}/g, '')).forEach((d) => out.push({ date: d.date, kind: 'alerta', title: `⚠️ ${title}`, detail: gvSnippet(l), note: al, line: i }));
      });
    }
    // Una vigencia por línea y fecha (si la línea nombra varias normas, van juntas).
    if (typeof proIndex === 'function') {
      const byLine = new Map();
      proIndex().norms.forEach((e) => e.future.forEach((f) => {
        const k = `${f.note.id}|${f.line}|${f.date}`;
        if (!byLine.has(k)) byLine.set(k, { f, keys: [] });
        if (!byLine.get(k).keys.includes(e.key)) byLine.get(k).keys.push(e.key);
      }));
      byLine.forEach(({ f, keys }) => out.push({ date: f.date, kind: 'norma', title: `⚖️ ${keys.join(' · ')}`, detail: f.text, note: f.note, line: f.line }));
    }
    return out.filter((x) => x.date >= from && x.date <= to).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));
  });
}

const ctFmt = (iso, opts = { day: 'numeric', month: 'short' }) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', opts);
const ctDaysLeft = (iso) => Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${dateKey()}T12:00:00`)) / 864e5);

async function ctToGoogle(ev) {
  if (typeof gAvailable !== 'function' || !gAvailable()) return showToastMessage('Google Calendar solo está disponible al abrir la app desde Claude. Usa «⤓ .ics» para importarlo en cualquier calendario.');
  const [y, m, d] = ev.date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 9, 0);
  const end = new Date(y, m - 1, d, 9, 30);
  try {
    const res = await gCall('Google Calendar', 'create_event', { summary: ev.title.replace(/^[⚠️⚖️\s]+/u, ''), startTime: localStamp(start), endTime: localStamp(end), timeZone: tz(), description: `${ev.detail || ''}\n\nDesde el Calendario tributario de Enfoque.`.trim() });
    showToastMessage(`Añadido a Google Calendar: ${ev.title} (${ctFmt(ev.date)})${res?.htmlLink ? '' : ''}`);
  } catch (err) {
    showToastMessage(typeof gErrorText === 'function' ? gErrorText(err, 'Google Calendar') : 'No se pudo crear el evento.');
  }
}

async function ctExportIcs() {
  const from = dateKey();
  const t = new Date();
  const to = dateKey(new Date(t.getFullYear() + 1, t.getMonth(), t.getDate()));
  const evs = ctEvents(from, to).filter((e) => ctState.show[e.kind]);
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const day = (iso) => iso.replace(/-/g, '');
  const next = (iso) => day(dateKey(new Date(Date.parse(`${iso}T12:00:00`) + 864e5)));
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Enfoque//Calendario tributario//ES', 'CALSCALE:GREGORIAN',
    ...evs.flatMap((e, i) => ['BEGIN:VEVENT', `UID:enfoque-ct-${day(e.date)}-${i}@enfoque`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${next(e.date)}`, `SUMMARY:${esc(e.title.replace(/^[⚠️⚖️\s]+/u, ''))}`, `DESCRIPTION:${esc(e.detail)}`, 'END:VEVENT']),
    'END:VCALENDAR'].join('\r\n');
  const filename = `calendario-tributario-${from}.ics`;
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads').catch(() => null);
    if (downloads) {
      try {
        await downloads.save({ filename, data: ics });
        return showToastMessage(`Guardado ${filename} (${plural(evs.length, 'vencimiento', 'vencimientos')}).`);
      } catch (e) {
        if (e?.code === 'declined') return;
      }
    }
  }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToastMessage(`Descargado ${filename} (${plural(evs.length, 'vencimiento', 'vencimientos')}).`);
}

// Añade la sección del calendario al perfil (si no la tiene) y lo abre.
function ctEditProfile() {
  if (typeof proOpenProfile !== 'function') return;
  let note = proProfileNote();
  if (!note) {
    proOpenProfile();
    note = proProfileNote();
  }
  if (note && !/^##\s+Calendario de obligaciones/m.test(note.body)) {
    note.body = `${note.body.replace(/\s+$/, '')}\n\n${CT_DEFAULT}`;
    note.updatedAt = Date.now();
    dataRev++;
    save();
  }
  if (note) openNote(note);
}

// Nombre corto para la cuadrícula del mes: «F29», «Cotizaciones», «F22», «Contribuciones»…
function ctShort(title) {
  const t = title.replace(/^[⚠️⚖️\s]+/u, '');
  if (title.startsWith('⚖')) return `⚖️ ${t.split(' · ')[0]}`;
  const code = t.match(/^(F\s?\d+|DJ\s?\d+)/i);
  if (code) return code[1].replace(/\s/g, '');
  const w = t.split(/[\s(,·]+/)[0];
  return `${title.startsWith('⚠') ? '⚠️ ' : ''}${w.length > 13 ? `${w.slice(0, 12)}.` : w}`;
}

function ctEventChip(ev, { long = false } = {}) {
  const left = ctDaysLeft(ev.date);
  const b = el('button', { className: `ct-ev k-${ev.kind}${left < 0 ? ' past' : left <= 3 ? ' soon' : ''}`, title: `${ctFmt(ev.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${ev.shifted ? ` (corrido desde el ${ev.shifted.split('-').reverse().join('-')} por no ser hábil)` : ''}\n${ev.title}${ev.detail ? `\n${ev.detail}` : ''}` }, long
    ? [el('span', { className: 'ct-when' }, [el('strong', {}, ctFmt(ev.date)), el('span', { className: 'muted' }, left === 0 ? 'hoy' : left === 1 ? 'mañana' : left > 0 ? `en ${left} días` : `hace ${-left} días`)]), el('span', { className: 'ct-what' }, [el('strong', {}, ev.title), ev.detail ? el('span', { className: 'muted' }, ev.detail) : ''])]
    : ctShort(ev.title));
  b.addEventListener('click', (e) => (ev.note ? openNoteAtLine(ev.note.id, ev.line, { newTab: e.ctrlKey || e.metaKey }) : ctEventMenu(ev, { x: e.clientX, y: e.clientY })));
  b.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctEventMenu(ev, { x: e.clientX, y: e.clientY });
  });
  return b;
}

function ctEventMenu(ev, pos) {
  showMenu(pos, [
    { label: '📅 Añadir a Google Calendar', action: () => ctToGoogle(ev) },
    ev.note && { label: 'Abrir la nota', action: () => openNoteAtLine(ev.note.id, ev.line) },
    !ev.note && { label: '⚙ Cambiar las obligaciones (perfil)', action: ctEditProfile },
  ]);
}

function renderCalendarioTrib() {
  const box = $('#view-calendario-trib');
  if (!box) return;
  const today = dateKey();
  if (!ctState.ym) ctState.ym = today.slice(0, 7);
  const [y, m] = ctState.ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const monthEvents = ctEvents(`${ctState.ym}-01`, `${ctState.ym}-${String(lastDay).padStart(2, '0')}`).filter((e) => ctState.show[e.kind]);
  const upcoming = ctEvents(today, dateKey(new Date(Date.now() + 75 * 864e5))).filter((e) => ctState.show[e.kind]).slice(0, 14);
  const move = (k) => {
    const d = new Date(y, m - 1 + k, 1);
    ctState.ym = dateKey(d).slice(0, 7);
    renderCalendarioTrib();
  };
  const toggle = (k, label) => gvBtn(`${ctState.show[k] ? '☑' : '☐'} ${label}`, () => { ctState.show[k] = !ctState.show[k]; renderCalendarioTrib(); }, `gv-chip ct-f k-${k}`);
  const bar = el('div', { className: 'gv-bar' }, [
    gvBtn('‹', () => move(-1), 'gv-chip', 'Mes anterior'),
    el('strong', { className: 'ct-month' }, first.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })),
    gvBtn('›', () => move(1), 'gv-chip', 'Mes siguiente'),
    gvBtn('Hoy', () => { ctState.ym = today.slice(0, 7); renderCalendarioTrib(); }, 'gv-chip'),
    toggle('obl', 'Obligaciones'),
    toggle('alerta', 'Alertas'),
    toggle('norma', 'Vigencias'),
    el('span', { className: 'gv-spacer' }),
    gvBtn('⤓ .ics', ctExportIcs, 'gv-chip', 'Descargar los próximos 12 meses para importarlos en Google Calendar, Outlook o Apple'),
    gvBtn('⚙ Obligaciones', ctEditProfile, 'gv-chip', 'Cambiar las obligaciones y los feriados en el perfil'),
  ]);
  const byDay = new Map();
  monthEvents.forEach((e) => (byDay.get(e.date) || byDay.set(e.date, []).get(e.date)).push(e));
  const lead = (first.getDay() + 6) % 7; // lunes primero
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(el('div', { className: 'ct-day out' }));
  const { holidays } = ctProfile();
  for (let d = 1; d <= lastDay; d++) {
    const iso = ctIso(y, m, d);
    const evs = byDay.get(iso) || [];
    const cell = el('div', { className: `ct-day${iso === today ? ' today' : ''}${ctIsWorkday(iso, holidays) ? '' : ' off'}${iso < today ? ' past' : ''}` }, [
      el('span', { className: 'ct-num' }, String(d)),
      ...evs.slice(0, 4).map((e) => ctEventChip(e)),
      evs.length > 4 ? gvBtn(`y ${evs.length - 4} más`, () => openPicker({ placeholder: ctFmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }), items: () => evs.map((e) => ({ label: e.title, detail: e.detail, action: () => (e.note ? openNoteAtLine(e.note.id, e.line) : ctToGoogle(e)) })) }), 'link') : '',
    ]);
    cells.push(cell);
  }
  const grid = el('div', { className: 'ct-grid' }, [...['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((w) => el('div', { className: 'ct-wd' }, w)), ...cells]);
  const side = el('aside', { className: 'ct-side' }, [
    el('h3', { className: 'ct-side-title' }, 'Próximos vencimientos'),
    upcoming.length ? el('div', { className: 'ct-up' }, upcoming.map((e) => ctEventChip(e, { long: true }))) : el('p', { className: 'muted' }, 'Nada en los próximos 75 días.'),
    el('p', { className: 'muted ct-note' }, 'Fechas «hábiles» corridas por fin de semana y feriados fijos; agrega los móviles en el perfil. Verifica cada año con el calendario del SII.'),
  ]);
  box.replaceChildren(
    gvHead('calendario-trib', 'Vencimientos tributarios y previsionales del perfil, las fechas de tus alertas abiertas y las vigencias futuras de las normas. Toca una alerta o vigencia para abrir su nota; clic derecho en cualquiera para añadirla a Google Calendar.'),
    bar,
    el('div', { className: 'ct-wrap gv-fill' }, [grid, side])
  );
}

// ---------- Registro en la sección «Contador» ----------
GV_VIEWS.push(
  { id: 'vigencia', title: 'Revisión de vigencia', icon: 'stethoscope', hint: 'Revisión de vigencia: las notas que conviene revisar, una a una, con el motivo' },
  { id: 'calendario-trib', title: 'Calendario tributario', icon: 'cal-month', hint: 'Calendario tributario: vencimientos, alertas y vigencias futuras en un mes, con Google Calendar' }
);
if (!ICONS.stethoscope) ICONS.stethoscope = '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>';
['vigencia', 'calendario-trib'].forEach((id) => {
  const v = GV_VIEWS.find((x) => x.id === id);
  VIEW_TITLES[id] = v.title;
  VIEW_ICONS[id] = v.icon;
  $('#views-pane main').append(el('section', { id: `view-${id}`, className: 'view gv-view' }));
  const b = el('button', { className: 'rib', title: v.hint, ariaLabel: v.title }, [ico(v.icon), el('span', { className: 'rib-label' }, v.title)]);
  b.dataset.view = id;
  b.addEventListener('click', (e) => showView(id, { newTab: e.ctrlKey || e.metaKey }));
  const prof = $('#rib-pro-profile');
  if (prof) prof.before(b);
  else $('.ribbon [data-group="pro"] .rib-gitems')?.append(b);
});
Object.assign(VIEW_RENDER, { vigencia: renderVigencia, 'calendario-trib': renderCalendarioTrib });
