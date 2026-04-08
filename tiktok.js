/* ============================================================
   /api/auth/tiktok — Initiate TikTok OAuth Flow
   Redirects user to TikTok authorization page.

   Required env vars:
   - TIKTOK_CLIENT_KEY (from TikTok Developer Portal)
   - TIKTOK_CLIENT_SECRET
   - APP_URL (your Vercel deployment URL)
   ============================================================ */

export default function handler(req, res) {
  const { TIKTOK_CLIENT_KEY, APP_URL } = process.env;

  if (!TIKTOK_CLIENT_KEY || !APP_URL) {
    return res.status(500).json({ error: 'TikTok app not configured. Set TIKTOK_CLIENT_KEY and APP_URL in environment variables.' });
  }

  // CSRF state parameter
  const state = Buffer.from(JSON.stringify({
    ts: Date.now(),
    returnTo: req.query.returnTo || '/settings'
  })).toString('base64url');

  const redirectUri = `${APP_URL}/api/auth/tiktok-callback`;

  // TikTok Login Kit v2 scopes
  // user.info.basic: read username, display name, avatar
  // user.info.stats: read follower/following/likes/video counts
  // video.list: read user's public videos
  const scope = 'user.info.basic,user.info.stats,video.list';

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?` +
    `client_key=${TIKTOK_CLIENT_KEY}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&state=${state}`;

  res.redirect(302, authUrl);
}
