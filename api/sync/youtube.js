/* ============================================================
   /api/sync/youtube — Pull Latest YouTube Data
   Fetches channel stats + recent videos from YouTube Data API v3
   and stores them in Supabase.

   Required env vars:
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
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

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  try {
    const { user_id, claim_token } = req.body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Find the connection ──
    let query = supabase.from('platform_connections').select('*').eq('platform', 'youtube').eq('status', 'active');
    if (user_id) {
      query = query.eq('user_id', user_id);
    } else if (claim_token) {
      query = query.eq('claim_token', claim_token);
    } else {
      return res.status(400).json({ error: 'Must provide user_id or claim_token' });
    }

    const { data: connections, error: connErr } = await query.limit(1);
    if (connErr || !connections?.length) {
      return res.status(404).json({ error: 'No active YouTube connection found. Please connect your account first.' });
    }

    const conn = connections[0];
    let accessToken = conn.access_token;

    // ── Check if token needs refresh ──
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      if (conn.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        const refreshResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: conn.refresh_token
          })
        });
        const refreshData = await refreshResp.json();

        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          await supabase.from('platform_connections').update({
            access_token: refreshData.access_token,
            token_expires_at: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString()
          }).eq('id', conn.id);
        } else {
          await supabase.from('platform_connections').update({ status: 'expired' }).eq('id', conn.id);
          return res.status(401).json({ error: 'YouTube token expired and refresh failed. Please reconnect your account.' });
        }
      } else {
        await supabase.from('platform_connections').update({ status: 'expired' }).eq('id', conn.id);
        return res.status(401).json({ error: 'YouTube token expired. Please reconnect your account.' });
      }
    }

    // ── Fetch updated channel stats ──
    let channel = null;
    try {
      const channelResp = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const channelData = await channelResp.json();
      if (channelData.items?.length) {
        channel = channelData.items[0];
      }
    } catch (e) {
      console.log('Channel fetch failed:', e.message);
    }

    // ── Fetch recent videos from uploads playlist ──
    let videos = [];
    const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads || conn.metadata?.uploads_playlist_id;

    if (uploadsPlaylistId) {
      let nextPageToken = null;
      let fetchCount = 0;

      while (fetchCount < 2) {
        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`;
        if (nextPageToken) url += `&pageToken=${nextPageToken}`;

        const playlistResp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const playlistData = await playlistResp.json();

        if (playlistData.error) {
          console.error('YouTube playlist error:', playlistData.error);
          break;
        }

        const items = playlistData.items || [];
        if (items.length === 0) break;

        const videoIds = items.map(i => i.contentDetails?.videoId).filter(Boolean);

        if (videoIds.length > 0) {
          const statsResp = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(',')}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          const statsData = await statsResp.json();

          if (statsData.items) {
            videos = videos.concat(statsData.items);
          }
        }

        nextPageToken = playlistData.nextPageToken;
        if (!nextPageToken) break;
        fetchCount++;
      }
    }

    // ── Store in Supabase ──
    const userId = conn.user_id;

    if (userId && videos.length > 0) {
      for (const video of videos) {
        const duration = parseDuration(video.contentDetails?.duration);
        const contentItem = {
          user_id: userId,
          platform: 'YouTube',
          content_type: 'Video',
          title: (video.snippet?.title || '').substring(0, 100),
          caption: video.snippet?.description || '',
          link: `https://www.youtube.com/watch?v=${video.id}`,
          status: 'published',
          format: duration <= 60 ? 'Short' : 'Video',
          platform_post_id: video.id,
          published_at: video.snippet?.publishedAt || null,
          metrics: {
            views: parseInt(video.statistics?.viewCount || '0', 10),
            likes: parseInt(video.statistics?.likeCount || '0', 10),
            comments: parseInt(video.statistics?.commentCount || '0', 10),
            favorites: parseInt(video.statistics?.favoriteCount || '0', 10),
            duration: duration
          },
          thumbnail_url: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url,
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

    // ── Update connection metadata ──
    await supabase.from('platform_connections').update({
      last_synced_at: new Date().toISOString(),
      metadata: {
        ...conn.metadata,
        last_sync_videos: videos.length,
        subscriber_count: channel?.statistics?.subscriberCount,
        video_count: channel?.statistics?.videoCount,
        view_count: channel?.statistics?.viewCount
      }
    }).eq('id', conn.id);

    // ── Return data for frontend ──
    return res.status(200).json({
      success: true,
      profile: channel ? {
        channelId: channel.id,
        channelTitle: channel.snippet?.title,
        thumbnail: channel.snippet?.thumbnails?.default?.url,
        subscribers: channel.statistics?.subscriberCount,
        totalVideos: channel.statistics?.videoCount,
        totalViews: channel.statistics?.viewCount
      } : null,
      posts: videos.map(v => ({
        id: v.id,
        type: (parseDuration(v.contentDetails?.duration) <= 60) ? 'Short' : 'Video',
        title: (v.snippet?.title || '').substring(0, 200),
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url,
        timestamp: v.snippet?.publishedAt,
        duration: parseDuration(v.contentDetails?.duration),
        views: parseInt(v.statistics?.viewCount || '0', 10),
        likes: parseInt(v.statistics?.likeCount || '0', 10),
        comments: parseInt(v.statistics?.commentCount || '0', 10)
      })),
      syncedAt: new Date().toISOString(),
      totalPosts: videos.length
    });

  } catch (err) {
    console.error('YouTube sync error:', err);
    return res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
}

/**
 * Parse ISO 8601 duration (e.g., PT4M13S) to seconds
 */
function parseDuration(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
