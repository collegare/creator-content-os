/* ============================================================
   /api/auth/instagram — Initiate Instagram OAuth Flow
   Redirects user to Facebook/Instagram authorization page.

   Required env vars:
   - INSTAGRAM_APP_ID (Facebook App ID)
   - INSTAGRAM_APP_SECRET (Facebook App Secret)
   - APP_URL (your Vercel deployment URL, e.g. https://your-app.vercel.app)
   ============================================================ */

export default function handler(req, res) {
  const { INSTAGRAM_APP_ID, APP_URL } = process.env;

  if (!INSTAGRAM_APP_ID || !APP_URL) {
    return res.status(500).json({ error: 'Instagram app not configured. Set INSTAGRAM_APP_ID and APP_URL in environment variables.' });
  }

  // State parameter to prevent CSRF — includes the user's return path
  const state = Buffer.from(JSON.stringify({
    ts: Date.now(),
    returnTo: req.query.returnTo || '/settings'
  })).toString('base64url');

  const redirectUri = `${APP_URL}/api/auth/instagram-callback`;

  // Instagram Graph API permissions
  // instagram_basic: read profile + media list
  // instagram_manage_insights: read engagement metrics on media
  // pages_show_list: required for Instagram Business accounts connected via Facebook Pages
  const scope = 'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement';

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${INSTAGRAM_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&state=${state}`;

  // Redirect user to Facebook authorization
  res.redirect(302, authUrl);
}
