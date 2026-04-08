/* ============================================================
   /api/analyze — AI Content Analysis
   Analyzes pasted content and returns structured insights
   ============================================================ */
import { callAI, parseJSON, setCorsHeaders } from './_ai-provider.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content, contentType, niche } = req.body;
    if (!content) return res.status(400).json({ error: 'Content text is required' });

    const systemPrompt = `You are an elite content strategy analyst who works with top creators. You analyze content with the precision of a media company strategist and the creative instinct of a viral content creator. Always return valid JSON only — no markdown, no explanation outside the JSON.`;

    const userPrompt = `Analyze the following ${contentType || 'content'} in the ${niche || 'general'} niche.

Content to analyze:
"""
${content.substring(0, 3000)}
"""

Return this exact JSON structure:
{
  "score": 75,
  "hook": "Analysis of the opening hook — what works and what could be stronger (2-3 sentences)",
  "structure": "Breakdown of the content structure and flow (2-3 sentences)",
  "visual_strategy": "Visual/presentation suggestions (2-3 sentences)",
  "cta": "Call-to-action analysis and improvement suggestions (2-3 sentences)",
  "emotional_trigger": "Emotional hooks identified and suggestions (2-3 sentences)",
  "shareability": "What makes this shareable or not, and how to improve (2-3 sentences)",
  "seo_discovery": "SEO and discoverability analysis (2-3 sentences)",
  "audience_fit": "How well this resonates with the target audience (2-3 sentences)",
  "originality": "Uniqueness assessment and differentiation suggestions (2-3 sentences)",
  "improvement": "Top 3 specific, actionable improvements as a single paragraph",
  "concept": {
    "angle": "A fresh angle to explore with this topic",
    "hook": "A stronger hook suggestion (under 15 words)",
    "format": "Best format recommendation",
    "caption": "A sample caption/description (2-3 sentences)",
    "cta": "A compelling CTA suggestion"
  }
}`;

    const text = await callAI(systemPrompt, userPrompt);
    const analysis = parseJSON(text);

    if (!analysis) {
      return res.status(200).json({ analysis: { raw: text, error: 'Could not parse structured response' } });
    }

    return res.status(200).json({ analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
}
