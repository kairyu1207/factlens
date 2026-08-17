const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { generateSearchQueries } = require('./searchQueryGenerator');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function verifyFacts(masterEvent, facts, emitEvent = () => {}) {
  const sources = [];
  let searchResultsContext = '';
  let searchLogs = [];

  const logAndEmit = (msg, type = 'info', step = null) => {
    searchLogs.push(msg);
    if (step) {
      emitEvent({ type: 'step', step, status: 'running', detail: msg });
    } else {
      emitEvent({ type: 'log', message: msg, level: type });
    }
  };

  try {
    // 1. Generate master queries based on masterEvent
    emitEvent({ type: 'step', step: 'search', status: 'running', detail: 'Generating search queries...' });
    const searchQueries = await generateSearchQueries(masterEvent);

    // 2. Hybrid Parallel Search
    for (const query of searchQueries) {
      emitEvent({ type: 'search_query', query: query });
      logAndEmit(`[Search] Query: "${query}"`, 'info', 'search');
      console.log(`\n[Search] 하이브리드 병렬 검색: "${query}"`);
      
      const [factCheckRes, wikiRes, ddgRes] = await Promise.all([
        process.env.GOOGLE_API_KEY ? searchGoogleFactCheck(query) : Promise.resolve(null),
        searchWikipedia(query),
        searchDuckDuckGoLite(query)
      ]);
      
      const rawCombined = [...(factCheckRes || []), ...(wikiRes || []), ...(ddgRes || [])];
      
      // Filter out 'X' or 'Twitter' sources based on user request
      const combinedResults = rawCombined.filter(src => {
        const url = (src.url || '').toLowerCase();
        const title = (src.title || '').toLowerCase();
        if (url.includes('twitter.com') || url.includes('x.com')) return false;
        if (title === 'x (social network)' || title === 'twitter') return false;
        return true;
      });
      
      if (combinedResults.length > 0) {
        emitEvent({ type: 'search_found', query: query, sources: combinedResults });
        logAndEmit(`[Found] ${combinedResults.length} valid sources across FactCheck, Wiki, and Web.`, 'success');
        console.log(`   [Found] 문서 발견: ${combinedResults.length}건`);
        sources.push(...combinedResults);
        searchResultsContext += `\n[Combined Results for "${query}"]\n${JSON.stringify(combinedResults, null, 2)}`;
        
        console.log(`   [Scrape] 본문 심층 스크래핑 시작...`);
        logAndEmit(`[Scrape] Starting deep scrape for up to 10 sources...`, 'info', 'scrape');
        
        // Scrape up to 10 unique sources to ensure all Wiki results PLUS other sources are included
        const urlsToScrape = [];
        const addedUrls = new Set();
        
        for (const item of combinedResults) {
          if (urlsToScrape.length >= 10) break;
          if (!addedUrls.has(item.url)) {
            urlsToScrape.push(item.url);
            addedUrls.add(item.url);
          }
        }
        
        const scrapePromises = urlsToScrape.map(url => scrapeWebpage(url));
        const scrapedContents = await Promise.all(scrapePromises);
        
        let successScrapes = 0;
        searchResultsContext += `\n[Page Contents for "${query}"]\n`;
        scrapedContents.forEach((content, idx) => {
          if (content) {
            successScrapes++;
            searchResultsContext += `${content.substring(0, 3000)}\n---\n`;
            emitEvent({ type: 'scrape_snippet', url: urlsToScrape[idx], snippet: content.substring(0, 50000) });
            logAndEmit(`[Snippet] ${urlsToScrape[idx]}: ${content.substring(0, 100)}...`, 'info');
          }
        });
        console.log(`   [Scrape] 스크래핑 완료: ${successScrapes}건 본문 추출`);
        emitEvent({ type: 'step', step: 'scrape', status: 'done', detail: `${successScrapes} pages scraped` });
      } else {
        logAndEmit(`[Found] 0 sources.`, 'warning');
        console.log(`   [Fail] 기사 발견 실패`);
      }
    }

    emitEvent({ type: 'step', step: 'search', status: 'done', detail: `${sources.length} sources found` });

    // 4. Verify Each Fact Individually
    const verifiedFacts = [];
    emitEvent({ type: 'step', step: 'verify_ai', status: 'running', detail: `Evaluating ${facts.length} facts...` });
    
    for (const fact of facts) {
      logAndEmit(`[Verify] Evaluating Fact: "${fact.claim}"...`, 'info');
      const evaluation = await evaluateWithGPT(fact, searchResultsContext, sources, searchQueries);
      logAndEmit(`[Result] -> ${evaluation.status} (Conf: ${evaluation.confidenceScore}%)`, evaluation.status === 'VERIFIED' ? 'success' : 'warning');
      logAndEmit(`[Reason] ${evaluation.explanation}`, 'info');
      verifiedFacts.push({ ...fact, verification: evaluation });
    }

    emitEvent({ type: 'step', step: 'verify_ai', status: 'done', detail: `Verification complete` });
    return { results: verifiedFacts, searchLogs };
  } catch (error) {
    console.error(`[Fail] Verification Failed: ${error.message}`);
    throw error;
  }
}

