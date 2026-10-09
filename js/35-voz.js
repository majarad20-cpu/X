'use strict';

// ---------- Notas de voz ----------
// Graba audio con el micrófono y lo guarda en la nota (se reproduce ahí mismo). Si el navegador
// sabe reconocer la voz, escribe además la transcripción mientras hablas. Dentro de Claude el
// navegador puede no dar acceso al micrófono: entonces se explica y no se graba nada.
const VOICE_MAX_MS = 5 * 60 * 1000;
const voice = { rec: null, stream: null, chunks: [], started: 0, timer: null, speech: null, final: '', interim: '', noteId: null, caret: null, cancelled: false, meter: null, seq: 0 };
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function pickMime() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

async function openVoice() {
  const note = activeNote();
  if (!note) return showToastMessage('Abre una nota para grabar una nota de voz.');
  if (note.enc) return showToastMessage('Las notas con contraseña no admiten grabaciones.');
  flushNoteSave();
  if (voice.stream) stopTracks();
  const seq = ++voice.seq;
  const ta = $('#note-editor');
  voice.noteId = note.id;
  voice.caret = !ta.hidden && ta.dataset.note === note.id ? (document.activeElement === ta ? ta.selectionStart : Number(ta.dataset.caret ?? ta.value.length)) : null;
  voice.final = '';
  voice.interim = '';
  voice.cancelled = false;
  $('#voice').hidden = false;
  $('#voice-error').textContent = '';
  $('#voice-transcript').textContent = '';
  $('#voice-transcript-wrap').hidden = !SpeechRec;
  $('#voice-time').textContent = '0:00';
  $('#voice-stop').disabled = true;
  if (!canRecord()) return voiceError('Este navegador no permite grabar audio.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Cancelado o reabierto mientras se pedía permiso: no se graba.
    if (seq !== voice.seq || voice.cancelled || $('#voice').hidden) return stream.getTracks().forEach((t) => t.stop());
    voice.stream = stream;
  } catch (e) {
    if (seq !== voice.seq || voice.cancelled || $('#voice').hidden) return;
    return voiceError(
      e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
        ? 'No hay permiso para usar el micrófono. Dentro de Claude el navegador puede no permitirlo; en la app de escritorio funcionará.'
        : 'No se encontró ningún micrófono.'
    );
  }
  startRecording();
}

function voiceError(text) {
  $('#voice-error').textContent = text;
  $('#voice-status').textContent = 'Sin grabar';
  $('#voice').classList.remove('recording');
  stopTracks();
}

function startRecording() {
  const mimeType = pickMime();
  voice.chunks = [];
  voice.rec = new MediaRecorder(voice.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24000 });
  voice.rec.ondataavailable = (e) => e.data.size && voice.chunks.push(e.data);
  voice.rec.onstop = finishRecording;
  voice.rec.start(1000);
  voice.started = Date.now();
  $('#voice').classList.add('recording');
  $('#voice-status').textContent = 'Grabando…';
  $('#voice-stop').disabled = false;
  voice.timer = setInterval(() => {
    const ms = Date.now() - voice.started;
    $('#voice-time').textContent = mmss(ms);
    if (ms >= VOICE_MAX_MS) stopVoice();
  }, 250);
  startMeter();
  startSpeech();
}

// Nivel del micrófono, para ver que está captando sonido.
function startMeter() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(voice.stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const bar = $('#voice-level');
    const tick = () => {
      if (!voice.rec || voice.rec.state !== 'recording') return ctx.close();
      an.getByteTimeDomainData(buf);
      const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v - 128)), 0) / 128;
      bar.style.transform = `scaleX(${Math.min(1, peak * 2.2).toFixed(2)})`;
      requestAnimationFrame(tick);
    };
    tick();
  } catch {
    // Sin medidor: la grabación sigue igual.
  }
}

