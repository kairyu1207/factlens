/**
 * FactLens Web App — Real-time Screen Fact Checker
 * 
 * Flow:
 * 1. User clicks "Start Capture" → getDisplayMedia() for screen + audio
 * 2. Every 3s, grab a frame from the video → Tesseract OCR → extract text
 * 3. When new text is detected, accumulate it
 * 4. After enough text or 30s, send to server for fact extraction + verification
 * 5. Display results in sidebar
 */

const SERVER_URL = 'http://localhost:3777';
const OCR_INTERVAL_MS = 3000;      // OCR every 3 seconds
const ANALYSIS_COOLDOWN_MS = 30000; // Min 30s between server calls
const MIN_NEW_CHARS = 50;          // Min new chars before sending to server

// ── State ──
let mediaStream = null;
let ocrInterval = null;
let timerInterval = null;
let captureStartTime = null;
let lastAnalysisTime = 0;
let allExtractedText = '';
let lastOcrText = '';
let pendingText = '';
let isAnalyzing = false;
let tesseractWorker = null;

// ── DOM ──
const $ = id => document.getElementById(id);

const btnStart = $('btnStart');
const btnStop = $('btnStop');
const startPanel = $('startPanel');
const capturePanel = $('capturePanel');
const screenVideo = $('screenVideo');
const ocrCanvas = $('ocrCanvas');
const captureTimer = $('captureTimer');
const statusDot = $('statusDot');
const statusText = $('statusText');
const debugToggle = $('debugToggle');
const debugBody = $('debugBody');
const textFeedBody = $('textFeedBody');
const textCount = $('textCount');
const resultsPanel = $('resultsPanel');
const resultsBody = $('resultsBody');
const scoreBadge = $('scoreBadge');

// ── Init ──
btnStart.addEventListener('click', startCapture);
btnStop.addEventListener('click', stopCapture);
debugToggle.addEventListener('click', () => {
  debugBody.classList.toggle('collapsed');
  debugToggle.textContent = debugBody.classList.contains('collapsed') ? '+' : '-';
});

// ── Screen Capture ──
async function startCapture() {
  try {
    updateStep('capture', 'running', 'Requesting...');
    setStatus('active', 'Requesting permission...');

    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: true  // capture tab audio
    });

    screenVideo.srcObject = mediaStream;
    startPanel.style.display = 'none';
    capturePanel.style.display = 'flex';

    updateStep('capture', 'done', 'Streaming');
    setStatus('active', 'Monitoring');

    // Track when capture stops (user clicks browser stop)
    mediaStream.getVideoTracks()[0].onended = () => stopCapture();

    // Start timer
    captureStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);

    // Initialize Tesseract
    await initOCR();

    // Start periodic OCR
    ocrInterval = setInterval(runOCR, OCR_INTERVAL_MS);
    // Run first OCR after 1s
    setTimeout(runOCR, 1000);

    // Start audio capture if available
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length > 0) {
      updateStep('audio', 'done', 'Audio available');
    } else {
      updateStep('audio', 'skip', 'No audio track');
    }

  } catch (err) {
    console.error('Capture error:', err);
    updateStep('capture', 'fail', err.message);
    setStatus('error', 'Capture failed');
    
    // Reset UI
    startPanel.style.display = '';
    capturePanel.style.display = 'none';
  }
}

function stopCapture() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (ocrInterval) { clearInterval(ocrInterval); ocrInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  screenVideo.srcObject = null;
  startPanel.style.display = '';
  capturePanel.style.display = 'none';

  setStatus('', 'Stopped');
  updateStep('capture', 'pending', '');
  updateStep('ocr', 'pending', '');
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - captureStartTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  captureTimer.textContent = `${m}:${s}`;
}

