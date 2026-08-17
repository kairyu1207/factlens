const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Raw Text를 GPT-4o를 이용해 깨끗한 문맥으로 전처리(Preprocessing)
 * 
 * @param {string} rawText - OCR 및 STT 텍스트 뭉치
 * @returns {Promise<string>} 정리된 컨텍스트 문자열
 */
async function preprocessText(rawText) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `당신은 팩트체크를 위한 데이터 전처리(Preprocessing) AI입니다.
다음은 화면 캡처 OCR 텍스트와 음성 인식(STT) 텍스트가 시간순으로 뒤섞인 원시 데이터(Raw Data)입니다.
이 데이터는 오타, 짤린 단어, 의미 없는 특수문자, 문맥 단절, 파편화된 문장들을 포함하고 있습니다.

당신의 임무는 다음과 같습니다:
1. 무의미한 단어나 파편화된 기호, 채널 이름(예: FOX NEWS, 구독, 좋아요 등) 등은 제거하세요.
2. 조각난 문장들을 부드럽게 이어 붙여 하나의 완성된 맥락(Context)으로 요약 및 복원하세요.
3. 팩트체크에 필요한 핵심 주장이 훼손되지 않도록 원래의 의미를 정확히 살려야 합니다.
4. 전처리된 결과를 서술형 문장들로 깔끔하게 정리하여 반환하세요.
5. 어떤 설명이나 부연 없이 '오직 전처리된 텍스트 결과물'만 출력하세요.`
        },
        {
          role: "user",
          content: rawText
        }
      ]
    });

    const content = response.choices[0].message.content;
    return content.trim();

  } catch (error) {
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key in Preprocessor');
    }
    if (error.status === 429) {
      throw new Error('API Rate limit exceeded or quota exhausted in Preprocessor');
    }
    throw new Error(`Preprocessing failed: ${error.message}`);
  }
}

module.exports = { preprocessText };
