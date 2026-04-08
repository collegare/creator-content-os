/* ============================================================
   Shared AI Provider — supports Claude (Anthropic) and OpenAI
   ============================================================
   Auto-detects which API key is configured in Vercel env vars:
   - ANTHROPIC_API_KEY → uses Claude
   - OPENAI_API_KEY → uses ChatGPT / GPT-4o

   Set ONE of these in Vercel → Settings → Environment Variables.
   Claude is recommended for quality; OpenAI works as a fallback.
   ============================================================ */

export function getProvider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export async function callAI(systemPrompt, userPrompt, options = {}) {
  const provider = getProvider();
  const maxTokens = options.maxTokens || 2048;

  if (!provider) {
    throw new Error('No AI API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel Environment Variables.');
  }

  if (provider === 'anthropic') {
    return callClaude(systemPrompt, userPrompt, maxTokens);
  } else {
    return callOpenAI(systemPrompt, userPrompt, maxTokens);
  }
}

async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.content?.[0]?.text || '';
}

async function callOpenAI(systemPrompt, userPrompt, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}

export function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
    }
    return null;
  }
}

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
