/* ============================================================
   CREATOR CONTENT OS v2 — Application Script
   Brand: Collegare Studio
   Data syncs to Supabase when authenticated, falls back to
   localStorage in local-only mode.
   Includes: Auth flow, Strategy Intelligence Engine, Content
   Analyzer, Monetization, Quarterly Planning, Chart.js
   ============================================================ */

// ---- Storage Keys ----
const CONTENT_KEY = 'ccos_content';
const FOCUS_KEY = 'ccos_focus';
const REVIEW_KEY = 'ccos_review'
const ANALYSES_KEY = 'ccos_analyses';
const PERF_KEY = 'ccos_performance';
const SETTINGS_KEY = 'ccos_settings';
const QUARTERLY_KEY = 'ccos_quarterly';
const MONET_KEY = 'ccos_monetization';

// ---- Data Migration (v1 → v2) ----
['creatorContentOS_content','creatorContentOS_focus','creatorContentOS_review','creatorContentOS_analyses','creatorContentOS_performance'].forEach((oldKey, i) => {
  const newKeys = [CONTENT_KEY, FOCUS_KEY, REVIEW_KEY, ANALYSES_KEY, PERF_KEY];
  if (localStorage.getItem(oldKey) && !localStorage.getItem(newKeys[i])) {
    localStorage.setItem(newKeys[i], localStorage.getItem(oldKey));
  }
});

// ============================================================
// AUTH FLOW
// ============================================================
let isAuthenticated = false;
let currentUser = null;

async function initAuth() {
  const authScreen = document.getElementById('authScreen');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const resetForm = document.getElementById('resetForm');

  // Check if Supabase is configured (key isn't the placeholder)
  const supabaseConfigured = typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE';

  if (!supabaseConfigured) {
    // No Supabase configured — skip auth, run in local mode
    authScreen.classList.add('hidden');
    showLocalModeBadge();
    return;
  }

  // Check for existing session
  const session = await getSession();
  if (session?.user) {
    currentUser = session.user;
    isAuthenticated = true;
    await syncFromSupabase();
    authScreen.classList.add('hidden');
    showAuthIndicator(session.user.email);
    return;
  }

  // Show auth screen
  authScreen.classList.remove('hidden');

  // Form switching
  document.getElementById('showSignup').addEventListener('click', () => {
    loginForm.style.display = 'none'; signupForm.style.display = 'block'; resetForm.style.display = 'none';
  });
  document.getElementById('showLogin').addEventListener('click', () => {
    loginForm.style.display = 'block'; signupForm.style.display = 'none'; resetForm.style.display = 'none';
  });
  document.getElementById('showReset').addEventListener('click', () => {
    loginForm.style.display = 'none'; signupForm.style.display = 'none'; resetForm.style.display = 'block';
  });
  document.getElementById('showLoginFromReset').addEventListener('click', () => {
    loginForm.style.display = 'block'; signupForm.style.display = 'none'; resetForm.style.display = 'none';
  });

  // Skip auth (local only mode)
  document.getElementById('skipAuthBtn').addEventListener('click', () => {
    authScreen.classList.add('hidden');
    showLocalModeBadge();
  });

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    document.getElementById('loginBtn').disabled = true;
    const { data, error } = await signIn(email, password);
    document.getElementById('loginBtn').disabled = false;
    if (error) { errEl.textContent = error.message; return; }
    currentUser = data.user;
    isAuthenticated = true;
    await syncFromSupabase();
    authScreen.classList.add('hidden');
    showAuthIndicator(email);
    init();
  });

  // Signup
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const errEl = document.getElementById('signupError');
    errEl.textContent = '';
    document.getElementById('signupBtn').disabled = true;
    const { data, error } = await signUp(email, password, name);
    document.getElementById('signupBtn').disabled = false;
    if (error) { errEl.textContent = error.message; return; }
    if (data.user && !data.session) {
      errEl.style.color = '#2d6a4f';
      errEl.textContent = 'Check your email for a confirmation link, then sign in.';
      return;
    }
    currentUser = data.user;
    isAuthenticated = true;
    // Migrate any existing localStorage data to Supabase
    await migrateLocalToSupabase();
    authScreen.classList.add('hidden');
    showAuthIndicator(email);
    init();
  });

  // Password reset
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    const errEl = document.getElementById('resetError');
    const successEl = document.getElementById('resetSuccess');
    errEl.textContent = ''; successEl.textContent = '';
    const { error } = await resetPassword(email);
    if (error) { errEl.textContent = error.message; return; }
    successEl.textContent = 'Reset link sent! Check your inbox.';
  });

  // Listen for auth state changes (e.g. email confirmation redirect)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      isAuthenticated = true;
      await syncFromSupabase();
      authScreen.classList.add('hidden');
      showAuthIndicator(session.user.email);
      init();
    }
  });
}

function showAuthIndicator(email) {
  const tmpl = document.getElementById('authIndicatorTemplate');
  if (!tmpl) return;
  const clone = tmpl.content.cloneNode(true);
  const emailEl = clone.querySelector('#authUserEmail');
  if (emailEl) emailEl.textContent = email;
  const signOutBtn = clone.querySelector('#signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await signOut();
      isAuthenticated = false;
      currentUser = null;
      window.location.reload();
    });
  }
  const sidebar = document.getElementById('sidebar');
  const footer = sidebar.querySelector('.sidebar-footer-text');
  if (footer) footer.parentElement.insertBefore(clone, footer);
  else sidebar.appendChild(clone);
}

function showLocalModeBadge() {
  const sidebar = document.getElementById('sidebar');
  const badge = document.createElement('div');
  badge.className = 'local-mode-badge';
  badge.innerHTML = '<i class="ph ph-desktop-tower"></i> <span>Local mode — data saved on this device only</span>';
  const footer = sidebar.querySelector('.sidebar-footer-text');
  if (footer) footer.parentElement.insertBefore(badge, footer);
  else sidebar.appendChild(badge);
}

// Pull all data from Supabase into localStorage (render cache)
async function syncFromSupabase() {
  if (!isAuthenticated) return;
  try {
    const content = await DB.getContent();
    if (content.length) setArr(CONTENT_KEY, content);

    const analyses = await DB.getAnalyses();
    if (analyses.length) setArr(ANALYSES_KEY, analyses);

    const perf = await DB.getPerformance();
    if (perf.length) setArr(PERF_KEY, perf);

    const revenue = await DB.getRevenue();
    if (revenue.length) setArr(MONET_KEY, revenue);

    const profile = await DB.getProfile();
    if (profile && profile.display_name) {
      setObj(SETTINGS_KEY, {
        name: profile.display_name,
        niche: profile.niche || '',
        followers: profile.follower_count || 0,
        platforms: profile.platforms || [],
        stage: profile.creator_stage || ''
      });
    }

    const focus = await DB.getFocus();
    if (focus) setStr(FOCUS_KEY, focus);

    const review = await DB.getReview();
    if (review && Object.keys(review).length) setObj(REVIEW_KEY, review);
  } catch (err) {
    console.warn('Supabase sync failed, using local data:', err);
  }
}

// On signup, push existing localStorage data to Supabase
async function migrateLocalToSupabase() {
  if (!isAuthenticated) return;
  try {
    const content = getArr(CONTENT_KEY);
    for (const item of content) { await DB.addContent(item); }
    const analyses = getArr(ANALYSES_KEY);
    for (const a of analyses) { await DB.addAnalysis(a); }
    const perf = getArr(PERF_KEY);
    for (const p of perf) { await DB.addPerformance(p); }
    const revenue = getArr(MONET_KEY);
    for (const r of revenue) { await DB.addRevenue(r); }
    const settings = getObj(SETTINGS_KEY);
    if (settings.name) await DB.saveProfile(settings);
    const focus = getStr(FOCUS_KEY);
    if (focus) await DB.saveFocus(focus);
  } catch (err) {
    console.warn('Migration to Supabase failed:', err);
  }
}

// Helper: push a mutation to Supabase in the background
function syncToCloud(fn) {
  if (isAuthenticated) { fn().catch(err => console.warn('Cloud sync error:', err)); }
}

