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
  let lineChart = null;
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
    // Revenue form — use button click instead of form submit for reliability
    const logBtn = document.getElementById('logRevenueBtn');
    if (logBtn) logBtn.addEventListener('click', e => { e.preventDefault(); logRevenue(); });

    // Also prevent form submission entirely
    const form = document.getElementById('logRevenueForm');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); logRevenue(); });

    // Roadmap question flow
    const startRoadmapBtn = document.getElementById('startRoadmapBtn');
    if (startRoadmapBtn) startRoadmapBtn.addEventListener('click', startRoadmapFlow);

    // Chart filter buttons
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

  // ---- Single Line Chart ----

  function renderCharts() {
    const chartEl = document.getElementById('revenueLineChart');
    if (!chartEl) return;
    if (chartEl.offsetParent === null) return;

    const entries = getData();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - currentMonthFilter);

    const filtered = entries.filter(e => new Date(e.date) >= cutoff);
    const byMonth = {};

    filtered.forEach(e => {
      const m = (e.date||'').substring(0,7);
      const a = parseFloat(e.amount)||0;
      byMonth[m] = (byMonth[m]||0) + a;
    });

    // Fill in missing months so the line is continuous
    const months = [];
    const now = new Date();
    for (let i = currentMonthFilter - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      months.push(key);
    }

    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(y, mo-1).toLocaleDateString('en-US', {month:'short', year:'2-digit'});
    });
    const data = months.map(m => byMonth[m] || 0);

    if (lineChart) lineChart.destroy();
    lineChart = new Chart(chartEl.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Revenue',
          data,
          borderColor: '#6B2D0F',
          backgroundColor: 'rgba(107,45,15,0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#6B2D0F',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: {display:false}, ticks: {color:'#3a2a1a', font:{size:11}} },
          y: {
            beginAtZero: true,
            ticks: { color:'#3a2a1a', font:{size:11}, callback: v => '$' + v.toLocaleString() },
            grid: { color:'#e6d5c3' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#3a2a1a',
            titleFont: {size:13},
            bodyFont: {size:12},
            padding: 10,
            callbacks: { label: ctx => 'Revenue: ' + fmt(ctx.parsed.y) }
          }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }

  // ---- Revenue Logging ----

  function logRevenue() {
    const dateEl = document.getElementById('revenueDate');
    const typeEl = document.getElementById('revenueType');
    const amountEl = document.getElementById('revenueAmount');
    const notesEl = document.getElementById('revenueNotes');

    const date = dateEl ? dateEl.value : '';
    const type = typeEl ? typeEl.value : '';
    const amount = amountEl ? parseFloat(amountEl.value) : 0;
    const notes = notesEl ? notesEl.value : '';

    if (!date || !type || !amount || amount <= 0) {
      if (typeof toast === 'function') toast('Please fill in date, type, and amount', 'error');
      return;
    }

    const data = getData();
    data.push({ id: uid(), date, type, amount, notes });
    saveData(data);

    // Reset form fields manually instead of form.reset()
    if (amountEl) amountEl.value = '';
    if (notesEl) notesEl.value = '';
    if (typeEl) typeEl.selectedIndex = 0;
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

  // ---- AI Roadmap — Interactive Question Flow ----

  const ROADMAP_QUESTIONS = [
    {
      id: 'revenueGoal',
      question: 'What is your monthly revenue goal?',
      subtitle: 'Dream big — where do you want to be in 6-12 months?',
      type: 'select',
      options: ['$500/mo', '$1,000/mo', '$2,500/mo', '$5,000/mo', '$10,000/mo', '$25,000+/mo']
    },
    {
      id: 'niche',
      question: 'What is your niche or area of expertise?',
      subtitle: 'The topic or industry you create content about.',
      type: 'text',
      placeholder: 'e.g., Fitness coaching, personal finance, tech reviews, cooking...'
    },
    {
      id: 'audience',
      question: 'Who is your ideal audience?',
      subtitle: 'Think about who benefits most from your content.',
      type: 'text',
      placeholder: 'e.g., Beginner entrepreneurs ages 25-35, busy moms, college students...'
    },
    {
      id: 'platforms',
      question: 'What platforms are you most active on?',
      subtitle: 'Select all that apply.',
      type: 'multi',
      options: ['Instagram', 'TikTok', 'YouTube', 'X / Twitter', 'LinkedIn', 'Blog/Newsletter', 'Podcast']
    },
    {
      id: 'strengths',
      question: 'What are your biggest strengths as a creator?',
      subtitle: 'What do you enjoy doing and what comes naturally to you?',
      type: 'text',
      placeholder: 'e.g., Storytelling, video editing, teaching, community building...'
    },
    {
      id: 'offering',
      question: 'What knowledge or skills could you package into a product?',
      subtitle: 'Think about what your audience asks you about most.',
      type: 'text',
      placeholder: 'e.g., Meal planning templates, coding tutorials, workout programs...'
    },
    {
      id: 'currentRevenue',
      question: 'What does your current monetization look like?',
      subtitle: 'No judgment — just a starting point.',
      type: 'select',
      options: ['Not monetizing yet', 'Under $100/mo', '$100-$500/mo', '$500-$2,000/mo', '$2,000-$5,000/mo', '$5,000+/mo']
    },
    {
      id: 'biggestChallenge',
      question: 'What is your biggest monetization challenge right now?',
      subtitle: 'What feels like the main blocker?',
      type: 'select',
      options: [
        "I don't know where to start",
        "I don't have enough audience yet",
        "I don't know what to sell",
        "I struggle with pricing",
        "I can't stay consistent",
        "I need better systems/tools",
        "Other"
      ]
    }
  ];

  let roadmapStep = 0;
  let roadmapAnswers = {};

  function startRoadmapFlow() {
    roadmapStep = 0;
    roadmapAnswers = {};
    showRoadmapQuestion();
  }

  function showRoadmapQuestion() {
    const container = document.getElementById('roadmapQuestionFlow');
    const initial = document.getElementById('roadmapInitial');
    const results = document.getElementById('roadmapResults');
    const loading = document.getElementById('roadmapLoading');

    if (initial) initial.style.display = 'none';
    if (results) results.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (!container) return;

    container.style.display = 'block';

    if (roadmapStep >= ROADMAP_QUESTIONS.length) {
      generateRoadmap();
      return;
    }

    const q = ROADMAP_QUESTIONS[roadmapStep];
    const progress = Math.round(((roadmapStep) / ROADMAP_QUESTIONS.length) * 100);

    let inputHtml = '';
    if (q.type === 'text') {
      inputHtml = `<input type="text" id="roadmapInput" class="roadmap-input" placeholder="${q.placeholder || ''}" autocomplete="off">`;
    } else if (q.type === 'select') {
      inputHtml = `<div class="roadmap-options">${q.options.map((opt, i) =>
        `<button type="button" class="roadmap-option-btn" data-value="${opt}">${opt}</button>`
      ).join('')}</div>`;
    } else if (q.type === 'multi') {
      inputHtml = `<div class="roadmap-options multi">${q.options.map((opt, i) =>
        `<button type="button" class="roadmap-option-btn" data-value="${opt}">${opt}</button>`
      ).join('')}</div>
      <button type="button" class="btn btn-primary roadmap-next-btn" id="roadmapMultiNext" style="margin-top:12px;">Continue</button>`;
    }

    container.innerHTML = `
      <div class="roadmap-question-card">
        <div class="roadmap-progress-bar"><div class="roadmap-progress-fill" style="width:${progress}%"></div></div>
        <div class="roadmap-step-label">Question ${roadmapStep + 1} of ${ROADMAP_QUESTIONS.length}</div>
        <h3 class="roadmap-question-text">${q.question}</h3>
        <p class="roadmap-question-subtitle">${q.subtitle}</p>
        ${inputHtml}
        ${q.type === 'text' ? '<button type="button" class="btn btn-primary roadmap-next-btn" id="roadmapTextNext">Next</button>' : ''}
        ${roadmapStep > 0 ? '<button type="button" class="roadmap-back-btn" id="roadmapBack"><i class="ph ph-arrow-left"></i> Back</button>' : ''}
      </div>
    `;

    // Event listeners
    if (q.type === 'select') {
      container.querySelectorAll('.roadmap-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          roadmapAnswers[q.id] = btn.dataset.value;
          roadmapStep++;
          showRoadmapQuestion();
        });
      });
    } else if (q.type === 'multi') {
      const selected = new Set();
      container.querySelectorAll('.roadmap-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.value;
          if (selected.has(val)) { selected.delete(val); btn.classList.remove('selected'); }
          else { selected.add(val); btn.classList.add('selected'); }
        });
      });
      const nextBtn = document.getElementById('roadmapMultiNext');
      if (nextBtn) nextBtn.addEventListener('click', () => {
        roadmapAnswers[q.id] = Array.from(selected);
        roadmapStep++;
        showRoadmapQuestion();
      });
    } else if (q.type === 'text') {
      const input = document.getElementById('roadmapInput');
      const nextBtn = document.getElementById('roadmapTextNext');
      if (nextBtn) nextBtn.addEventListener('click', () => {
        if (input && input.value.trim()) {
          roadmapAnswers[q.id] = input.value.trim();
          roadmapStep++;
          showRoadmapQuestion();
        }
      });
      if (input) input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && input.value.trim()) {
          roadmapAnswers[q.id] = input.value.trim();
          roadmapStep++;
          showRoadmapQuestion();
        }
      });
      // Auto-focus
      setTimeout(() => { if (input) input.focus(); }, 100);
    }

    const backBtn = document.getElementById('roadmapBack');
    if (backBtn) backBtn.addEventListener('click', () => { roadmapStep--; showRoadmapQuestion(); });
  }

  // ---- AI Roadmap Generation ----

  async function generateRoadmap() {
    const container = document.getElementById('roadmapQuestionFlow');
    const loading = document.getElementById('roadmapLoading');
    if (container) container.style.display = 'none';
    if (loading) loading.style.display = 'flex';

    try {
      const resp = await fetch('/api/ai/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: roadmapAnswers, revenueData: getData() })
      });
      if (!resp.ok) throw new Error('Server error — ' + resp.status);
      const roadmap = await resp.json();
      if (roadmap.error) throw new Error(roadmap.error);
      localStorage.setItem(ROADMAP_KEY, JSON.stringify(roadmap));
      showRoadmap(roadmap);
    } catch(err) {
      console.error('Roadmap error:', err);
      if (typeof toast === 'function') toast('Error: ' + err.message, 'error');
      else alert('Error generating roadmap: ' + err.message);
      if (container) container.style.display = 'none';
      if (loading) loading.style.display = 'none';
      const initial = document.getElementById('roadmapInitial');
      if (initial) initial.style.display = 'flex';
    }
  }

  function loadSavedRoadmap() {
    try {
      const saved = JSON.parse(localStorage.getItem(ROADMAP_KEY));
      if (saved && saved.recommendedStreams) showRoadmap(saved);
    } catch(e) {}
  }

  function showRoadmap(r) {
    const initial = document.getElementById('roadmapInitial');
    const loading = document.getElementById('roadmapLoading');
    const flow = document.getElementById('roadmapQuestionFlow');
    const el = document.getElementById('roadmapResults');
    if (initial) initial.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (flow) flow.style.display = 'none';
    if (!el) return;
    el.style.display = 'block';

    let html = `<div class="roadmap-header-actions">
      <button type="button" class="btn btn-secondary" id="regenerateRoadmapBtn"><i class="ph ph-arrows-clockwise"></i> Start Over</button>
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
      html += `<div class="roadmap-section roadmap-target-section"><h4><i class="ph ph-target"></i> Your Monthly Revenue Target</h4>
        <div class="roadmap-target-card"><div class="roadmap-target-amount">${fmt(r.monthlyTarget)}</div>
        <p class="roadmap-target-desc">Realistic target based on your answers and niche</p></div></div>`;
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
      const initial = document.getElementById('roadmapInitial');
      if (initial) initial.style.display = 'flex';
    });
  }

  return { init, renderAll, renderCharts };
})();

// Override old initMonetization so existing script.js calls route here
function initMonetization() { MonetizationModule.init(); }

// Also handle tab switching — call full init (not just renderCharts) to ensure listeners are set up
const origSwitchTab = window.switchTab;
if (typeof origSwitchTab === 'function') {
  window.switchTab = function(tab) {
    origSwitchTab(tab);
    if (tab === 'monetization') {
      setTimeout(() => MonetizationModule.init(), 50);
    }
  };
}

