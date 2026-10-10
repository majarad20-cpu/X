'use strict';

// ---------- Ajustes: color y copia de seguridad ----------
const ACCENTS = { indigo: 'Índigo', blue: 'Azul', teal: 'Turquesa', fuchsia: 'Fucsia', orange: 'Naranja', slate: 'Grafito' };

function applySettings() {
  document.documentElement.dataset.accent = ACCENTS[state.settings.accent] ? state.settings.accent : 'indigo';
  applyLook();
  refreshSettingsInputs();
  $('#set-archive-days').value = String(archiveAfterDays());
}

// Cuándo pasan al archivo las tareas hechas (02-tareas.js): al momento, 1, 7, 30 días o nunca.
$('#set-archive-days').addEventListener('change', (e) => {
  state.settings.archiveDays = Number(e.target.value);
  archiveOldTasks();
  save();
  renderAll();
});

function renderAccents() {
  $('#accent-picker').replaceChildren(
    ...Object.entries(ACCENTS).map(([key, label]) => {
      const on = (state.settings.accent || 'indigo') === key;
      const btn = el('button', { className: `swatch${on ? ' on' : ''}`, role: 'radio', ariaChecked: String(on), title: label }, [
        el('span', { className: 'swatch-dot', ariaHidden: 'true' }),
        label,
      ]);
      btn.dataset.swatch = key;
      btn.addEventListener('click', () => {
        state.settings.accent = key;
        // Elegir un color de la lista quita el color propio.
        if (state.settings.look?.customAccent) state.settings.look = { ...state.settings.look, customAccent: '' };
        save();
        applySettings();
        renderAccents();
        renderAppearance();
      });
      return btn;
    })
  );
}

function setBackupMessage(text, isError = false) {
  const node = $('#backup-message');
  node.textContent = text;
  node.classList.toggle('error', isError);
}

async function exportBackup() {
  const data = Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]]));
  // Las imágenes de las notas viajan en la copia descargada (no en la copiada al portapapeles).
  const images = await backupFiles();
  const json = JSON.stringify({ app: 'enfoque', version: 1, exportedAt: new Date().toISOString(), data, files: images }, null, 2);
  const filename = `enfoque-copia-${dateKey()}.json`;

  // Dentro de Claude: el visor pide confirmación y guarda el archivo.
  if (window.claude?.use) {
    const downloads = await window.claude.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: json });
        setBackupMessage(`Copia guardada como ${filename}.`);
      } catch (e) {
        if (e?.code !== 'declined') setBackupMessage('No se pudo guardar el archivo aquí. Usa «Copiar» y pégalo en una nota.', true);
      }
      return;
    }
  }
  // Navegador normal: descarga directa.
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setBackupMessage(`Copia descargada como ${filename}.`);
}

async function copyBackup() {
  const json = JSON.stringify({ app: 'enfoque', version: 1, data: Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])) });
  try {
    await navigator.clipboard.writeText(json);
    setBackupMessage('Copia en el portapapeles. Pégala en una nota para guardarla.');
  } catch {
    $('#backup-text').hidden = false;
    $('#backup-text').value = json;
    $('#backup-text').select();
    setBackupMessage('Selecciona el texto de abajo y cópialo.');
  }
}

function restoreBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    setBackupMessage('Ese archivo no es una copia de Enfoque válida.', true);
    return;
  }
  const data = parsed?.data ?? parsed;
  if (!Array.isArray(data?.tasks) || !Array.isArray(data?.habits)) {
    setBackupMessage('Ese archivo no es una copia de Enfoque válida.', true);
    return;
  }
  // Las conexiones con Google (copia diaria, resumen) se quedan como están ahora.
  const google = state.settings.google;
  withUndo('Copia restaurada', () => {
    const fresh = defaults();
    for (const k of DATA_KEYS) state[k] = data[k] ?? fresh[k];
    state.settings = { ...fresh.settings, ...state.settings, ...(google ? { google } : {}) };
  });
  applySettings();
  renderAccents();
  setBackupMessage(`Restauradas ${data.tasks.length} tareas y ${data.habits.length} hábitos.`);
  restoreFiles(parsed?.files).then((n) => n && setBackupMessage(`Restauradas ${data.tasks.length} tareas, ${data.habits.length} hábitos y ${n} ${n === 1 ? 'imagen' : 'imágenes'}.`));
}

$('#open-settings').addEventListener('click', () => {
  showView('settings');
  renderAccents();
  renderAppearance();
  renderStorage();
});
$('#backup-export').addEventListener('click', exportBackup);
$('#backup-copy').addEventListener('click', copyBackup);
$('#backup-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) restoreBackup(await file.text());
  e.target.value = '';
});
$('#backup-paste').addEventListener('click', () => {
  const box = $('#restore-text');
  if (box.hidden) {
    box.hidden = false;
    box.focus();
    $('#backup-paste').textContent = 'Restaurar texto pegado';
  } else if (box.value.trim()) {
    restoreBackup(box.value.trim());
    box.value = '';
    box.hidden = true;
    $('#backup-paste').textContent = 'Pegar copia';
  }
});
