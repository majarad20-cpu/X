'use strict';

// ---------- Inicio ----------
// Primero se lee la copia completa de IndexedDB (si es más reciente que la de localStorage).
loadFromDB().then(boot, boot);

function boot() {
  backfillLog();
  archiveOldTasks();
  welcomeNote();
  applyPanels();
  paintIcons();
  applySettings();
  attachPreview($('#task-title'), $('#task-preview'));
  attachPreview($('#today-title'), $('#today-preview'));
  attachPreview($('#pd-task-title'), $('#pd-task-preview'));
  renderComposer();
  updateStorageWarning();
  renderAIControls();
  setSyncStatus('local');
  renderAll();
  startSync();
  startAI();
  startCalendar();
  document.documentElement.dataset.ready = '1';
}
