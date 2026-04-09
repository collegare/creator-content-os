// ================================================================
// MONETIZATION MODULE — Overrides built-in monetization functions
// Load AFTER script.js to replace old monetization behavior
// ================================================================

const MonetizationModule = (() => {
  const MONET_KEY = 'ccos_monetization';
  const SETTINGS_KEY = 'ccos_settings';
  const ROADMAP_KEY = 'ccos_ai_roadmap';

  const REVENUE_TYPES = {
    'Brand Deals': '#8B4513',
    'Digital Products': '#C4841D',
    'Affiliate': '#6B8E23',
    'Services': '#CD5C5C',
    'Memberships': '#4682B4',
    'Consulting': '#9370DB',
    'Ad Revenue': '#20B2AA',
    'Other': '#708090'
  };

  let currentMonthFilter = 6;
  let barChart = null;
  let trendChart = null;
  let initialized = false;

  function init() {
    if (initialized) { renderAll(); return; }
    initialized = true;
    setDefaultDate();
    setupListeners();
    renderAll();
    loadSavedRoadmap();
  }

  function renderAll() {
    renderSummary();
    renderCharts();
    renderHistory();
  }

  function setDefaultDate() {
    const el = document.getElementById('revenueDate');
    if (el) el.value = new Date().toISOString().split('T')[0];
  }

  function setupListeners() {
    const form = document.getElementById('logRevenueForm');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); logRevenue(); });

    const genBtn = document.getElementById('generateRoadmapBtn');
    if (genBtn) genBtn.addEventListener('click', generateRoadmap);

    document.querySelectorAll('.monet-chart-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.monet-chart-filters .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentMonthFilter = parseInt(e.target.dataset.months);
        renderCharts();
      });
    });
  }

  // ---- Data Layer ----

  function getData() {
    try {
      const raw = localStorage.getItem(MONET_KEY);
      if (!raw) return [];
      let arr = JSON.parse(raw);
      return arr.map(e => {
        if (e.month && e.stream && !e.date) {
          return { id: e.id || uid(), date: e.month + '-01', type: e.stream, amount: e.amount, notes: e.notes || '' };
        }
        return { ...e, id: e.id || uid(), type: e.type || e.stream || 'Other' };
      });
    } catch(e) { return []; }
  }

  function saveData(arr) { localStorage.setItem(MONET_KEY, JSON.stringify(arr)); }
  function uid() { return 'r' + Date.now() + Math.random().toString(36).substr(2,6); }
  function fmt(n) { return '$' + Number(n||0).toLocaleString('en-US', {maximumFractionDigits:0}); }
  function fmtDate(d) { return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function curMonth() { const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); }
  function prevMonth() { const n=new Date(); n.setMonth(n.getMonth()-1); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); }

  // ---- Summary Cards ----

  function renderSummary() {
    const entries = getData();
    const cm = curMonth(), pm = prevMonth();
    let total=0, thisM=0, lastM=0, byMonth={};
    entries.forEach(e => {
      const a = parseFloat(e.amount)||0;
      total += a;
      const m = (e.date||'').substring(0,7);
      if (m===cm) thisM+=a;
      if (m===pm) lastM+=a;
      byMonth[m] = (byMonth[m]||0) + a;
    });
    const best = Object.values(byMonth).length ? Math.max(...Object.values(byMonth)) : 0;
    const growth = lastM > 0 ? ((thisM - lastM)/lastM)*100 : (thisM > 0 ? 100 : 0);

    const el = id => document.getElementById(id);
    if (el('totalRevenueValue')) el('totalRevenueValue').textContent = fmt(total);
    if (el('thisMonthRevenueValue')) el('thisMonthRevenueValue').textContent = fmt(thisM);
    if (el('bestMonthRevenueValue')) el('bestMonthRevenueValue').textContent = fmt(best);

    const gv = el('growthPercentValue');
    if (gv) gv.textContent = Math.abs(growth).toFixed(1) + '%';

    const gi = el('growthChangeIndicator');
    if (gi) {
      if (growth > 0) { gi.innerHTML = '<i class="ph ph-arrow-up"></i> Growing'; gi.className = 'monet-summary-change positive'; }
      else if (growth < 0) { gi.innerHTML = '<i class="ph ph-arrow-down"></i> Declining'; gi.className = 'monet-summary-change negative'; }
      else { gi.innerHTML = '<i class="ph ph-minus"></i> Flat'; gi.className = 'monet-summary-change flat'; }
    }
  }

  // ---- Charts ----

  function renderCharts() {
    const barEl = document.getElementById('revenueBarChart');
    const trendEl = document.getElementById('revenueTrendChart');
    if (!barEl || !trendEl) return;
    // Only render if visible
    if (barEl.offsetParent === null) return;

    const entries = getData();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - currentMonthFilter);

    const filtered = entries.filter(e => new Date(e.date) >= cutoff);
    const byMonthType = {}, typeTotals = {};

    filtered.forEach(e => {
      const m = (e.date||'').substring(0,7), t = e.type||'Other', a = parseFloat(e.amount)||0;
      if (!byMonthType[m]) byMonthType[m] = {};
      byMonthType[m][t] = (byMonthType[m][t]||0) + a;
      typeTotals[t] = (typeTotals[t]||0) + a;
    });

    const months = Object.keys(byMonthType).sort();
    const types = Object.keys(REVENUE_TYPES).filter(t => typeTotals[t]);
    const labels = months.map(m => { const [y,mo]=m.split('-'); return new Date(y,mo-1).toLocaleDateString('en-US',{month:'short'}); });

    // Stacked bar
    if (barChart) barChart.destroy();
    barChart = new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: types.map(t => ({
          label: t,
          data: months.map(m => byMonthType[m][t]||0),
          backgroundColor: REVENUE_TYPES[t],
          borderWidth: 0
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid:{display:false}, ticks:{color:'#3a2a1a'} },
          y: { stacked: true, ticks:{color:'#3a2a1a', callback:v=>'$'+v.toLocaleString()}, grid:{color:'#e6d5c3'} }
        },
        plugins: {
          legend: { position:'top', labels:{color:'#3a2a1a',usePointStyle:true,padding:15} },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label+': '+fmt(ctx.parsed.y) } }
        }
      }
    });

    // Trend line
    const totals = months.map(m => types.reduce((s,t) => s+(byMonthType[m][t]||0), 0));
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(trendEl.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total Revenue',
          data: totals,
          borderColor: '#6B2D0F',
          backgroundColor: 'rgba(107,45,15,0.05)',
          borderWidth: 2, fill: true, tension: 0.4,
          pointBackgroundColor: '#6B2D0F', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid:{display:false}, ticks:{color:'#3a2a1a',font:{size:11}} },
          y: { ticks:{color:'#3a2a1a',font:{size:11},callback:v=>fmt(v)}, grid:{color:'#e6d5c3'} }
        },
        plugins: { legend:{display:false}, tooltip:{ callbacks:{label:ctx=>'Total: '+fmt(ctx.parsed.y)} } }
      }
    });
  }

  // ---- Revenue Logging ----

  function logRevenue() {
    const date = document.getElementById('revenueDate').value;
    const type = document.getElementById('revenueType').value;
    const amount = parseFloat(document.getElementById('revenueAmount').value);
    const notes = document.getElementById('revenueNotes').value;
    if (!date || !type || !amount) return;

    const data = getData();
    data.push({ id: uid(), date, type, amount, notes });
    saveData(data);

    document.getElementById('logRevenueForm').reset();
    setDefaultDate();
    renderAll();
    if (typeof toast === 'function') toast('Revenue logged!');
  }

  function deleteRevenue(id) {
    if (!confirm('Delete this transaction?')) return;
    saveData(getData().filter(e => e.id !== id));
    renderAll();
  }

  function renderHistory() {
    const el = document.getElementById('revenueHistory');
    if (!el) return;
    const sorted = getData().sort((a,b) => new Date(b.date) - new Date(a.date));
    if (!sorted.length) { el.innerHTML = '<div class="monet-history-empty">No transactions logged yet</div>'; return; }

    el.innerHTML = sorted.map(e => `
      <div class="monet-history-item">
        <div class="monet-history-date">${fmtDate(e.date)}</div>
        <div class="monet-history-type"><span class="type-dot" style="background:${REVENUE_TYPES[e.type]||'#708090'}"></span>${e.type}</div>
        <div class="monet-history-amount">${fmt(e.amount)}</div>
        <div class="monet-history-notes">${e.notes ? '<span class="note-badge">'+e.notes+'</span>' : ''}</div>
        <button class="monet-history-delete" data-id="${e.id}" title="Delete"><i class="ph ph-trash"></i></button>
      </div>
    `).join('');

    el.querySelectorAll('.monet-history-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteRevenue(btn.dataset.id));
    });
  }

  // ---- AI Roadmap ----

  async function generateRoadmap() {
    const settings = localStorage.getItem(SETTINGS_KEY);
    let profile;
    try { profile = JSON.parse(settings); } catch(e) {}
    if (!profile || !profile.niche) {
      if (typeof toast === 'function') toast('Please complete your Creator Profile in Settings first', 'error');
      else alert('Please complete your Creator Profile in Settings first');
      return;
    }

    document.getElementById('roadmapInitial').style.display = 'none';
    document.getElementById('roadmapLoading').style.display = 'flex';
    document.getElementById('roadmapResults').style.display = 'none';

    try {
      const resp = await fetch('/api/ai/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, revenueData: getData() })
      });
      if (!resp.ok) throw new Error('Server error \u2014 ' + resp.status);
      const roadmap = await resp.json();
      if (roadmap.error) throw new Error(roadmap.error);
      localStorage.setItem(ROADMAP_KEY, JSON.stringify(roadmap));
      showRoadmap(roadmap);
    } catch(err) {
      console.error('Roadmap error:', err);
      if (typeof toast === 'function') toast('Error: ' + err.message, 'error');
      else alert('Error generating roadmap: ' + err.message);
      document.getElementById('roadmapInitial').style.display = 'flex';
      document.getElementById('roadmapLoading').style.display = 'none';
    }
  }

  function loadSavedRoadmap() {
    try {
      const saved = JSON.parse(localStorage.getItem(ROADMAP_KEY));
      if (saved && saved.recommendedStreams) showRoadmap(saved);
    } catch(e) {}
  }

  function showRoadmap(r) {
    document.getElementById('roadmapInitial').style.display = 'none';
    document.getElementById('roadmapLoading').style.display = 'none';
    const el = document.getElementById('roadmapResults');
    el.style.display = 'block';

    let html = `<div class="roadmap-header-actions">
      <button type="button" class="btn btn-secondary" id="regenerateRoadmapBtn"><i class="ph ph-arrows-clockwise"></i> Regenerate</button>
    </div>`;

    if (r.recommendedStreams && r.recommendedStreams.length) {
      html += `<div class="roadmap-section"><h4><i class="ph ph-lightning"></i> Recommended Revenue Streams</h4><div class="roadmap-items">`;
      r.recommendedStreams.forEach(s => {
        html += `<div class="roadmap-item"><div class="roadmap-item-header">
          <span class="roadmap-item-title">${s.name||s}</span>
          ${s.priority ? '<span class="roadmap-badge priority-'+s.priority.toLowerCase()+'">'+s.priority+'</span>' : ''}
        </div>
        ${s.description ? '<p class="roadmap-item-desc">'+s.description+'</p>' : ''}
        ${s.potentialMonthly ? '<p class="roadmap-item-detail"><strong>Potential Monthly:</strong> '+fmt(s.potentialMonthly)+'</p>' : ''}
        </div>`;
      });
      html += '</div></div>';
    }

    if (r.quickWins && r.quickWins.length) {
      html += `<div class="roadmap-section"><h4><i class="ph ph-rocket"></i> Quick Wins (This Week)</h4><div class="roadmap-items">`;
      r.quickWins.forEach(w => {
        html += `<div class="roadmap-item"><div class="roadmap-item-header">
          <span class="roadmap-item-title">${w.action||w}</span>
          <span class="roadmap-badge difficulty-${(w.difficulty||'easy').toLowerCase()}">${w.difficulty||'Easy'}</span>
        </div>
        ${w.description ? '<p class="roadmap-item-desc">'+w.description+'</p>' : ''}
        ${w.timeRequired ? '<p class="roadmap-item-detail"><strong>Time:</strong> '+w.timeRequired+'</p>' : ''}
        </div>`;
      });
      html += '</div></div>';
    }

    if (r.thirtyDayPlan && r.thirtyDayPlan.length) {
      html += `<div class="roadmap-section"><h4><i class="ph ph-calendar"></i> 30-Day Action Plan</h4><div class="roadmap-timeline">`;
      r.thirtyDayPlan.forEach((p,i) => {
        html += `<div class="roadmap-timeline-item">
          <div class="roadmap-timeline-week">Week ${i+1}</div>
          <div class="roadmap-timeline-action">${p.action||p}</div>
          ${p.description ? '<p class="roadmap-timeline-desc">'+p.description+'</p>' : ''}
        </div>`;
      });
      html += '</div></div>';
    }

    if (r.monthlyTarget) {
      html += `<div class="roadmap-section roadmap-target-section"><h4><i class="ph ph-target"></i> Monthly Revenue Target</h4>
        <div class="roadmap-target-card"><div class="roadmap-target-amount">${fmt(r.monthlyTarget)}</div>
        <p class="roadmap-target-desc">Realistic target based on your niche and stage</p></div></div>`;
    }

    if (r.recommendedTools && r.recommendedTools.length) {
      html += `<div class="roadmap-section"><h4><i class="ph ph-toolbox"></i> Recommended Tools & Platforms</h4><div class="roadmap-tools">`;
      r.recommendedTools.forEach(t => {
        html += `<div class="roadmap-tool-item">
          <div class="roadmap-tool-name">${t.name||t}</div>
          ${t.purpose ? '<p class="roadmap-tool-purpose">'+t.purpose+'</p>' : ''}
          ${t.pricingTier ? '<span class="roadmap-pricing">'+t.pricingTier+'</span>' : ''}
        </div>`;
      });
      html += '</div></div>';
    }

    el.innerHTML = html;

    document.getElementById('regenerateRoadmapBtn').addEventListener('click', () => {
      localStorage.removeItem(ROADMAP_KEY);
      el.innerHTML = '';
      el.style.display = 'none';
      document.getElementById('roadmapInitial').style.display = 'flex';
    });
  }

  return { init, renderAll, renderCharts };
})();

// Override old initMonetization so existing script.js calls route here
function initMonetization() { MonetizationModule.init(); }

// Also handle tab switching \u2014 re-render charts when tab becomes visible
const origSwitchTab = window.switchTab;
if (typeof origSwitchTab === 'function') {
  window.switchTab = function(tab) {
    origSwitchTab(tab);
    if (tab === 'monetization') {
      setTimeout(() => MonetizationModule.renderCharts(), 50);
    }
  };
}
