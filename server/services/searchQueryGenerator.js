const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * AI-driven search query generator.
 * Takes the Master Event and generates 2-3 optimized Google Search queries to find the core news articles.
 * @param {string} masterEvent - The core event to search for.
 * @returns {Promise<string[]>} Array of search queries
 */
async function generateSearchQueries(masterEvent) {
  try {
    const systemPrompt = `You are an expert OSINT (Open-Source Intelligence) researcher.
Your task is to generate highly optimized Google Search queries to find the primary news articles covering a specific "Master Event".

CRITICAL RULES:
1. Generate exactly 2-3 distinct search queries.
2. The queries MUST be in the predominant language of the provided "Master Event" text (e.g., if the text is mostly Korean, write queries in Korean. If English, write in English).
3. Query 1 should be a direct keyword combination of the core entities and action.
4. Query 2 should use synonyms or focus on a slightly different angle of the controversy.
5. DO NOT use natural language questions. Use precise keywords.
6. Output ONLY a JSON array of strings.

Example Output:
{
  "queries": [
    "NYPD Zohran Mamdani wife travel warning",
    "Zohran Mamdani Middle East trip police escort denied"
  ]
}`;

    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: masterEvent }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    return parsed.queries || [masterEvent];
  } catch (error) {
    console.error('[searchQueryGenerator] Error generating queries:', error.message);
    return [masterEvent];
  }
}

module.exports = { generateSearchQueries };
