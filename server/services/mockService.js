/**
 * FactLens Mock 서비스
 * 
 * OpenAI API 크레딧이 없을 때 데모/테스트용으로 사용됩니다.
 * .env에 USE_MOCK=true를 설정하면 활성화됩니다.
 */

/**
 * Mock 팩트 추출
 */
function mockExtractFacts(text) {
  // 간단한 한국어 문장 분석 시뮬레이션
  const facts = [];
  let id = 1;

  // 영화 관련 패턴
  const moviePattern = /(.+?)(?:라는|이라는)\s*영화/;
  const movieMatch = text.match(moviePattern);
  if (movieMatch) {
    const movieName = movieMatch[1].trim();
    facts.push({
      id: id++,
      claim: `"${movieName}"라는 영화가 존재한다`,
      category: 'existence',
      context: '영화 존재 여부',
      originalText: text,
      isPrerequisite: true
    });
  }

  // 인물 패턴 — 한국어 이름 (2~4글자, '라는/이라는' 앞 단어 제외)
  const namePattern = /([가-힣]{2,4})(?:가|이|는|을|를|에게|의)\s/g;
  const names = new Set();
  let nameMatch;
  while ((nameMatch = namePattern.exec(text + ' ')) !== null) {
    const name = nameMatch[1];
    // 일반 명사/조사 패턴 제외
    const excludeWords = [
      '영화', '드라마', '에서', '라는', '이라는', '때문', '그래서',
      '여기', '거기', '우리', '그것', '이것', '저것', '모든', '어떤',
      '사람', '세상', '세계', '나라', '한국', '미국', '일본', '중국'
    ];
    // '라는/이라는' 바로 앞에 붙은 단어인지 확인
    const beforeContext = text.slice(0, nameMatch.index);
    const isPartOfPattern = text.slice(nameMatch.index).match(new RegExp(`^${name}(?:라는|이라는)`));
    if (!excludeWords.includes(name) && !isPartOfPattern) {
      names.add(name);
    }
  }

  const movieName = movieMatch ? movieMatch[1].trim() : '';
  for (const name of names) {
    facts.push({
      id: id++,
      claim: movieName ? `영화 "${movieName}"에 "${name}"라는 인물이 등장한다` : `"${name}"라는 인물/대상이 존재한다`,
      category: 'character',
      context: movieName ? `영화 인물 확인` : '인물/대상 확인',
      originalText: text,
      isPrerequisite: true
    });
  }

  // 핵심 주장 (원문 전체)
  facts.push({
    id: id++,
    claim: text.trim(),
    category: 'plot',
    context: '핵심 주장',
    originalText: text,
    isPrerequisite: false
  });

  return facts;
}

/**
 * Mock 팩트 검증
 */
async function mockVerifyFacts(facts) {
  const results = [];

  for (const fact of facts) {
    // Wikipedia에서 실제로 검색 시도
    let wikiResult = null;
    try {
      wikiResult = await searchWikiSimple(fact.claim);
    } catch {
      // Wikipedia 검색 실패 시 무시
    }

    let status, confidence, explanation, sources;

    if (wikiResult) {
      // Wikipedia에서 관련 정보를 찾은 경우
      status = 'VERIFIED';
      confidence = 0.7;
      explanation = `Wikipedia에서 관련 정보를 찾았습니다: ${wikiResult.snippet.slice(0, 150)}...`;
      sources = [{
        title: wikiResult.title,
        url: wikiResult.url,
        relevance: 'Wikipedia 문서에서 관련 정보 확인',
        credibility: {
          level: 'medium',
          description: 'Wikipedia는 전 세계 자원봉사자들이 편집하는 무료 백과사전입니다. 대부분의 주요 문서는 신뢰할 수 있지만, 누구나 편집 가능하므로 최근 편집된 항목이나 논쟁적인 주제는 오류가 있을 수 있습니다.'
        }
      }];
    } else {
      // 검색 결과 없음
      if (fact.category === 'opinion') {
        status = 'OPINION';
        confidence = 1.0;
        explanation = '이 주장은 사실 판단이 아닌 주관적 의견입니다.';
        sources = [];
      } else {
        status = 'UNVERIFIED';
        confidence = 0.3;
        explanation = '현재 이용 가능한 소스에서 이 주장을 확인할 수 없습니다. (OpenAI API 크레딧 충전 후 정밀 분석 가능)';
        sources = [];
      }
    }

    results.push({
      ...fact,
      verification: { status, confidence, explanation, sources }
    });

    // 요청 간 간격
    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

/**
 * 간단한 Wikipedia 검색
 */
async function searchWikiSimple(query) {
  try {
    // 핵심 키워드 추출 (따옴표 안의 단어)
    const quotedMatch = query.match(/"(.+?)"/);
    const searchQuery = quotedMatch ? quotedMatch[1] : query.split(/[은는이가을를]/)[0].trim();

    if (!searchQuery || searchQuery.length < 2) return null;

    // 한국어 Wikipedia 검색
    const url = `https://ko.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&srlimit=1&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.query?.search?.length) {
      // 영어 Wikipedia 시도
      const enUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&srlimit=1&origin=*`;
      const enRes = await fetch(enUrl);
      if (!enRes.ok) return null;
      const enData = await enRes.json();
      if (!enData.query?.search?.length) return null;

      const item = enData.query.search[0];
      return {
        title: item.title,
        snippet: item.snippet.replace(/<[^>]*>/g, ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
      };
    }

    const item = data.query.search[0];
    return {
      title: item.title,
      snippet: item.snippet.replace(/<[^>]*>/g, ''),
      url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
    };
  } catch {
    return null;
  }
}

module.exports = { mockExtractFacts, mockVerifyFacts };