// ============================================================
// UTILITIES
// ============================================================
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
function getArr(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function setArr(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function getStr(key) { return localStorage.getItem(key) || ''; }
function setStr(key, val) { localStorage.setItem(key, val); }
function getObj(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
function setObj(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function fmtDate(s) { if (!s) return ''; return new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function parseNum(v) { return parseInt(String(v||'0').replace(/[^0-9]/g,''))||0; }
function toast(msg, type='success') {
  const c=$('toastContainer'), t=document.createElement('div');
  t.className=`toast ${type}`;
  const icon = type==='success'?'ph-check-circle':type==='error'?'ph-warning-circle':'ph-info';
  t.innerHTML=`<i class="ph ${icon}"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function switchTab(tabId) {
  $$('.nav-item').forEach(n=>n.classList.remove('active'));
  $$('.tab-content').forEach(t=>t.classList.remove('active'));
  const btn=document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  const tab=$(`tab-${tabId}`);
  if(btn)btn.classList.add('active');
  if(tab)tab.classList.add('active');
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('open');
  // Render tab-specific content on switch
  if(tabId==='intelligence') renderIntelligence();
  if(tabId==='performance') renderPerformance();
  if(tabId==='monetization') renderMonetization();
  if(tabId==='quarterly') renderQuarterly();
}
$$('.nav-item').forEach(item=>item.addEventListener('click',()=>switchTab(item.dataset.tab)));
$('mobileMenuBtn').addEventListener('click',()=>{$('sidebar').classList.toggle('open');$('sidebarOverlay').classList.toggle('open');});
$('sidebarOverlay').addEventListener('click',()=>{$('sidebar').classList.remove('open');$('sidebarOverlay').classList.remove('open');});

// ============================================================
// DASHBOARD
// ============================================================
function updateDashboard() {
  const items=getArr(CONTENT_KEY);
  const now=new Date(), weekAgo=new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
  const scheduled=items.filter(i=>i.status==='Scheduled').length;
  const progress=items.filter(i=>['Scripting','Filming','Editing'].includes(i.status)).length;
  const posted=items.filter(i=>{if(i.status!=='Posted')return false;if(!i.postDate)return true;return new Date(i.postDate+'T00:00:00')>=weekAgo;}).length;
  const ideas=items.filter(i=>i.status==='Idea').length;
  const top=items.filter(i=>i.status==='Reviewing'||(i.review&&i.review.length>0)).length;
  $('stat-scheduled').textContent=scheduled;
  $('stat-progress').textContent=progress;
  $('stat-posted').textContent=posted;
  $('stat-ideas').textContent=ideas;
  $('stat-top').textContent=top;

  // Strategy Score
  renderStrategyScore(items);

  // Platform overview
  renderPlatformOverview();

  // Workflow mini
  renderWorkflowMini();

  // Recent
  const rc=$('recent-content'), re=$('recent-empty');
  const recent=items.slice(-5).reverse();
  if(!recent.length){rc.innerHTML='';re.style.display='block';}
  else{re.style.display='none';rc.innerHTML=recent.map(i=>`<div class="recent-item"><div class="recent-item-left"><span class="status-badge status-${i.status.toLowerCase()}">${i.status}</span><span class="recent-item-title">${i.idea}</span></div><span class="recent-item-meta">${i.platform}${i.postDate?' · '+fmtDate(i.postDate):''}</span></div>`).join('');}

  loadFocus();
}

function renderStrategyScore(items) {
  const canvas=$('scoreRingCanvas'), numEl=$('scoreRingNumber'), descEl=$('scoreDescription'), factorsEl=$('scoreFactors');
  if(!items.length){numEl.textContent='—';descEl.textContent='Add content to your planner and track performance to generate your strategy score.';factorsEl.innerHTML='';drawScoreRing(canvas,0);return;}
  // Calculate score (0-100) based on multiple factors
  let score=0;const factors=[];
  // 1. Content volume (up to 20 pts)
  const vol=Math.min(items.length/20,1)*20; score+=vol;
  factors.push({label:`${items.length} content items`,status:items.length>=10?'good':items.length>=5?'warn':'weak'});
  // 2. Pillar diversity (up to 20 pts)
  const pillars=new Set(items.filter(i=>i.pillar).map(i=>i.pillar));
  const pillarScore=Math.min(pillars.size/4,1)*20; score+=pillarScore;
  factors.push({label:`${pillars.size} content pillars`,status:pillars.size>=4?'good':pillars.size>=2?'warn':'weak'});
  // 3. Platform diversity (up to 15 pts)
  const platforms=new Set(items.map(i=>i.platform).filter(Boolean));
  const platScore=Math.min(platforms.size/2,1)*15; score+=platScore;
  factors.push({label:`${platforms.size} platforms`,status:platforms.size>=2?'good':'warn'});
  // 4. Pipeline health (up to 20 pts)
  const hasIdeas=items.some(i=>i.status==='Idea');
  const hasProgress=items.some(i=>['Scripting','Filming','Editing'].includes(i.status));
  const hasPosted=items.some(i=>i.status==='Posted');
  const pipeScore=(hasIdeas?7:0)+(hasProgress?7:0)+(hasPosted?6:0); score+=pipeScore;
  factors.push({label:'Pipeline active',status:pipeScore>=14?'good':pipeScore>=7?'warn':'weak'});
  // 5. Performance tracking (up to 15 pts)
  const perf=getArr(PERF_KEY);
  const perfScore=Math.min(perf.length/4,1)*15; score+=perfScore;
  factors.push({label:`${perf.length} perf entries`,status:perf.length>=4?'good':perf.length>=1?'warn':'weak'});
  // 6. Consistency (up to 10 pts)
  const posted=items.filter(i=>i.status==='Posted');
  const consistency=Math.min(posted.length/8,1)*10; score+=consistency;

  score=Math.round(score);
  numEl.textContent=score;
  descEl.textContent=score>=80?'Your content strategy is strong. Keep this momentum going.':score>=50?'Good foundation. Focus on diversifying your content mix and tracking performance consistently.':'Early stages. Keep adding content, try different pillars and platforms, and start tracking performance.';
  factorsEl.innerHTML=factors.map(f=>`<span class="score-factor ${f.status}">${f.label}</span>`).join('');
  drawScoreRing(canvas,score);
}

function drawScoreRing(canvas,score) {
  const ctx=canvas.getContext('2d');
  const size=100, center=size/2, radius=38, lineWidth=8;
  ctx.clearRect(0,0,size,size);
  // Background ring
  ctx.beginPath();ctx.arc(center,center,radius,0,2*Math.PI);ctx.strokeStyle='#e8e5e0';ctx.lineWidth=lineWidth;ctx.stroke();
  // Score ring
  if(score>0){
    const color=score>=70?'#2d6a4f':score>=40?'#b8860b':'#a4243b';
    const angle=(score/100)*2*Math.PI-Math.PI/2;
    ctx.beginPath();ctx.arc(center,center,radius,-Math.PI/2,angle);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.stroke();
  }
}

function renderPlatformOverview() {
  const perf=getArr(PERF_KEY);
  const container=$('platformMiniCards');
  const platforms=['Instagram','TikTok','YouTube'];
  const colors={Instagram:{bg:'#f3e8f5',color:'#8b3baf',icon:'ph-instagram-logo'},TikTok:{bg:'#e8f5f5',color:'#000',icon:'ph-tiktok-logo'},YouTube:{bg:'#fce8e8',color:'#c4302b',icon:'ph-youtube-logo'}};
  container.innerHTML=platforms.map(p=>{
    const entries=perf.filter(e=>e.platform===p);
    const latest=entries[entries.length-1];
    const c=colors[p];
    return `<div class="platform-mini"><div class="platform-mini-icon" style="background:${c.bg};color:${c.color};"><i class="ph ${c.icon}"></i></div><div class="platform-mini-info"><strong>${p}</strong><span>${latest?latest.followers+' followers':'Not tracked yet'}</span></div></div>`;
  }).join('');
}

// Workflow mini
const WORKFLOW_STEPS=['Brainstorm','Select content','Align to strategy','Script hooks','Batch film','Edit & polish','Write captions','Schedule','Post & engage','Review performance','Repurpose winners','Plan next week'];
function renderWorkflowMini(){$('workflowMiniSteps').innerHTML=WORKFLOW_STEPS.map((s,i)=>`<div class="workflow-mini-step"><span class="workflow-mini-num">${i+1}</span>${s}</div>`).join('');}

// Focus
function loadFocus(){const f=getStr(FOCUS_KEY);const ia=document.querySelector('.focus-input-area');const d=$('focusDisplay');const t=$('focusText');if(f){ia.style.display='none';d.style.display='flex';t.textContent=f;}else{ia.style.display='flex';d.style.display='none';}}
$('saveFocusBtn').addEventListener('click',()=>{const v=$('weeklyFocusInput').value.trim();if(v){setStr(FOCUS_KEY,v);loadFocus();toast('Focus saved');syncToCloud(()=>DB.saveFocus(v));}});
$('editFocusBtn').addEventListener('click',()=>{$('weeklyFocusInput').value=getStr(FOCUS_KEY);document.querySelector('.focus-input-area').style.display='flex';$('focusDisplay').style.display='none';});
$('expandWorkflowBtn')?.addEventListener('click',()=>{/* Could open a modal with full workflow — keeping nav simple */toast('Full workflow details are in the Weekly Workflow section of your Strategy Intelligence tab.');});

// ============================================================
// CONTENT PLANNER (preserved from v1, enhanced)
// ============================================================
let deleteTargetId=null, deleteTargetType='content';

function renderContentGrid(){
  const items=getArr(CONTENT_KEY);
  const search=$('plannerSearch').value.toLowerCase();
  const platform=$('filterPlatform').value;
  const status=$('filterContentStatus').value;
  const pillar=$('filterPillar').value;
  let filtered=items.filter(i=>{
    if(search&&!i.idea.toLowerCase().includes(search))return false;
    if(platform!=='all'&&i.platform!==platform)return false;
    if(status!=='all'&&i.status!==status)return false;
    if(pillar!=='all'&&i.pillar!==pillar)return false;
    return true;
  });
  // Pipeline stats
  const ps=$('pipelineStats');
  const statusCounts={};items.forEach(i=>{statusCounts[i.status]=(statusCounts[i.status]||0)+1;});
  ps.innerHTML=Object.entries(statusCounts).map(([s,c])=>`<span class="pipeline-stat">${s}: ${c}</span>`).join('');

  const grid=$('content-grid'), empty=$('content-empty');
  if(!filtered.length){grid.innerHTML='';empty.style.display='block';
    if(items.length>0&&(search||platform!=='all'||status!=='all'||pillar!=='all')){empty.querySelector('p').textContent='No content matches your filters.';const b=empty.querySelector('button');if(b)b.style.display='none';}
    else{empty.querySelector('p').textContent='No content in your pipeline yet.';const b=empty.querySelector('button');if(b)b.style.display='inline-flex';}
  }else{
    empty.style.display='none';
    grid.innerHTML=filtered.map(item=>{
      const sc='status-'+item.status.toLowerCase();
      let tags='';
      if(item.platform)tags+=`<span class="tag tag-platform">${item.platform}</span>`;
      if(item.pillar)tags+=`<span class="tag tag-pillar">${item.pillar}</span>`;
      if(item.format)tags+=`<span class="tag tag-format">${item.format}</span>`;
      if(item.contentType&&item.contentType!=='Organic')tags+=`<span class="tag tag-brand">${item.contentType}</span>`;
      let dates='';
      if(item.filmDate)dates+=`<span><i class="ph ph-video-camera"></i> ${fmtDate(item.filmDate)}</span>`;
      if(item.editDate)dates+=`<span><i class="ph ph-scissors"></i> ${fmtDate(item.editDate)}</span>`;
      if(item.postDate)dates+=`<span><i class="ph ph-paper-plane-tilt"></i> ${fmtDate(item.postDate)}</span>`;
      return `<div class="content-card"><div class="content-card-top"><span class="content-card-title">${item.idea}</span><div class="content-card-actions"><button class="edit-btn" onclick="editContent('${item.id}')" title="Edit"><i class="ph ph-pencil-simple"></i></button><button class="delete-btn" onclick="confirmDelete('${item.id}','content')" title="Delete"><i class="ph ph-trash"></i></button></div></div><div class="content-card-tags"><span class="status-badge ${sc}">${item.status}</span>${tags}</div>${dates?`<div class="content-card-dates">${dates}</div>`:''}${item.cta?`<div class="content-card-meta"><strong>CTA:</strong> ${item.cta}</div>`:''}${item.goal?`<div class="content-card-meta"><strong>Goal:</strong> ${item.goal}</div>`:''}</div>`;
    }).join('');
  }
}

['plannerSearch'].forEach(id=>$(id).addEventListener('input',renderContentGrid));
['filterPlatform','filterContentStatus','filterPillar'].forEach(id=>$(id).addEventListener('change',renderContentGrid));

// Content Modal
const contentOverlay=$('contentModalOverlay'), contentForm=$('contentForm');
function openContentModal(data=null){
  contentForm.reset();$('contentId').value='';$('contentModalTitle').textContent=data?'Edit Content':'Add Content';
  if(data){$('contentId').value=data.id;['contentIdea','contentPlatform','contentPillar','contentGoal','contentFormat','contentStatus','contentType','contentFilmDate','contentEditDate','contentPostDate','contentCTA','contentHookStatus','contentCaptionStatus','contentRepurpose','contentReview','contentTakeaway'].forEach(fld=>{const el=$(fld);if(el){const key=fld.replace('content','');const k=key.charAt(0).toLowerCase()+key.slice(1);el.value=data[k]||data[fld.replace('content','').replace(/^./,c=>c.toLowerCase())]||'';}});}
  contentOverlay.classList.add('open');
}
function closeContentModal(){contentOverlay.classList.remove('open');}
$('addContentBtn').addEventListener('click',()=>openContentModal());
$('addFirstContent')?.addEventListener('click',()=>openContentModal());
$('contentModalClose').addEventListener('click',closeContentModal);
$('contentModalCancel').addEventListener('click',closeContentModal);
contentOverlay.addEventListener('click',e=>{if(e.target===contentOverlay)closeContentModal();});

contentForm.addEventListener('submit',e=>{
  e.preventDefault();
  const items=getArr(CONTENT_KEY), id=$('contentId').value;
  const entry={id:id||genId(),idea:$('contentIdea').value.trim(),platform:$('contentPlatform').value,pillar:$('contentPillar').value,goal:$('contentGoal').value,format:$('contentFormat').value,status:$('contentStatus').value,contentType:$('contentType').value,filmDate:$('contentFilmDate').value,editDate:$('contentEditDate').value,postDate:$('contentPostDate').value,cta:$('contentCTA').value.trim(),hookStatus:$('contentHookStatus').value,captionStatus:$('contentCaptionStatus').value,repurpose:$('contentRepurpose').value.trim(),review:$('contentReview').value.trim(),takeaway:$('contentTakeaway').value.trim(),createdAt:id?(items.find(i=>i.id===id)?.createdAt||new Date().toISOString()):new Date().toISOString()};
  if(id){const idx=items.findIndex(i=>i.id===id);if(idx!==-1)items[idx]=entry;}else items.push(entry);
  setArr(CONTENT_KEY,items);closeContentModal();renderContentGrid();updateDashboard();toast(id?'Content updated':'Content added');
  syncToCloud(() => id ? DB.updateContent(id, entry) : DB.addContent(entry));
});
window.editContent=function(id){const items=getArr(CONTENT_KEY);const item=items.find(i=>i.id===id);if(item)openContentModal(item);};

// Delete
const deleteOverlay=$('deleteOverlay');
window.confirmDelete=function(id,type='content'){deleteTargetId=id;deleteTargetType=type;deleteOverlay.classList.add('open');};
$('deleteClose').addEventListener('click',()=>deleteOverlay.classList.remove('open'));
$('deleteCancelBtn').addEventListener('click',()=>deleteOverlay.classList.remove('open'));
$('deleteConfirmBtn').addEventListener('click',()=>{
  if(!deleteTargetId)return;
  const keyMap={content:CONTENT_KEY,analysis:ANALYSES_KEY,perf:PERF_KEY,monet:MONET_KEY};
  const key=keyMap[deleteTargetType]||CONTENT_KEY;
  const delId=deleteTargetId, delType=deleteTargetType;
  let data=getArr(key);data=data.filter(i=>i.id!==delId);setArr(key,data);
  deleteTargetId=null;deleteOverlay.classList.remove('open');
  renderContentGrid();updateDashboard();renderSavedAnalyses();renderPerformance();renderMonetization();
  toast('Item deleted');
  syncToCloud(() => {
    if(delType==='content') return DB.deleteContent(delId);
    if(delType==='analysis') return DB.deleteAnalysis(delId);
    if(delType==='perf') return DB.deletePerformance(delId);
    if(delType==='monet') return DB.deleteRevenue(delId);
    return Promise.resolve();
  });
});

// ============================================================
// STRATEGY INTELLIGENCE ENGINE
// ============================================================
function renderIntelligence(){
  const items=getArr(CONTENT_KEY), perf=getArr(PERF_KEY), settings=getObj(SETTINGS_KEY);

  // Creator Profile
  const profileGrid=$('profileGrid');
  const totalContent=items.length;
  const platforms=[...new Set(items.map(i=>i.platform).filter(Boolean))];
  const primaryPlatform=settings.platform||getMostCommon(items.map(i=>i.platform))||'Not set';
  const latestPerf=perf[perf.length-1];
  const followers=latestPerf?latestPerf.followers:'—';
  const stage=settings.stage||detectStage(followers);
  const niche=settings.niche||'Not set';
  const topPillar=getMostCommon(items.filter(i=>i.pillar).map(i=>i.pillar))||'—';
  const topFormat=getMostCommon(items.filter(i=>i.format).map(i=>i.format))||'—';
  const postFreq=items.filter(i=>i.status==='Posted').length;

  profileGrid.innerHTML=[
    {label:'Creator Stage',value:stage,sub:followers!=='—'?followers+' followers':'Based on profile'},
    {label:'Primary Niche',value:niche,sub:''},
    {label:'Primary Platform',value:primaryPlatform,sub:platforms.length+' platforms tracked'},
    {label:'Total Content',value:totalContent,sub:postFreq+' posted'},
    {label:'Strongest Pillar',value:topPillar,sub:'Most used content pillar'},
    {label:'Top Format',value:topFormat,sub:'Most used format'},
  ].map(p=>`<div class="profile-item"><div class="profile-item-label">${p.label}</div><div class="profile-item-value">${p.value}</div>${p.sub?`<div class="profile-item-sub">${p.sub}</div>`:''}</div>`).join('');

  // Content Mix Chart
  renderContentMixChart(items);
  // Format Chart
  renderFormatChart(items);
  // Intelligence Cards
  renderIntelCards(items,perf,settings);
  // Review sections
  renderReviewMini();
}

function getMostCommon(arr){const counts={};arr.forEach(v=>{if(v)counts[v]=(counts[v]||0)+1;});let max=0,result='';Object.entries(counts).forEach(([k,v])=>{if(v>max){max=v;result=k;}});return result;}

function detectStage(followers){const n=parseNum(followers);if(n>=250000)return'Top Creator';if(n>=50000)return'Established';if(n>=10000)return'Rising Creator';if(n>=1000)return'Early Growth';return'Pre-launch';}

let contentMixChartInstance=null, formatChartInstance=null;
function renderContentMixChart(items){
  const ctx=$('contentMixChart');if(!ctx)return;
  if(contentMixChartInstance)contentMixChartInstance.destroy();
  const pillarCounts={};items.filter(i=>i.pillar).forEach(i=>{pillarCounts[i.pillar]=(pillarCounts[i.pillar]||0)+1;});
  const labels=Object.keys(pillarCounts), data=Object.values(pillarCounts);
  const colors=['#2d6a4f','#4a6fa5','#9b2948','#92660a','#6b1309','#1a7a6d'];
  const total=data.reduce((s,v)=>s+v,0);
  if(!total){$('mixAnalysis').innerHTML='<p style="color:var(--color-text-muted);font-size:13px;">Add content with pillars to see your content mix analysis.</p>';return;}
  contentMixChartInstance=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors.slice(0,labels.length),borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{family:'Be Vietnam Pro',size:12},padding:12}}}}});
  // Mix analysis text
  $('mixAnalysis').innerHTML=labels.map((l,i)=>{const pct=Math.round(data[i]/total*100);return `<div class="mix-item"><span class="mix-item-label">${l}</span><span class="mix-item-value">${pct}% (${data[i]} items)</span></div>`;}).join('');
}

function renderFormatChart(items){
  const ctx=$('formatChart');if(!ctx)return;
  if(formatChartInstance)formatChartInstance.destroy();
  const formatCounts={};items.filter(i=>i.format).forEach(i=>{formatCounts[i.format]=(formatCounts[i.format]||0)+1;});
  const labels=Object.keys(formatCounts), data=Object.values(formatCounts);
  if(!data.length){$('formatAnalysis').innerHTML='<p style="color:var(--color-text-muted);font-size:13px;">Add content with formats to see format analysis.</p>';return;}
  formatChartInstance=new Chart(ctx,{type:'bar',data:{labels,datasets:[{data,backgroundColor:'rgba(107,19,9,0.8)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{font:{family:'Be Vietnam Pro',size:11}}},x:{ticks:{font:{family:'Be Vietnam Pro',size:11}}}}}});
  $('formatAnalysis').innerHTML=labels.map((l,i)=>`<div class="mix-item"><span class="mix-item-label">${l}</span><span class="mix-item-value">${data[i]} items</span></div>`).join('');
}

function renderIntelCards(items,perf,settings){
  const grid=$('intelCardsGrid');
  const cards=[];
  const posted=items.filter(i=>i.status==='Posted');
  const pillars={}; items.filter(i=>i.pillar).forEach(i=>{pillars[i.pillar]=(pillars[i.pillar]||0)+1;});
  const formats={}; items.filter(i=>i.format).forEach(i=>{formats[i.format]=(formats[i.format]||0)+1;});
  const platformCounts={}; items.forEach(i=>{if(i.platform)platformCounts[i.platform]=(platformCounts[i.platform]||0)+1;});

  // Strongest pillars
  const sortedPillars=Object.entries(pillars).sort((a,b)=>b[1]-a[1]);
  if(sortedPillars.length){
    cards.push({icon:'ph-star',bg:'var(--color-success-bg)',color:'var(--color-success)',title:'Strongest Content Pillars',body:`Your most-used pillar is <strong>${sortedPillars[0][0]}</strong> with ${sortedPillars[0][1]} pieces.`,list:sortedPillars.slice(0,3).map(([p,c])=>`${p}: ${c} items`)});
  }

  // Weak pillars
  const allPillars=['Growth','Value','Lifestyle','Authority','Conversion','Brand'];
  const missing=allPillars.filter(p=>!pillars[p]);
  if(missing.length){
    cards.push({icon:'ph-warning',bg:'var(--color-warning-bg)',color:'var(--color-warning)',title:'Missing Content Pillars',body:`You have no content tagged under these pillars. A balanced strategy uses at least 4 pillars.`,list:missing.map(p=>`Add ${p} content to your mix`)});
  }

  // Format recommendations
  const sortedFormats=Object.entries(formats).sort((a,b)=>b[1]-a[1]);
  if(sortedFormats.length>=2){
    cards.push({icon:'ph-video-camera',bg:'var(--color-info-bg)',color:'var(--color-info)',title:'Format Insights',body:`Your go-to format is <strong>${sortedFormats[0][0]}</strong>. Consider testing more variety to see what resonates differently.`,list:sortedFormats.slice(0,4).map(([f,c])=>`${f}: ${c} items`)});
  }

  // Platform strategy
  const sortedPlatforms=Object.entries(platformCounts).sort((a,b)=>b[1]-a[1]);
  if(sortedPlatforms.length){
    cards.push({icon:'ph-devices',bg:'var(--color-accent-plum-bg)',color:'var(--color-accent-plum)',title:'Platform Strategy',body:sortedPlatforms.length===1?`You're focused on ${sortedPlatforms[0][0]}. Consider cross-posting to at least one more platform to diversify your reach.`:`You're active on ${sortedPlatforms.length} platforms. ${sortedPlatforms[0][0]} is your primary platform.`,list:sortedPlatforms.map(([p,c])=>`${p}: ${c} items`)});
  }

  // Post more of
  if(sortedPillars.length>=2){
    const weakest=sortedPillars[sortedPillars.length-1];
    cards.push({icon:'ph-arrow-fat-up',bg:'var(--color-accent-teal-bg)',color:'var(--color-accent-teal)',title:'Post More Of',body:`Your weakest active pillar is <strong>${weakest[0]}</strong> with only ${weakest[1]} items. Increasing this creates a more balanced strategy.`,list:[`Create 2-3 ${weakest[0]} posts this week`,`Pair ${weakest[0]} content with your strongest format`,`Test ${weakest[0]} content on your best platform`]});
  }

  // Stop doing
  const staleIdeas=items.filter(i=>i.status==='Idea'&&i.createdAt);
  if(staleIdeas.length>10){
    cards.push({icon:'ph-trash',bg:'var(--color-danger-bg)',color:'var(--color-danger)',title:'Clean Up Your Pipeline',body:`You have ${staleIdeas.length} ideas sitting in your bank. Review and archive ideas you won't use — a clean pipeline is a productive pipeline.`,list:['Archive ideas older than 30 days','Prioritize top 5 ideas for this week','Delete duplicates or outdated ideas']});
  }

  // Performance-based insights
  if(perf.length>=2){
    const latest=perf[perf.length-1], prev=perf[perf.length-2];
    const viewsChange=parseNum(latest.views)-parseNum(prev.views);
    cards.push({icon:'ph-chart-line-up',bg:'var(--color-accent-amber-bg)',color:'var(--color-accent-amber)',title:'Performance Trend',body:`Views ${viewsChange>=0?'increased':'decreased'} by ${Math.abs(viewsChange).toLocaleString()} since your last entry on ${latest.platform}.`,list:[`Latest: ${latest.views||'—'} views, ${latest.likes||'—'} likes`,`Previous: ${prev.views||'—'} views, ${prev.likes||'—'} likes`,latest.topPost?`Top post: ${latest.topPost}`:'Log your top post for better insights']});
  }

  // Brand strategy
  const brandContent=items.filter(i=>i.contentType==='Brand'||i.contentType==='Affiliate');
  cards.push({icon:'ph-handshake',bg:'var(--color-accent-rose-bg)',color:'var(--color-accent-rose)',title:'Brand Positioning',body:brandContent.length?`You have ${brandContent.length} brand/affiliate content items. Make sure brand content is no more than 15-20% of your feed.`:'You have no brand content tracked yet. Even without deals, creating brand-friendly content shows partners what collaboration looks like.',list:brandContent.length?['Keep brand content under 20% of total','Diversify brand categories','Track performance vs organic']:[`Create 1-2 "portfolio" posts this month`,'Tag content as Brand or Affiliate when relevant','Build a media kit with your best brand-style content']});

  grid.innerHTML=cards.map(c=>`<div class="intel-card"><div class="intel-card-icon" style="background:${c.bg};color:${c.color};"><i class="ph ${c.icon}"></i></div><div class="intel-card-title">${c.title}</div><div class="intel-card-body">${c.body}</div>${c.list?`<ul class="intel-card-list">${c.list.map(l=>`<li>${l}</li>`).join('')}</ul>`:''}</div>`).join('');
}

$('runIntelligenceBtn').addEventListener('click',()=>{renderIntelligence();toast('Insights generated');});

// Review Mini
const REVIEW_PROMPTS=[
  {icon:'ph-trophy',title:'What Performed Well',prompt:'Which posts exceeded expectations?'},
  {icon:'ph-arrow-down',title:'What Underperformed',prompt:'Which posts didn\'t land? Why?'},
  {icon:'ph-lightning',title:'Hooks That Worked',prompt:'What hook styles grabbed attention?'},
  {icon:'ph-play-circle',title:'Best Formats',prompt:'Which format drove the most engagement?'},
  {icon:'ph-chat-dots',title:'Engaging Topics',prompt:'What topics sparked conversation?'},
  {icon:'ph-arrows-clockwise',title:'What to Repeat',prompt:'What patterns are worth repeating?'},
  {icon:'ph-wrench',title:'What to Refine',prompt:'What almost worked but needs tweaking?'},
  {icon:'ph-scissors',title:'What to Cut',prompt:'What should you stop doing?'},
];
function renderReviewMini(){
  $('reviewSectionsMini').innerHTML=REVIEW_PROMPTS.map(r=>`<div class="review-mini-card"><h4><i class="ph ${r.icon}"></i> ${r.title}</h4><p>${r.prompt}</p></div>`).join('');
  $('reviewNotes').value=getStr(REVIEW_KEY);
}
$('saveReviewBtn').addEventListener('click',()=>{const rv=$('reviewNotes').value;setStr(REVIEW_KEY,rv);$('reviewSavedMsg').textContent='Saved';setTimeout(()=>$('reviewSavedMsg').textContent='',2000);toast('Review notes saved');syncToCloud(()=>DB.saveReview({notes:rv}));});

// ============================================================
// CONTENT ANALYZER (upgraded)
// ============================================================
const ANALYSIS_CATS=[
  {title:'Hook Analysis',icon:'ph-lightning',color:'var(--color-warning)',bg:'var(--color-warning-bg)',placeholder:'What was the hook? Why did it work? Question, bold statement, pattern interrupt, or curiosity gap?'},
  {title:'Caption & CTA Analysis',icon:'ph-text-aa',color:'var(--color-info)',bg:'var(--color-info-bg)',placeholder:'How was the caption structured? Story arc, list, question? What was the CTA and did it match the content goal?'},
  {title:'Tone & Voice',icon:'ph-microphone',color:'var(--color-accent-plum)',bg:'var(--color-accent-plum-bg)',placeholder:'Casual, authoritative, vulnerable, humorous? How did personality come through?'},
  {title:'Storytelling & Structure',icon:'ph-book-open',color:'var(--color-accent-sage)',bg:'var(--color-accent-sage-bg)',placeholder:'Narrative arc? Setup → tension → payoff? How was pacing managed?'},
  {title:'Visual & Production Quality',icon:'ph-camera',color:'var(--color-accent-rose)',bg:'var(--color-accent-rose-bg)',placeholder:'Lighting, framing, editing style, transitions, text overlays, music choice?'},
  {title:'Why It Likely Worked',icon:'ph-star',color:'var(--color-accent-amber)',bg:'var(--color-accent-amber-bg)',placeholder:'Core driver: relatability, timing, unique perspective, emotional resonance, production quality, trend leverage?'},
  {title:'Emotional & Structural Drivers',icon:'ph-heart',color:'var(--color-danger)',bg:'var(--color-danger-bg)',placeholder:'What emotion did it trigger? Aspiration, FOMO, curiosity, validation? What structural pattern drove engagement?'},
  {title:'Weak Points',icon:'ph-warning',color:'var(--color-text-muted)',bg:'#f0eee8',placeholder:'What could be stronger? CTA weak? Too long? Energy drop? Unclear value proposition?'},
  {title:'How to Elevate It',icon:'ph-arrow-up',color:'var(--color-success)',bg:'var(--color-success-bg)',placeholder:'If you were to create something similar, what would you add, remove, or change?'},
  {title:'Adapt Without Copying',icon:'ph-arrows-split',color:'var(--color-accent-teal)',bg:'var(--color-accent-teal-bg)',placeholder:'Extract the structure and strategy, not the words. How would you apply this approach in your own niche and voice?'},
];

$('runAnalysisBtn').addEventListener('click', async ()=>{
  const link=$('analyzerLink').value.trim();
  const platform=$('analyzerPlatform').value;
  const contentType=$('analyzerContentType').value;
  const niche=$('analyzerNiche').value.trim();
  const caption=$('analyzerCaption').value.trim();
  const views=$('analyzerViews').value.trim();
  const likes=$('analyzerLikes').value.trim();
  const comments=$('analyzerComments').value.trim();
  const saves=$('analyzerSaves').value.trim();
  const notes=$('analyzerNotes').value.trim();

  if(!link&&!caption){toast('Please provide a link or caption to analyze','error');return;}

  // ── AI-FIRST FLOW ──
  // Always try AI analysis first (with link OR caption). Falls back to manual if AI unavailable.
  const results = $('analysisResults');
  results.style.display = 'block';
  results.innerHTML = '';

  // Show loading with progress steps
  const loadingEl = document.createElement('div');
  loadingEl.className = 'ai-analysis-prompt';
  loadingEl.style.cssText = 'padding:24px;margin-bottom:16px;background:linear-gradient(135deg,#f3e8e6,#e8f5f5);border-radius:12px;text-align:center;';
  results.appendChild(loadingEl);

  // Step 1: If we have a link, try to fetch metadata first
  let postMetadata = null;
  if (link) {
    loadingEl.innerHTML = '<div class="ai-loading"><div class="spinner"></div><p><strong>Step 1/2:</strong> Fetching post data from link...</p></div>';
    try {
      const metaResp = await fetch('/api/fetch-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link })
      });
      const metaData = await metaResp.json();
      if (metaData.metadata && !metaData.metadata.error) {
        postMetadata = metaData.metadata;
        // If we got a caption from the post and user didn't paste one, use it
        if (postMetadata.caption && !caption) {
          $('analyzerCaption').value = postMetadata.caption;
        }
        // Show what we found
        let foundItems = [];
        if (postMetadata.author) foundItems.push(`Creator: ${postMetadata.author}`);
        if (postMetadata.title) foundItems.push(`Title: ${postMetadata.title}`);
        if (postMetadata.caption) foundItems.push('Caption extracted');
        if (postMetadata.description) foundItems.push('Description found');
        if (foundItems.length) {
          loadingEl.innerHTML = `<div class="ai-loading"><div class="spinner"></div><p><strong>Step 1/2:</strong> Found: ${foundItems.join(' · ')}</p><p style="margin-top:8px;font-size:12px;color:var(--color-text-muted);">Sending to AI for deep analysis...</p></div>`;
        }
      }
    } catch (e) {
      // Metadata fetch failed — that's okay, continue with what we have
      console.log('Metadata fetch failed:', e);
    }
  }

  // Step 2: Run AI analysis with everything we have
  loadingEl.innerHTML = `<div class="ai-loading"><div class="spinner"></div><p><strong>${link ? 'Step 2/2' : 'Analyzing'}:</strong> Running deep AI content analysis...</p><p style="margin-top:8px;font-size:12px;color:var(--color-text-muted);">Claude is analyzing your content across 10 strategic dimensions</p></div>`;

  // Also show manual skip option during loading
  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn btn-ghost';
  skipBtn.style.cssText = 'margin-top:16px;display:block;margin-left:auto;margin-right:auto;font-size:12px;';
  skipBtn.innerHTML = '<i class="ph ph-pencil-simple"></i> Skip AI — analyze manually instead';
  skipBtn.addEventListener('click', () => { results.innerHTML = ''; runManualAnalysis(); });
  loadingEl.appendChild(skipBtn);

  try {
    const analyzePayload = {
      content: caption || postMetadata?.caption || postMetadata?.description || '',
      contentType,
      niche,
      link,
      platform,
      metadata: postMetadata,
      views, likes, comments, saves
    };

    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analyzePayload)
    });
    const result = await resp.json();

    if (result.error) {
      toast(result.error, 'error');
      loadingEl.remove();
      runManualAnalysis();
      return;
    }

    if (result.analysis) {
      // Success — render the analysis cards and auto-fill with AI results
      loadingEl.remove();
      runManualAnalysis();
      setTimeout(() => {
        const a = result.analysis;
        const fields = ['hook','structure','visual_strategy','cta','emotional_trigger','shareability','seo_discovery','audience_fit','originality','improvement'];
        document.querySelectorAll('[data-analysis-idx]').forEach(ta => {
          const idx = parseInt(ta.dataset.analysisIdx);
          const key = fields[idx];
          if (a[key]) ta.value = a[key];
        });
        if (a.concept) {
          Object.entries(a.concept).forEach(([k, v]) => {
            const el = document.querySelector(`[data-concept="${k}"]`);
            if (el) el.value = v;
          });
        }
        // Show AI badge on the results
        const aiBadge = document.createElement('div');
        aiBadge.style.cssText = 'text-align:center;padding:8px;margin-bottom:12px;';
        aiBadge.innerHTML = '<span class="badge badge-ai" style="font-size:11px;padding:4px 12px;">AI-Generated Analysis</span><span style="font-size:12px;color:var(--color-text-muted);margin-left:8px;">Review and edit any field below</span>';
        results.insertBefore(aiBadge, results.firstChild);
        toast('AI analysis complete — review and edit the results below');
        results.scrollIntoView({behavior:'smooth',block:'start'});
      }, 100);
      return;
    }
  } catch (err) {
    console.log('AI analysis error:', err);
    toast('AI unavailable — switching to manual analysis', 'info');
  }

  // Fallback to manual
  loadingEl.remove();
  runManualAnalysis();
});

