# 🛡️ FactLens — 디지털 리터러시 팩트체크 도우미

숏폼 영상에서 모든 정보를 자동으로 추출하고, 각 정보의 신뢰성을 검증하여 리포트를 제공하는 Chrome 확장 프로그램입니다.

## ✨ 주요 기능

- 🎬 **영상 자동 감지**: 브라우저에서 재생 중인 영상을 자동으로 감지
- 🎤 **음성 → 텍스트**: OpenAI Whisper로 영상 음성을 텍스트로 변환
- 🧠 **팩트 추출**: GPT-4o가 텍스트에서 모든 사실적 주장을 원자적으로 분리
- 🔍 **다중 소스 검증**: Wikipedia, Google 검색 등을 활용한 크로스체크
- 📊 **신뢰도 리포트**: 각 정보별 ✅확인/⚠️미확인/❌반박 결과와 출처 표시

## 🚀 시작하기

### 1. 백엔드 서버 실행

```bash
cd server
npm install
```

`.env` 파일에 API 키 설정:
```
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_google_api_key (선택사항)
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id (선택사항)
```

서버 실행:
```bash
npm start
```

### 2. Chrome 확장 프로그램 설치

1. Chrome에서 `chrome://extensions/` 접속
2. 우측 상단 **"개발자 모드"** 활성화
3. **"압축 해제된 확장 프로그램을 로드합니다"** 클릭
4. `extension/` 폴더 선택

### 3. 사용 방법

1. YouTube Shorts, TikTok 등에서 영상 재생
2. 영상 위에 나타나는 **FactLens** 버튼 클릭
3. 또는 확장 프로그램 팝업에서 직접 텍스트 입력
4. 분석 결과 확인!

## 📁 프로젝트 구조

```
factlens/
├── extension/           # Chrome 확장 프로그램
│   ├── manifest.json    # Manifest V3 설정
│   ├── content.js       # 영상 감지 + 결과 오버레이
│   ├── content.css      # 오버레이 스타일
│   ├── background.js    # Service Worker (오디오 캡처 관리)
│   ├── offscreen.*      # 오디오 녹음 처리
│   ├── popup.*          # 팝업 대시보드 UI
│   └── icons/           # 확장 프로그램 아이콘
│
├── server/              # Node.js 백엔드
│   ├── server.js        # Express 서버
│   ├── routes/
│   │   └── analyze.js   # 분석 API
│   └── services/
│       ├── transcriber.js      # Whisper 음성→텍스트
│       ├── factExtractor.js    # GPT-4o 팩트 추출
│       ├── factVerifier.js     # 다중 소스 검증
│       └── reportGenerator.js  # 리포트 생성
│
└── README.md
```

## 🔧 기술 스택

| 구성요소 | 기술 |
|:---|:---|
| 확장 프로그램 | Chrome Manifest V3, tabCapture API |
| 백엔드 | Node.js, Express |
| 음성 인식 | OpenAI Whisper API |
| AI 분석 | OpenAI GPT-4o |
| 팩트 검증 | Wikipedia API, Google Fact Check API, Google Custom Search |

## 💰 비용 안내

- **Whisper**: $0.006/분 (1분 숏폼 = 약 8원)
- **GPT-4o**: ~$0.01-0.05/분석 (팩트 수에 따라 다름)
- **Google API**: 무료 100쿼리/일 (없어도 Wikipedia로 동작)

## 📝 라이선스

MIT License
