'use strict';

// ---------- Inicio ----------
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