// ── OCR ──
async function initOCR() {
  updateStep('ocr', 'running', 'Loading Tesseract...');
  
  try {
    tesseractWorker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          updateStep('ocr', 'running', `${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    updateStep('ocr', 'done', 'Ready');
  } catch (err) {
    console.error('Tesseract init error:', err);
    updateStep('ocr', 'fail', err.message);
  }
}

async function runOCR() {
  if (!mediaStream || !tesseractWorker) return;

  const videoTrack = mediaStream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState !== 'live') return;

  try {
    // Grab frame from video
    const canvas = ocrCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = screenVideo.videoWidth;
    canvas.height = screenVideo.videoHeight;
    
    if (canvas.width === 0 || canvas.height === 0) return;
    
    ctx.drawImage(screenVideo, 0, 0);

    updateStep('ocr', 'running', 'Scanning...');

    // Run OCR
    const result = await tesseractWorker.recognize(canvas);
    const newText = result.data.text.trim();

    if (!newText) {
      updateStep('ocr', 'done', 'No text found');
      return;
    }

    // Check if text changed
    const similarity = textSimilarity(lastOcrText, newText);
    
    if (similarity < 0.85) {
      // New text detected!
      lastOcrText = newText;
      
      // Find truly new content
      const newParts = findNewContent(allExtractedText, newText);
      if (newParts.length > 0) {
        pendingText += '\n' + newParts;
        allExtractedText += '\n' + newParts;
        addTextEntry(newParts, true);
      } else {
        addTextEntry(newText.slice(0, 120), false);
      }

      textCount.textContent = `${allExtractedText.length} chars`;
      updateStep('ocr', 'done', `${newText.length} chars`);

      // Check if we should send for analysis
      checkAndAnalyze();
    } else {
      updateStep('ocr', 'done', 'No change');
    }

  } catch (err) {
    console.error('OCR error:', err);
    updateStep('ocr', 'fail', err.message);
  }
}

// ── Text Comparison ──
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = [...setA].filter(w => setB.has(w));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

function findNewContent(existing, fresh) {
  const existingWords = new Set(existing.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const freshWords = fresh.split(/\s+/);
  const newWords = freshWords.filter(w => !existingWords.has(w.toLowerCase()) && w.length > 2);
  return newWords.length > 3 ? newWords.join(' ') : '';
}

// ── Analysis Trigger ──
function checkAndAnalyze() {
  if (isAnalyzing) return;
  
  const now = Date.now();
  const timeSinceLast = now - lastAnalysisTime;
  const hasEnoughText = pendingText.trim().length >= MIN_NEW_CHARS;
  const cooldownPassed = timeSinceLast >= ANALYSIS_COOLDOWN_MS;

  if (hasEnoughText && cooldownPassed) {
    sendForAnalysis();
  }
}

async function sendForAnalysis() {
  if (isAnalyzing || !pendingText.trim()) return;
  
  isAnalyzing = true;
  lastAnalysisTime = Date.now();
  const textToAnalyze = allExtractedText;
  pendingText = '';

  updateStep('extract', 'running', 'Sending to server...');
  setStatus('active', 'Analyzing...');

  try {
    const res = await fetch(`${SERVER_URL}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textToAnalyze })
    });

    const report = await res.json();
    handleReport(report);

  } catch (err) {
    console.error('Analysis error:', err);
    updateStep('extract', 'fail', err.message);
    setStatus('error', 'Server error');
  } finally {
    isAnalyzing = false;
  }
}

// ── Handle Report ──
function handleReport(report) {
  if (report.partial) {
    updateStep(report.failedAt, 'fail', report.error?.slice(0, 60));
  }

  // Update steps from progress
  if (report.progress?.steps) {
    for (const [key, val] of Object.entries(report.progress.steps)) {
      updateStep(key, val.status, val.detail || '');
    }
  }

  // Show facts
  if (report.facts && report.facts.length > 0) {
    renderResults(report);
  }

  setStatus('active', 'Monitoring');
}

