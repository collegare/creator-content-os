/* ============================================================
   /api/sync/instagram — Pull Latest Instagram Data
   Fetches recent media + insights from the Instagram Graph API
   and stores them in Supabase content_items + performance.

   Required env vars:
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  try {
    const { user_id, platform_user_id, claim_token } = req.body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Find the connection ──
    let query = supabase.from('platform_connections').select('*').eq('platform', 'instagram').eq('status', 'active');

    if (platform_user_id) {
      query = query.eq('platform_user_id', platform_user_id);
    } else if (user_id) {
      query = query.eq('user_id', user_id);
    } else if (claim_token) {
      query = query.eq('claim_token', claim_token);
    } else {
      return res.status(400).json({ error: 'Must provide user_id, platform_user_id, or claim_token' });
    }

    const { data: connections, error: connErr } = await query.limit(1);
    if (connErr || !connections?.length) {
      return res.status(404).json({ error: 'No active Instagram connection found. Please connect your account first.' });
    }

    const conn = connections[0];
    const accessToken = conn.page_access_token || conn.access_token;
    const igAccountId = conn.platform_user_id;

    // Check if token is expired
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      await supabase.from('platform_connections').update({ status: 'expired' }).eq('id', conn.id);
      return res.status(401).json({ error: 'Instagram token expired. Please reconnect your account.' });
    }

    // ── Fetch profile data ──
    const profileResp = await fetch(
      `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,name,followers_count,follows_count,media_count,profile_picture_url&access_token=${accessToken}`
    );
    let profile = null;
    if (profileResp.ok) {
      profile = await profileResp.json();
    }

    // ── Fetch recent media ──
    const mediaResp = await fetch(
      `https://graph.facebook.com/v19.0/${igAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${accessToken}`
    );
    const mediaData = await mediaResp.json();

    if (mediaData.error) {
      console.error('Instagram media fetch error:', mediaData.error);
      return res.status(502).json({ error: `Instagram API error: ${mediaData.error.message}` });
    }

    const posts = mediaData.data || [];

    // ── Fetch insights for each post ──
    const enrichedPosts = [];
    for (const post of posts) {
      let insights = {};
      try {
        // Only video/reel posts support reach + plays. Images support reach, impressions, etc.
        const metricsParam = post.media_type === 'VIDEO'
          ? 'reach,plays,saved,shares'
          : 'reach,impressions,saved,shares';

        const insightsResp = await fetch(
          `https://graph.facebook.com/v19.0/${post.id}/insights?metric=${metricsParam}&access_token=${accessToken}`
        );
        if (insightsResp.ok) {
          const insightsData = await insightsResp.json();
          for (const metric of (insightsData.data || [])) {
            insights[metric.name] = metric.values?.[0]?.value || 0;
          }
        }
      } catch (e) {
        // Insights may not be available for all posts (e.g., stories, albums)
        console.log(`Could not fetch insights for post ${post.id}:`, e.message);
      }

      enrichedPosts.push({
        ...post,
        insights
      });
    }

    // ── Store/update in Supabase ──
    const userId = conn.user_id; // May be null if using claim_token flow

    // Map to content_items format
    const contentItems = enrichedPosts.map(post => ({
      user_id: userId,
      platform: 'Instagram',
      content_type: mapMediaType(post.media_type),
      title: (post.caption || '').substring(0, 100),
      caption: post.caption || '',
      link: post.permalink,
      status: 'published',
      pillar: '', // user can categorize later
      format: mapMediaType(post.media_type),
      platform_post_id: post.id,
      published_at: post.timestamp,
      metrics: {
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
        reach: post.insights.reach || 0,
        impressions: post.insights.impressions || 0,
        saves: post.insights.saved || 0,
        shares: post.insights.shares || 0,
        plays: post.insights.plays || 0
      },
      thumbnail_url: post.thumbnail_url || post.media_url,
      synced_at: new Date().toISOString()
    }));

    // Upsert content items (use platform_post_id to avoid duplicates)
    if (userId && contentItems.length > 0) {
      // Insert new posts, skip existing ones
      for (const item of contentItems) {
        const { data: existing } = await supabase
          .from('content_items')
          .select('id')
          .eq('user_id', userId)
          .eq('platform_post_id', item.platform_post_id)
          .limit(1);

        if (existing?.length) {
          // Update metrics only
          await supabase
            .from('content_items')
            .update({ metrics: item.metrics, synced_at: item.synced_at })
            .eq('id', existing[0].id);
        } else {
          await supabase.from('content_items').insert(item);
        }
      }
    }

    // ── Update connection last_synced ──
    await supabase
      .from('platform_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        metadata: {
          ...conn.metadata,
          last_sync_posts: posts.length,
          followers: profile?.followers_count,
          following: profile?.follows_count
        }
      })
      .eq('id', conn.id);

    // ── Return the data for frontend rendering ──
    return res.status(200).json({
      success: true,
      profile: profile ? {
        username: profile.username,
        name: profile.name,
        followers: profile.followers_count,
        following: profile.follows_count,
        mediaCount: profile.media_count,
        profilePic: profile.profile_picture_url
      } : null,
      posts: enrichedPosts.map(p => ({
        id: p.id,
        type: mapMediaType(p.media_type),
        caption: (p.caption || '').substring(0, 200),
        permalink: p.permalink,
        thumbnail: p.thumbnail_url || p.media_url,
        timestamp: p.timestamp,
        likes: p.like_count || 0,
        comments: p.comments_count || 0,
        reach: p.insights.reach || 0,
        saves: p.insights.saved || 0,
        shares: p.insights.shares || 0,
        plays: p.insights.plays || 0
      })),
      syncedAt: new Date().toISOString(),
      totalPosts: posts.length
    });

  } catch (err) {
    console.error('Instagram sync error:', err);
    return res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
}

function mapMediaType(igType) {
  switch (igType) {
    case 'VIDEO': return 'Reel';
    case 'IMAGE': return 'Image Post';
    case 'CAROUSEL_ALBUM': return 'Carousel';
    default: return 'Post';
  }
}
