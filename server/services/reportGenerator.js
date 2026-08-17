/**
 * 팩트 검증 결과를 종합하여 리포트 생성
 * 
 * @param {Object} params
 * @param {string} params.sourceUrl - 원본 영상 URL
 * @param {string} params.transcript - 추출된 텍스트
 * @param {Array} params.facts - 검증된 팩트 배열
 * @param {number} params.analysisTime - 분석 소요 시간 (ms)
 * @returns {Object} 구조화된 리포트
 */
function generateReport({ sourceUrl, transcript, facts, analysisTime }) {
  // 카테고리별 분류
  const verified = facts.filter(f => f.verification?.status === 'VERIFIED');
  const refuted = facts.filter(f => f.verification?.status === 'REFUTED');
  const unverified = facts.filter(f => f.verification?.status === 'UNVERIFIED');
  const opinions = facts.filter(f => f.verification?.status === 'OPINION');
  const errors = facts.filter(f => f.verification?.status === 'ERROR');

  // 전체 신뢰도 점수 계산
  const scorableFacts = facts.filter(f => f.verification?.status !== 'OPINION' && f.verification?.status !== 'ERROR');
  let overallScore = 0;

  if (scorableFacts.length > 0) {
    const totalConfidence = scorableFacts.reduce((sum, f) => {
      const v = f.verification;
      if (v.status === 'VERIFIED') return sum + v.confidence;
      if (v.status === 'REFUTED') return sum + (1 - v.confidence) * -1; // 반박된 팩트는 감점
      return sum; // UNVERIFIED는 0점
    }, 0);
    overallScore = Math.max(0, Math.min(100, Math.round((totalConfidence / scorableFacts.length) * 100)));
  }

  // 신뢰도 등급 결정
  let overallGrade;
  if (overallScore >= 80) overallGrade = { label: '높음', emoji: '🟢', description: '대부분의 정보가 출처를 통해 확인되었습니다.' };
  else if (overallScore >= 60) overallGrade = { label: '보통', emoji: '🟡', description: '일부 정보가 확인되었으나, 미확인 정보도 존재합니다.' };
  else if (overallScore >= 30) overallGrade = { label: '낮음', emoji: '🟠', description: '상당수의 정보가 확인되지 않았습니다. 주의가 필요합니다.' };
  else overallGrade = { label: '매우 낮음', emoji: '🔴', description: '대부분의 정보가 확인되지 않거나 반박되었습니다. 신뢰하지 마세요.' };

  return {
    // 메타 정보
    meta: {
      sourceUrl,
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: analysisTime,
      analysisTimeSec: (analysisTime / 1000).toFixed(1)
    },

    // 요약
    summary: {
      totalFacts: facts.length,
      verified: verified.length,
      refuted: refuted.length,
      unverified: unverified.length,
      opinions: opinions.length,
      errors: errors.length,
      overallScore,
      overallGrade
    },

    // 원본 텍스트
    transcript: transcript.slice(0, 2000), // 최대 2000자

    // 각 팩트별 상세 결과
    facts: facts.map(fact => ({
      id: fact.id,
      claim: fact.claim,
      category: fact.category,
      context: fact.context,
      originalText: fact.originalText,
      isPrerequisite: fact.isPrerequisite,
      verification: fact.verification
    })),

    // 카테고리별 그룹핑 (프론트엔드 편의용)
    byStatus: {
      verified: verified.map(f => f.id),
      refuted: refuted.map(f => f.id),
      unverified: unverified.map(f => f.id),
      opinions: opinions.map(f => f.id),
      errors: errors.map(f => f.id)
    }
  };
}

module.exports = { generateReport };
