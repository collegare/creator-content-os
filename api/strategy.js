/* ============================================================
   /api/strategy — AI Strategy Recommendations
   Deep analysis of the creator's full data set to produce
   personalized strategy advice, growth plan, and action items.
   ============================================================ */
import { callAI, parseJSON, setCorsHeaders } from './_ai-provider.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content, performance, revenue, profile, quarterly } = req.body;

    const systemPrompt = `You are a senior content strategist and creator economy advisor. You provide the kind of advice that creators pay $500/hour for — specific, data-informed, and immediately actionable. You never give generic advice. Every recommendation ties directly to the creator's actual data. Always return valid JSON only.`;

    // Build data summary
    const totalContent = content?.length || 0;
    const posted = content?.filter(c => c.status === 'Posted' || c.status === 'posted')?.length || 0;
    const ideas = content?.filter(c => c.status === 'Idea' || c.status === 'idea')?.length || 0;

    const pillarCounts = {};
    const formatCounts = {};
    const platformCounts = {};
    (content || []).forEach(c => {
      if (c.pillar) pillarCounts[c.pillar] = (pillarCounts[c.pillar] || 0) + 1;
      if (c.format) formatCounts[c.format] = (formatCounts[c.format] || 0) + 1;
      if (c.platform) platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
    });

    let perfTrend = 'No performance data tracked yet.';
    if (performance?.length >= 2) {
      const first = performance[0];
      const last = performance[performance.length - 1];
      const followerGrowth = (parseInt(last.followers) || 0) - (parseInt(first.followers) || 0);
      const viewsTrend = (parseInt(last.views) || 0) - (parseInt(first.views) || 0);
      perfTrend = `Over ${performance.length} tracking periods: followers ${followerGrowth >= 0 ? '+' : ''}${followerGrowth}, views trend ${viewsTrend >= 0 ? '+' : ''}${viewsTrend}. Latest: ${last.followers || '?'} followers, ${last.views || '?'} views.`;
    } else if (performance?.length === 1) {
      perfTrend = `Only 1 entry tracked: ${performance[0].followers || '?'} followers on ${performance[0].platform || '?'}.`;
    }

    const totalRevenue = (revenue || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const revenueStreams = {};
    (revenue || []).forEach(r => {
      if (r.stream) revenueStreams[r.stream] = (revenueStreams[r.stream] || 0) + (parseFloat(r.amount) || 0);
    });

    const userPrompt = `Provide a comprehensive strategy review for this creator.

CREATOR PROFILE:
- Name: ${profile?.name || profile?.display_name || 'Creator'}
- Niche: ${profile?.niche || 'Not specified'}
- Stage: ${profile?.stage || profile?.creator_stage || 'Not specified'}
- Followers: ${profile?.followers || profile?.follower_count || 'Unknown'}
- Primary Platform: ${profile?.platform || profile?.platforms?.[0] || 'Not specified'}

CONTENT DATA:
- Total items: ${totalContent} (${posted} posted, ${ideas} ideas)
- Pillars: ${JSON.stringify(pillarCounts)}
- Formats: ${JSON.stringify(formatCounts)}
- Platforms: ${JSON.stringify(platformCounts)}

PERFORMANCE TREND:
${perfTrend}

MONETIZATION:
- Total revenue tracked: $${totalRevenue.toFixed(2)}
- Revenue streams: ${Object.keys(revenueStreams).length ? JSON.stringify(revenueStreams) : 'None tracked yet'}

QUARTERLY GOALS:
${quarterly ? JSON.stringify(quarterly) : 'No quarterly goals set yet'}

Return this JSON structure:
{
  "overallGrade": "A/B/C/D/F",
  "headline": "One-sentence summary of their strategy health (sharp and specific)",
  "strengths": [
    {"title": "Strength name", "detail": "Why this is a strength based on their data (1-2 sentences)"}
  ],
  "weaknesses": [
    {"title": "Weakness name", "detail": "Why this is a problem and what it's costing them (1-2 sentences)"}
  ],
  "thirtyDayPlan": [
    {"week": 1, "focus": "What to focus on", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"]},
    {"week": 2, "focus": "What to focus on", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"]},
    {"week": 3, "focus": "What to focus on", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"]},
    {"week": 4, "focus": "What to focus on", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"]}
  ],
  "monetizationAdvice": {
    "nextStream": "The one revenue stream they should focus on next",
    "why": "Why this stream makes sense for their stage and data (2-3 sentences)",
    "firstStep": "The literal first action to take this week"
  },
  "contentMixAdvice": "What to change about their content pillar/format/platform mix (2-3 sentences)",
  "growthLever": "The single biggest growth opportunity based on their data (2-3 sentences)",
  "stopDoing": "One thing they should stop or reduce (1-2 sentences)"
}

Provide exactly 3 strengths and 3 weaknesses. Be direct and specific — no filler.`;

    const text = await callAI(systemPrompt, userPrompt, { maxTokens: 3000 });
    const strategy = parseJSON(text);

    if (!strategy) {
      return res.status(200).json({ strategy: { raw: text, error: 'Could not parse structured response' } });
    }

    return res.status(200).json({ strategy });
  } catch (error) {
    console.error('Strategy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