async function searchGoogleFactCheck(query) {
  try {
    const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&key=${process.env.GOOGLE_API_KEY}&languageCode=ko`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.claims || data.claims.length === 0) return null;
    return data.claims.slice(0, 3).map(claim => ({
      type: 'factcheck',
      title: claim.text || '',
      url: claim.claimReview?.[0]?.url || '',
      publisher: claim.claimReview?.[0]?.publisher?.name || '',
      rating: claim.claimReview?.[0]?.textualRating || '',
      snippet: claim.claimReview?.[0]?.title || ''
    }));
  } catch { return null; }
}

async function searchWikipedia(query) {
  try {
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(query);
    const lang = hasKorean ? 'ko' : 'en';
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'FactLensBot/1.0' } });
    if (!res.data.query || !res.data.query.search) return null;
    
    return res.data.query.search.slice(0, 5).map(item => ({
      type: 'web',
      title: item.title,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
      snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
      publisher: 'Wikipedia'
    }));
  } catch (error) {
    console.error(`Wiki Search Failed: ${error.message}`);
    return null;
  }
}

async function searchDuckDuckGoLite(query) {
  try {
    const res = await axios.post('https://lite.duckduckgo.com/lite/', `q=${encodeURIComponent(query)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result-snippet').each((i, el) => {
      if (i >= 5) return;
      const snippet = $(el).text().trim();
      const a = $(el).prev('.result-title').find('a.result-url');
      const title = a.text().trim();
      const url = a.attr('href');
      if (title && url) {
        results.push({ type: 'web', title, url, snippet, publisher: 'Web' });
      }
    });
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error(`DDG Lite Search Failed: ${error.message}`);
    return null;
  }
}

async function scrapeWebpage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    $('script, style, noscript, iframe, img, svg, video, audio, nav, footer, header').remove();
    let text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.substring(0, 50000);
  } catch (error) { return null; }
}

async function evaluateWithGPT(fact, searchResults, sources, searchQueries) {
  const hasExternalSources = sources.length > 0;
  try {
    const systemPrompt = `You are a strict fact-checking agent.
You will be provided with a specific Claim (extracted from a video), and scraped content from Google Search Results covering the Master Event related to this claim.

Your job is to determine if the specific claim is VERIFIED, REFUTED, OPINION, or UNVERIFIED, strictly based on the provided search results.

## Important Rules
1. **Source-based & Semantic Judgment**: Base your verdict entirely on the provided search results. Use semantic context to judge.
2. **Predominant Language**: The "explanation" MUST be written in the predominant language of the Claim (e.g. if the claim is in Korean, explain in Korean. If English, explain in English).
3. **Detailed Explanation**: Provide a detailed explanation outlining WHY this verdict was reached, referencing the sources.

Output JSON Format:
{
  "status": "VERIFIED" | "REFUTED" | "UNVERIFIED" | "OPINION",
  "confidence": 0.9,
  "explanation": "Detailed explanation matching the language of the claim",
  "sources": [
    { 
      "title": "Source title", 
      "url": "URL", 
      "publisher_identity": "Brief explanation of who the publisher is and their credibility/reliability (e.g., 'Reuters (Major Global News Agency)', 'Wikipedia (Community-edited Encyclopedia)')",
      "relevance": "Why this source is relevant", 
      "snippet": "Exact quote from the source that supports your verdict" 
    }
  ]
}`;

    const MAX_CONTEXT_CHARS = 20000;
    const truncatedSearchResults = searchResults.length > MAX_CONTEXT_CHARS
      ? `${searchResults.substring(0, MAX_CONTEXT_CHARS)}\n...(truncated)`
      : searchResults;

    const userPrompt = `## Claim to Verify: ${fact.claim}
## Context: ${fact.context || ''}

## Scraped Context:
${hasExternalSources ? truncatedSearchResults : '(No external search results found)'}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    if (!parsed.sources || parsed.sources.length === 0) {
      parsed.sources = sources.map(s => ({ title: s.title, url: s.url, relevance: "Used in contextual search" })).slice(0, 5);
    }
    
    // Attach the queries used so the frontend can display them
    parsed.searchQueries = searchQueries;
    
    return parsed;
  } catch (error) {
    console.error('Fact GPT Error:', error);
    return { status: 'ERROR', explanation: 'GPT failed to evaluate', searchQueries };
  }
}

module.exports = { verifyFacts };