function runManualAnalysis() {
  const link=$('analyzerLink').value.trim();
  const platform=$('analyzerPlatform').value;
  const contentType=$('analyzerContentType').value;
  const niche=$('analyzerNiche').value.trim();
  const caption=$('analyzerCaption').value.trim();
  const views=$('analyzerViews').value.trim();
  const likes=$('analyzerLikes').value.trim();
  const comments=$('analyzerComments').value.trim();
  const saves=$('analyzerSaves').value.trim();
  const notes=$('analyzerNotes').value.trim();

  const results=$('analysisResults');
  results.style.display='block';

  // Overview
  let overviewHtml=`<div class="analysis-overview-card">
    <h3 style="font-size:16px;font-weight:600;margin-bottom:4px;">Post Analysis Overview</h3>
    <p style="font-size:13px;color:var(--color-text-secondary);">${link?`<a href="${link}" target="_blank" rel="noopener">${link}</a>`:'Manual analysis'}</p>
    <div class="analysis-overview-grid">
      <div class="analysis-overview-item"><strong>${platform}</strong><span>Platform</span></div>
      ${contentType?`<div class="analysis-overview-item"><strong>${contentType}</strong><span>Content Type</span></div>`:''}
      ${views?`<div class="analysis-overview-item"><strong>${views}</strong><span>Views</span></div>`:''}
      ${likes?`<div class="analysis-overview-item"><strong>${likes}</strong><span>Likes</span></div>`:''}
      ${comments?`<div class="analysis-overview-item"><strong>${comments}</strong><span>Comments</span></div>`:''}
      ${saves?`<div class="analysis-overview-item"><strong>${saves}</strong><span>Saves/Shares</span></div>`:''}
    </div>
    ${caption?`<p style="margin-top:14px;font-size:13px;color:var(--color-text-secondary);"><strong>Caption:</strong> ${caption.substring(0,300)}${caption.length>300?'...':''}</p>`:''}
    ${notes?`<p style="font-size:13px;color:var(--color-text-muted);margin-top:6px;"><strong>Notes:</strong> ${notes}</p>`:''}
  </div>`;

  // Analysis cards
  let cardsHtml=`<div class="analysis-results-grid">${ANALYSIS_CATS.map((cat,i)=>`<div class="analysis-card"><div class="analysis-card-icon" style="background:${cat.bg};color:${cat.color};"><i class="ph ${cat.icon}"></i></div><div class="analysis-card-title">${cat.title}</div><div class="analysis-card-body"><textarea data-analysis-idx="${i}" placeholder="${cat.placeholder}"></textarea></div></div>`).join('')}`;

  // Concept Generator (flagship feature)
  cardsHtml+=`<div class="analysis-card concept-generator">
    <h3><i class="ph ph-rocket"></i> Your Stronger Concept</h3>
    <p style="font-size:13px;color:var(--color-text-secondary);line-height:1.5;">Based on your analysis above, create a stronger original concept. Extract the strategy — don't copy the content.</p>
    <div class="concept-field"><label>Your Content Angle</label><textarea data-concept="angle" rows="2" placeholder="How would you approach this topic in your own niche and voice?"></textarea></div>
    <div class="concept-field"><label>Suggested Hook</label><input type="text" data-concept="hook" placeholder="Write a hook for your version..." /></div>
    <div class="concept-field"><label>Suggested Format</label><input type="text" data-concept="format" placeholder="e.g. Talking to camera with b-roll transitions..." /></div>
    <div class="concept-field"><label>Suggested Caption Angle</label><textarea data-concept="caption" rows="2" placeholder="Draft your caption approach..."></textarea></div>
    <div class="concept-field"><label>Suggested CTA</label><input type="text" data-concept="cta" placeholder="e.g. Save this for when you need it..." /></div>
  </div>`;

  // Save button
  cardsHtml+=`<div style="grid-column:1/-1;text-align:center;padding:16px;"><button class="btn btn-primary btn-lg" id="saveAnalysisBtn"><i class="ph ph-floppy-disk"></i> Save Full Analysis</button></div></div>`;

  results.innerHTML=overviewHtml+cardsHtml;

  // Wire save
  $('saveAnalysisBtn').addEventListener('click',()=>{
    const analyses=getArr(ANALYSES_KEY);
    const analysisNotes={};
    document.querySelectorAll('[data-analysis-idx]').forEach(ta=>{analysisNotes[ta.dataset.analysisIdx]=ta.value.trim();});
    const concept={};
    document.querySelectorAll('[data-concept]').forEach(el=>{concept[el.dataset.concept]=(el.value||'').trim();});
    const newAnalysis={id:genId(),link,platform,contentType,niche,caption:caption.substring(0,300),views,likes,comments,saves,notes,analysisNotes,concept,date:new Date().toISOString()};
    analyses.push(newAnalysis);
    setArr(ANALYSES_KEY,analyses);renderSavedAnalyses();toast('Analysis saved');
    syncToCloud(()=>DB.addAnalysis({type:contentType,niche,metrics:{views,likes,comments,saves},categories:analysisNotes,concept}));
  });

  results.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderSavedAnalyses(){
  const analyses=getArr(ANALYSES_KEY);const c=$('savedAnalyses'), e=$('analyses-empty');
  if(!analyses.length){c.innerHTML='';e.style.display='block';}
  else{e.style.display='none';c.innerHTML=analyses.slice().reverse().map(a=>`<div class="saved-analysis-item"><div class="saved-analysis-info"><div class="saved-analysis-title">${a.platform}${a.contentType?' · '+a.contentType:''} — ${a.link||'Manual Analysis'}</div><div class="saved-analysis-meta">${new Date(a.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div></div><div class="saved-analysis-actions"><button class="btn btn-xs btn-ghost" onclick="confirmDelete('${a.id}','analysis')"><i class="ph ph-trash"></i></button></div></div>`).join('');}
}

// ============================================================
// PERFORMANCE (upgraded with charts)
// ============================================================
let growthChartInstance=null, engagementChartInstance=null;

function renderPerformance(){
  const allData=getArr(PERF_KEY);
  const activePlatform=document.querySelector('.platform-tab.active')?.dataset.platform||'all';
  const data=activePlatform==='all'?allData:allData.filter(d=>d.platform===activePlatform);

  if(!$('perfWeek').value)$('perfWeek').value=new Date().toISOString().split('T')[0];

  renderPerfStatCards(data);
  renderPerfCharts(data);
  renderPerfHistory(data);
}

// Platform tabs
$('perfPlatformTabs').addEventListener('click',e=>{if(e.target.classList.contains('platform-tab')){$$('.platform-tab').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');renderPerformance();}});

function renderPerfStatCards(data){
  const c=$('perfStatCards');
  if(!data.length){c.innerHTML=['Followers','Views','Likes','Comments','Saves','Shares'].map(l=>`<div class="perf-stat-card"><div class="perf-stat-value">—</div><span class="perf-stat-label">${l}</span></div>`).join('');return;}
  const latest=data[data.length-1];
  const totalViews=data.reduce((s,d)=>s+parseNum(d.views),0);
  const totalLikes=data.reduce((s,d)=>s+parseNum(d.likes),0);
  const totalComments=data.reduce((s,d)=>s+parseNum(d.comments),0);
  const totalSaves=data.reduce((s,d)=>s+parseNum(d.saves),0);
  const totalShares=data.reduce((s,d)=>s+parseNum(d.shares),0);
  const avgEng=data.length>1?Math.round((totalLikes+totalComments+totalSaves)/(data.length)):0;
  c.innerHTML=[
    {v:latest.followers||'—',l:'Followers',s:latest.platform},
    {v:totalViews.toLocaleString(),l:'Total Views',s:data.length+' weeks'},
    {v:totalLikes.toLocaleString(),l:'Likes',s:''},
    {v:totalComments.toLocaleString(),l:'Comments',s:''},
    {v:totalSaves.toLocaleString(),l:'Saves',s:''},
    {v:totalShares.toLocaleString(),l:'Shares',s:''},
    {v:avgEng.toLocaleString(),l:'Avg Engagement/Week',s:'likes+comments+saves'},
  ].map(s=>`<div class="perf-stat-card"><div class="perf-stat-value">${s.v}</div><span class="perf-stat-label">${s.l}</span>${s.s?`<span class="perf-stat-sub">${s.s}</span>`:''}</div>`).join('');
}

function renderPerfCharts(data){
  if(!data.length)return;
  // Growth chart
  const gctx=$('growthChart');
  if(growthChartInstance)growthChartInstance.destroy();
  const labels=data.map(d=>fmtDate(d.week));
  const followersData=data.map(d=>parseNum(d.followers));
  const viewsData=data.map(d=>parseNum(d.views));
  growthChartInstance=new Chart(gctx,{type:'line',data:{labels,datasets:[{label:'Followers',data:followersData,borderColor:'#6b1309',backgroundColor:'rgba(107,19,9,0.1)',fill:true,tension:0.3,borderWidth:2,pointRadius:3},{label:'Views',data:viewsData,borderColor:'#4a6fa5',backgroundColor:'rgba(74,111,165,0.1)',fill:true,tension:0.3,borderWidth:2,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{family:'Be Vietnam Pro',size:11},padding:10}}},scales:{y:{beginAtZero:true,ticks:{font:{family:'Be Vietnam Pro',size:10}}},x:{ticks:{font:{family:'Be Vietnam Pro',size:10}}}}}});

  // Engagement chart
  const ectx=$('engagementChart');
  if(engagementChartInstance)engagementChartInstance.destroy();
  engagementChartInstance=new Chart(ectx,{type:'bar',data:{labels,datasets:[{label:'Likes',data:data.map(d=>parseNum(d.likes)),backgroundColor:'rgba(107,19,9,0.7)',borderRadius:4},{label:'Comments',data:data.map(d=>parseNum(d.comments)),backgroundColor:'rgba(74,111,165,0.7)',borderRadius:4},{label:'Saves',data:data.map(d=>parseNum(d.saves)),backgroundColor:'rgba(45,106,79,0.7)',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{family:'Be Vietnam Pro',size:11},padding:10}}},scales:{y:{beginAtZero:true,stacked:true,ticks:{font:{family:'Be Vietnam Pro',size:10}}},x:{stacked:true,ticks:{font:{family:'Be Vietnam Pro',size:10}}}}}});
}

function renderPerfHistory(data){
  const h=$('perfHistory'),e=$('perf-empty');
  if(!data.length){h.innerHTML='';e.style.display='block';return;}
  e.style.display='none';
  h.innerHTML=`<div class="perf-history-item perf-history-header"><span>Week</span><span>Platform</span><span>Top Post</span><span>Views</span><span>Likes</span><span>Saves</span><span></span></div>`+data.slice().reverse().map(d=>`<div class="perf-history-item"><span>${fmtDate(d.week)}</span><strong>${d.platform}</strong><span>${d.topPost||'—'}</span><span>${d.views||'—'}</span><span>${d.likes||'—'}</span><span>${d.saves||'—'}</span><button class="btn btn-xs btn-ghost" onclick="confirmDelete('${d.id}','perf')"><i class="ph ph-trash"></i></button></div>`).join('');
}

$('savePerfBtn').addEventListener('click',()=>{
  const week=$('perfWeek').value;if(!week){toast('Please select a week date','error');return;}
  const data=getArr(PERF_KEY);
  const perfEntry={id:genId(),platform:$('perfPlatform').value,week,followers:$('perfFollowers').value.trim(),views:$('perfViews').value.trim(),likes:$('perfLikes').value.trim(),comments:$('perfComments').value.trim(),saves:$('perfSaves').value.trim(),shares:$('perfShares').value.trim(),watchTime:$('perfWatchTime').value.trim(),topPost:$('perfTopPost').value.trim(),notes:$('perfNotes').value.trim(),date:new Date().toISOString()};
  data.push(perfEntry);
  setArr(PERF_KEY,data);
  ['perfFollowers','perfViews','perfLikes','perfComments','perfSaves','perfShares','perfWatchTime','perfTopPost','perfNotes'].forEach(id=>$(id).value='');
  renderPerformance();updateDashboard();toast('Stats saved');
  syncToCloud(()=>DB.addPerformance(perfEntry));
});

// ============================================================
// MONETIZATION
// ============================================================
const MONET_STREAMS=[
  {title:'Brand Deals',icon:'ph-handshake',color:'var(--color-accent-teal)',bg:'var(--color-accent-teal-bg)',desc:'Paid collaborations with brands for sponsored content — reels, stories, posts, or dedicated videos.',readiness:{prelaunch:'later',early:'soon',rising:'ready',established:'ready',top:'ready'},action:'Build a media kit and start pitching brands in your niche.'},
  {title:'Digital Products',icon:'ph-package',color:'var(--color-primary)',bg:'var(--color-primary-light)',desc:'Templates, guides, courses, presets, or toolkits that solve a specific problem for your audience.',readiness:{prelaunch:'soon',early:'ready',rising:'ready',established:'ready',top:'ready'},action:'Start with a low-ticket product ($27-$97) that solves your audience\'s #1 problem.'},
  {title:'Affiliate Marketing',icon:'ph-link',color:'var(--color-info)',bg:'var(--color-info-bg)',desc:'Earn commissions by recommending products and tools you genuinely use and love.',readiness:{prelaunch:'ready',early:'ready',rising:'ready',established:'ready',top:'ready'},action:'Join affiliate programs for tools you already use and mention them naturally in content.'},
  {title:'Services & Consulting',icon:'ph-briefcase',color:'var(--color-accent-plum)',bg:'var(--color-accent-plum-bg)',desc:'1:1 coaching, consulting, freelance content creation, UGC, or done-for-you services.',readiness:{prelaunch:'ready',early:'ready',rising:'ready',established:'ready',top:'ready'},action:'Package your expertise into a clear service offer with defined deliverables.'},
  {title:'Memberships & Community',icon:'ph-users',color:'var(--color-accent-sage)',bg:'var(--color-accent-sage-bg)',desc:'Recurring revenue from a paid community, membership, or subscription content model.',readiness:{prelaunch:'later',early:'later',rising:'soon',established:'ready',top:'ready'},action:'Build a free community first, then convert your most engaged members to paid.'},
  {title:'Ad Revenue',icon:'ph-play-circle',color:'var(--color-accent-amber)',bg:'var(--color-accent-amber-bg)',desc:'YouTube AdSense, TikTok Creator Fund, Instagram bonuses, or platform-specific monetization programs.',readiness:{prelaunch:'later',early:'later',rising:'soon',established:'ready',top:'ready'},action:'Focus on watch time and views — ad revenue scales with content volume.'},
];

function renderMonetization(){
  if(!document.getElementById('monetStream'))return;
  const perf=getArr(PERF_KEY), settings=getObj(SETTINGS_KEY);
  const latestPerf=perf[perf.length-1];
  const followers=latestPerf?latestPerf.followers:'0';
  const stage=(settings.stage||detectStage(followers)).toLowerCase().replace(/[- ]/g,'');

  // Stage banner
  const stageLabel=settings.stage||detectStage(followers);
  const stageDescs={'pre-launch':'You\'re building your foundation. Focus on creating great content, finding your voice, and growing your initial audience.','early growth':'You\'re gaining traction. Focus on consistency, audience engagement, and testing your first revenue streams.','rising creator':'You have real momentum. Start diversifying income, pitching brands, and building products.','established':'You\'re a proven creator. Optimize your revenue mix, hire help, and build systems.','top creator':'You\'re at the top. Focus on scaling, building a team, and creating evergreen revenue.'};
  const stageKey=stageLabel.toLowerCase();
  $('monetStageBanner').innerHTML=`<div class="monet-stage-icon" style="background:var(--color-primary-light);color:var(--color-primary);"><i class="ph ph-rocket"></i></div><div class="monet-stage-info"><h3>${stageLabel}</h3><p>${stageDescs[stageKey]||'Configure your creator profile in Settings to get personalized monetization recommendations.'}</p></div>`;

  // Streams grid
  const stageMap={'pre-launch':'prelaunch','early growth':'early','rising creator':'rising','established':'established','top creator':'top'};
  const sk=stageMap[stageKey]||'early';
  $('monetStreamsGrid').innerHTML=MONET_STREAMS.map(s=>{
    const readiness=s.readiness[sk]||'soon';
    const rLabel={ready:'Ready Now',soon:'Start Preparing',later:'Future Priority'}[readiness];
    const rClass={ready:'readiness-ready',soon:'readiness-soon',later:'readiness-later'}[readiness];
    return `<div class="monet-stream-card"><div class="monet-stream-icon" style="background:${s.bg};color:${s.color};"><i class="ph ${s.icon}"></i></div><div class="monet-stream-title">${s.title}</div><div class="monet-stream-desc">${s.desc}</div><div class="monet-stream-readiness ${rClass}"><i class="ph ph-${readiness==='ready'?'check-circle':readiness==='soon'?'clock':'calendar'}"></i> ${rLabel}</div><div class="monet-stream-action">${s.action}</div></div>`;
  }).join('');

  // Revenue tracker
  renderMonetHistory();

  // Roadmap
  renderMonetRoadmap(stageLabel);
}

function renderMonetHistory(){
if(!document.getElementById('saveMonetBtn'))return;
  const data=getArr(MONET_KEY);const h=$('monetHistory'), e=$('monet-empty');
  if(!$('monetMonth').value)$('monetMonth').value=new Date().toISOString().substring(0,7);
  if(!data.length){h.innerHTML='';e.style.display='block';return;}
  e.style.display='none';
  const total=data.reduce((s,d)=>s+parseNum(d.amount),0);
  h.innerHTML=`<div style="padding:10px 16px;font-size:14px;font-weight:600;color:var(--color-success);margin-bottom:8px;">Total Revenue Tracked: $${total.toLocaleString()}</div>`+data.slice().reverse().map(d=>`<div class="monet-history-item"><div class="monet-history-item-info"><strong>${d.stream}</strong><span>${d.month} ${d.notes?'· '+d.notes:''}</span></div><div class="monet-history-item-amount">$${parseNum(d.amount).toLocaleString()}</div><button class="btn btn-xs btn-ghost" onclick="confirmDelete('${d.id}','monet')" style="margin-left:8px;"><i class="ph ph-trash"></i></button></div>`).join('');
}

$('saveMonetBtn')?.addEventListener('click',()=>{
  const amount=$('monetAmount').value.trim();if(!amount){toast('Please enter an amount','error');return;}
  const data=getArr(MONET_KEY);
  const monetEntry={id:genId(),month:$('monetMonth').value,stream:$('monetStream').value,amount,notes:$('monetNotes').value.trim(),date:new Date().toISOString()};
  data.push(monetEntry);
  setArr(MONET_KEY,data);$('monetAmount').value='';$('monetNotes').value='';
  renderMonetHistory();toast('Revenue logged');
  syncToCloud(()=>DB.addRevenue(monetEntry));
});

function renderMonetRoadmap(stage){
if(!document.getElementById('monetRoadmap'))return;
  const roadmaps={'Pre-launch':[{title:'Create 3-5 pieces of content per week',desc:'Build your content library and find your voice before monetizing.'},{title:'Set up affiliate links for tools you use',desc:'The easiest first revenue stream — no audience size requirement.'},{title:'Package one skill as a service',desc:'Offer 1:1 coaching, consulting, or freelance work based on your expertise.'},{title:'Build a media kit',desc:'Even at 0 followers, a strong media kit shows brands you\'re serious.'}],
  'Early Growth':[{title:'Launch a low-ticket digital product ($27-$97)',desc:'Templates, guides, or mini-courses that solve a specific problem.'},{title:'Pitch 5 brands per month',desc:'Start with gifted collaborations, then negotiate paid deals as your numbers grow.'},{title:'Optimize affiliate income',desc:'Create dedicated content around your affiliate products to drive conversions.'},{title:'Build your email list',desc:'Email subscribers are 10x more likely to buy than social followers.'}],
  'Rising Creator':[{title:'Diversify to 3+ revenue streams',desc:'Don\'t rely on any single income source. Mix brand deals, products, and services.'},{title:'Raise your rates',desc:'With proven engagement, your rates should reflect your value. Research market rates.'},{title:'Launch a signature product or course',desc:'Your audience is ready for a higher-ticket offer ($197-$997).'},{title:'Explore membership or community revenue',desc:'Recurring revenue creates stability. Start with your most engaged followers.'}],
  'Established':[{title:'Build systems and delegate',desc:'Hire an editor, VA, or manager to free up your time for strategy and creation.'},{title:'Negotiate long-term brand partnerships',desc:'Move from one-off posts to quarterly or annual ambassador deals.'},{title:'Scale your product suite',desc:'Create a ladder from free content → low-ticket → mid-ticket → high-ticket.'},{title:'Explore licensing and IP opportunities',desc:'Your content, brand, and audience have value beyond individual posts.'}]};
  const steps=roadmaps[stage]||roadmaps['Early Growth'];
  if($('monetRoadmap')) $('monetRoadmap').innerHTML=steps.map((s,i)=>`<div class="monet-roadmap-step"><div class="monet-roadmap-num">${i+1}</div><div class="monet-roadmap-content"><h4>${s.title}</h4><p>${s.desc}</p></div></div>`).join('');
}

// ============================================================
// QUARTERLY PLAN
// ============================================================
function renderQuarterly(){
  const data=getObj(QUARTERLY_KEY);
  // Set quarter label
  const now=new Date();const q=Math.ceil((now.getMonth()+1)/3);
  $('quarterLabel').textContent=`Q${q} ${now.getFullYear()} — Map your growth, content, and monetization goals.`;
  // Load saved data
  ['qGrowth','qContent','qBrand','qMonetization','qOffers','qPlatforms','qCampaigns','qMetrics','qActions'].forEach(id=>{if(data[id])$(id).value=data[id];});
  // Snapshot
  const items=getArr(CONTENT_KEY), perf=getArr(PERF_KEY), monet=getArr(MONET_KEY);
  const totalContent=items.length;const posted=items.filter(i=>i.status==='Posted').length;
  const latestPerf=perf[perf.length-1];
  const totalRevenue=monet.reduce((s,d)=>s+parseNum(d.amount),0);
  $('quarterSnapshot').innerHTML=[
    {v:totalContent,l:'Total Content Items'},{v:posted,l:'Posted'},{v:perf.length,l:'Weeks Tracked'},{v:latestPerf?latestPerf.followers:'—',l:'Latest Followers'},{v:'$'+totalRevenue.toLocaleString(),l:'Revenue Tracked'},
  ].map(s=>`<div class="quarter-snapshot-card"><div class="quarter-snapshot-value">${s.v}</div><div class="quarter-snapshot-label">${s.l}</div></div>`).join('');
}

$('saveQuarterlyBtn').addEventListener('click',()=>{
  const data={};
  ['qGrowth','qContent','qBrand','qMonetization','qOffers','qPlatforms','qCampaigns','qMetrics','qActions'].forEach(id=>{data[id]=$(id).value;});
  setObj(QUARTERLY_KEY,data);toast('Quarterly plan saved');
  syncToCloud(()=>{const now=new Date();const q='Q'+Math.ceil((now.getMonth()+1)/3);return DB.saveQuarterlyPlan(q,now.getFullYear(),data);});
});

// ============================================================
// PROMPT STUDIO (enhanced with monetization prompts)
// ============================================================
const PROMPTS_DATA=[
  {title:'Generate Content Ideas From My Niche',cat:'ideation',text:`I'm a creator in the [YOUR NICHE] space. My audience cares about [TOPICS/PAIN POINTS]. Generate 10 content ideas that would perform well on [PLATFORM]. Mix trending formats with evergreen value. Include a hook suggestion for each idea.`},
  {title:'Build a Week of Content Around One Theme',cat:'ideation',text:`I want to build a week of content around the theme: [YOUR THEME]. Create 5 pieces of content across different formats (reel, carousel, story, thread, etc.) that explore this theme from different angles. Each piece should serve a different content pillar (growth, value, authority, lifestyle, conversion).`},
  {title:'Turn a Rough Thought Into a Reel Hook',cat:'scripting',text:`I have a rough content idea: [YOUR ROUGH IDEA]. Turn this into 5 different reel hook options. Each hook should be under 10 words, pattern-interrupting, and designed to stop the scroll in the first 2 seconds. Make them feel natural, not clickbaity.`},
  {title:'Repurpose One Idea Across Platforms',cat:'repurpose',text:`I created this content: [DESCRIBE YOUR CONTENT]. Repurpose this into content for Instagram (reel + carousel), TikTok, YouTube Short, LinkedIn post, and Twitter/X thread. Adapt the tone, format, and length for each platform while keeping the core message.`},
  {title:'Improve My Caption Ideas',cat:'scripting',text:`Here's a draft caption for my [PLATFORM] post about [TOPIC]:\n\n[YOUR DRAFT CAPTION]\n\nImprove this caption. Make the hook stronger, tighten the middle, and end with a clear CTA. Keep it [casual/professional/conversational] — match my brand voice.`},
  {title:'Improve My CTA Ideas',cat:'scripting',text:`I'm creating a [FORMAT] about [TOPIC] on [PLATFORM]. I need 5 CTA options that feel natural and not salesy. My goal for this post is [GOAL: saves / shares / comments / link clicks / follows]. Give me CTAs that serve this goal.`},
  {title:'Analyze Content Gaps in My Strategy',cat:'analysis',text:`Here's a summary of the content I've posted in the last 30 days:\n\n[LIST YOUR RECENT CONTENT TOPICS AND FORMATS]\n\nAnalyze my content gaps. What pillar am I over-indexing on? What's missing? What topics or formats should I add to create a more balanced and strategic content mix?`},
  {title:'Strengthen Scripting and Tone',cat:'scripting',text:`Here's a rough script for my [REEL/TIKTOK/VIDEO]:\n\n[YOUR ROUGH SCRIPT]\n\nRewrite this to be tighter, punchier, and more engaging. Keep the first 3 seconds strong. Make the pacing feel conversational and the ending memorable. Keep it under [X] seconds of speaking time.`},
  {title:'Improve Strategy Based on Performance',cat:'strategy',text:`Here's how my content performed this week:\n\nTop performer: [DESCRIBE]\nWorst performer: [DESCRIBE]\nAverage reach: [NUMBER]\nBest format: [FORMAT]\n\nBased on this data, what should I do more of, less of, and differently next week? Give me a specific, actionable content plan for the next 7 days.`},
  {title:'Turn One Topic Into Multiple Angles',cat:'ideation',text:`I want to create multiple pieces of content around the topic: [YOUR TOPIC]. Give me 8 different content angles I could use to explore this topic. Each angle should feel fresh and serve a different purpose (educate, entertain, inspire, challenge, relate, sell, etc.).`},
  {title:'Audit My Content Strategy',cat:'strategy',text:`I'm a [YOUR NICHE] creator with [FOLLOWER COUNT] followers. My goals are: [LIST YOUR GOALS]. Here's my current content approach:\n\n[DESCRIBE YOUR APPROACH]\n\nAudit my strategy. What's working? What's missing? What would you change if you were my content strategist? Be specific and actionable.`},
  {title:'Create a Content Repurposing Plan',cat:'repurpose',text:`Here are my top 3 best-performing posts from the last month:\n\n1. [DESCRIBE POST 1]\n2. [DESCRIBE POST 2]\n3. [DESCRIBE POST 3]\n\nCreate a repurposing plan for each. Show me how to turn each post into at least 3 new pieces of content across different platforms and formats.`},
  {title:'Build My Monetization Strategy',cat:'monetization',text:`I'm a [YOUR NICHE] creator with [FOLLOWER COUNT] followers on [PLATFORMS]. My current revenue is [AMOUNT/NONE]. My goals are [GOALS].\n\nBuild me a realistic monetization strategy. What revenue streams should I focus on first? What products should I create? What price points make sense? Give me a 90-day monetization plan.`},
  {title:'Write My Brand Pitch Email',cat:'monetization',text:`I'm a [YOUR NICHE] creator with [FOLLOWER COUNT] followers. My engagement rate is [RATE]. I want to pitch [BRAND NAME] for a paid collaboration.\n\nWrite a professional pitch email that highlights my value, audience alignment, and proposed deliverables. Make it confident but not pushy.`},
  {title:'Plan My Digital Product Launch',cat:'monetization',text:`I want to launch a digital product for my audience. My niche is [NICHE], my audience's biggest problem is [PROBLEM], and I'm thinking of creating a [PRODUCT TYPE].\n\nHelp me plan the launch. Give me: product positioning, pricing strategy, content calendar for the launch sequence, email sequence outline, and post-launch optimization tips.`},
];

function renderPrompts(){
  const container=$('prompts-grid');
  const activeCat=document.querySelector('.prompt-cat-btn.active')?.dataset.cat||'all';
  const filtered=activeCat==='all'?PROMPTS_DATA:PROMPTS_DATA.filter(p=>p.cat===activeCat);
  container.innerHTML=filtered.map((p,i)=>`<div class="prompt-card"><div class="prompt-card-top"><span class="prompt-card-title">${p.title}</span><span class="prompt-card-cat">${p.cat}</span></div><div class="prompt-card-text">${p.text}</div><div class="prompt-card-footer"><button class="copy-btn" onclick="copyPrompt(this,${i})"><i class="ph ph-copy"></i> Copy Prompt</button></div></div>`).join('');
}
$('promptCategories').addEventListener('click',e=>{if(e.target.classList.contains('prompt-cat-btn')){$$('.prompt-cat-btn').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');renderPrompts();}});
window.copyPrompt=function(btn,idx){const activeCat=document.querySelector('.prompt-cat-btn.active')?.dataset.cat||'all';const filtered=activeCat==='all'?PROMPTS_DATA:PROMPTS_DATA.filter(p=>p.cat===activeCat);const text=filtered[idx]?.text;if(text){navigator.clipboard.writeText(text).then(()=>{btn.classList.add('copied');btn.innerHTML='<i class="ph ph-check"></i> Copied';setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML='<i class="ph ph-copy"></i> Copy Prompt';},1500);});}};

// ============================================================
// SETTINGS
// ============================================================
function loadSettings(){
  const s=getObj(SETTINGS_KEY);
  if(s.name)$('settingsName').value=s.name;
  if(s.niche)$('settingsNiche').value=s.niche;
  if(s.platform)$('settingsPlatform').value=s.platform;
  if(s.stage)$('settingsStage').value=s.stage;
  if(s.goals)$('settingsGoals').value=s.goals;
}
$('saveSettingsBtn').addEventListener('click',()=>{
  const settingsData={name:$('settingsName').value.trim(),niche:$('settingsNiche').value.trim(),platform:$('settingsPlatform').value,stage:$('settingsStage').value,goals:$('settingsGoals').value.trim()};
  setObj(SETTINGS_KEY,settingsData);
  toast('Profile saved');
  syncToCloud(()=>DB.saveProfile(settingsData));
});

// Data export/import
$('exportDataBtn').addEventListener('click',()=>{
  const data={content:getArr(CONTENT_KEY),performance:getArr(PERF_KEY),analyses:getArr(ANALYSES_KEY),monetization:getArr(MONET_KEY),quarterly:getObj(QUARTERLY_KEY),settings:getObj(SETTINGS_KEY),focus:getStr(FOCUS_KEY),review:getStr(REVIEW_KEY)};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`creator-content-os-backup-${new Date().toISOString().split('T')[0]}.json`;a.click();
  URL.revokeObjectURL(url);toast('Data exported');
});
$('importDataBtn').addEventListener('click',()=>$('importFileInput').click());
$('importFileInput').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(data.content)setArr(CONTENT_KEY,data.content);
      if(data.performance)setArr(PERF_KEY,data.performance);
      if(data.analyses)setArr(ANALYSES_KEY,data.analyses);
      if(data.monetization)setArr(MONET_KEY,data.monetization);
      if(data.quarterly)setObj(QUARTERLY_KEY,data.quarterly);
      if(data.settings)setObj(SETTINGS_KEY,data.settings);
      if(data.focus)setStr(FOCUS_KEY,data.focus);
      if(data.review)setStr(REVIEW_KEY,data.review);
      toast('Data imported successfully');
      init();
    }catch{toast('Invalid file format','error');}
  };
  reader.readAsText(file);
});

