require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const analyzeRouter = require('./routes/analyze');
const preprocessRouter = require('./routes/preprocess');

const app = express();
const PORT = process.env.PORT || 3777;

// Middleware
app.use(cors({
  origin: '*', // Chrome 확장 프로그램에서의 요청 허용
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 업로드 디렉토리 생성
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve web app
app.use(express.static(path.join(__dirname, '..', 'web')));

// Routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/analyze/preprocess', preprocessRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FactLens Server',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[FactLens Error]', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || '서버 내부 오류가 발생했습니다.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`\n🛡️  FactLens Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Analyze API:  http://localhost:${PORT}/api/analyze\n`);

  // API 키 상태 확인
  if (process.env.OPENAI_API_KEY) {
    console.log('✅ OpenAI API 키 로드됨');
  } else {
    console.log('❌ OpenAI API 키 누락!');
  }

  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  GOOGLE_API_KEY가 없습니다. Wikipedia 기반 검증만 사용됩니다.');
  } else {
    console.log('✅ Google API 키 로드됨');
  }
});

module.exports = app;
