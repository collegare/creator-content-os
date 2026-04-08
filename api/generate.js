/* ============================================================
   /api/generate — AI Caption, Hook & Script Writer
   Generates ready-to-use content pieces based on the creator's
   topic, style, and platform.
   ============================================================ */
import { callAI, parseJSON, setCorsHeaders } from './_ai-provider.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, topic, platform, niche, tone, format, context } = req.body;

    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const systemPrompt = `You are a viral content writer who specializes in social media content for creators. You write hooks that stop the scroll, captions that convert, and scripts that keep viewers watching. Your tone adapts to the creator's brand. Always return valid JSON only.`;

    let userPrompt = '';

    if (type === 'hooks') {
      userPrompt = `Generate 10 scroll-stopping hooks for this content:

Topic: ${topic}
Platform: ${platform || 'Instagram'}
Niche: ${niche || 'general'}
Tone: ${tone || 'conversational'}
${context ? `Additional context: ${context}` : ''}

Return JSON:
{
  "hooks": [
    {"text": "Hook text (under 12 words)", "style": "question/bold-claim/pattern-interrupt/curiosity-gap/storytelling/statistic", "why": "Why this hook works (1 sentence)"}
  ]
}`;
    } else if (type === 'caption') {
      userPrompt = `Write a high-converting caption for this post:

Topic: ${topic}
Platform: ${platform || 'Instagram'}
Niche: ${niche || 'general'}
Tone: ${tone || 'conversational'}
Format: ${format || 'Reel'}
${context ? `Additional context: ${context}` : ''}

Return JSON:
{
  "captions": [
    {
      "version": "Version A (direct/punchy)",
      "hook": "Opening line",
      "body": "Caption body (3-5 sentences for IG, shorter for TikTok)",
      "cta": "Call to action",
      "hashtags": ["relevant", "hashtag", "suggestions"]
    },
    {
      "version": "Version B (storytelling)",
      "hook": "Opening line",
      "body": "Caption body",
      "cta": "Call to action",
      "hashtags": ["relevant", "hashtag", "suggestions"]
    },
    {
      "version": "Version C (value-driven)",
      "hook": "Opening line",
      "body": "Caption body",
      "cta": "Call to action",
      "hashtags": ["relevant", "hashtag", "suggestions"]
    }
  ]
}`;
    } else if (type === 'script') {
      userPrompt = `Write a short-form video script for this content:

Topic: ${topic}
Platform: ${platform || 'Instagram'}
Niche: ${niche || 'general'}
Tone: ${tone || 'conversational'}
Format: ${format || 'Reel'}
Target length: 30-60 seconds
${context ? `Additional context: ${context}` : ''}

Return JSON:
{
  "script": {
    "hook": "Opening hook (first 3 seconds — this is the most important part)",
    "setup": "Context and setup (5-10 seconds)",
    "body": "Main content delivery — the value, story, or teaching moment (15-30 seconds)",
    "payoff": "The twist, reveal, or key takeaway (5-10 seconds)",
    "cta": "Closing call-to-action (3-5 seconds)",
    "totalEstimatedSeconds": 45,
    "onScreenText": ["Text overlay 1 for hook", "Text overlay 2 for key point", "Text overlay 3 for CTA"],
    "bRollSuggestions": ["Visual suggestion 1", "Visual suggestion 2", "Visual suggestion 3"],
    "musicMood": "Suggested music mood/vibe"
  },
  "alternateHooks": [
    "Alternative hook option 1",
    "Alternative hook option 2",
    "Alternative hook option 3"
  ]
}`;
    } else if (type === 'ideas') {
      userPrompt = `Generate 10 content ideas based on this topic/theme:

Topic/Theme: ${topic}
Platform: ${platform || 'Instagram'}
Niche: ${niche || 'general'}
${context ? `Additional context: ${context}` : ''}

Return JSON:
{
  "ideas": [
    {
      "title": "Content idea title",
      "format": "Reel/Carousel/Story/Thread/etc.",
      "pillar": "Growth/Value/Authority/Lifestyle/Conversion/Brand",
      "hook": "Suggested hook (under 12 words)",
      "angle": "What makes this unique (1 sentence)",
      "difficulty": "easy/medium/hard"
    }
  ]
}`;
    } else {
      return res.status(400).json({ error: 'Invalid type. Use: hooks, caption, script, or ideas' });
    }

    const text = await callAI(systemPrompt, userPrompt, { maxTokens: 2500 });
    const result = parseJSON(text);

    if (!result) {
      return res.status(200).json({ result: { raw: text, error: 'Could not parse structured response' } });
    }

    return res.status(200).json({ result });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: error.message });
  }
}