// ============================================================
// AI: WHAT SHOULD I POST NEXT (Dashboard)
// ============================================================
$('runAISuggestBtn').addEventListener('click', async () => {
  const resultsEl = $('aiSuggestResults');
  const btn = $('runAISuggestBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> Analyzing...';
  resultsEl.innerHTML = '<div class="ai-loading"><div class="spinner"></div><p>AI is analyzing your content patterns...</p></div>';

  try {
    const content = getArr(CONTENT_KEY);
    const performance = getArr(PERF_KEY);
    const settings = getObj(SETTINGS_KEY);
    const profile = { niche: settings.niche || '', stage: settings.creator_stage || '', followers: settings.follower_count || '', platforms: settings.platforms || [], platform: settings.platforms?.[0] || '' };

    const resp = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, performance, profile })
    });
    const data = await resp.json();
    if (data.error) { toast(data.error, 'error'); resultsEl.innerHTML = ''; return; }
    const s = data.suggestions;
    if (!s || s.raw) { toast('Could not parse AI response', 'error'); resultsEl.innerHTML = `<pre style="font-size:12px;overflow:auto;max-height:300px;">${s?.raw || 'No response'}</pre>`; return; }

    // Render suggestions
    let html = '<div class="ai-results-container">';

    // Next posts
    if (s.nextPosts?.length) {
      html += '<h4 style="margin-bottom:12px;"><i class="ph ph-lightning"></i> Recommended Next Posts</h4><div class="ai-suggestions-grid">';
      s.nextPosts.forEach(p => {
        html += `<div class="ai-suggestion-card">
          <div class="ai-suggestion-header">
            <span class="badge badge-sm">${p.platform || ''}</span>
            <span class="badge badge-sm badge-outline">${p.pillar || ''}</span>
            <span class="badge badge-sm ${p.priority === 'high' ? 'badge-high' : p.priority === 'medium' ? 'badge-med' : 'badge-low'}">${p.priority || ''}</span>
          </div>
          <h5>${p.title || ''}</h5>
          <p class="ai-suggestion-hook">"${p.hook || ''}"</p>
          <p class="ai-suggestion-why">${p.why || ''}</p>
          <span class="badge badge-sm badge-outline">${p.format || ''}</span>
        </div>`;
      });
      html += '</div>';
    }

    // Week plan
    if (s.weekPlan) {
      html += '<h4 style="margin:20px 0 12px;"><i class="ph ph-calendar-dots"></i> Your Week Plan</h4><div class="ai-week-plan">';
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      days.forEach((d, i) => {
        if (s.weekPlan[d]) {
          html += `<div class="ai-week-day"><strong>${dayLabels[i]}</strong><span>${s.weekPlan[d]}</span></div>`;
        }
      });
      html += '</div>';
    }

    // Gaps
    if (s.gaps?.length) {
      html += '<h4 style="margin:20px 0 12px;"><i class="ph ph-warning-circle"></i> Content Gaps</h4><div class="ai-gaps">';
      s.gaps.forEach(g => {
        html += `<div class="ai-gap-item"><strong>${g.area}</strong><span>${g.suggestion}</span></div>`;
      });
      html += '</div>';
    }

    // Insight
    if (s.insight) {
      html += `<div class="ai-insight"><i class="ph ph-lightbulb"></i><p>${s.insight}</p></div>`;
    }

    html += '</div>';
    resultsEl.innerHTML = html;
    toast('AI suggestions ready');
  } catch (err) {
    console.error('Suggest error:', err);
    toast('AI suggestions unavailable — check your API key and try again', 'error');
    resultsEl.innerHTML = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-sparkle"></i> Get AI Suggestions';
  }
});

