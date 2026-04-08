/* ============================================================
   /api/sync/tiktok — Pull Latest TikTok Data
   Fetches user profile stats + recent videos from TikTok API v2
   and stores them in Supabase.

   Required env vars:
   - TIKTOK_CLIENT_KEY
   - TIKTOK_CLIENT_SECRET
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  try {
    const { user_id, claim_token } = req.body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabase.from('platform_connections').select('*').eq('platform', 'tiktok').eq('status', 'active');
    if (user_id) {
      query = query.eq('user_id', user_id);
    } else if (claim_token) {
      query = query.eq('claim_token', claim_token);
    } else {
      return res.status(400).json({ error: 'Must provide user_id or claim_token' });
    }

    const { data: connections, error: connErr } = await query.limit(1);
    if (connErr || !connections?.length) {
      return res.status(404).json({ error: 'No active TikTok connection found. Please connect your account first.' });
    }

    const conn = connections[0];
    let accessToken = conn.access_token;

    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      if (conn.refresh_token && TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET) {
        const refreshResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY,
            client_secret: TIKTOK_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: conn.refresh_token
          })
        });
        const refreshData = await refreshResp.json();

        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          await supabase.from('platform_connections').update({
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token || conn.refresh_token,
            token_expires_at: new Date(Date.now() + (refreshData.expires_in || 86400) * 1000).toISOString()
          }).eq('id', conn.id);
        } else {
          await supabase.from('platform_connections').update({ status: 'expired' }).eq('id', conn.id);
          return res.status(401).json({ error: 'TikTok token expired and refresh failed. Please reconnect your account.' });
        }
      } else {
        await supabase.from('platform_connections').update({ status: 'expired' }).eq('id', conn.id);
        return res.status(401).json({ error: 'TikTok token expired. Please reconnect your account.' });
      }
    }

    let profile = null;
    try {
      const profileResp = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url,follower_count,following_count,likes_count,video_count',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const profileData = await profileResp.json();
      if (profileData.data?.user) {
        profile = profileData.data.user;
      }
    } catch (e) {
      console.log('Profile fetch failed:', e.message);
    }

    let videos = [];
    let cursor = null;
    let hasMore = true;
    let fetchCount = 0;

    while (hasMore && fetchCount < 3) {
      const bodyParams = { max_count: 20 };
      if (cursor) bodyParams.cursor = cursor;

      const videosResp = await fetch(
        'https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,share_url,duration,cover_image_url,like_count,comment_count,share_count,view_count',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bodyParams)
        }
      );
      const videosData = await videosResp.json();

      if (videosData.error?.code) {
        console.error('TikTok video list error:', videosData.error);
        if (videos.length === 0) {
          return res.status(502).json({ error: `TikTok API error: ${videosData.error.message || videosData.error.code}` });
        }
        break;
      }

      const pageVideos = videosData.data?.videos || [];
      videos = videos.concat(pageVideos);
      hasMore = videosData.data?.has_more || false;
      cursor = videosData.data?.cursor;
      fetchCount++;
    }

    const userId = conn.user_id;

    if (userId && videos.length > 0) {
      for (const video of videos) {
        const contentItem = {
          user_id: userId,
          platform: 'TikTok',
          content_type: 'Video',
          title: (video.title || video.video_description || '').substring(0, 100),
          caption: video.video_description || video.title || '',
          link: video.share_url,
          status: 'published',
          format: 'Video',
          platform_post_id: video.id,
          published_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
          metrics: {
            views: video.view_count || 0,
            likes: video.like_count || 0,
            comments: video.comment_count || 0,
            shares: video.share_count || 0,
            duration: video.duration || 0
          },
          thumbnail_url: video.cover_image_url,
          synced_at: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('content_items')
          .select('id')
          .eq('user_id', userId)
          .eq('platform_post_id', video.id)
          .limit(1);

        if (existing?.length) {
          await supabase.from('content_items')
            .update({ metrics: contentItem.metrics, synced_at: contentItem.synced_at })
            .eq('id', existing[0].id);
        } else {
          await supabase.from('content_items').insert(contentItem);
        }
      }
    }

    await supabase.from('platform_connections').update({
      last_synced_at: new Date().toISOString(),
      metadata: {
        ...conn.metadata,
        last_sync_videos: videos.length,
        follower_count: profile?.follower_count,
        following_count: profile?.following_count,
        likes_count: profile?.likes_count,
        video_count: profile?.video_count
      }
    }).eq('id', conn.id);

    return res.status(200).json({
      success: true,
      profile: profile ? {
        username: profile.username || profile.display_name,
        displayName: profile.display_name,
        avatar: profile.avatar_url,
        followers: profile.follower_count,
        following: profile.following_count,
        totalLikes: profile.likes_count,
        videoCount: profile.video_count
      } : null,
      posts: videos.map(v => ({
        id: v.id,
        type: 'Video',
        title: (v.title || v.video_description || '').substring(0, 200),
        permalink: v.share_url,
        thumbnail: v.cover_image_url,
        timestamp: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
        duration: v.duration,
        views: v.view_count || 0,
        likes: v.like_count || 0,
        comments: v.comment_count || 0,
        shares: v.share_count || 0
      })),
      syncedAt: new Date().toISOString(),
      totalPosts: videos.length
    });

  } catch (err) {
    console.error('TikTok sync error:', err);
    return res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
}
