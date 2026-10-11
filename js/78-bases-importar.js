'use strict';

// ---------- Bases: importar CSV o una tabla/lista pegada, y exportar ----------
// Cada fila es una entrada (una nota con sus propiedades); cada columna, un campo con su tipo.
// Se puede crear una base nueva o añadir/actualizar las entradas de una que ya existe.
// Exportar: CSV para Excel, copiar como tabla para pegar en una hoja, nota con la tabla o JSON.

// ---------- Leer los valores ----------
function impNum(s) {
  let t = String(s).trim().replace(/[\s€$%]/g, '');
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  if (t.includes('.') && t.includes(',')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function impDate(s) {
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const [d, mo] = [+m[1], +m[2]];
  return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
const IMP_YES = /^(s[ií]|si|yes|y|true|verdadero|x|✓|✔|1)$/i;
const IMP_BOOL = /^(s[ií]|si|yes|y|true|verdadero|x|✓|✔|1|no|n|false|falso|0|-)?$/i;

// Tipo de una columna por sus valores (y su nombre).
function impGuessType(header, values) {
  const v = values.map((x) => String(x).trim()).filter(Boolean);
  if (!v.length) return { type: guessField(header, []).type, options: [] };
  if (v.every((x) => impDate(x))) return { type: 'fecha', options: [] };
  if (v.every((x) => impNum(x) !== null)) return { type: 'número', options: [] };
  if (v.every((x) => /^https?:\/\/\S+$/i.test(x))) return { type: 'enlace', options: [] };
  if (v.every((x) => IMP_BOOL.test(x)) && v.some((x) => IMP_YES.test(x))) return { type: 'casilla', options: [] };
  const distinct = [...new Set(v)];
  // Pocos valores que se repiten (o una columna de estado, tipo, categoría…): opción.
  const statusLike = /estado|status|tipo|categor|prioridad|g[eé]nero|nivel|fase|etapa/i.test(header);
  if (v.length >= 4 && distinct.length < v.length && distinct.length <= 8 && distinct.every((x) => x.length <= 30) && (statusLike || distinct.length <= Math.ceil(v.length / 2))) return { type: 'opción', options: distinct };
  return { type: 'texto', options: [] };
}

// Valor de la celda según el tipo del campo.
function impValue(type, raw) {
  const s = String(raw ?? '').trim();
  if (type === 'casilla') return IMP_YES.test(s);
  if (!s) return '';
  if (type === 'número') return impNum(s) ?? s;
  if (type === 'fecha') return impDate(s) || s;
  if (type === 'lista') return s.split(/\s*[,;|]\s*/).filter(Boolean);
  return s;
}

const impKey = (h, i) => String(h || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[:,[\]|#"'{}]/g, '') || `campo_${i + 1}`;

// Texto (CSV, tabla pegada de una hoja o lista) → filas. Una lista sin separadores pierde sus viñetas.
function impRows(text) {
  const { rows } = finCsvParse(text);
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 1) return rows.map((r) => [r[0].trim().replace(/^(?:[-*•+]\s+|\d+[.)]\s+)?(?:\[[ xX]\]\s*)?/, '')]).filter((r) => r[0]);
  return rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim()));
}

// ---------- Diálogo de importación ----------
// base: importar en una base existente; si no, se crea una con el nombre que se elija.
function openImportDialog(text, { base = null, name = 'Importada' } = {}) {
  const all = impRows(text);
  if (!all.length) return showToastMessage('No hay filas que importar.');
  const width = all[0].length;
  const looksHeader = width > 1 && all.length > 1 && all[0].every((c) => c && impNum(c) === null && !impDate(c));
  const st = { header: looksHeader, nameCol: 0, bodyCol: -1, update: true };
  let cols = [];
  const fields = base ? baseFields(base) : [];
  const build = () => {
    const head = st.header ? all[0] : all[0].map((_, i) => (width === 1 ? 'nombre' : `columna ${i + 1}`));
    const data = st.header ? all.slice(1) : all;
    cols = head.map((h, i) => {
      const key = impKey(h, i);
      const known = fields.find((f) => f.key.toLowerCase() === key);
      return { i, label: String(h).trim() || `Columna ${i + 1}`, key, on: true, ...(known ? { type: known.type, options: [...known.options] } : impGuessType(key, data.map((r) => r[i]).slice(0, 200))) };
    });
    if (st.header && st.nameCol === 0) {
      const byName = cols.findIndex((c) => /^(nombre|t[ií]tulo|title|name|producto|art[ií]culo|libro|pel[ií]cula|tarea|item|elemento)$/i.test(c.key));
      if (byName >= 0) st.nameCol = byName;
      const byBody = cols.findIndex((c) => /^(contenido|content|body|cuerpo)$/i.test(c.key));
      if (byBody >= 0 && byBody !== st.nameCol) st.bodyCol = byBody;
    }
    return data;
  };
  let data = build();
  const back = entryModal();
  const box = el('div', { className: 'imp-box' });
  const draw = () => {
    const sel = (label, value, list, onChange) => {
      const s = el('select', { ariaLabel: label }, list.map(([v, l]) => el('option', { value: String(v) }, l)));
      s.value = String(value);
      s.addEventListener('change', () => onChange(+s.value));
      return el('label', { className: 'imp-pick' }, [el('span', { className: 'muted' }, label), s]);
    };
    const colList = cols.map((c) => [c.i, c.label]);
    const headChk = el('input', { type: 'checkbox', checked: st.header });
    headChk.addEventListener('change', () => {
      st.header = headChk.checked;
      [st.nameCol, st.bodyCol] = [0, -1];
      data = build();
      draw();
    });
    const rowsOut = cols.filter((c) => c.i !== st.nameCol && c.i !== st.bodyCol).map((c) => {
      const on = el('input', { type: 'checkbox', checked: c.on, ariaLabel: `Importar ${c.label}` });
      on.addEventListener('change', () => (c.on = on.checked));
      const key = el('input', { type: 'text', value: c.key, className: 'fm-name', ariaLabel: `Campo para ${c.label}` });
      key.addEventListener('input', () => (c.key = key.value.replace(/[:,[\]|]/g, '').trim().replace(/\s+/g, '_')));
      const type = el('select', { ariaLabel: 'Tipo' }, FIELD_TYPES.map(([k, l]) => el('option', { value: k }, l)));
      type.value = c.type;
      type.addEventListener('change', () => {
        c.type = type.value;
        if (c.type === 'opción' && !c.options.length) c.options = [...new Set(data.map((r) => r[c.i]).filter(Boolean))].slice(0, 12);
      });
      const sample = data.slice(0, 3).map((r) => r[c.i]).filter(Boolean).join(' · ');
      return el('div', { className: 'imp-col' }, [on, key, type, el('span', { className: 'muted imp-sample', title: sample }, sample || '(vacía)')]);
    });
    const exists = base ? new Set(baseEntries(base).map((n) => baseName(n.path).toLowerCase())) : new Set();
    const dupes = data.filter((r) => exists.has(cleanName(r[st.nameCol]).toLowerCase())).length;
    const upd = el('input', { type: 'checkbox', checked: st.update });
    upd.addEventListener('change', () => (st.update = upd.checked));
    box.replaceChildren(
      width > 1 ? el('label', { className: 'fm-check' }, [headChk, 'La primera fila son los nombres de las columnas']) : '',
      el('div', { className: 'imp-picks' }, [
        sel('Nombre de cada entrada', st.nameCol, colList, (v) => {
          st.nameCol = v;
          if (st.bodyCol === v) st.bodyCol = -1;
          draw();
        }),
        ...(width > 1 ? [sel('Contenido de la nota', st.bodyCol, [[-1, '— ninguno —'], ...colList.filter(([i]) => i !== st.nameCol)], (v) => {
          st.bodyCol = v;
          draw();
        })] : []),
      ]),
      rowsOut.length ? el('div', { className: 'imp-cols' }, [el('div', { className: 'muted imp-cols-head' }, 'Campos (desmarca los que no quieras importar)'), ...rowsOut]) : '',
      dupes ? el('label', { className: 'fm-check' }, [upd, `Actualizar las ${dupes} entradas que ya existen con el mismo nombre (si no, se crean aparte)`]) : '',
    );
    go.textContent = `Importar ${data.length} ${data.length === 1 ? 'entrada' : 'entradas'}`;
  };
  const nameIn = base ? null : el('input', { type: 'text', className: 'entry-title', value: cleanName(name) || 'Importada', ariaLabel: 'Nombre de la base nueva', placeholder: 'Nombre de la base nueva' });
  const go = el('button', { className: 'primary' }, 'Importar');
  const cancel = el('button', {}, 'Cancelar');
  cancel.addEventListener('click', () => (back.hidden = true));
  go.addEventListener('click', () => {
    const title = base ? '' : cleanName(nameIn.value);
    if (!base && !title) return nameIn.focus();
    if (!base && allBases().some((b) => baseName(b.path).toLowerCase() === title.toLowerCase())) return showToastMessage(`Ya tienes una base «${title}»: elige otro nombre`);
    const used = cols.filter((c) => c.on && c.i !== st.nameCol && c.i !== st.bodyCol && c.key);
    const keys = used.map((c) => c.key.toLowerCase());
    if (new Set(keys).size !== keys.length) return showToastMessage('Hay dos campos con el mismo nombre');
    back.hidden = true;
    const target = runImport({ base, title, data, used, nameCol: st.nameCol, bodyCol: st.bodyCol, update: st.update });
    if (target) openBase(target.id);
  });
  back.replaceChildren(el('div', { className: 'modal entry-card imp-card' }, [
    el('h3', {}, base ? `📥 Importar en «${baseName(base.path)}»` : '📥 Importar como base nueva'),
    ...(nameIn ? [nameIn] : []),
    box,
    el('div', { className: 'row entry-actions' }, [go, cancel]),
  ]));
  draw();
  back.hidden = false;
  (nameIn || go).focus();
  nameIn?.select();
}

// Crea (o actualiza) las entradas; todo de una vez, con «Deshacer».
function runImport({ base, title, data, used, nameCol, bodyCol, update }) {
  const fields = used.map((c) => ({ key: c.key, type: c.type, options: c.type === 'opción' ? c.options : [] }));
  // Cuántas se crean y cuántas se actualizan (para el aviso con «Deshacer»).
  const seen = new Set(base && update ? baseEntries(base).filter((n) => folderOf(n.path) === baseFolders(base)[0] && noteText(n) !== null).map((n) => baseName(n.path).toLowerCase()) : []);
  let changed = 0;
  data.forEach((r, i) => {
    const k = (cleanName(r[nameCol]) || `Entrada ${i + 1}`).toLowerCase();
    if (seen.has(k) && (base ? update : true)) changed++;
    seen.add(k);
  });
  const made = data.length - changed;
  const where = base ? baseName(base.path) : title;
  let target = base;
  withUndo(`${made} ${made === 1 ? 'entrada nueva' : 'entradas nuevas'}${changed ? ` · ${changed} actualizadas` : ''} en «${where}»`, () => {
    if (!base) {
      const folder = title;
      const opt = fields.find((f) => f.type === 'opción' && f.options.length);
      const views = [['Tabla', tbl(folder, fields.slice(0, 8).map((f) => f.key))]];
      if (opt) views.push([`Por ${opt.key}`, brd(folder, opt.key, opt.options.join(', '), fields.filter((f) => f !== opt).slice(0, 2).map((f) => f.key))]);
      target = createBase({ name: title, folder, views, icon: '📥' });
      if (!target) return;
      setBaseFields(target, fields);
    } else addFieldsToBase(base, fields.filter((f) => !baseFields(base).some((x) => x.key.toLowerCase() === f.key.toLowerCase())), { columns: true });
    const folder = baseFolders(target)[0];
    if (!state.folders.includes(folder)) state.folders.push(folder);
    const byName = new Map(baseEntries(target).filter((n) => folderOf(n.path) === folder).map((n) => [baseName(n.path).toLowerCase(), n]));
    data.forEach((r, i) => {
      const name = cleanName(r[nameCol]) || `Entrada ${i + 1}`;
      const vals = fields.map((f, k) => ({ ...f, value: impValue(f.type, r[used[k].i]) }));
      const body = bodyCol >= 0 ? String(r[bodyCol] || '').replace(/\\n/g, '\n') : '';
      const old = byName.get(name.toLowerCase());
      if (old && update && noteText(old) !== null) {
        vals.filter((v) => v.value !== '' && !(Array.isArray(v.value) && !v.value.length)).forEach((v) => peSet(old, v.key, FIELD_PE[v.type] || 'text', v.value));
        if (body.trim() && !noteText(old).includes(body.trim())) qbEdit(old, (lines) => lines.push('', ...body.trim().split('\n')));
        return;
      }
      const yaml = entryYaml(vals);
      const note = { id: uid(), path: uniquePath(folder, name), body: `${yaml.length ? `---\n${yaml.join('\n')}\n---\n` : ''}\n${body.trim() ? `${body.trim()}\n` : ''}`, createdAt: Date.now(), updatedAt: Date.now() };
      state.notes.push(note);
      byName.set(name.toLowerCase(), note);
    });
  });
  return target;
}

// ---------- Elegir archivo o pegar ----------
function importBaseFile(base = null) {
  const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) return showToastMessage('Guarda la hoja como CSV en Excel (Archivo › Guardar como › CSV) o copia las celdas y usa «Pegar».');
    openImportDialog(await file.text(), { base, name: file.name.replace(/\.[^.]+$/, '') });
  });
  document.body.append(input);
  input.click();
}