// ============================================================
// AI: STRATEGY REVIEW (Intelligence Tab)
// ============================================================
$('runAIStrategyBtn').addEventListener('click', async () => {
  const resultsEl = $('aiStrategyResults');
  const btn = $('runAIStrategyBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> Analyzing...';
  resultsEl.innerHTML = '<div class="ai-loading"><div class="spinner"></div><p>Running deep strategy analysis...</p></div>';

  try {
    const content = getArr(CONTENT_KEY);
    const performance = getArr(PERF_KEY);
    const revenue = getArr(MONET_KEY);
    const settings = getObj(SETTINGS_KEY);
    const quarterly = getObj(QUARTERLY_KEY);
    const profile = { name: settings.display_name || '', niche: settings.niche || '', stage: settings.creator_stage || '', followers: settings.follower_count || '', platform: settings.platforms?.[0] || '', platforms: settings.platforms || [] };

    const resp = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, performance, revenue, profile, quarterly })
    });
    const data = await resp.json();
    if (data.error) { toast(data.error, 'error'); resultsEl.innerHTML = ''; return; }
    const st = data.strategy;
    if (!st || st.raw) { toast('Could not parse AI response', 'error'); resultsEl.innerHTML = `<pre style="font-size:12px;overflow:auto;max-height:300px;">${st?.raw || 'No response'}</pre>`; return; }

    let html = '<div class="ai-results-container">';

    // Grade + headline
    html += `<div class="ai-strategy-header">
      <div class="ai-grade ai-grade-${(st.overallGrade || 'C')[0].toLowerCase()}">${st.overallGrade || '?'}</div>
      <p class="ai-headline">${st.headline || ''}</p>
    </div>`;

    // Strengths & Weaknesses
    html += '<div class="ai-sw-grid">';
    if (st.strengths?.length) {
      html += '<div class="ai-sw-col ai-strengths"><h4><i class="ph ph-check-circle"></i> Strengths</h4>';
      st.strengths.forEach(s => { html += `<div class="ai-sw-item"><strong>${s.title}</strong><p>${s.detail}</p></div>`; });
      html += '</div>';
    }
    if (st.weaknesses?.length) {
      html += '<div class="ai-sw-col ai-weaknesses"><h4><i class="ph ph-warning"></i> Weaknesses</h4>';
      st.weaknesses.forEach(w => { html += `<div class="ai-sw-item"><strong>${w.title}</strong><p>${w.detail}</p></div>`; });
      html += '</div>';
    }
    html += '</div>';

    // 30 Day Plan
    if (st.thirtyDayPlan?.length) {
      html += '<h4 style="margin:20px 0 12px;"><i class="ph ph-calendar-check"></i> 30-Day Action Plan</h4><div class="ai-plan-grid">';
      st.thirtyDayPlan.forEach(w => {
        html += `<div class="ai-plan-week"><div class="ai-plan-week-header">Week ${w.week}: ${w.focus}</div><ul>${(w.actions||[]).map(a => `<li>${a}</li>`).join('')}</ul></div>`;
      });
      html += '</div>';
    }

    // Monetization advice
    if (st.monetizationAdvice) {
      const m = st.monetizationAdvice;
      html += `<div class="ai-advice-card"><h4><i class="ph ph-currency-circle-dollar"></i> Monetization Advice</h4><p><strong>Next stream:</strong> ${m.nextStream || ''}</p><p>${m.why || ''}</p><p class="ai-first-step"><i class="ph ph-arrow-right"></i> <strong>First step:</strong> ${m.firstStep || ''}</p></div>`;
    }

    // Additional insights
    html += '<div class="ai-insights-row">';
    if (st.contentMixAdvice) html += `<div class="ai-insight-item"><h5><i class="ph ph-chart-pie-slice"></i> Content Mix</h5><p>${st.contentMixAdvice}</p></div>`;
    if (st.growthLever) html += `<div class="ai-insight-item"><h5><i class="ph ph-rocket"></i> Growth Lever</h5><p>${st.growthLever}</p></div>`;
    if (st.stopDoing) html += `<div class="ai-insight-item ai-stop"><h5><i class="ph ph-stop-circle"></i> Stop Doing</h5><p>${st.stopDoing}</p></div>`;
    html += '</div>';

    html += '</div>';
    resultsEl.innerHTML = html;
    toast('Strategy review complete');
  } catch (err) {
    console.error('Strategy error:', err);
    toast('Strategy review unavailable — check your API key and try again', 'error');
    resultsEl.innerHTML = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-sparkle"></i> Run AI Strategy Review';
  }
});

