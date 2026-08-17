// FactLens API 테스트 스크립트
const testText = '타짜라는 영화에서 고니가 고광렬을 죽인다';

async function test() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 FactLens API 테스트');
  console.log(`   입력: "${testText}"`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Health check
    const healthRes = await fetch('http://localhost:3777/api/health');
    const health = await healthRes.json();
    console.log('✅ 서버 상태:', health.status);

    // 텍스트 분석
    console.log('\n📡 분석 요청 전송...\n');
    const startTime = Date.now();

    const res = await fetch('http://localhost:3777/api/analyze/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const report = await res.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n━━━━━━━━━━ 결과 (${elapsed}초) ━━━━━━━━━━\n`);
    console.log(`📊 전체 신뢰도 점수: ${report.summary.overallScore}점`);
    console.log(`   ${report.summary.overallGrade.emoji} ${report.summary.overallGrade.label}: ${report.summary.overallGrade.description}`);
    console.log(`\n   총 팩트: ${report.summary.totalFacts}개`);
    console.log(`   ✅ 확인됨: ${report.summary.verified}`);
    console.log(`   ⚠️ 미확인: ${report.summary.unverified}`);
    console.log(`   ❌ 반박됨: ${report.summary.refuted}`);
    console.log(`   💭 의견: ${report.summary.opinions}`);

    console.log('\n─── 각 팩트 상세 ───\n');
    report.facts.forEach((fact, i) => {
      const icon = { VERIFIED: '✅', REFUTED: '❌', UNVERIFIED: '⚠️', OPINION: '💭' }[fact.verification.status] || '❓';
      console.log(`${i + 1}. ${icon} [${fact.verification.status}] ${fact.claim}`);
      console.log(`   신뢰도: ${Math.round(fact.verification.confidence * 100)}%`);
      console.log(`   설명: ${fact.verification.explanation}`);
      if (fact.verification.sources?.length > 0) {
        fact.verification.sources.forEach(s => {
          console.log(`   📎 ${s.title}: ${s.url}`);
        });
      }
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 테스트 완료!');

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

test();
