/* ============================================================
   SUPABASE CONFIG — Creator Content OS
   ============================================================
   INSTRUCTIONS:
   1. Go to your Supabase dashboard → Settings → API Keys
   2. Click "Legacy anon, service_role API keys" tab
   3. Copy the "anon public" key (starts with eyJ...)
   4. Paste it below as SUPABASE_ANON_KEY
   ============================================================ */

const SUPABASE_URL = 'https://iwglhesnhmpdqcoxcgjp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE'; // ← Paste your anon key here

// Initialize Supabase client (loaded from CDN in index.html)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH HELPERS
// ============================================================
async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
  });
  return { data, error };
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

async function resetPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  return { data, error };
}

// ============================================================
// DATA LAYER — wraps Supabase calls for each table
// Falls back to localStorage if not authenticated
// ============================================================
const DB = {
  _userId: null,

  async init() {
    const user = await getUser();
    this._userId = user?.id || null;
    return !!this._userId;
  },

  isAuthenticated() {
    return !!this._userId;
  },

  // ---- USER PROFILE ----
  async getProfile() {
    if (!this._userId) return getObj('ccos_settings');
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', this._userId)
      .single();
    return data || {};
  },

  async saveProfile(profile) {
    if (!this._userId) { setObj('ccos_settings', profile); return { data: profile }; }
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: this._userId,
        display_name: profile.name || profile.display_name,
        niche: profile.niche,
        follower_count: parseInt(profile.followers || profile.follower_count) || 0,
        platforms: profile.platforms || [],
        creator_stage: profile.creator_stage || detectStageFromCount(parseInt(profile.followers || profile.follower_count) || 0)
      })
      .select()
      .single();
    return { data, error };
  },

  // ---- CONTENT ITEMS ----
  async getContent() {
    if (!this._userId) return getArr('ccos_content');
    const { data } = await supabase
      .from('content_items')
      .select('*')
      .eq('user_id', this._userId)
      .order('created_at', { ascending: false });
    return (data || []).map(mapContentFromDB);
  },

  async addContent(item) {
    if (!this._userId) {
      const arr = getArr('ccos_content');
      item.id = item.id || genId();
      arr.push(item);
      setArr('ccos_content', arr);
      return { data: item };
    }
    const { data, error } = await supabase
      .from('content_items')
      .insert(mapContentToDB(item, this._userId))
      .select()
      .single();
    return { data: data ? mapContentFromDB(data) : null, error };
  },

  async updateContent(id, updates) {
    if (!this._userId) {
      const arr = getArr('ccos_content');
      const idx = arr.findIndex(i => i.id === id);
      if (idx >= 0) { Object.assign(arr[idx], updates); setArr('ccos_content', arr); }
      return { data: arr[idx] };
    }
    const dbUpdates = {};
    if (updates.idea !== undefined) dbUpdates.title = updates.idea;
    if (updates.platform !== undefined) dbUpdates.platform = updates.platform;
    if (updates.pillar !== undefined) dbUpdates.pillar = updates.pillar;
    if (updates.format !== undefined) dbUpdates.format = updates.format;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.postDate !== undefined) dbUpdates.publish_date = updates.postDate || null;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    const { data, error } = await supabase
      .from('content_items')
      .update(dbUpdates)
      .eq('id', id)
      .eq('user_id', this._userId)
      .select()
      .single();
    return { data: data ? mapContentFromDB(data) : null, error };
  },

  async deleteContent(id) {
    if (!this._userId) {
      const arr = getArr('ccos_content').filter(i => i.id !== id);
      setArr('ccos_content', arr);
      return { error: null };
    }
    return await supabase
      .from('content_items')
      .delete()
      .eq('id', id)
      .eq('user_id', this._userId);
  },

  // ---- CONTENT ANALYSES ----
  async getAnalyses() {
    if (!this._userId) return getArr('ccos_analyses');
    const { data } = await supabase
      .from('content_analyses')
      .select('*')
      .eq('user_id', this._userId)
      .order('created_at', { ascending: false });
    return (data || []).map(mapAnalysisFromDB);
  },

  async addAnalysis(analysis) {
    if (!this._userId) {
      const arr = getArr('ccos_analyses');
      analysis.id = analysis.id || genId();
      arr.push(analysis);
      setArr('ccos_analyses', arr);
      return { data: analysis };
    }
    const { data, error } = await supabase
      .from('content_analyses')
      .insert({
        user_id: this._userId,
        content_type: analysis.type,
        niche: analysis.niche,
        metrics: analysis.metrics || {},
        analysis_data: analysis.categories || {},
        concept: analysis.concept || {}
      })
      .select()
      .single();
    return { data: data ? mapAnalysisFromDB(data) : null, error };
  },

  async deleteAnalysis(id) {
    if (!this._userId) {
      const arr = getArr('ccos_analyses').filter(i => i.id !== id);
      setArr('ccos_analyses', arr);
      return { error: null };
    }
    return await supabase
      .from('content_analyses')
      .delete()
      .eq('id', id)
      .eq('user_id', this._userId);
  },

  // ---- PERFORMANCE ENTRIES ----
  async getPerformance() {
    if (!this._userId) return getArr('ccos_performance');
    const { data } = await supabase
      .from('performance_entries')
      .select('*')
      .eq('user_id', this._userId)
      .order('entry_date', { ascending: true });
    return (data || []).map(mapPerfFromDB);
  },

  async addPerformance(entry) {
    if (!this._userId) {
      const arr = getArr('ccos_performance');
      entry.id = entry.id || genId();
      arr.push(entry);
      setArr('ccos_performance', arr);
      return { data: entry };
    }
    const { data, error } = await supabase
      .from('performance_entries')
      .insert({
        user_id: this._userId,
        platform: entry.platform,
        followers: parseInt(entry.followers) || 0,
        views: parseInt(entry.views) || 0,
        likes: parseInt(entry.likes) || 0,
        comments: parseInt(entry.comments) || 0,
        saves: parseInt(entry.saves) || 0,
        entry_date: entry.date || new Date().toISOString().split('T')[0]
      })
      .select()
      .single();
    return { data: data ? mapPerfFromDB(data) : null, error };
  },

  async deletePerformance(id) {
    if (!this._userId) {
      const arr = getArr('ccos_performance').filter(i => i.id !== id);
      setArr('ccos_performance', arr);
      return { error: null };
    }
    return await supabase
      .from('performance_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', this._userId);
  },

  // ---- QUARTERLY PLANS ----
  async getQuarterlyPlan(quarter, year) {
    if (!this._userId) return getObj('ccos_quarterly');
    const { data } = await supabase
      .from('quarterly_plans')
      .select('*')
      .eq('user_id', this._userId)
      .eq('quarter', quarter)
      .eq('year', year)
      .single();
    return data ? (data.goals || {}) : {};
  },

  async saveQuarterlyPlan(quarter, year, goals) {
    if (!this._userId) { setObj('ccos_quarterly', goals); return { data: goals }; }
    const { data, error } = await supabase
      .from('quarterly_plans')
      .upsert({
        user_id: this._userId,
        quarter,
        year,
        goals
      }, { onConflict: 'user_id,quarter,year' })
      .select()
      .single();
    return { data, error };
  },

  // ---- REVENUE ENTRIES ----
  async getRevenue() {
    if (!this._userId) return getArr('ccos_monetization');
    const { data } = await supabase
      .from('revenue_entries')
      .select('*')
      .eq('user_id', this._userId)
      .order('entry_date', { ascending: false });
    return (data || []).map(mapRevenueFromDB);
  },

  async addRevenue(entry) {
    if (!this._userId) {
      const arr = getArr('ccos_monetization');
      entry.id = entry.id || genId();
      arr.push(entry);
      setArr('ccos_monetization', arr);
      return { data: entry };
    }
    const { data, error } = await supabase
      .from('revenue_entries')
      .insert({
        user_id: this._userId,
        stream: entry.stream,
        amount: parseFloat(entry.amount) || 0,
        entry_date: entry.date || new Date().toISOString().split('T')[0],
        notes: entry.notes || ''
      })
      .select()
      .single();
    return { data: data ? mapRevenueFromDB(data) : null, error };
  },

  async deleteRevenue(id) {
    if (!this._userId) {
      const arr = getArr('ccos_monetization').filter(i => i.id !== id);
      setArr('ccos_monetization', arr);
      return { error: null };
    }
    return await supabase
      .from('revenue_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', this._userId);
  },

  // ---- WEEKLY FOCUS ----
  async getFocus() {
    if (!this._userId) return getStr('ccos_focus');
    const weekStart = getWeekStart();
    const { data } = await supabase
      .from('weekly_focus')
      .select('focus_text')
      .eq('user_id', this._userId)
      .eq('week_start', weekStart)
      .single();
    return data?.focus_text || '';
  },

  async saveFocus(text) {
    if (!this._userId) { setStr('ccos_focus', text); return; }
    const weekStart = getWeekStart();
    await supabase
      .from('weekly_focus')
      .upsert({
        user_id: this._userId,
        focus_text: text,
        week_start: weekStart
      }, { onConflict: 'user_id,week_start' });
  },

  // ---- WEEKLY REVIEWS ----
  async getReview() {
    if (!this._userId) return getObj('ccos_review');
    const weekStart = getWeekStart();
    const { data } = await supabase
      .from('weekly_reviews')
      .select('review_data')
      .eq('user_id', this._userId)
      .eq('week_start', weekStart)
      .single();
    return data?.review_data || {};
  },

  async saveReview(reviewData) {
    if (!this._userId) { setObj('ccos_review', reviewData); return; }
    const weekStart = getWeekStart();
    await supabase
      .from('weekly_reviews')
      .upsert({
        user_id: this._userId,
        review_data: reviewData,
        week_start: weekStart
      }, { onConflict: 'user_id,week_start' });
  },

  // ---- PLATFORM CONNECTIONS ----
  async getConnections() {
    if (!this._userId) return JSON.parse(localStorage.getItem('ccos_connections') || '[]');
    const { data } = await supabase
      .from('platform_connections')
      .select('id, platform, platform_username, status, last_synced_at, metadata, token_expires_at')
      .eq('user_id', this._userId);
    return data || [];
  },

  async claimConnection(claimToken) {
    // After OAuth callback, claim the connection for the current user
    if (!this._userId) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('platform_connections')
      .update({ user_id: this._userId, claim_token: null })
      .eq('claim_token', claimToken)
      .select()
      .single();
    return { data, error };
  },

  async disconnectPlatform(connectionId) {
    if (!this._userId) return;
    await supabase
      .from('platform_connections')
      .update({ status: 'disconnected', access_token: null, page_access_token: null })
      .eq('id', connectionId)
      .eq('user_id', this._userId);
  },

  async syncInstagram(connectionId) {
    const resp = await fetch('/api/sync/instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: this._userId })
    });
    return await resp.json();
  },

  async syncTikTok(connectionId) {
    const resp = await fetch('/api/sync/tiktok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: this._userId })
    });
    return await resp.json();
  },

  async syncYouTube(connectionId) {
    const resp = await fetch('/api/sync/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: this._userId })
    });
    return await resp.json();
  },

    // ---- BULK EXPORT / IMPORT ----
  async exportAll() {
    return {
      content: await this.getContent(),
      analyses: await this.getAnalyses(),
      performance: await this.getPerformance(),
      revenue: await this.getRevenue(),
      profile: await this.getProfile(),
      focus: await this.getFocus(),
      review: await this.getReview(),
      exportedAt: new Date().toISOString(),
      version: 'v2-supabase'
    };
  }
};