// ============================================================
// AI: WRITER (Prompt Studio Tab)
// ============================================================
$('runAIWriterBtn').addEventListener('click', async () => {
  const topic = $('aiWriterTopic').value.trim();
  if (!topic) { toast('Please enter a topic', 'error'); return; }

  const resultsEl = $('aiWriterResults');
  const btn = $('runAIWriterBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> Generating...';
  resultsEl.innerHTML = '<div class="ai-loading"><div class="spinner"></div><p>AI is writing your content...</p></div>';

  const type = $('aiWriterType').value;
  const platform = $('aiWriterPlatform').value;
  const tone = $('aiWriterTone').value;
  const format = $('aiWriterFormat').value;
  const context = $('aiWriterContext').value.trim();
  const settings = getObj(SETTINGS_KEY);
  const niche = settings.niche || '';

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, topic, platform, niche, tone, format, context })
    });
    const data = await resp.json();
    if (data.error) { toast(data.error, 'error'); resultsEl.innerHTML = ''; return; }
    const r = data.result;
    if (!r || r.raw) { toast('Could not parse AI response', 'error'); resultsEl.innerHTML = `<pre style="font-size:12px;overflow:auto;max-height:300px;">${r?.raw || 'No response'}</pre>`; return; }

    let html = '<div class="ai-results-container">';

    // HOOKS
    if (type === 'hooks' && r.hooks?.length) {
      html += '<h4 style="margin-bottom:12px;"><i class="ph ph-megaphone"></i> Scroll-Stopping Hooks</h4><div class="ai-hooks-list">';
      r.hooks.forEach((h, i) => {
        html += `<div class="ai-hook-item">
          <div class="ai-hook-num">${i + 1}</div>
          <div class="ai-hook-body">
            <p class="ai-hook-text">"${h.text}"</p>
            <div class="ai-hook-meta"><span class="badge badge-sm badge-outline">${h.style || ''}</span><span>${h.why || ''}</span></div>
          </div>
          <button class="btn btn-xs btn-ghost ai-copy-btn" data-copy="${h.text.replace(/"/g, '&quot;')}"><i class="ph ph-copy"></i></button>
        </div>`;
      });
      html += '</div>';
    }

    // CAPTIONS
    if (type === 'caption' && r.captions?.length) {
      html += '<h4 style="margin-bottom:12px;"><i class="ph ph-text-aa"></i> Caption Versions</h4>';
      r.captions.forEach(c => {
        html += `<div class="ai-caption-card">
          <h5>${c.version}</h5>
          <p class="ai-caption-hook"><strong>Hook:</strong> ${c.hook || ''}</p>
          <p class="ai-caption-body">${c.body || ''}</p>
          <p class="ai-caption-cta"><strong>CTA:</strong> ${c.cta || ''}</p>
          <div class="ai-caption-tags">${(c.hashtags || []).map(t => `<span class="badge badge-sm badge-outline">#${t}</span>`).join(' ')}</div>
          <button class="btn btn-xs btn-ghost ai-copy-btn" data-copy="${(c.hook + '\n\n' + c.body + '\n\n' + c.cta + '\n\n' + (c.hashtags||[]).map(t=>'#'+t).join(' ')).replace(/"/g, '&quot;')}"><i class="ph ph-copy"></i> Copy</button>
        </div>`;
      });
    }

    // SCRIPT
    if (type === 'script' && r.script) {
      const sc = r.script;
      html += '<h4 style="margin-bottom:12px;"><i class="ph ph-film-script"></i> Video Script</h4>';
      html += `<div class="ai-script-card">
        <div class="ai-script-section"><span class="ai-script-label">HOOK (0-3s)</span><p>${sc.hook || ''}</p></div>
        <div class="ai-script-section"><span class="ai-script-label">SETUP (3-13s)</span><p>${sc.setup || ''}</p></div>
        <div class="ai-script-section"><span class="ai-script-label">BODY (13-43s)</span><p>${sc.body || ''}</p></div>
        <div class="ai-script-section"><span class="ai-script-label">PAYOFF (43-53s)</span><p>${sc.payoff || ''}</p></div>
        <div class="ai-script-section"><span class="ai-script-label">CTA (53-${sc.totalEstimatedSeconds || 60}s)</span><p>${sc.cta || ''}</p></div>
        <div class="ai-script-extras">
          ${sc.onScreenText?.length ? `<div><strong>On-Screen Text:</strong><ul>${sc.onScreenText.map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
          ${sc.bRollSuggestions?.length ? `<div><strong>B-Roll Ideas:</strong><ul>${sc.bRollSuggestions.map(t => `<li>${t}</li>`).join('')}</ul></div>` : ''}
          ${sc.musicMood ? `<div><strong>Music Mood:</strong> ${sc.musicMood}</div>` : ''}
        </div>
      </div>`;

      if (r.alternateHooks?.length) {
        html += '<h5 style="margin:16px 0 8px;">Alternate Hooks</h5><div class="ai-hooks-list">';
        r.alternateHooks.forEach((h, i) => {
          html += `<div class="ai-hook-item"><div class="ai-hook-num">${i+1}</div><div class="ai-hook-body"><p class="ai-hook-text">"${h}"</p></div><button class="btn btn-xs btn-ghost ai-copy-btn" data-copy="${h.replace(/"/g,'&quot;')}"><i class="ph ph-copy"></i></button></div>`;
        });
        html += '</div>';
      }
    }

    // IDEAS
    if (type === 'ideas' && r.ideas?.length) {
      html += '<h4 style="margin-bottom:12px;"><i class="ph ph-lightbulb"></i> Content Ideas</h4><div class="ai-ideas-grid">';
      r.ideas.forEach(idea => {
        html += `<div class="ai-idea-card">
          <h5>${idea.title || ''}</h5>
          <p class="ai-idea-hook">"${idea.hook || ''}"</p>
          <p class="ai-idea-angle">${idea.angle || ''}</p>
          <div class="ai-idea-meta">
            <span class="badge badge-sm badge-outline">${idea.format || ''}</span>
            <span class="badge badge-sm badge-outline">${idea.pillar || ''}</span>
            <span class="badge badge-sm ${idea.difficulty === 'easy' ? 'badge-low' : idea.difficulty === 'hard' ? 'badge-high' : 'badge-med'}">${idea.difficulty || ''}</span>
          </div>
        </div>`;
      });
      html += '</div>';
    }

    html += '</div>';
    resultsEl.innerHTML = html;

    // Wire copy buttons
    resultsEl.querySelectorAll('.ai-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => toast('Copied to clipboard'));
      });
    });

    toast('Content generated');
  } catch (err) {
    console.error('Writer error:', err);
    toast('AI writer unavailable — check your API key and try again', 'error');
    resultsEl.innerHTML = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-sparkle"></i> Generate with AI';
  }
});

