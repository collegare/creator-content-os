/* ============================================================
   /api/auth/youtube-callback — YouTube/Google OAuth Callback
   Exchanges the auth code for an access token, fetches the
   user's YouTube channel info, and stores the connection
   in Supabase.

   Required env vars:
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - APP_URL
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state, error: authError } = req.query;

  let returnTo = '/';
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString());
    returnTo = parsed.returnTo || '/';
  } catch {}

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  // User denied or error
  if (authError) {
    return res.redirect(302, `${APP_URL}${returnTo}?yt_error=${encodeURIComponent(authError)}`);
  }

  if (!code) {
    return res.redirect(302, `${APP_URL}${returnTo}?yt_error=no_code`);
  }

  try {
    // ── Step 1: Exchange code for access token ──
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${APP_URL}/api/auth/youtube-callback`
      })
    });
    const tokenData = await tokenResp.json();

    if (tokenData.error || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
      console.error('Google token exchange error:', tokenData);
      return res.redirect(302, `${APP_URL}${returnTo}?yt_error=${encodeURIComponent(errMsg)}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600; // default 1h

    // ── Step 2: Fetch YouTube channel info ──
    const channelResp = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const channelData = await channelResp.json();

    if (!channelData.items || channelData.items.length === 0) {
      return res.redirect(302, `${APP_URL}${returnTo}?yt_error=${encodeURIComponent('No YouTube channel found for this Google account.')}`);
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const channelTitle = channel.snippet?.title || 'Unknown';
    const channelThumb = channel.snippet?.thumbnails?.default?.url || '';

    // ── Step 3: Generate claim token ──
    const claimToken = generateClaimToken();

    // ── Step 4: Store connection in Supabase ──
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      await supabase.from('platform_connections').upsert({
        platform: 'youtube',
        platform_user_id: channelId,
        platform_username: channelTitle,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        status: 'active',
        claim_token: claimToken,
        metadata: {
          channel_id: channelId,
          channel_title: channelTitle,
          channel_thumbnail: channelThumb,
          subscriber_count: channel.statistics?.subscriberCount,
          video_count: channel.statistics?.videoCount,
          view_count: channel.statistics?.viewCount,
          uploads_playlist_id: channel.contentDetails?.relatedPlaylists?.uploads,
          connected_at: new Date().toISOString()
        }
      }, {
        onConflict: 'platform,platform_user_id'
      });
    }

    // ── Step 5: Redirect back with success ──
    return res.redirect(302,
      `${APP_URL}${returnTo}?yt_connected=true&yt_channel=${encodeURIComponent(channelTitle)}&yt_claim=${claimToken}`
    );

  } catch (err) {
    console.error('YouTube callback error:', err);
    return res.redirect(302, `${APP_URL}${returnTo}?yt_error=${encodeURIComponent('Connection failed: ' + err.message)}`);
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