function importBasePaste(base = null) {
  const back = entryModal();
  const ta = el('textarea', { className: 'notes imp-paste', rows: 10, placeholder: 'Pega aquí celdas copiadas de Excel o Google Sheets, un CSV, o una lista (una línea por entrada)…', ariaLabel: 'Texto a importar' });
  const next = el('button', { className: 'primary' }, 'Siguiente');
  const cancel = el('button', {}, 'Cancelar');
  cancel.addEventListener('click', () => (back.hidden = true));
  next.addEventListener('click', () => {
    if (!ta.value.trim()) return ta.focus();
    openImportDialog(ta.value, { base, name: 'Lista pegada' });
  });
  back.replaceChildren(el('div', { className: 'modal entry-card imp-card' }, [
    el('h3', {}, base ? `📋 Pegar filas en «${baseName(base.path)}»` : '📋 Pegar una tabla o lista'),
    el('p', { className: 'muted' }, 'Cada línea será una entrada. Si las filas tienen columnas (de una hoja de cálculo), cada columna será un campo.'),
    ta,
    el('div', { className: 'row entry-actions' }, [next, cancel]),
  ]));
  back.hidden = false;
  ta.focus();
}

// ---------- Exportar ----------
function baseTable(base) {
  const entries = baseEntries(base).sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), 'es'));
  const keys = baseFields(base).map((f) => f.key);
  const recs = [];
  let locked = 0;
  entries.forEach((n) => {
    const text = noteText(n);
    if (text === null) return locked++;
    const { props, end } = parseProps(text);
    props.forEach((p) => keys.some((k) => k.toLowerCase() === p.key.toLowerCase()) || keys.push(p.key));
    const body = text.split('\n').slice(end > 0 ? end + 1 : 0).join('\n').trim();
    recs.push({ name: baseName(n.path), props, body });
  });
  const cell = (v) => (Array.isArray(v) ? v.join(', ') : v === true ? 'sí' : v === false ? 'no' : v == null ? '' : String(v));
  const rows = recs.map((r) => keys.map((k) => cell(r.props.find((p) => p.key.toLowerCase() === k.toLowerCase())?.value)));
  return { keys, recs, rows, locked, cell };
}