function startSpeech() {
  if (!SpeechRec) return;
  try {
    const s = new SpeechRec();
    s.lang = navigator.language?.startsWith('es') ? navigator.language : 'es-ES';
    s.continuous = true;
    s.interimResults = true;
    s.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) voice.final += `${r[0].transcript.trim()} `;
        else interim += r[0].transcript;
      }
      voice.interim = interim;
      $('#voice-transcript').textContent = `${voice.final}${interim}`.trim() || '…';
    };
    // Algunos navegadores cortan el reconocimiento tras un silencio: se reanuda mientras se graba.
    s.onend = () => {
      if (voice.rec?.state === 'recording') {
        try {
          s.start();
        } catch {
          // Ya estaba en marcha.
        }
      }
    };
    s.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') $('#voice-transcript-wrap').hidden = true;
    };
    s.start();
    voice.speech = s;
  } catch {
    $('#voice-transcript-wrap').hidden = true;
  }
}

function stopTracks() {
  clearInterval(voice.timer);
  voice.stream?.getTracks().forEach((t) => t.stop());
  voice.stream = null;
  try {
    voice.speech?.stop();
  } catch {
    // Ya parado.
  }
  voice.speech = null;
}

function stopVoice() {
  if (voice.rec?.state === 'recording') voice.rec.stop();
  stopTracks();
  $('#voice').classList.remove('recording');
  $('#voice-status').textContent = 'Guardando…';
  $('#voice-stop').disabled = true;
}

function cancelVoice() {
  voice.cancelled = true;
  stopVoice();
  $('#voice').hidden = true;
}

async function finishRecording() {
  const duration = Date.now() - voice.started;
  const rec = voice.rec;
  voice.rec = null;
  if (voice.cancelled) return;
  const blob = new Blob(voice.chunks, { type: rec.mimeType || voice.chunks[0]?.type || 'audio/webm' });
  const note = noteById(voice.noteId);
  $('#voice').hidden = true;
  if (!note || !blob.size) return showToastMessage('No se grabó nada.');
  const data = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
  const file = { id: uid(), name: 'Nota de voz', type: blob.type, data, duration, createdAt: Date.now() };
  if (!(await putFile(file))) return showToastMessage('No se pudo guardar la grabación en este formato.');
  const transcript = `${voice.final}${voice.interim}`.trim();
  const label = `🎤 Nota de voz · ${mmss(duration)} · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  const block = [`![${label}](audio:${file.id})`, ...(transcript ? ['', '> [!quote] Transcripción', `> ${transcript}`] : []), ''].join('\n');
  await snapshotNote(note, { force: true });
  const at = voice.caret ?? note.body.length;
  const before = note.body.slice(0, at);
  note.body = `${before}${before && !before.endsWith('\n') ? '\n' : ''}${block}\n${note.body.slice(at)}`;
  note.updatedAt = Date.now();
  save();
  if (isEditing(note.id)) {
    $('#note-editor').value = note.body;
    autosize($('#note-editor'));
  }
  renderAll();
  scheduleFilesSync();
  showToastMessage(data.length > FILE_MAX_CHARS ? 'Nota de voz guardada. Es larga: se queda en este dispositivo y no se sincroniza.' : 'Nota de voz guardada');
}

$('#voice-stop').addEventListener('click', stopVoice);
$('#voice-cancel').addEventListener('click', cancelVoice);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#voice').hidden) cancelVoice();
});

NOTE_MENU_EXTRA.push((note) => (note.enc ? null : { label: '🎤 Nota de voz…', action: openVoice }));
SLASH_ITEMS.splice(SLASH_ITEMS.findIndex((it) => it.label === 'Imagen…'), 0, {
  when: () => !activeNote()?.enc,
  icon: '🎤',
  label: 'Nota de voz…',
  detail: SpeechRec ? 'Graba audio y escribe la transcripción' : 'Graba audio en la nota',
  keys: 'voz audio grabar grabacion dictar dictado microfono',
  run: () => openVoice(),
});