// ============================================================
// DATA MAPPERS — translate between front-end shape & DB shape
// ============================================================
function mapContentToDB(item, userId) {
  return {
    user_id: userId,
    title: item.idea || item.title,
    platform: item.platform || null,
    pillar: item.pillar || null,
    format: item.format || null,
    status: (item.status || 'idea').toLowerCase(),
    publish_date: item.postDate || null,
    due_date: item.dueDate || null,
    notes: item.notes || null
  };
}

function mapContentFromDB(row) {
  return {
    id: row.id,
    idea: row.title,
    platform: row.platform || '',
    pillar: row.pillar || '',
    format: row.format || '',
    status: capitalize(row.status || 'idea'),
    postDate: row.publish_date || '',
    dueDate: row.due_date || '',
    notes: row.notes || '',
    created_at: row.created_at
  };
}

function mapAnalysisFromDB(row) {
  return {
    id: row.id,
    type: row.content_type,
    niche: row.niche,
    metrics: row.metrics || {},
    categories: row.analysis_data || {},
    concept: row.concept || {},
    created_at: row.created_at
  };
}

function mapPerfFromDB(row) {
  return {
    id: row.id,
    platform: row.platform || '',
    followers: row.followers || 0,
    views: row.views || 0,
    likes: row.likes || 0,
    comments: row.comments || 0,
    saves: row.saves || 0,
    date: row.entry_date || '',
    created_at: row.created_at
  };
}

function mapRevenueFromDB(row) {
  return {
    id: row.id,
    stream: row.stream,
    amount: row.amount || 0,
    date: row.entry_date || '',
    notes: row.notes || '',
    created_at: row.created_at
  };
}

// ============================================================
// UTILITY HELPERS
// ============================================================
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function detectStageFromCount(followers) {
  if (followers >= 100000) return 'advanced';
  if (followers >= 25000) return 'established';
  if (followers >= 5000) return 'emerging';
  if (followers >= 1000) return 'growing';
  return 'starter';
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

// localStorage helpers (kept for fallback)
function getArr(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function setArr(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function getStr(key) { return localStorage.getItem(key) || ''; }
function setStr(key, val) { localStorage.setItem(key, val); }
function getObj(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
function setObj(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