function exportBase(base, how) {
  const { keys, recs, rows, locked } = baseTable(base);
  if (!recs.length) return showToastMessage('Esta base no tiene entradas que exportar.');
  const name = baseName(base.path);
  const withBody = recs.some((r) => r.body);
  const head = ['nombre', ...keys, ...(withBody ? ['contenido'] : [])];
  const full = recs.map((r, i) => [r.name, ...rows[i], ...(withBody ? [r.body] : [])]);
  if (how === 'csv') {
    const sep = finCsvSep();
    const numCols = new Set(baseFields(base).filter((f) => f.type === 'número').map((f) => head.indexOf(f.key)));
    const csv = `﻿${[head, ...full].map((r) => r.map((c, j) => finCsvCell(numCols.has(j) && sep === ';' ? String(c).replace('.', ',') : c, sep, numCols.has(j))).join(sep)).join('\r\n')}\r\n`;
    offerDownload(`${name}.csv`, csv, 'text/csv;charset=utf-8');
  } else if (how === 'copy') {
    const tsv = [head.slice(0, withBody ? -1 : undefined), ...full.map((r) => r.slice(0, withBody ? -1 : undefined))].map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    copyText(tsv);
    showToastMessage(`${recs.length} filas copiadas: pégalas en Excel o Google Sheets`);
  } else if (how === 'note') {
    const esc = (c) => String(c).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
    const md = [`| ${['Nombre', ...keys].join(' | ')} |`, `|${['Nombre', ...keys].map(() => ' --- ').join('|')}|`, ...recs.map((r, i) => `| [[${r.name}]] | ${rows[i].map(esc).join(' | ')} |`)].join('\n');
    createNote({ folder: '', title: `${name} (tabla ${dateKey()})`, body: `# ${name}\n\nCopia de la base «${name}» del ${dateKey()} (${recs.length} entradas).\n\n${md}\n` });
  } else if (how === 'json') {
    const data = { base: name, exportado: new Date().toISOString(), campos: baseFields(base), entradas: recs.map((r) => ({ nombre: r.name, ...Object.fromEntries(r.props.map((p) => [p.key, p.value])), ...(r.body ? { contenido: r.body } : {}) })) };
    offerDownload(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
  if (locked) showToastMessage(`${locked} entradas con contraseña no se exportaron`);
}

function exportBaseMenu(base) {
  pickFrom(`Exportar «${baseName(base.path)}»…`, [
    { label: '📊 CSV para Excel / Google Sheets', detail: 'Un archivo con una fila por entrada', action: () => exportBase(base, 'csv') },
    { label: '📋 Copiar como tabla', detail: 'Para pegar directamente en una hoja de cálculo', action: () => exportBase(base, 'copy') },
    { label: '📝 Nota con la tabla', detail: 'Una copia en Markdown dentro de tus notas', action: () => exportBase(base, 'note') },
    { label: '{ } JSON (copia completa)', detail: 'Campos, propiedades y contenido de cada nota', action: () => exportBase(base, 'json') },
  ]);
}
