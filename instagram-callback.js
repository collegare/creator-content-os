/* ============================================================
   /api/auth/instagram-callback — Instagram OAuth Callback
   Exchanges the auth code for an access token, fetches the
   Instagram Business Account ID, and stores the connection
   in Supabase.

   Required env vars:
   - INSTAGRAM_APP_ID
   - INSTAGRAM_APP_SECRET
   - APP_URL
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY (service role key for server-side writes)
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state, error: authError, error_description } = req.query;

  // Parse state
  let returnTo = '/';
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString());
    returnTo = parsed.returnTo || '/';
  } catch {}

  const { INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  // User denied or error from Facebook
  if (authError) {
    return res.redirect(302, `${APP_URL}${returnTo}?ig_error=${encodeURIComponent(error_description || authError)}`);
  }

  if (!code) {
    return res.redirect(302, `${APP_URL}${returnTo}?ig_error=no_code`);
  }

  try {
    // ── Step 1: Exchange code for short-lived token ──
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token`;
    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: `${APP_URL}/api/auth/instagram-callback`,
        code
      })
    });
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error);
      return res.redirect(302, `${APP_URL}${returnTo}?ig_error=${encodeURIComponent(tokenData.error.message || 'token_exchange_failed')}`);
    }

    const shortLivedToken = tokenData.access_token;

    // ── Step 2: Exchange for long-lived token (60 days) ──
    const longTokenResp = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${INSTAGRAM_APP_ID}` +
      `&client_secret=${INSTAGRAM_APP_SECRET}&fb_exchange_token=${shortLivedToken}`
    );
    const longTokenData = await longTokenResp.json();
    const accessToken = longTokenData.access_token || shortLivedToken;
    const expiresIn = longTokenData.expires_in || 5184000; // default 60 days

    // ── Step 3: Get Facebook Pages connected to this user ──
    const pagesResp = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesResp.json();

    // Find the page that has an Instagram Business Account
    let igAccountId = null;
    let igUsername = null;
    let pageName = null;
    let pageAccessToken = null;

    for (const page of (pagesData.data || [])) {
      if (page.instagram_business_account) {
        igAccountId = page.instagram_business_account.id;
        pageName = page.name;
        pageAccessToken = page.access_token || accessToken;
        break;
      }
    }

    if (!igAccountId) {
      // Try direct Instagram account approach (for creator accounts)
      const meResp = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`
      );
      const meData = await meResp.json();

      // Try to get Instagram account via user's accounts
      const igResp = await fetch(
        `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${accessToken}`
      );
      if (igResp.ok) {
        const igData = await igResp.json();
        igAccountId = igData.id;
        igUsername = igData.username;
      } else {
        return res.redirect(302, `${APP_URL}${returnTo}?ig_error=${encodeURIComponent('No Instagram Business or Creator account found. Make sure your Instagram is connected to a Facebook Page or is a Creator/Business account.')}`);
      }
    }

    // ── Step 4: Get Instagram username if we don't have it yet ──
    if (!igUsername && igAccountId) {
      const profileResp = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,name,profile_picture_url,followers_count,media_count&access_token=${pageAccessToken || accessToken}`
      );
      if (profileResp.ok) {
        const profile = await profileResp.json();
        igUsername = profile.username;
      }
    }

    // ── Step 5: Get the Supabase user from the auth header ──
    // The frontend passes the Supabase JWT in a cookie or we use the state
    // For serverless, we'll pass the user_id in the state
    // Actually, we need to identify the user — use Supabase auth
    const authHeader = req.headers.cookie?.match(/sb-.*-auth-token=([^;]+)/)?.[1];

    // Alternative: store the connection with a temporary claim token
    // and let the frontend associate it on return
    const claimToken = generateClaimToken();

    // ── Step 6: Store connection in Supabase ──
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      await supabase.from('platform_connections').upsert({
        platform: 'instagram',
        platform_user_id: igAccountId,
        platform_username: igUsername || pageName || 'Unknown',
        access_token: accessToken,
        page_access_token: pageAccessToken || null,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        status: 'active',
        claim_token: claimToken,
        metadata: {
          ig_account_id: igAccountId,
          page_name: pageName,
          connected_at: new Date().toISOString()
        }
      }, {
        onConflict: 'platform,platform_user_id'
      });
    }

    // ── Step 7: Redirect back to the app with success ──
    return res.redirect(302,
      `${APP_URL}${returnTo}?ig_connected=true&ig_username=${encodeURIComponent(igUsername || '')}&ig_claim=${claimToken}`
    );

  } catch (err) {
    console.error('Instagram callback error:', err);
    return res.redirect(302, `${APP_URL}${returnTo}?ig_error=${encodeURIComponent('Connection failed: ' + err.message)}`);
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
