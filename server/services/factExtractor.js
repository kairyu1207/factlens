const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
/**
 * Extract all verifiable factual claims from text.
 */
async function extractFacts(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `당신은 영상 내용을 분석하여 팩트체크가 필요한 주요 주장을 추출하는 AI입니다.
다음은 화면 OCR 텍스트와 음성 텍스트입니다. 이를 바탕으로 "사실 확인이 필요한 핵심 주장(Fact)"을 최대 3개까지 추출해 주세요.
단순한 의견, 감상, 인사말은 제외하고, 구글 검색으로 참/거짓을 판별할 수 있는 명제만 추출하세요.
팩트체크할 주장이 없다면 빈 배열을 반환하세요.

반드시 다음 JSON 형식으로 응답하세요:
{
  "facts": [
    "추출된 주장 1",
    "추출된 주장 2"
  ]
}`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const content = response.choices[0].message.content;
    
    // Parse JSON
    const parsed = JSON.parse(content);

    if (!parsed.facts || !Array.isArray(parsed.facts)) {
      throw new Error('Invalid response format from OpenAI');
    }

    return parsed.facts.map((fact, index) => ({
      id: index + 1,
      claim: typeof fact === 'string' ? fact : (fact.claim || ''),
      category: 'other',
      context: '',
      originalText: '',
      isPrerequisite: false
    })).filter(fact => fact.claim.length > 0);

  } catch (error) {
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key');
    }
    if (error.status === 429) {
      throw new Error('API Rate limit exceeded or quota exhausted.');
    }
    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse Gemini response');
    }
    throw new Error(`Fact extraction failed: ${error.message}`);
  }
}

module.exports = { extractFacts };
