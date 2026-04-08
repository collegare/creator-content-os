/* ============================================================
   /api/analyze — Claude AI Content Analysis Proxy
   ============================================================
   This serverless function proxies requests to Claude's API
   so the API key never touches the browser.

   SETUP:
   1. Get a Claude API key from console.anthropic.com
   2. In Vercel dashboard → Project → Settings → Environment Variables
   3. Add: ANTHROPIC_API_KEY = sk-ant-...your-key...
   ============================================================ */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Vercel Environment Variables.' });
  }

  try {
    const { content, contentType, niche } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content text is required' });
    }

    const prompt = `You are a content strategy analyst for creators. Analyze the following ${contentType || 'content'} in the ${niche || 'general'} niche.

Content to analyze:
"""
${content}
"""

Provide your analysis in this exact JSON structure:
{
  "hook": "Analysis of the opening hook — what works and what could be stronger",
  "structure": "Breakdown of the content structure and flow",
  "visual_strategy": "Visual/presentation suggestions",
  "cta": "Call-to-action analysis and improvement suggestions",
  "emotional_trigger": "Emotional hooks identified and suggestions",
  "shareability": "What makes this shareable (or not) and how to improve",
  "seo_discovery": "SEO and discoverability analysis",
  "audience_fit": "How well this resonates with the target audience",
  "originality": "Uniqueness score and differentiation suggestions",
  "improvement": "Top 3 specific, actionable improvements",
  "concept": {
    "angle": "A fresh angle to explore with this topic",
    "hook": "A stronger hook suggestion",
    "format": "Best format recommendation for this content",
    "caption": "A sample caption/description",
    "cta": "A compelling CTA suggestion"
  },
  "score": 75
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Claude API error: ${errText}` });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Parse the JSON from Claude's response
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1].trim());
      } else {
        analysis = { raw: text, error: 'Could not parse structured analysis' };
      }
    }

    return res.status(200).json({ analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