// ============================================================
// PLATFORM CONNECTIONS (Instagram OAuth + Sync)
// ============================================================
function initPlatformConnections() {
  // Check URL params for OAuth callback results
  const params = new URLSearchParams(window.location.search);

  if (params.get('ig_connected') === 'true') {
    const username = params.get('ig_username');
    const claimToken = params.get('ig_claim');
    toast(`Instagram connected${username ? ': @' + username : ''}!`);

    // Claim the connection for the current user
    if (claimToken && typeof DB !== 'undefined' && DB.isAuthenticated()) {
      DB.claimConnection(claimToken).then(() => {
        renderInstagramConnection();
      });
    } else if (claimToken) {
      // Store claim token in localStorage for when user logs in
      localStorage.setItem('ccos_ig_claim', claimToken);
    }

    // Also store locally for display
    localStorage.setItem('ccos_ig_connected', 'true');
    localStorage.setItem('ccos_ig_username', username || '');

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (params.get('ig_error')) {
    toast('Instagram connection failed: ' + decodeURIComponent(params.get('ig_error')), 'error');
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Wire connect button
  const connectBtn = $('connectInstagramBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      // Redirect to OAuth initiation endpoint
      window.location.href = '/api/auth/instagram?returnTo=/';
    });
  }

  // ── TikTok OAuth callback handling ──
  if (params.get('tt_connected') === 'true') {
    const username = params.get('tt_username');
    const claimToken = params.get('tt_claim');
    toast(`TikTok connected${username ? ': @' + username : ''}!`);

    if (claimToken && typeof DB !== 'undefined' && DB.isAuthenticated()) {
      DB.claimConnection(claimToken).then(() => { renderTikTokConnection(); });
    } else if (claimToken) {
      localStorage.setItem('ccos_tt_claim', claimToken);
    }

    localStorage.setItem('ccos_tt_connected', 'true');
    localStorage.setItem('ccos_tt_username', username || '');
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (params.get('tt_error')) {
    toast('TikTok connection failed: ' + decodeURIComponent(params.get('tt_error')), 'error');
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Wire TikTok connect button
  const connectTTBtn = $('connectTikTokBtn');
  if (connectTTBtn) {
    connectTTBtn.addEventListener('click', () => {
      window.location.href = '/api/auth/tiktok?returnTo=/';
    });
  }

  // ── YouTube OAuth callback handling ──
  if (params.get('yt_connected') === 'true') {
    const username = params.get('yt_channel');
    const claimToken = params.get('yt_claim');
    toast(`YouTube connected${username ? ': ' + username : ''}!`);

    if (claimToken && typeof DB !== 'undefined' && DB.isAuthenticated()) {
      DB.claimConnection(claimToken).then(() => { renderYouTubeConnection(); });
    } else if (claimToken) {
      localStorage.setItem('ccos_yt_claim', claimToken);
    }

    localStorage.setItem('ccos_yt_connected', 'true');
    localStorage.setItem('ccos_yt_username', username || '');
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (params.get('yt_error')) {
    toast('YouTube connection failed: ' + decodeURIComponent(params.get('yt_error')), 'error');
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Wire YouTube connect button
  const connectYTBtn = $('connectYouTubeBtn');
  if (connectYTBtn) {
    connectYTBtn.addEventListener('click', () => {
      window.location.href = '/api/auth/youtube?returnTo=/';
    });
  }

  // Render current connection states
  renderInstagramConnection();
  renderTikTokConnection();
  renderYouTubeConnection();
}

// ── TikTok Connection UI ──
async function renderTikTokConnection() {
  const statusEl = $('ttConnectionStatus');
  const detailEl = $('ttConnectionDetail');
  if (!statusEl) return;

  const isConnected = localStorage.getItem('ccos_tt_connected') === 'true';
  const username = localStorage.getItem('ccos_tt_username');

  let connection = null;
  if (typeof DB !== 'undefined' && DB.isAuthenticated()) {
    try {
      const connections = await DB.getConnections();
      connection = connections.find(c => c.platform === 'tiktok' && c.status === 'active');
    } catch (e) { console.log('Could not fetch TT connections:', e); }

    const pendingClaim = localStorage.getItem('ccos_tt_claim');
    if (pendingClaim) {
      await DB.claimConnection(pendingClaim);
      localStorage.removeItem('ccos_tt_claim');
      const connections = await DB.getConnections();
      connection = connections.find(c => c.platform === 'tiktok' && c.status === 'active');
    }
  }

  if (connection || isConnected) {
    const displayName = connection?.platform_username || username || 'Connected';
    const lastSynced = connection?.last_synced_at
      ? new Date(connection.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Never';

    statusEl.innerHTML = `
      <span class="connection-badge connected"><i class="ph ph-check-circle"></i> Connected</span>
      <div class="connection-actions">
        <button class="btn btn-primary btn-sm" id="syncTikTokBtn">
          <i class="ph ph-arrows-clockwise"></i> Sync Now
        </button>
        <button class="btn btn-ghost btn-sm" id="disconnectTikTokBtn">
          <i class="ph ph-plug"></i> Disconnect
        </button>
      </div>
    `;

    if (detailEl) {
      detailEl.style.display = 'block';
      detailEl.innerHTML = `
        <span class="connection-username">@${displayName}</span>
        <span class="connection-meta">Last synced: ${lastSynced}</span>
      `;
    }

    // Wire sync
    $('syncTikTokBtn')?.addEventListener('click', async () => {
      const btn = $('syncTikTokBtn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner-sm"></div> Syncing...';

      try {
        const result = await DB.syncTikTok(connection?.id);
        if (result.error) {
          toast(result.error, 'error');
        } else {
          toast(`Synced ${result.totalPosts || 0} videos from TikTok`);
          if (result.posts?.length) {
            const content = getArr(CONTENT_KEY);
            let added = 0;
            result.posts.forEach(post => {
              if (!content.find(c => c.link === post.permalink)) {
                content.push({
                  id: genId(),
                  idea: (post.title || 'TikTok Video').substring(0, 100),
                  platform: 'TikTok',
                  format: 'Video',
                  status: 'Published',
                  link: post.permalink,
                  pillar: '',
                  postDate: post.timestamp?.split('T')[0] || '',
                  notes: `Views: ${post.views} | Likes: ${post.likes} | Comments: ${post.comments} | Shares: ${post.shares}`,
                  synced: true
                });
                added++;
              }
            });
            if (added > 0) {
              setArr(CONTENT_KEY, content);
              renderContentGrid();
              updateDashboard();
              toast(`Added ${added} new videos to your content library`);
            }
          }
          if (result.profile) {
            localStorage.setItem('ccos_tt_profile', JSON.stringify(result.profile));
          }
          renderTikTokConnection();
        }
      } catch (err) {
        toast('Sync failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Sync Now';
      }
    });

    // Wire disconnect
    $('disconnectTikTokBtn')?.addEventListener('click', async () => {
      if (!confirm('Disconnect TikTok? Your synced data will remain.')) return;
      if (connection) await DB.disconnectPlatform(connection.id);
      localStorage.removeItem('ccos_tt_connected');
      localStorage.removeItem('ccos_tt_username');
      localStorage.removeItem('ccos_tt_profile');
      toast('TikTok disconnected');
      renderTikTokConnection();
    });

  } else {
    statusEl.innerHTML = `
      <button class="btn btn-primary btn-sm" id="connectTikTokBtn">
        <i class="ph ph-plug"></i> Connect TikTok
      </button>
      <p class="connection-api-note">Requires TikTok Developer Portal app</p>
    `;
    if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }
    $('connectTikTokBtn')?.addEventListener('click', () => {
      window.location.href = '/api/auth/tiktok?returnTo=/';
    });
  }
}

async function renderInstagramConnection() {
  const statusEl = $('igConnectionStatus');
  const detailEl = $('igConnectionDetail');
  if (!statusEl) return;

  const isConnected = localStorage.getItem('ccos_ig_connected') === 'true';
  const username = localStorage.getItem('ccos_ig_username');

  // If authenticated, check Supabase for real connection
  let connection = null;
  if (typeof DB !== 'undefined' && DB.isAuthenticated()) {
    try {
      const connections = await DB.getConnections();
      connection = connections.find(c => c.platform === 'instagram' && c.status === 'active');
    } catch (e) {
      console.log('Could not fetch connections:', e);
    }

    // Also try to claim any pending connection
    const pendingClaim = localStorage.getItem('ccos_ig_claim');
    if (pendingClaim) {
      await DB.claimConnection(pendingClaim);
      localStorage.removeItem('ccos_ig_claim');
      const connections = await DB.getConnections();
      connection = connections.find(c => c.platform === 'instagram' && c.status === 'active');
    }
  }

  if (connection || isConnected) {
    const displayName = connection?.platform_username || username || 'Connected';
    const lastSynced = connection?.last_synced_at
      ? new Date(connection.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Never';
    const expiresAt = connection?.token_expires_at
      ? new Date(connection.token_expires_at)
      : null;
    const isExpiring = expiresAt && (expiresAt - Date.now()) < 7 * 24 * 60 * 60 * 1000; // 7 days

    statusEl.innerHTML = `
      <span class="connection-badge connected"><i class="ph ph-check-circle"></i> Connected</span>
      <div class="connection-actions">
        <button class="btn btn-primary btn-sm" id="syncInstagramBtn">
          <i class="ph ph-arrows-clockwise"></i> Sync Now
        </button>
        <button class="btn btn-ghost btn-sm" id="disconnectInstagramBtn">
          <i class="ph ph-plug"></i> Disconnect
        </button>
      </div>
      ${isExpiring ? '<p class="connection-api-note" style="color:#d97706;">Token expires soon — reconnect to refresh</p>' : ''}
    `;

    if (detailEl) {
      detailEl.style.display = 'block';
      detailEl.innerHTML = `
        <span class="connection-username">@${displayName}</span>
        <span class="connection-meta">Last synced: ${lastSynced}</span>
      `;
    }

    // Wire sync button
    $('syncInstagramBtn')?.addEventListener('click', async () => {
      const btn = $('syncInstagramBtn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner-sm"></div> Syncing...';

      try {
        const result = await DB.syncInstagram(connection?.id);
        if (result.error) {
          toast(result.error, 'error');
        } else {
          toast(`Synced ${result.totalPosts || 0} posts from Instagram`);
          // Update localStorage with synced data for immediate rendering
          if (result.posts?.length) {
            const content = getArr(CONTENT_KEY);
            let added = 0;
            result.posts.forEach(post => {
              // Avoid duplicates by checking permalink
              if (!content.find(c => c.link === post.permalink)) {
                content.push({
                  id: genId(),
                  idea: (post.caption || 'Instagram Post').substring(0, 100),
                  platform: 'Instagram',
                  format: post.type,
                  status: 'Published',
                  link: post.permalink,
                  pillar: '',
                  postDate: post.timestamp?.split('T')[0] || '',
                  notes: `Likes: ${post.likes} | Comments: ${post.comments} | Reach: ${post.reach} | Saves: ${post.saves}`,
                  synced: true
                });
                added++;
              }
            });
            if (added > 0) {
              setArr(CONTENT_KEY, content);
              renderContentGrid();
              updateDashboard();
              toast(`Added ${added} new posts to your content library`);
            }
          }
          // Update profile data if available
          if (result.profile) {
            localStorage.setItem('ccos_ig_profile', JSON.stringify(result.profile));
          }
          renderInstagramConnection(); // refresh UI with new last_synced
        }
      } catch (err) {
        toast('Sync failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Sync Now';
      }
    });

    // Wire disconnect button
    $('disconnectInstagramBtn')?.addEventListener('click', async () => {
      if (!confirm('Disconnect Instagram? Your synced data will remain, but no new data will be pulled.')) return;
      if (connection) {
        await DB.disconnectPlatform(connection.id);
      }
      localStorage.removeItem('ccos_ig_connected');
      localStorage.removeItem('ccos_ig_username');
      localStorage.removeItem('ccos_ig_profile');
      toast('Instagram disconnected');
      renderInstagramConnection();
    });

  } else {
    // Not connected state
    statusEl.innerHTML = `
      <button class="btn btn-primary btn-sm" id="connectInstagramBtn">
        <i class="ph ph-plug"></i> Connect Instagram
      </button>
      <p class="connection-api-note">Requires Instagram Business/Creator account</p>
    `;
    if (detailEl) {
      detailEl.style.display = 'none';
      detailEl.innerHTML = '';
    }
    // Re-wire button
    $('connectInstagramBtn')?.addEventListener('click', () => {
      window.location.href = '/api/auth/instagram?returnTo=/';
    });
  }
}

// ── YouTube Connection UI ──
async function renderYouTubeConnection() {
  const statusEl = $('ytConnectionStatus');
  const detailEl = $('ytConnectionDetail');
  if (!statusEl) return;

  const isConnected = localStorage.getItem('ccos_yt_connected') === 'true';
  const username = localStorage.getItem('ccos_yt_username');

  let connection = null;
  if (typeof DB !== 'undefined' && DB.isAuthenticated()) {
    try {
      const connections = await DB.getConnections();
      connection = connections.find(c => c.platform === 'youtube' && c.status === 'active');
    } catch (e) { console.log('Could not fetch YT connections:', e); }

    const pendingClaim = localStorage.getItem('ccos_yt_claim');
    if (pendingClaim) {
      await DB.claimConnection(pendingClaim);
      localStorage.removeItem('ccos_yt_claim');
      const connections = await DB.getConnections();
      connection = connections.find(c => c.platform === 'youtube' && c.status === 'active');
    }
  }

  if (connection || isConnected) {
    const displayName = connection?.platform_username || username || 'Connected';
    const lastSynced = connection?.last_synced_at
      ? new Date(connection.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Never';

    statusEl.innerHTML = `
      <span class="connection-badge connected"><i class="ph ph-check-circle"></i> Connected</span>
      <div class="connection-actions">
        <button class="btn btn-primary btn-sm" id="syncYouTubeBtn">
          <i class="ph ph-arrows-clockwise"></i> Sync Now
        </button>
        <button class="btn btn-ghost btn-sm" id="disconnectYouTubeBtn">
          <i class="ph ph-plug"></i> Disconnect
        </button>
      </div>
    `;

    if (detailEl) {
      detailEl.style.display = 'block';
      detailEl.innerHTML = `
        <span class="connection-username">${displayName}</span>
        <span class="connection-meta">Last synced: ${lastSynced}</span>
      `;
    }

    $('syncYouTubeBtn')?.addEventListener('click', async () => {
      const btn = $('syncYouTubeBtn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner-sm"></div> Syncing...';
      try {
        const result = await DB.syncYouTube(connection?.id);
        if (result.error) {
          toast(result.error, 'error');
        } else {
          toast(`Synced ${result.totalPosts || 0} videos from YouTube`);
          if (result.posts?.length) {
            const content = getArr(CONTENT_KEY);
            let added = 0;
            result.posts.forEach(post => {
              if (!content.find(c => c.link === post.permalink)) {
                content.push({
                  id: genId(),
                  idea: (post.title || 'YouTube Video').substring(0, 100),
                  platform: 'YouTube',
                  format: post.format || 'Video',
                  status: 'Published',
                  link: post.permalink,
                  pillar: '',
                  postDate: post.timestamp?.split('T')[0] || '',
                  notes: `Views: ${post.views} | Likes: ${post.likes} | Comments: ${post.comments}`,
                  synced: true
                });
                added++;
              }
            });
            if (added > 0) {
              setArr(CONTENT_KEY, content);
              renderContentGrid();
              updateDashboard();
              toast(`Added ${added} new videos to your content library`);
            }
          }
          if (result.profile) {
            localStorage.setItem('ccos_yt_profile', JSON.stringify(result.profile));
          }
          renderYouTubeConnection();
        }
      } catch (err) {
        toast('Sync failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Sync Now';
      }
    });

    $('disconnectYouTubeBtn')?.addEventListener('click', async () => {
      if (!confirm('Disconnect YouTube? Your synced data will remain.')) return;
      if (connection) await DB.disconnectPlatform(connection.id);
      localStorage.removeItem('ccos_yt_connected');
      localStorage.removeItem('ccos_yt_username');
      localStorage.removeItem('ccos_yt_profile');
      toast('YouTube disconnected');
      renderYouTubeConnection();
    });

  } else {
    statusEl.innerHTML = `
      <button class="btn btn-primary btn-sm" id="connectYouTubeBtn">
        <i class="ph ph-plug"></i> Connect YouTube
      </button>
      <p class="connection-api-note">Requires YouTube Data API v3 + OAuth</p>
    `;
    if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }
    $('connectYouTubeBtn')?.addEventListener('click', () => {
      window.location.href = '/api/auth/youtube?returnTo=/';
    });
  }
}

// ============================================================
// INITIALIZATION
// ============================================================
function init(){
  loadSettings();
  updateDashboard();
  renderContentGrid();
  renderPrompts();
  renderSavedAnalyses();
  renderPerformance();
  initPlatformConnections();
}

async function boot() {
  await initAuth();
  init();
}

document.addEventListener('DOMContentLoaded', boot);
if(document.readyState!=='loading') boot();