// ── Render Results ──
function renderResults(report) {
  resultsPanel.style.display = '';

  const { facts, summary } = report;
  const withSource = facts.filter(f => f.verification?.sources?.length > 0);
  const ratio = facts.length > 0 ? withSource.length / facts.length : 0;

  // Score badge
  if (ratio >= 0.7) {
    scoreBadge.className = 'score-badge good';
    scoreBadge.textContent = `${Math.round(ratio * 100)}% verified`;
  } else if (ratio >= 0.4) {
    scoreBadge.className = 'score-badge warn';
    scoreBadge.textContent = `${Math.round(ratio * 100)}% verified`;
  } else {
    scoreBadge.className = 'score-badge bad';
    scoreBadge.textContent = `${Math.round(ratio * 100)}% verified`;
  }

  resultsBody.innerHTML = facts.map((f, i) => {
    const v = f.verification || {};
    const status = (v.status || 'UNVERIFIED').toLowerCase();
    const sources = v.sources || [];
    
    return `
      <div class="fact-item fact-${status}" onclick="this.classList.toggle('expanded')">
        <div class="fact-header">
          <span class="fact-num">${i + 1}</span>
          <span class="fact-claim">${esc(f.claim)}</span>
          <span class="fact-arrow">▼</span>
        </div>
        <div class="fact-detail">
          <div class="fact-explanation"><strong>Verdict:</strong> ${esc(v.explanation || 'No info')}</div>
          ${sources.length > 0 ? sources.map(s => `
            <div class="source-card">
              <a href="${esc(s.url)}" target="_blank" class="source-link" onclick="event.stopPropagation()">${esc(s.title || s.url)}</a>
              ${s.credibility ? `
                <div>
                  <span class="cred-badge cred-${s.credibility.level || 'unknown'}">${s.credibility.level === 'high' ? 'High reliability' : s.credibility.level === 'medium' ? 'Medium' : s.credibility.level === 'low' ? 'Low' : 'Unknown'}</span>
                  <p class="cred-desc">${esc(s.credibility.description || '')}</p>
                </div>
              ` : ''}
              ${s.relevance ? `<p class="source-relevance">${esc(s.relevance)}</p>` : ''}
            </div>
          `).join('') : '<div style="color:var(--text-muted);font-size:12px;">No sources found</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// ── UI Helpers ──
function updateStep(stepId, status, detail) {
  const el = $(`step-${stepId}`);
  if (!el) return;

  el.dataset.status = status;
  const icon = el.querySelector('.step-icon');
  const statusEl = el.querySelector('.step-status');

  switch (status) {
    case 'running':
      icon.innerHTML = '<div class="spinner"></div>';
      statusEl.textContent = detail || 'Processing...';
      break;
    case 'done':
      icon.textContent = 'OK';
      statusEl.textContent = detail || 'Done';
      break;
    case 'fail':
      icon.textContent = '!';
      statusEl.textContent = detail || 'Failed';
      break;
    case 'skip':
      icon.textContent = '-';
      statusEl.textContent = detail || 'Skipped';
      break;
    default:
      icon.textContent = '-';
      statusEl.textContent = '';
  }
}

function setStatus(type, text) {
  const dot = statusDot.querySelector('.dot');
  dot.className = 'dot' + (type ? ` ${type}` : '');
  statusText.textContent = text;
}

function addTextEntry(text, isNew) {
  // Remove placeholder
  const placeholder = textFeedBody.querySelector('.text-placeholder');
  if (placeholder) placeholder.remove();

  const now = new Date();
  const time = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const entry = document.createElement('div');
  entry.className = 'text-entry';
  entry.innerHTML = `
    <span class="text-time">${time}</span>
    ${isNew ? '<span class="text-new">[NEW]</span> ' : ''}
    <span class="text-content">${esc(text.slice(0, 200))}</span>
  `;
  textFeedBody.appendChild(entry);
  textFeedBody.scrollTop = textFeedBody.scrollHeight;

  // Keep last 50 entries
  while (textFeedBody.children.length > 50) {
    textFeedBody.removeChild(textFeedBody.firstChild);
  }
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t || '';
  return d.innerHTML;
}

// ── Manual test button (for debugging without API) ──
// Press Ctrl+Shift+D to force-send current text
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    if (allExtractedText.trim()) {
      console.log('[FactLens] Force-sending text for analysis...');
      pendingText = allExtractedText;
      sendForAnalysis();
    } else {
      console.log('[FactLens] No text extracted yet.');
    }
  }
});

console.log('[FactLens] Web app loaded. Click "Start Capture" to begin.');
