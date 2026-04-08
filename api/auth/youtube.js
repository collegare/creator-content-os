/* ============================================================
   /api/auth/youtube — Initiate YouTube/Google OAuth Flow
   Redirects user to Google authorization page to connect
   their YouTube channel.

   Required env vars:
   - GOOGLE_CLIENT_ID (from Google Cloud Console)
   - GOOGLE_CLIENT_SECRET
   - APP_URL (your Vercel deployment URL)
   ============================================================ */

export default function handler(req, res) {
  const { GOOGLE_CLIENT_ID, APP_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !APP_URL) {
    return res.status(500).json({ error: 'YouTube/Google app not configured. Set GOOGLE_CLIENT_ID and APP_URL in environment variables.' });
  }

  // CSRF state parameter
  const state = Buffer.from(JSON.stringify({
    ts: Date.now(),
    returnTo: req.query.returnTo || '/settings'
  })).toString('base64url');

  const redirectUri = `${APP_URL}/api/auth/youtube-callback`;

  // Google OAuth scopes for YouTube
  // youtube.readonly: view YouTube account, channel info, videos, playlists
  // yt-analytics.readonly: view YouTube Analytics data (views, watch time, etc.)
  const scope = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'openid',
    'profile'
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  res.redirect(302, authUrl);
}
