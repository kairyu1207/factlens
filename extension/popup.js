/**
 * FactLens Popup — 대시보드 로직
 */

const SERVER_URL = 'http://localhost:3777';

// DOM 요소
const stateIdle = document.getElementById('state-idle');
const stateAnalyzing = document.getElementById('state-analyzing');
const stateResult = document.getElementById('state-result');
const manualText = document.getElementById('manual-text');
const manualAnalyzeBtn = document.getElementById('manual-analyze-btn');
const analyzingStep = document.getElementById('analyzing-step');
const factsContainer = document.getElementById('facts-container');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

/**
 * 초기화
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 서버 상태 확인
  checkServerStatus();

  // 이전 분석 결과 확인
  const stored = await chrome.storage.local.get(['lastReport', 'lastAnalyzedAt']);
  if (stored.lastReport) {
    showResult(stored.lastReport);
  }

  // 분석 상태 확인
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getAnalysisState' });
    if (state?.isAnalyzing) {
      showState('analyzing');
    }
  } catch {
    // Background script not available
  }
});

/**
 * 수동 분석 버튼
 */
manualAnalyzeBtn.addEventListener('click', async () => {
  const text = manualText.value.trim();
  if (!text) return;

  manualAnalyzeBtn.disabled = true;
  showState('analyzing');

  try {
    animateSteps([
      '텍스트를 분석하고 있습니다...',
      '팩트를 추출하고 있습니다...',
      '각 정보를 검증하고 있습니다...',
      '리포트를 생성하고 있습니다...'
    ]);

    const response = await fetch(`${SERVER_URL}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `서버 오류: ${response.status}`);
    }

    const report = await response.json();

    // 저장
    chrome.storage.local.set({
      lastReport: report,
      lastAnalyzedAt: new Date().toISOString()
    });

    showResult(report);

  } catch (error) {
    alert(`분석 실패: ${error.message}`);
    showState('idle');
  } finally {
    manualAnalyzeBtn.disabled = false;
  }
});

/**
 * 리셋 버튼
 */
document.getElementById('reset-btn').addEventListener('click', () => {
  chrome.storage.local.remove(['lastReport', 'lastAnalyzedAt']);
  manualText.value = '';
  showState('idle');
});

/**
 * 필터 탭
 */
document.getElementById('filter-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;

  // 활성 탭 변경
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');

  const filter = tab.dataset.filter;

  // 팩트 카드 필터링
  document.querySelectorAll('.fact-card').forEach(card => {
    if (filter === 'all' || card.dataset.status === filter) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
});

/**
 * 상태 전환
 */
function showState(state) {
  stateIdle.classList.toggle('hidden', state !== 'idle');
  stateAnalyzing.classList.toggle('hidden', state !== 'analyzing');
  stateResult.classList.toggle('hidden', state !== 'result');
}

/**
 * 분석 단계 애니메이션
 */
function animateSteps(steps) {
  let i = 0;
  const interval = setInterval(() => {
    if (i < steps.length) {
      analyzingStep.textContent = steps[i];
      i++;
    } else {
      clearInterval(interval);
    }
  }, 3000);
}

/**
 * 결과 표시
 */
function showResult(report) {
  showState('result');

  const { summary, facts, transcript, meta } = report;

  // 점수 애니메이션
  animateScore(summary.overallScore, summary.overallGrade);

  // 통계
  document.getElementById('stat-total').textContent = summary.totalFacts;
  document.getElementById('stat-verified').textContent = summary.verified;
  document.getElementById('stat-unverified').textContent = summary.unverified;
  document.getElementById('stat-refuted').textContent = summary.refuted;

  // 팩트 카드 생성
  renderFacts(facts);

  // 원본 텍스트
  document.getElementById('transcript-text').textContent = transcript || '(없음)';

  // 메타 정보
  document.getElementById('meta-time').textContent = `분석 시간: ${meta.analysisTimeSec}초`;
  document.getElementById('meta-date').textContent = new Date(meta.analyzedAt).toLocaleString('ko-KR');

  // Mock 모드 알림
  const existingNotice = document.querySelector('.mock-notice');
  if (existingNotice) existingNotice.remove();

  if (meta.mode === 'mock') {
    const notice = document.createElement('div');
    notice.className = 'mock-notice';
    notice.innerHTML = `⚠️ <strong>제한 모드</strong>: ${meta.mockNotice || 'OpenAI API 크레딧 부족으로 Wikipedia 기반 제한적 검증만 수행되었습니다.'}`;
    document.getElementById('score-card').insertAdjacentElement('afterend', notice);
  }
}

/**
 * 점수 링 애니메이션
 */
function animateScore(score, grade) {
  const arc = document.getElementById('score-arc');
  const numberEl = document.getElementById('score-number');
  const gradeEl = document.getElementById('score-grade');
  const descEl = document.getElementById('score-desc');

  // 색상 결정
  let color;
  if (score >= 60) color = '#34d399';
  else if (score >= 30) color = '#fbbf24';
  else color = '#f87171';

  arc.style.stroke = color;

  // 원호 애니메이션
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (score / 100) * circumference;

  requestAnimationFrame(() => {
    arc.style.strokeDashoffset = offset;
  });

  // 숫자 카운트업
  let current = 0;
  const duration = 1500;
  const step = score / (duration / 16);

  function countUp() {
    current += step;
    if (current >= score) {
      current = score;
      numberEl.textContent = Math.round(current);
      return;
    }
    numberEl.textContent = Math.round(current);
    requestAnimationFrame(countUp);
  }
  countUp();

  // 등급 표시
  gradeEl.textContent = `${grade.emoji} 신뢰도: ${grade.label}`;
  descEl.textContent = grade.description;
}

/**
 * 팩트 카드 렌더링
 */
function renderFacts(facts) {
  factsContainer.innerHTML = '';

  facts.forEach(fact => {
    const status = fact.verification?.status || 'UNVERIFIED';
    const confidence = fact.verification?.confidence || 0;
    const confLabel = confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'mid' : 'low';

    const card = document.createElement('div');
    card.className = `fact-card status-${status.toLowerCase()}`;
    card.dataset.status = status;

    card.innerHTML = `
      <div class="fact-header">
        <span class="fact-status-icon">${getStatusIcon(status)}</span>
        <div class="fact-content">
          <div class="fact-claim">${escapeHtml(fact.claim)}</div>
          <span class="fact-category">${getCategoryLabel(fact.category)}</span>
        </div>
        <span class="fact-confidence ${confLabel}">${Math.round(confidence * 100)}%</span>
      </div>
      <div class="fact-details">
        <p class="fact-explanation">${escapeHtml(fact.verification?.explanation || '')}</p>
        ${renderSources(fact.verification?.sources || [])}
      </div>
    `;

    card.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    factsContainer.appendChild(card);
  });
}

/**
 * 출처 렌더링
 */
function renderSources(sources) {
  if (!sources.length) return '';

  return `
    <div class="fact-sources">
      <div class="fact-sources-title">📎 출처</div>
      ${sources.map(s => `
        <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="source-item" onclick="event.stopPropagation()">
          <span class="source-icon">🔗</span>
          <div class="source-info">
            <div class="source-title">${escapeHtml(s.title || s.url)}</div>
            ${s.relevance ? `<div class="source-relevance">${escapeHtml(s.relevance)}</div>` : ''}
          </div>
          <span class="source-arrow">↗</span>
        </a>
      `).join('')}
    </div>
  `;
}

/**
 * 서버 상태 확인
 */
async function checkServerStatus() {
  statusDot.className = 'status-dot checking';
  statusText.textContent = '서버 확인 중...';

  try {
    const response = await fetch(`${SERVER_URL}/api/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      statusDot.className = 'status-dot online';
      statusText.textContent = '서버 연결됨';
    } else {
      throw new Error();
    }
  } catch {
    statusDot.className = 'status-dot offline';
    statusText.textContent = '서버 연결 실패 — localhost:3777';
  }
}

/**
 * 유틸리티
 */
function getStatusIcon(status) {
  const icons = {
    'VERIFIED': '✅', 'REFUTED': '❌', 'UNVERIFIED': '⚠️',
    'OPINION': '💭', 'ERROR': '⛔'
  };
  return icons[status] || '❓';
}

function getCategoryLabel(category) {
  const labels = {
    'existence': '존재 여부', 'character': '인물', 'plot': '줄거리',
    'event': '사건/역사', 'statistic': '통계/수치', 'science': '과학',
    'attribution': '발언/행동', 'relationship': '관계', 'opinion': '의견',
    'other': '기타'
  };
  return labels[category] || category;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Background에서 메시지 수신 (분석 완료/오류)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analysisComplete' && message.report) {
    showResult(message.report);
    sendResponse({ received: true });
  }

  if (message.action === 'analysisError') {
    showState('idle');
    alert(`분석 오류: ${message.error}`);
    sendResponse({ received: true });
  }

  return true;
});
