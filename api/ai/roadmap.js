export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured. Add ANTHROPIC_API_KEY to Vercel env vars.' });

  try {
    const { profile, revenueData } = req.body;
    if (!profile || !profile.niche) return res.status(400).json({ error: 'Missing creator profile' });

    const revenueCtx = summarizeRevenue(revenueData || []);
    const prompt = buildPrompt(profile, revenueCtx);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 2500,
        system: `You are an expert creator economy monetization strategist. You give specific, actionable advice tailored to the creator's niche, platform, and stage. Never give generic advice. Always respond with valid JSON only \u2014 no markdown, no code fences, no explanation outside the JSON.`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('Anthropic API error:', resp.status, errBody);
      throw new Error('AI API returned ' + resp.status);
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || '';

    let roadmap;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      roadmap = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (parseErr) {
      console.error('JSON parse failed, using fallback:', parseErr.message);
      roadmap = buildFallback(profile, revenueCtx);
    }

    roadmap = {
      recommendedStreams: roadmap.recommendedStreams || buildFallback(profile, revenueCtx).recommendedStreams,
      quickWins: roadmap.quickWins || buildFallback(profile, revenueCtx).quickWins,
      thirtyDayPlan: roadmap.thirtyDayPlan || buildFallback(profile, revenueCtx).thirtyDayPlan,
      monthlyTarget: roadmap.monthlyTarget || targetByStage(profile.stage),
      recommendedTools: roadmap.recommendedTools || buildFallback(profile, revenueCtx).recommendedTools
    };

    return res.status(200).json(roadmap);
  } catch (err) {
    console.error('Roadmap handler error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate roadmap' });
  }
}

function buildPrompt(profile, rev) {
  return `I'm a content creator. Here's my profile:
- Niche: ${profile.niche}
- Primary platform: ${profile.platform || 'Multiple'}
- Creator stage: ${profile.stage || 'Early'}
- Goals: ${profile.goals || 'Grow and monetize'}
${rev.total > 0 ? `- Total revenue so far: $${rev.total}
- Monthly average: $${rev.avg}
- Best month: $${rev.best}
- Revenue streams used: ${rev.streams.join(', ')}` : '- No revenue logged yet'}

Generate a personalized monetization roadmap as a JSON object with exactly these keys:

{
  "recommendedStreams": [
    { "name": "stream name", "description": "why this works for my niche", "potentialMonthly": 1000, "priority": "High|Medium|Low" }
  ],
  "quickWins": [
    { "action": "specific action", "description": "why and how", "timeRequired": "2 hours", "difficulty": "Easy|Medium|Hard" }
  ],
  "thirtyDayPlan": [
    { "action": "Week N focus title", "description": "specific steps" }
  ],
  "monthlyTarget": 5000,
  "recommendedTools": [
    { "name": "Tool", "purpose": "what I'd use it for", "pricingTier": "Free|$X/mo" }
  ]
}

Include 4-5 recommended streams, 3 quick wins, 4 weeks in the plan, and 4-5 tools.
Be extremely specific to ${profile.niche} creators on ${profile.platform || 'social media'}. Reference actual platforms, tools, and strategies that work in this niche.
Return ONLY the JSON object, nothing else.`;
}

function summarizeRevenue(data) {
  if (!data.length) return { total: 0, avg: 0, best: 0, streams: [] };
  let total = 0; const byMonth = {}, streams = new Set();
  data.forEach(e => {
    const a = parseFloat(e.amount) || 0; total += a;
    const m = (e.date || e.month || '').substring(0, 7);
    byMonth[m] = (byMonth[m] || 0) + a;
    streams.add(e.type || e.stream || 'Other');
  });
  const vals = Object.values(byMonth);
  return {
    total: Math.round(total),
    avg: Math.round(vals.length ? total / vals.length : 0),
    best: Math.round(vals.length ? Math.max(...vals) : 0),
    streams: Array.from(streams)
  };
}

function targetByStage(stage) {
  const map = { 'New Creator (0-1K)': 500, 'Rising Creator (10K-50K)': 3000, 'Established (50K-500K)': 8000, 'Pro (500K+)': 20000 };
  for (const [k, v] of Object.entries(map)) { if ((stage || '').includes(k.split(' ')[0])) return v; }
  return 2000;
}

function buildFallback(profile, rev) {
  const niche = profile.niche || 'content creation';
  return {
    recommendedStreams: [
      { name: 'Brand Sponsorships', description: `Partner with brands in the ${niche} space for sponsored posts and stories`, potentialMonthly: 2000, priority: 'High' },
      { name: 'Digital Products', description: `Create guides, templates, or presets specific to ${niche}`, potentialMonthly: 1500, priority: 'High' },
      { name: 'Affiliate Marketing', description: 'Earn commissions on products you already use and recommend', potentialMonthly: 800, priority: 'Medium' },
      { name: 'Coaching or Consulting', description: `Offer 1-on-1 sessions helping others in ${niche}`, potentialMonthly: 2000, priority: 'Medium' }
    ],
    quickWins: [
      { action: 'Set up affiliate links for 5 products you already use', description: 'Start earning passive income immediately', timeRequired: '1-2 hours', difficulty: 'Easy' },
      { action: 'Create a simple lead magnet', description: 'Build your email list with a free downloadable resource', timeRequired: '3-4 hours', difficulty: 'Medium' },
      { action: 'DM 10 brands for sponsorship', description: 'Initiate conversations with brands that fit your audience', timeRequired: '2 hours', difficulty: 'Easy' }
    ],
    thirtyDayPlan: [
      { action: 'Foundation & Affiliate Setup', description: 'Sign up for affiliate programs, add links to bio and content' },
      { action: 'Build Your First Digital Product', description: 'Create a simple guide, template pack, or resource for your audience' },
      { action: 'Launch & Promote', description: 'Release your digital product, set up a simple sales page, promote to your audience' },
      { action: 'Outreach & Scale', description: 'Reach out to brands, collect testimonials, plan next month\'s strategy' }
    ],
    monthlyTarget: targetByStage(profile.stage),
    recommendedTools: [
      { name: 'Gumroad', purpose: 'Sell digital products with zero upfront cost', pricingTier: 'Free (10% fee)' },
      { name: 'Beacons', purpose: 'Link-in-bio with built-in store and analytics', pricingTier: 'Free tier available' },
      { name: 'ConvertKit', purpose: 'Email marketing and automations for creators', pricingTier: 'Free up to 1K subs' },
      { name: 'Canva Pro', purpose: 'Design product assets, media kits, and content', pricingTier: '$13/month' }
    ]
  };
}
