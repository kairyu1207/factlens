const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('../services/transcriber');
const { preprocessText } = require('../services/textPreprocessor');
const { extractFacts } = require('../services/factExtractor');
const { verifyFacts } = require('../services/factVerifier');
const { generateReport } = require('../services/reportGenerator');
const { getYouTubeTranscript } = require('../services/youtubeTranscript');
const { googleVisionRecognize, getQuota } = require('../services/googleVision');

const router = express.Router();

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `audio_${Date.now()}${path.extname(file.originalname) || '.webm'}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('오디오 파일만 업로드 가능합니다.'));
    }
  }
});

/**
 * POST /api/analyze/archive
 * Saves the session data to an archive folder
 */
router.post('/archive', (req, res) => {
  const { title, rawText, facts } = req.body;
  if (!title && !rawText) return res.status(400).json({ error: 'Data required' });
  
  const safeTitle = (title || 'Untitled').replace(/[^a-z0-9가-힣]/gi, '_').substring(0, 50);
  const timestamp = Date.now();
  const archiveDir = path.join(__dirname, '..', 'archives', `${timestamp}_${safeTitle}`);
  
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    
    fs.writeFileSync(path.join(archiveDir, 'tier1_raw.json'), JSON.stringify({ title, rawText }, null, 2));
    
    if (facts && Array.isArray(facts)) {
      const tier2 = facts.map(f => ({ id: f.id, claim: f.claim, category: f.category, context: f.context }));
      fs.writeFileSync(path.join(archiveDir, 'tier2_facts.json'), JSON.stringify(tier2, null, 2));
      
      const tier3 = facts.map(f => ({ id: f.id, claim: f.claim, verification: f.verification }));
      fs.writeFileSync(path.join(archiveDir, 'tier3_verification.json'), JSON.stringify(tier3, null, 2));
    }
    
    res.json({ success: true, archivePath: archiveDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analyze/audio-chunk
 * Receives audio chunk from frontend MediaRecorder, runs Whisper
 */
router.post('/audio-chunk', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  try {
    const text = await transcribeAudio(req.file.path);
    // Delete temp file after transcription
    fs.unlink(req.file.path, () => {});
    res.json({ text });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analyze/ocr
 * 
 * Accepts a base64-encoded frame, runs OCR.space API, returns text
 */
router.post('/ocr', async (req, res) => {
  console.log('[API] Received /api/analyze/ocr request');
  const { image } = req.body;
  if (!image) {
    console.log('[API] /ocr rejected: no image provided');
    return res.status(400).json({ error: 'base64 image required' });
  }

  try {
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    console.log('[API] /ocr calling googleVisionRecognize...');
    const result = await googleVisionRecognize(base64);
    console.log('[API] /ocr success:', result.text ? 'Extracted text' : 'No text found');
    res.json(result);
  } catch (error) {
    console.error('[API] /ocr failed:', error.message);
    res.status(500).json({ error: error.message, text: '', lines: [] });
  }
});

/**
 * POST /api/analyze/verify
 * 
 * Accepts a masterContext object, verifies them using holistic context, and returns the report.
 */
router.post('/verify', async (req, res) => {
  const { infoLogs: masterContext } = req.body;
  
  if (!masterContext || !masterContext.masterEvent || !masterContext.facts) {
    return res.status(400).json({ error: 'Valid Master Context and facts required' });
  }

  // Initialize SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const emitEvent = (eventData) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  console.log(`\n[Step 4] Verification 시작: ${masterContext.masterEvent} (${masterContext.facts.length} facts)...`);
  
  try {
    const verifyResult = await verifyFacts(masterContext.masterEvent, masterContext.facts, emitEvent);
    const verifiedFacts = verifyResult.results || [];
    const searchLogs = verifyResult.searchLogs || [];
    
    let verifiedCount = 0;
    let unverifiedCount = 0;
    
    verifiedFacts.forEach(f => {
      if (f.verification?.status === 'VERIFIED') verifiedCount++;
      else unverifiedCount++;
    });

    console.log(`[Step 4] Verification 완료 (Verified: ${verifiedCount}, Unverified/Other: ${unverifiedCount})`);

    emitEvent({
      type: 'complete',
      data: {
        success: true,
        totalCount: verifiedFacts.length,
        verifiedCount,
        unverifiedCount,
        results: verifiedFacts,
        searchLogs
      }
    });
    res.end();
  } catch (error) {
    console.error('Verification error:', error);
    emitEvent({ type: 'error', error: 'Fact verification failed', details: error.message });
    res.end();
  }
});

/**
 * POST /api/analyze/youtube
 * 
 * YouTube URL -> caption extraction -> fact check pipeline
 */
router.post('/youtube', async (req, res) => {
  const startTime = Date.now();
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  console.log(`\n[YouTube] Analyzing: ${url}`);

  const progress = {
    steps: {
      transcript: { status: 'pending' },
      extract: { status: 'pending' },
      verify: { status: 'pending' },
      report: { status: 'pending' }
    }
  };

  try {
    // Step 1: Fetch YouTube captions
    progress.steps.transcript = { status: 'running' };
    const transcript = await getYouTubeTranscript(url);
    progress.steps.transcript = { status: 'done', detail: `${transcript.charCount} chars, ${transcript.segmentCount} segments` };
    console.log(`[YouTube] Transcript: ${transcript.charCount} chars`);

    // Step 2: Extract facts
    progress.steps.extract = { status: 'running' };
    let facts;
    try {
      facts = await extractFacts(transcript.text);
      progress.steps.extract = { status: 'done', detail: `${facts.length} facts` };
    } catch (e) {
      progress.steps.extract = { status: 'fail', detail: e.message };
      return res.json({
        partial: true, failedAt: 'extract', error: e.message,
        progress, transcript: transcript.text,
        facts: [], summary: { totalFacts: 0, verified: 0, unverified: 0, refuted: 0, opinions: 0 },
        meta: { analysisTimeSec: ((Date.now() - startTime) / 1000).toFixed(1) }
      });
    }

    // Step 3: Verify facts
    progress.steps.verify = { status: 'running' };
    let verifiedFacts;
    let searchLogs = [];
    try {
      const verifyResult = await verifyFacts(url, facts);
      verifiedFacts = verifyResult.results || [];
      searchLogs = verifyResult.searchLogs || [];
      progress.steps.verify = { status: 'done', detail: `${verifiedFacts.length} verified` };
    } catch (e) {
      progress.steps.verify = { status: 'fail', detail: e.message };
      verifiedFacts = facts.map(f => ({ ...f, verification: { status: 'UNVERIFIED', confidence: 0, explanation: 'Verification failed', sources: [] } }));
    }

    // Step 4: Generate report
    const report = generateReport(verifiedFacts, transcript.text);
    progress.steps.report = { status: 'done' };
    report.progress = progress;
    report.meta.analysisTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
    report.meta.source = 'youtube-captions';
    report.meta.url = url;

    console.log(`[YouTube] Done in ${report.meta.analysisTimeSec}s`);
    res.json(report);

  } catch (error) {
    progress.steps.transcript = { status: 'fail', detail: error.message };
    res.json({
      partial: true, failedAt: 'transcript', error: error.message,
      progress, transcript: '', facts: [],
      summary: { totalFacts: 0, verified: 0, unverified: 0, refuted: 0, opinions: 0 },
      meta: { analysisTimeSec: ((Date.now() - startTime) / 1000).toFixed(1) }
    });
  }
});

/**
 * POST /api/analyze
 * 
 * Audio + screen text analysis
 */
router.post('/', upload.single('audio'), async (req, res, next) => {
  const startTime = Date.now();
  let audioFilePath = req.file?.path;

  // 진행 상태 추적
  const progress = {
    steps: {
      audio: { status: 'pending' },
      extract: { status: 'pending' },
      verify: { status: 'pending' },
      report: { status: 'pending' }
    },
    transcript: '',
    facts: [],
    verifiedFacts: [],
    failedAt: null,
    error: null
  };

  try {
    const { screenText, sourceUrl } = req.body;

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('FactLens 분석 시작');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ── Step 1: 음성 → 텍스트 (Whisper) ──
    let transcript = '';
    if (audioFilePath) {
      console.log('\n🎤 Step 1: 음성 → 텍스트 (Whisper)');
      progress.steps.audio.status = 'running';
      try {
        transcript = await transcribeAudio(audioFilePath);
        progress.steps.audio.status = 'done';
        progress.steps.audio.detail = `${transcript.length}자 변환됨`;
        console.log(`   ${transcript.length}자 변환 완료`);
      } catch (err) {
        progress.steps.audio.status = 'fail';
        progress.steps.audio.detail = err.message;
        progress.failedAt = 'audio';
        progress.error = err.message;
        console.error(`   Whisper 실패: ${err.message}`);
        // 음성 실패해도 화면 텍스트로 계속 시도
      }
    } else {
      progress.steps.audio.status = 'skip';
      progress.steps.audio.detail = '오디오 없음';
    }

    const combinedText = [transcript, screenText].filter(Boolean).join('\n\n---\n\n');
    progress.transcript = combinedText;

    if (!combinedText.trim()) {
      return res.status(400).json({
        error: true,
        message: '추출된 텍스트가 없습니다.',
        progress
      });
    }

    // ── Step 2: 팩트 추출 (GPT-4o) ──
    console.log('\n🧠 Step 2: 텍스트 → 팩트 추출 (GPT-4o)');
    progress.steps.extract.status = 'running';
    try {
      progress.facts = await extractFacts(combinedText);
      progress.steps.extract.status = 'done';
      progress.steps.extract.detail = `${progress.facts.length}개 추출`;
      console.log(`   ${progress.facts.length}개 팩트 추출`);
      progress.facts.forEach((f, i) => console.log(`   ${i + 1}. ${f.claim}`));
    } catch (err) {
      progress.steps.extract.status = 'fail';
      progress.steps.extract.detail = err.message;
      progress.failedAt = 'extract';
      progress.error = err.message;
      console.error(`   팩트 추출 실패: ${err.message}`);

      // 실패 → 부분 결과 반환
      return res.json({
        partial: true,
        failedAt: 'extract',
        error: err.message,
        progress,
        transcript: combinedText,
        facts: [],
        summary: { totalFacts: 0, verified: 0, unverified: 0, refuted: 0, opinions: 0 },
        meta: { analysisTimeSec: ((Date.now() - startTime) / 1000).toFixed(1), analyzedAt: new Date().toISOString() }
      });
    }

    // ── Step 3: 팩트 검증 ──
    console.log('\nStep 3: 팩트 검증');
    progress.steps.verify.status = 'running';
    try {
      progress.verifiedFacts = await verifyFacts(progress.facts);
      progress.steps.verify.status = 'done';
      progress.steps.verify.detail = '검증 완료';
      console.log('   검증 완료');
    } catch (err) {
      progress.steps.verify.status = 'fail';
      progress.steps.verify.detail = err.message;
      progress.failedAt = 'verify';
      progress.error = err.message;
      console.error(`   검증 실패: ${err.message}`);

      // 팩트 추출까지는 성공 → 미검증 팩트라도 반환
      const unverifiedFacts = progress.facts.map(f => ({
        ...f,
        verification: { status: 'UNVERIFIED', confidence: 0, explanation: '검증 단계에서 API 오류 발생', sources: [] }
      }));
      const report = generateReport({
        sourceUrl: sourceUrl || 'unknown',
        transcript: combinedText,
        facts: unverifiedFacts,
        analysisTime: Date.now() - startTime
      });
      report.partial = true;
      report.failedAt = 'verify';
      report.error = err.message;
      report.progress = progress;

      return res.json(report);
    }

    // ── Step 4: 리포트 생성 ──
    progress.steps.report.status = 'done';
    const report = generateReport({
      sourceUrl: sourceUrl || 'unknown',
      transcript: combinedText,
      facts: progress.verifiedFacts,
      analysisTime: Date.now() - startTime
    });
    report.progress = progress;

    console.log(`\n분석 완료 (${((Date.now() - startTime) / 1000).toFixed(1)}초)`);
    console.log(`   총: ${report.summary.totalFacts} | Verified: ${report.summary.verified} | Unverified: ${report.summary.unverified} | Refuted: ${report.summary.refuted}\n`);

    res.json(report);

  } catch (error) {
    next(error);
  } finally {
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
  }
});

/**
 * POST /api/analyze/text
 * 
 * 텍스트만으로 분석 — 부분 결과 반환 지원
 */
router.post('/text', async (req, res, next) => {
  const startTime = Date.now();

  const progress = {
    steps: {
      extract: { status: 'pending' },
      verify: { status: 'pending' },
      report: { status: 'pending' }
    },
    failedAt: null,
    error: null
  };

  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: true, message: '분석할 텍스트가 필요합니다.' });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 텍스트 분석 시작');
    console.log(`   입력: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Step 1: 팩트 추출
    console.log('\n🧠 Step 1: 팩트 추출 (GPT-4o)');
    progress.steps.extract.status = 'running';
    let facts;
    try {
      facts = await extractFacts(text);
      progress.steps.extract.status = 'done';
      progress.steps.extract.detail = `${facts.length}개 추출`;
      console.log(`   ✅ ${facts.length}개 추출`);
    } catch (err) {
      progress.steps.extract.status = 'fail';
      progress.steps.extract.detail = err.message;
      progress.failedAt = 'extract';
      progress.error = err.message;
      console.error(`   ❌ 실패: ${err.message}`);

      return res.json({
        partial: true, failedAt: 'extract', error: err.message,
        progress, transcript: text, facts: [],
        summary: { totalFacts: 0, verified: 0, unverified: 0, refuted: 0, opinions: 0 },
        meta: { analysisTimeSec: ((Date.now() - startTime) / 1000).toFixed(1), analyzedAt: new Date().toISOString() }
      });
    }

    // Step 2: 팩트 검증
    console.log('\n🔎 Step 2/2: 팩트 검증');
    progress.steps.verify.status = 'running';
    let verifiedFacts;
    let searchLogs = [];
    try {
      const verifyResult = await verifyFacts("Generic Text Input", facts);
      verifiedFacts = verifyResult.results || [];
      searchLogs = verifyResult.searchLogs || [];
      progress.steps.verify.status = 'done';
      console.log('   ✅ 검증 완료');
    } catch (err) {
      progress.steps.verify.status = 'fail';
      progress.steps.verify.detail = err.message;
      progress.failedAt = 'verify';
      progress.error = err.message;
      console.error(`   ❌ 검증 실패: ${err.message}`);

      // 미검증 팩트라도 반환
      verifiedFacts = facts.map(f => ({
        ...f,
        verification: { status: 'UNVERIFIED', confidence: 0, explanation: '검증 API 오류: ' + err.message, sources: [] }
      }));
    }

    // 리포트 생성
    progress.steps.report.status = 'done';
    const report = generateReport({
      sourceUrl: 'text-input',
      transcript: text,
      facts: verifiedFacts,
      analysisTime: Date.now() - startTime
    });

    if (progress.failedAt) {
      report.partial = true;
      report.failedAt = progress.failedAt;
      report.error = progress.error;
    }
    report.progress = progress;

    console.log(`\n✅ 분석 완료 (${((Date.now() - startTime) / 1000).toFixed(1)}초)${progress.failedAt ? ` [${progress.failedAt}에서 실패]` : ''}\n`);

    res.json(report);

  } catch (error) {
    next(error);
  }
});

module.exports = router;
