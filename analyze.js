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
    const { content, contentType, niche, link, platform, metadata, views, likes, comments, saves } = req.body;
    if (!content && !link) return res.status(400).json({ error: 'Content text or link is required' });

    const systemPrompt = `You are an elite content strategy analyst who works with top creators. You analyze content with the precision of a media company strategist and the creative instinct of a viral content creator. Always return valid JSON only — no markdown, no explanation outside the JSON.

When given a post link and metadata (even without a full caption/transcript), use ALL available context to produce the most insightful analysis possible — the platform, content type, niche, any caption or description, engagement metrics, and the post URL itself. Infer what you can from the metadata. If information is limited, be upfront about what you're inferring vs what you know, but still give actionable advice.`;

    // Build the context block from whatever we have
    let contextBlock = '';
    if (link) contextBlock += `Post URL: ${link}\n`;
    if (platform) contextBlock += `Platform: ${platform}\n`;
    if (contentType) contextBlock += `Content Type: ${contentType}\n`;
    if (niche) contextBlock += `Niche: ${niche}\n`;
    if (metadata?.author) contextBlock += `Creator: ${metadata.author}\n`;
    if (metadata?.title) contextBlock += `Post Title: ${metadata.title}\n`;
    if (metadata?.description) contextBlock += `Post Description: ${metadata.description}\n`;
    if (metadata?.caption) contextBlock += `Caption: ${metadata.caption}\n`;
    if (metadata?.contentType) contextBlock += `Media Type: ${metadata.contentType}\n`;
    if (views) contextBlock += `Views: ${views}\n`;
    if (likes) contextBlock += `Likes: ${likes}\n`;
    if (comments) contextBlock += `Comments: ${comments}\n`;
    if (saves) contextBlock += `Saves: ${saves}\n`;
    if (content) contextBlock += `\nCaption / Transcript:\n"""\n${content.substring(0, 3000)}\n"""`;

    const userPrompt = `Analyze the following ${contentType || 'content'} in the ${niche || 'general'} niche.

${contextBlock}

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
