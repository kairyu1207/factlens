const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runWordCorrection(ocrText, audioText) {
  const systemPrompt = `You are a strict data cleaner. The user provides two pieces of text: OCR (from subtitles) and AUDIO (from speech recognition).
OCR text contains spatial tags like [Top], [Middle], [Bottom] which indicate their position on screen.
AUDIO text is extracted using overlapping sliding windows (e.g. 0-4s, 2-6s, 4-8s). This means there will be duplicated, overlapping phrases where the chunks intersect.
CRITICAL RULES:
1. Ignore generic YouTube/App UI elements (e.g., "내 페이지", "기록", "로그인", "더보기", "자동 더빙", "리믹스", "구독", "공유", "조회수", "좋아요", "Subscribe", "Share"). If these are the only Korean words, the predominant language is STILL ENGLISH.
2. For OCR, preserve the spatial tags ([Top], etc.) and type tags ([고정], [자막]) in your output.

Output JSON format:
{
  "ocrLog": ["[OCR] [Top] original -> corrected", "[OCR] [Middle] original -> corrected", ...],
  "audioLog": ["[Audio] fixed duplicate -> clean text", ...],
  "correctedOcr": "...",
  "correctedAudio": "..."
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `OCR:\n${ocrText}\n\nAUDIO:\n${audioText}` }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  return JSON.parse(res.choices[0].message.content);
}

async function runSentenceFormulation(correctedOcr, correctedAudio) {
  const systemPrompt = `You are a strict data structurer. Take the corrected OCR and AUDIO text and organize them into sentences, grouped by their primary source.
OCR text includes spatial tags ([Top], [Middle], [Bottom]). Group them accordingly.
Output JSON format:
{
  "formulationLog": {
    "Top": ["[Merge-Top] sentence...", ...],
    "Middle": ["[Merge-Middle] sentence...", ...],
    "Bottom": ["[Merge-Bottom] sentence...", ...],
    "Audio": ["[Merge-Audio] sentence...", ...]
  }
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `OCR:\n${correctedOcr}\n\nAUDIO:\n${correctedAudio}` }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  return JSON.parse(res.choices[0].message.content);
}

async function runScriptReconstruction(formulationLog) {
  const systemPrompt = `You are a strict script restorer.
The user provides segmented sentences from OCR (Top, Middle, Bottom) and Audio.
These texts are raw and contain OCR/Speech-to-Text errors or cut-off sentences.

ABSOLUTE RULE: DO NOT SUMMARIZE, PARAPHRASE, OR SHORTEN THE TEXT. 
Your ONLY job is to restore the original sentences exactly word-for-word as they appeared on screen or were spoken. 
If the original text was a long, fragmented paragraph, you MUST output the long, fragmented paragraph. NEVER rewrite it into a neat, concise summary.

CRITICAL RULES:
1. RESTORE WORD-FOR-WORD: Deduce what the original text on the screen (Top, Mid, Bot) and the spoken words (Audio) actually were by STRICTLY cross-referencing all sources. If Audio is missing a word but OCR has it, use OCR context to fill the Audio's exact gap, and vice versa.
2. ABSOLUTE BAN ON UI ELEMENTS: Completely remove words like "내 페이지", "기록", "로그인", "더보기", "자동 더빙", "리믹스", "구독", "공유", "조회수", "좋아요", "Search", "Shorts", "Subscribe", "Like".
3. Output the restored script separately for Top, Middle, Bottom, and Audio. Do NOT merge them into one summary.
4. **Predominant Language**: The output MUST be in the predominant language of the actual CONTENT. If the only Korean words are the banned UI elements, the predominant language is ENGLISH. Do NOT output Korean just because of Korean UI words.

Output JSON format:
{
  "reconstructionLog": ["[Restore-Top] removed UI text", "[Restore-Audio] fixed misrecognized word", ...],
  "reconstructedScripts": {
    "Top": "Reconstructed top text...",
    "Middle": "Reconstructed middle text...",
    "Bottom": "Reconstructed bottom text...",
    "Audio": "Reconstructed audio transcript..."
  }
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(formulationLog, null, 2) }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  return JSON.parse(res.choices[0].message.content);
}

async function runEntityResolution(reconstructedScripts) {
  const systemPrompt = `You are an entity coreference resolution expert.
The user provides 4 reconstructed scripts (Top, Middle, Bottom, Audio).
Your task is to identify ambiguous pronouns (e.g., "그", "그녀", "그들") or implicit subjects (e.g., "시장의 아내", "이 지역") and REPLACE them with their explicit, specific entity names (e.g., "조란 맘다니의 아내", "South Sudan") based strictly on the combined context of all scripts.

CRITICAL RULES:
1. Rewrite the scripts with the entities resolved. Keep the 4-part structure (Top, Middle, Bottom, Audio).
2. Do not change the core meaning or add new facts.
3. Provide a brief log of the resolutions you made.
4. **Predominant Language**: The output MUST be in the predominant language of the provided scripts (e.g., if the script is mostly English, write logs and output in English).

Output JSON format:
{
  "resolutionLog": ["[Replace] 'mayor\\'s wife' -> 'Zohran Mamdani\\'s wife'", ...],
  "resolvedScripts": {
    "Top": "...",
    "Middle": "...",
    "Bottom": "...",
    "Audio": "..."
  }
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(reconstructedScripts, null, 2) }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  return JSON.parse(res.choices[0].message.content);
}

async function runInformationExtraction(resolvedScripts, existingFacts = []) {
  const existingFactsContext = existingFacts && existingFacts.length > 0 
    ? `\n\n**EXISTING VERIFIED FACTS (DO NOT DUPLICATE THESE):**\n${existingFacts.map(f => `- ${f}`).join('\n')}\nIf a claim is semantically identical or highly similar to any of these existing facts, DO NOT extract it again.`
    : '';

  const systemPrompt = `You are an expert OSINT and Fact-Checking Analyst.
Your task is to analyze the provided video scripts (Top, Middle, Bottom, Audio) and extract both the **Master Context** and the specific **Facts** for verification.

CRITICAL RULES:
1. **Predominant Language**: The output MUST be in the predominant language of the ACTUAL CONTENT. Ignore any leftover UI words like "내 페이지", "더보기", "로그인" when determining the language. If the video content is English, output in English.
2. **Master Event**: Identify the single core event or controversy this video is about.
3. **Specific Facts (2-5 Max)**: Extract 2-5 core objective claims from the video that need factual verification. Exclude opinions. 
4. **Entity Validation**: If specific entities (people, regions, organizations) are central to the context, ensure their identity and role are explicitly mentioned within those 2-5 facts so their existence can be verified. Do NOT extract dozens of micro-facts; group them logically into 2-5 substantial claims.
5. **ABSOLUTE BAN ON UI ELEMENTS**: Ignore all YouTube/Shorts UI elements (e.g., 1.7만, 4042, Subscribe, Share, "High-profile", "내 페이지", "기록", "로그인", "더보기", "자동 더빙", "리믹스").${existingFactsContext}

Output JSON format:
{
  "masterEvent": "The core event",
  "extractedInfoLogs": [
    "[Fact] Claim 1",
    "[Fact] Claim 2"
  ],
  "facts": [
    {
      "claim": "The specific objective claim",
      "context": "Context or entities involved to help verification",
      "required_info": "What information is needed to verify this?"
    }
  ]
}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(resolvedScripts) }
    ]
  });

  return JSON.parse(res.choices[0].message.content);
}

module.exports = {
  runWordCorrection,
  runSentenceFormulation,
  runScriptReconstruction,
  runEntityResolution,
  runInformationExtraction
};
