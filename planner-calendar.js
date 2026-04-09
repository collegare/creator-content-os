// ================================================================
// PLANNER CALENDAR MODULE v2 — Enhanced calendar + planning view
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

  // Updated stages per Maya's request
  const STAGES = ['Ideation', 'Scripting', 'Filming', 'Editing', 'Posting', 'Complete', 'Archive'];

  const STATUS_COLORS = {
    'Ideation':  { bg: '#FFF4E6', border: '#E8912D', text: '#B5630A', dot: '#E8912D' },
    'Scripting': { bg: '#FFF8E1', border: '#D4A017', text: '#8B6914', dot: '#D4A017' },
    'Filming':   { bg: '#FDE8E8', border: '#D94F4F', text: '#A33030', dot: '#D94F4F' },
    'Editing':   { bg: '#F0E6FF', border: '#8B5CF6', text: '#5B21B6', dot: '#8B5CF6' },
    'Posting':   { bg: '#E0F2FE', border: '#3B82F6', text: '#1D4ED8', dot: '#3B82F6' },
    'Complete':  { bg: '#DCFCE7', border: '#22C55E', text: '#15803D', dot: '#22C55E' },
    'Archive':   { bg: '#F1F1F1', border: '#9CA3AF', text: '#6B7280', dot: '#9CA3AF' },
    // Legacy mappings
    'Idea':      { bg: '#FFF4E6', border: '#E8912D', text: '#B5630A', dot: '#E8912D' },
    'Scheduled': { bg: '#E0F2FE', border: '#3B82F6', text: '#1D4ED8', dot: '#3B82F6' },
    'Posted':    { bg: '#DCFCE7', border: '#22C55E', text: '#15803D', dot: '#22C55E' },
    'Reviewing': { bg: '#F1F1F1', border: '#9CA3AF', text: '#6B7280', dot: '#9CA3AF' }
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
    const calLegend = document.getElementById('calendarLegend');
    if (calGrid) calGrid.style.display = viewMode === 'calendar' ? 'grid' : 'none';
    if (listGrid) listGrid.style.display = viewMode === 'list' ? 'grid' : 'none';
    if (calNav) calNav.style.display = viewMode === 'calendar' ? 'flex' : 'none';
    if (calLegend) calLegend.style.display = viewMode === 'calendar' ? 'flex' : 'none';
  }

  function render() {
    updateViewToggle();
    if (viewMode === 'calendar') {
      renderCalendar();
      renderStageLegend();
    }
  }

  function getItemDate(item) {
    return item.postDate || item.filmDate || item.editDate || null;
  }

  function renderStageLegend() {
    const legend = document.getElementById('calendarLegend');
    if (!legend) return;
    legend.innerHTML = STAGES.map(stage => {
      const c = STATUS_COLORS[stage];
      const items = getArr(CONTENT_KEY).filter(i => i.status === stage);
      return `<div class="legend-item">
        <span class="legend-dot" style="background:${c.dot}"></span>
        <span class="legend-label">${stage}</span>
        <span class="legend-count">${items.length}</span>
      </div>`;
    }).join('');
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
    const firstDay = new Date(year, month, 1).getDay();
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
      html += buildDayCell(day, dateStr, dayItems, true, false);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayItems = dateMap[dateStr] || [];
      html += buildDayCell(day, dateStr, dayItems, false, isToday);
    }

    // Fill remaining cells
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextMonthDate = new Date(year, month + 1, i);
      const dateStr = nextMonthDate.toISOString().split('T')[0];
      const dayItems = dateMap[dateStr] || [];
      html += buildDayCell(i, dateStr, dayItems, true, false);
    }

    grid.innerHTML = html;

    // Wire up click handlers for items
    grid.querySelectorAll('.cal-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        if (id && typeof window.editContent === 'function') {
          window.editContent(id);
        }
      });
    });

    // Wire up click on empty day to add content with pre-filled date
    grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.cal-item')) return;
        const date = el.dataset.date;
        if (date && !el.classList.contains('cal-day-outside') && typeof window.openContentModal === 'function') {
          window.openContentModal(null, date);
        }
      });
    });

    // Handle empty state
    const empty = document.getElementById('content-empty');
    if (empty) empty.style.display = items.length === 0 ? 'block' : 'none';
  }

  function buildDayCell(day, dateStr, items, isOutside, isToday) {
    const classes = ['cal-day'];
    if (isOutside) classes.push('cal-day-outside');
    if (isToday) classes.push('cal-day-today');

    let html = `<div class="${classes.join(' ')}" data-date="${dateStr}">`;
    html += `<div class="cal-day-header">`;
    html += `<span class="cal-day-number${isToday ? ' today-marker' : ''}">${day}</span>`;
    if (!isOutside && items.length === 0) {
      html += `<span class="cal-add-hint"><i class="ph ph-plus"></i></span>`;
    }
    html += `</div>`;
    html += renderDayItems(items);
    html += `</div>`;
    return html;
  }

  function renderDayItems(items) {
    if (!items.length) return '';
    const maxShow = 3;
    let html = '<div class="cal-day-items">';
    items.slice(0, maxShow).forEach(item => {
      const colors = STATUS_COLORS[item.status] || STATUS_COLORS['Ideation'];
      const icon = PLATFORM_ICONS[item.platform] || 'ph-note';
      const title = item.idea.length > 22 ? item.idea.substring(0, 22) + '...' : item.idea;
      html += `<div class="cal-item" data-id="${item.id}" style="background:${colors.bg};border-left:3px solid ${colors.border};" title="${item.idea} \u2014 ${item.status}">
        <i class="ph ${icon} cal-item-icon" style="color:${colors.border}"></i>
        <span class="cal-item-title" style="color:${colors.text}">${title}</span>
      </div>`;
    });
    if (items.length > maxShow) {
      html += `<div class="cal-item-more">+${items.length - maxShow} more</div>`;
    }
    html += '</div>';
    return html;
  }

  return { init, render, STAGES, STATUS_COLORS };
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
