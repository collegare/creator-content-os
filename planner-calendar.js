// ================================================================
// PLANNER CALENDAR MODULE — Adds calendar view to Content Planner
// Load AFTER script.js
// ================================================================

const PlannerCalendar = (() => {
  const CONTENT_KEY = 'ccos_content';
  let currentDate = new Date();
  let viewMode = 'calendar'; // 'calendar' or 'list'
  let initialized = false;

  function getArr(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
  }

  function init() {
    if (initialized) { render(); return; }
    initialized = true;
    setupCalendarControls();
    render();
  }

  function setupCalendarControls() {
    const prevBtn = document.getElementById('calPrevMonth');
    const nextBtn = document.getElementById('calNextMonth');
    const todayBtn = document.getElementById('calToday');
    const calViewBtn = document.getElementById('viewCalendar');
    const listViewBtn = document.getElementById('viewList');

    if (prevBtn) prevBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); render(); });
    if (todayBtn) todayBtn.addEventListener('click', () => { currentDate = new Date(); render(); });

    if (calViewBtn) calViewBtn.addEventListener('click', () => { viewMode = 'calendar'; updateViewToggle(); render(); });
    if (listViewBtn) listViewBtn.addEventListener('click', () => { viewMode = 'list'; updateViewToggle(); render(); });
  }

  function updateViewToggle() {
    const calBtn = document.getElementById('viewCalendar');
    const listBtn = document.getElementById('viewList');
    if (calBtn) calBtn.classList.toggle('active', viewMode === 'calendar');
    if (listBtn) listBtn.classList.toggle('active', viewMode === 'list');

    const calGrid = document.getElementById('calendarGrid');
    const listGrid = document.getElementById('content-grid');
    const calNav = document.getElementById('calendarNav');
    if (calGrid) calGrid.style.display = viewMode === 'calendar' ? 'grid' : 'none';
    if (listGrid) listGrid.style.display = viewMode === 'list' ? 'grid' : 'none';
    if (calNav) calNav.style.display = viewMode === 'calendar' ? 'flex' : 'none';
  }

  function render() {
    updateViewToggle();
    if (viewMode === 'calendar') {
      renderCalendar();
    }
    // List view is handled by the original renderContentGrid in script.js
  }

  function getItemDate(item) {
    return item.postDate || item.filmDate || item.editDate || null;
  }

  function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthLabel = document.getElementById('calMonthLabel');
    if (!grid) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (monthLabel) {
      monthLabel.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const items = getArr(CONTENT_KEY);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Build map of date -> items
    const dateMap = {};
    items.forEach(item => {
      const d = getItemDate(item);
      if (d) {
        if (!dateMap[d]) dateMap[d] = [];
        dateMap[d].push(item);
      }
    });

    // Calendar math
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    let html = '';

    // Day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(d => {
      html += `<div class="cal-header-cell">${d}</div>`;
    });

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevMonthDate = new Date(year, month - 1, day);
      const dateStr = prevMonthDate.toISOString().split('T')[0];
      const dayItems = dateMap[dateStr] || [];
      html += `<div class="cal-day cal-day-outside">
        <div class="cal-day-number">${day}</div>
        ${renderDayItems(dayItems)}
      </div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayItems = dateMap[dateStr] || [];
      html += `<div class="cal-day${isToday ? ' cal-day-today' : ''}">
        <div class="cal-day-number${isToday ? ' today-marker' : ''}">${day}</div>
        ${renderDayItems(dayItems)}
      </div>`;
    }

    // Fill remaining cells to complete the grid (6 rows)
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextMonthDate = new Date(year, month + 1, i);
      const dateStr = nextMonthDate.toISOString().split('T')[0];
      const dayItems = dateMap[dateStr] || [];
      html += `<div class="cal-day cal-day-outside">
        <div class="cal-day-number">${i}</div>
        ${renderDayItems(dayItems)}
      </div>`;
    }

    grid.innerHTML = html;

    // Wire up click handlers for items
    grid.querySelectorAll('.cal-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (id && typeof window.editContent === 'function') {
          window.editContent(id);
        }
      });
    });

    // Update pipeline stats
    renderPipelineStats(items);

    // Handle empty state
    const empty = document.getElementById('content-empty');
    if (empty) empty.style.display = items.length === 0 ? 'block' : 'none';
  }

  const STATUS_COLORS = {
    'Idea': '#9b8b7e',
    'Scripting': '#c4841d',
    'Filming': '#cd5c5c',
    'Editing': '#9370db',
    'Scheduled': '#4682b4',
    'Posted': '#22863a',
    'Reviewing': '#6b8e23'
  };

  const PLATFORM_ICONS = {
    'Instagram': 'ph-instagram-logo',
    'TikTok': 'ph-tiktok-logo',
    'YouTube': 'ph-youtube-logo',
    'LinkedIn': 'ph-linkedin-logo',
    'Twitter/X': 'ph-x-logo',
    'Pinterest': 'ph-pinterest-logo',
    'Blog': 'ph-article'
  };

  function renderDayItems(items) {
    if (!items.length) return '';
    const maxShow = 3;
    let html = '<div class="cal-day-items">';
    items.slice(0, maxShow).forEach(item => {
      const color = STATUS_COLORS[item.status] || '#9b8b7e';
      const icon = PLATFORM_ICONS[item.platform] || 'ph-note';
      const title = item.idea.length > 28 ? item.idea.substring(0, 28) + '...' : item.idea;
      html += `<div class="cal-item" data-id="${item.id}" style="border-left-color:${color};" title="${item.idea} (${item.status})">
        <i class="ph ${icon} cal-item-icon"></i>
        <span class="cal-item-title">${title}</span>
      </div>`;
    });
    if (items.length > maxShow) {
      html += `<div class="cal-item-more">+${items.length - maxShow} more</div>`;
    }
    html += '</div>';
    return html;
  }

  function renderPipelineStats(items) {
    const ps = document.getElementById('pipelineStats');
    if (!ps) return;
    const statusCounts = {};
    items.forEach(i => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });
    ps.innerHTML = Object.entries(statusCounts).map(([s, c]) => {
      const color = STATUS_COLORS[s] || '#9b8b7e';
      return `<span class="pipeline-stat" style="border-left:3px solid ${color};padding-left:8px;">${s}: ${c}</span>`;
    }).join('');
  }

  return { init, render };
})();

// Hook into tab switching to initialize calendar when planner tab is shown
const _origSwitchTab = window.switchTab;
if (typeof _origSwitchTab === 'function') {
  window.switchTab = function(tab) {
    _origSwitchTab(tab);
    if (tab === 'planner') {
      setTimeout(() => PlannerCalendar.init(), 50);
    }
    // Keep monetization hook
    if (tab === 'monetization') {
      setTimeout(() => { if (typeof MonetizationModule !== 'undefined') MonetizationModule.init(); }, 50);
    }
  };
}
