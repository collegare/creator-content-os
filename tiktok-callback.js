/* ============================================================
   /api/auth/tiktok-callback — TikTok OAuth Callback
   Exchanges the auth code for an access token, fetches user
   profile, and stores the connection in Supabase.

   Required env vars:
   - TIKTOK_CLIENT_KEY
   - TIKTOK_CLIENT_SECRET
   - APP_URL
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state, error: authError, error_description } = req.query;

  let returnTo = '/';
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString());
    returnTo = parsed.returnTo || '/';
  } catch {}

  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  // User denied or error
  if (authError) {
    return res.redirect(302, `${APP_URL}${returnTo}?tt_error=${encodeURIComponent(error_description || authError)}`);
  }

  if (!code) {
    return res.redirect(302, `${APP_URL}${returnTo}?tt_error=no_code`);
  }

  try {
    // ── Step 1: Exchange code for access token ──
    const tokenResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${APP_URL}/api/auth/tiktok-callback`
      })
    });
    const tokenData = await tokenResp.json();

    if (tokenData.error || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
      console.error('TikTok token exchange error:', tokenData);
      return res.redirect(302, `${APP_URL}${returnTo}?tt_error=${encodeURIComponent(errMsg)}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 86400; // default 24h
    const refreshExpiresIn = tokenData.refresh_expires_in || 31536000; // default 365 days
    const openId = tokenData.open_id;

    // ── Step 2: Fetch user profile ──
    const profileResp = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    const profileData = await profileResp.json();
    const user = profileData.data?.user || {};

    const username = user.username || user.display_name || openId;

    // ── Step 3: Generate claim token ──
    const claimToken = generateClaimToken();

    // ── Step 4: Store connection in Supabase ──
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      await supabase.from('platform_connections').upsert({
        platform: 'tiktok',
        platform_user_id: openId,
        platform_username: username,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
        status: 'active',
        claim_token: claimToken,
        metadata: {
          open_id: openId,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          follower_count: user.follower_count,
          following_count: user.following_count,
          likes_count: user.likes_count,
          video_count: user.video_count,
          connected_at: new Date().toISOString()
        }
      }, {
        onConflict: 'platform,platform_user_id'
      });
    }

    // ── Step 5: Redirect back with success ──
    return res.redirect(302,
      `${APP_URL}${returnTo}?tt_connected=true&tt_username=${encodeURIComponent(username)}&tt_claim=${claimToken}`
    );

  } catch (err) {
    console.error('TikTok callback error:', err);
    return res.redirect(302, `${APP_URL}${returnTo}?tt_error=${encodeURIComponent('Connection failed: ' + err.message)}`);
  }
}

function generateClaimToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
