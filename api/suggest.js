/* ============================================================
   /api/suggest — Smart "Post Next" Engine
   Analyzes the user's content history and performance data
   to recommend what they should create next.
   ============================================================ */
import { callAI, parseJSON, setCorsHeaders } from './_ai-provider.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content, performance, profile } = req.body;

    if (!content || !content.length) {
      return res.status(400).json({ error: 'Content history is required. Add items to your planner first.' });
    }

    // Summarize the user's data for the prompt
    const contentSummary = content.slice(-30).map(c =>
      `- "${c.idea || c.title}" | ${c.platform || '?'} | ${c.pillar || '?'} | ${c.format || '?'} | ${c.status || '?'}`
    ).join('\n');

    const pillarCounts = {};
    const formatCounts = {};
    const platformCounts = {};
    const statusCounts = {};
    content.forEach(c => {
      if (c.pillar) pillarCounts[c.pillar] = (pillarCounts[c.pillar] || 0) + 1;
      if (c.format) formatCounts[c.format] = (formatCounts[c.format] || 0) + 1;
      if (c.platform) platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
      if (c.status) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    });

    let perfSummary = 'No performance data available yet.';
    if (performance && performance.length) {
      const latest = performance[performance.length - 1];
      const totalViews = performance.reduce((s, p) => s + (parseInt(p.views) || 0), 0);
      const totalLikes = performance.reduce((s, p) => s + (parseInt(p.likes) || 0), 0);
      perfSummary = `Latest stats: ${latest.followers || '?'} followers on ${latest.platform || '?'}. Total tracked: ${totalViews} views, ${totalLikes} likes across ${performance.length} entries.`;
    }

    const systemPrompt = `You are a world-class content strategist for creators. You analyze content patterns, identify gaps, and recommend exactly what to create next based on data — not guesses. Your recommendations are specific, actionable, and backed by the creator's own performance patterns. Always return valid JSON only.`;

    const userPrompt = `Here is a creator's content data. Analyze their patterns and recommend what they should post next.

CREATOR PROFILE:
- Niche: ${profile?.niche || 'Not specified'}
- Stage: ${profile?.stage || profile?.creator_stage || 'Not specified'}
- Followers: ${profile?.followers || profile?.follower_count || 'Unknown'}
- Platforms: ${profile?.platforms?.join(', ') || profile?.platform || 'Not specified'}

CONTENT HISTORY (last 30 items):
${contentSummary}

CONTENT MIX BREAKDOWN:
- Pillars: ${JSON.stringify(pillarCounts)}
- Formats: ${JSON.stringify(formatCounts)}
- Platforms: ${JSON.stringify(platformCounts)}
- Status: ${JSON.stringify(statusCounts)}

PERFORMANCE:
${perfSummary}

Based on this data, return this JSON:
{
  "nextPosts": [
    {
      "title": "Specific content idea title",
      "platform": "Best platform for this",
      "pillar": "Content pillar",
      "format": "Format (Reel, Carousel, etc.)",
      "hook": "A ready-to-use hook (under 15 words)",
      "why": "Why this should be the next post (1-2 sentences based on their data)",
      "priority": "high/medium/low"
    }
  ],
  "gaps": [
    {
      "area": "What's missing",
      "suggestion": "How to fix it (1 sentence)"
    }
  ],
  "weekPlan": {
    "monday": "Content type + topic",
    "tuesday": "Content type + topic",
    "wednesday": "Content type + topic",
    "thursday": "Content type + topic",
    "friday": "Content type + topic",
    "saturday": "Content type + topic (or rest)",
    "sunday": "Content type + topic (or rest)"
  },
  "insight": "One key strategic insight about their content patterns (2-3 sentences)"
}

Generate exactly 5 nextPosts and 3 gaps. Make the week plan realistic for a solo creator.`;

    const text = await callAI(systemPrompt, userPrompt, { maxTokens: 2500 });
    const suggestions = parseJSON(text);

    if (!suggestions) {
      return res.status(200).json({ suggestions: { raw: text, error: 'Could not parse structured response' } });
    }

    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error('Suggest error:', error);
    return res.status(500).json({ error: error.message });
  }
}
