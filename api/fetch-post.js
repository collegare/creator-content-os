/* ============================================================
   /api/fetch-post — Social Media Post Metadata Fetcher
   Fetches Open Graph metadata + available content from a URL.
   Works with Instagram, TikTok, YouTube, LinkedIn, Twitter/X.
   ============================================================ */
import { setCorsHeaders } from './_ai-provider.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const metadata = { url, platform: detectPlatform(url) };

    // Try oEmbed first (works for many platforms without auth)
    const oembed = await tryOEmbed(url, metadata.platform);
    if (oembed) Object.assign(metadata, oembed);

    // Try fetching OG tags as fallback / supplement
    const og = await tryOpenGraph(url);
    if (og) {
      // Only fill in what oembed didn't get
      if (!metadata.title && og.title) metadata.title = og.title;
      if (!metadata.description && og.description) metadata.description = og.description;
      if (!metadata.thumbnail && og.image) metadata.thumbnail = og.image;
      if (!metadata.author && og.author) metadata.author = og.author;
      if (!metadata.type && og.type) metadata.type = og.type;
      if (og.video_url) metadata.videoUrl = og.video_url;
    }

    return res.status(200).json({ metadata });
  } catch (error) {
    console.error('Fetch-post error:', error);
    return res.status(200).json({ metadata: { url: req.body?.url, error: 'Could not fetch metadata' } });
  }
}

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('linkedin.com')) return 'LinkedIn';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
  if (u.includes('threads.net')) return 'Threads';
  return 'Other';
}

async function tryOEmbed(url, platform) {
  let oembedUrl = null;

  // Each platform has its own oEmbed endpoint
  if (platform === 'Instagram') {
    oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`;
  } else if (platform === 'TikTok') {
    oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (platform === 'YouTube') {
    oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  } else if (platform === 'Twitter/X') {
    oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
  }

  if (!oembedUrl) return null;

  try {
    const resp = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'CreatorContentOS/2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) return null;
    const data = await resp.json();

    const result = {};
    if (data.title) result.title = data.title;
    if (data.author_name) result.author = data.author_name;
    if (data.author_url) result.authorUrl = data.author_url;
    if (data.thumbnail_url) result.thumbnail = data.thumbnail_url;
    if (data.thumbnail_width) result.thumbnailWidth = data.thumbnail_width;
    if (data.thumbnail_height) result.thumbnailHeight = data.thumbnail_height;
    // Instagram/Twitter oembed returns the HTML embed which contains the caption
    if (data.html) result.embedHtml = data.html;
    // Try to extract caption text from embed HTML
    if (data.html) {
      const captionMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (captionMatch) {
        result.caption = captionMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .trim();
      }
    }
    if (data.type) result.contentType = data.type; // "rich", "video", "photo"
    return result;
  } catch {
    return null;
  }
}

async function tryOpenGraph(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CreatorContentOS/2.0; +https://collegare.studio)',
        'Accept': 'text/html'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Parse OG tags from HTML
    const og = {};
    const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']([^"']+)["']\s+(?:[^>]*?\s+)?content=["']([^"']*?)["'][^>]*>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      const [, prop, content] = match;
      if (prop === 'og:title') og.title = content;
      else if (prop === 'og:description') og.description = content;
      else if (prop === 'og:image') og.image = content;
      else if (prop === 'og:type') og.type = content;
      else if (prop === 'og:video' || prop === 'og:video:url') og.video_url = content;
      else if (prop === 'og:video:type') og.video_type = content;
      else if (prop === 'author' || prop === 'article:author') og.author = content;
    }

    // Also try reverse meta tag order (content before property)
    const metaRegex2 = /<meta\s+(?:[^>]*?\s+)?content=["']([^"']*?)["']\s+(?:[^>]*?\s+)?(?:property|name)=["']([^"']+)["'][^>]*>/gi;
    while ((match = metaRegex2.exec(html)) !== null) {
      const [, content, prop] = match;
      if (prop === 'og:title' && !og.title) og.title = content;
      else if (prop === 'og:description' && !og.description) og.description = content;
      else if (prop === 'og:image' && !og.image) og.image = content;
      else if (prop === 'og:type' && !og.type) og.type = content;
    }

    // Fallback: <title> tag
    if (!og.title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) og.title = titleMatch[1].trim();
    }

    return Object.keys(og).length > 0 ? og : null;
  } catch {
    return null;
  }
}
