// ─── Timezones ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  ['Pacific/Honolulu',                'Hawaii (HST, UTC−10)'],
  ['America/Anchorage',               'Alaska (AKST, UTC−9)'],
  ['America/Los_Angeles',             'Pacific Time (PST/PDT)'],
  ['America/Denver',                  'Mountain Time (MST/MDT)'],
  ['America/Phoenix',                 'Arizona (MST, no DST)'],
  ['America/Chicago',                 'Central Time (CST/CDT)'],
  ['America/New_York',                'Eastern Time (EST/EDT)'],
  ['America/Halifax',                 'Atlantic Time (AST/ADT)'],
  ['America/St_Johns',                'Newfoundland (NST/NDT)'],
  ['America/Sao_Paulo',               'Brasília (BRT, UTC−3)'],
  ['America/Argentina/Buenos_Aires',  'Argentina (ART, UTC−3)'],
  ['UTC',                             'UTC'],
  ['Europe/London',                   'London (GMT/BST)'],
  ['Europe/Paris',                    'Paris / Berlin / Rome (CET/CEST)'],
  ['Europe/Helsinki',                 'Helsinki / Kyiv (EET/EEST)'],
  ['Europe/Moscow',                   'Moscow (MSK, UTC+3)'],
  ['Asia/Dubai',                      'Dubai (GST, UTC+4)'],
  ['Asia/Kolkata',                    'India (IST, UTC+5:30)'],
  ['Asia/Dhaka',                      'Bangladesh (BST, UTC+6)'],
  ['Asia/Bangkok',                    'Bangkok (ICT, UTC+7)'],
  ['Asia/Hong_Kong',                  'Hong Kong / Singapore (UTC+8)'],
  ['Asia/Tokyo',                      'Tokyo / Seoul (JST/KST, UTC+9)'],
  ['Australia/Adelaide',              'Adelaide (ACST/ACDT)'],
  ['Australia/Sydney',                'Sydney (AEST/AEDT)'],
  ['Pacific/Auckland',                'Auckland (NZST/NZDT)'],
];

function localTzValue() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Returns the UTC offset of a timezone at a given instant, in minutes.
// Positive = ahead of UTC (e.g. Tokyo +540), negative = behind (e.g. NY −240 during EDT).
function tzOffsetMinutes(tz, date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  });
  const p = {};
  fmt.formatToParts(date).forEach(({ type, value }) => { p[type] = parseInt(value, 10); });
  const h = p.hour === 24 ? 0 : p.hour;
  const tzMs = Date.UTC(p.year, p.month - 1, p.day, h, p.minute, p.second);
  return Math.round((tzMs - date.getTime()) / 60000);
}

function tzLabel(tzValue) {
  const found = TIMEZONES.find(([v]) => v === tzValue);
  if (found) return found[1];
  // Fallback: show the IANA name with current offset
  const off = tzOffsetMinutes(tzValue);
  const sign = off >= 0 ? '+' : '−';
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const m = String(Math.abs(off) % 60).padStart(2, '0');
  return `${tzValue} (UTC${sign}${h}:${m})`;
}

function populateTzSelect(selectEl, selectedValue) {
  selectEl.innerHTML = '';
  TIMEZONES.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  eventType: 'specific',
  selectedDates: new Set(),
  startHour: 9,
  endHour: 17,
  calYear: null,
  calMonth: null,

  event: null,
  responses: [],
  myAvailability: {},
  myResponseId: null,

  eventTz: 'America/New_York',   // timezone stored with the event
  displayTz: localTzValue(),     // what the viewer has chosen to see times in
};

// ─── DOM refs ────────────────────────────────────────────────────────────────

const createSection    = document.getElementById('create-section');
const eventSection     = document.getElementById('event-section');
const eventNameInput   = document.getElementById('event-name');
const createBtn        = document.getElementById('create-btn');
const createError      = document.getElementById('create-error');
const specificPicker   = document.getElementById('specific-picker');
const recurringPicker  = document.getElementById('recurring-picker');
const dateGridEl       = document.getElementById('date-grid');
const startHourSel     = document.getElementById('start-hour');
const endHourSel       = document.getElementById('end-hour');
const eventTzSel       = document.getElementById('event-timezone');
const eventTitle       = document.getElementById('event-title');
const eventMeta        = document.getElementById('event-meta');
const eventShareUrl    = document.getElementById('event-share-url');
const eventCopyBtn     = document.getElementById('event-copy-btn');
const eventCopyConfirm = document.getElementById('event-copy-confirm');
const displayTzName    = document.getElementById('display-tz-name');
const changeTzBtn      = document.getElementById('change-tz-btn');
const displayTzSelect  = document.getElementById('display-tz-select');
const participantName  = document.getElementById('participant-name');
const submitBtn        = document.getElementById('submit-btn');
const submitConfirm    = document.getElementById('submit-confirm');
const responseCount    = document.getElementById('response-count');
const myGridWrap       = document.getElementById('my-grid-wrap');
const resultsGridWrap  = document.getElementById('results-grid-wrap');
const hoverTooltip     = document.getElementById('hover-tooltip');

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatHour(h) {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  if (h === 24) return '12:00 AM (next day)';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function timeSlots(startHour, endHour) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

// Shift a "HH:MM" slot string by offsetMinutes, returning a new "HH:MM" string.
// Wraps around midnight so labels stay valid.
function shiftSlot(slot, offsetMinutes) {
  const [h, m] = slot.split(':').map(Number);
  const total = ((h * 60 + m + offsetMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Short label for a "HH:MM" string — only shown on the hour.
function slotShortLabel(slot) {
  const [h, m] = slot.split(':').map(Number);
  if (m !== 0) return '';
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

// Full readable label for a "HH:MM" string.
function slotFullLabel(slot) {
  const [h, m] = slot.split(':').map(Number);
  const suffix   = h < 12 ? 'AM' : 'PM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${suffix}`;
}

function cellKey(date, slot) { return `${date}_${slot}`; }

// Offset to apply when rendering labels: shift event-timezone slots → display-timezone labels.
function displayShift() {
  const evOff   = tzOffsetMinutes(state.eventTz);
  const dispOff = tzOffsetMinutes(state.displayTz);
  return dispOff - evOff;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatDateLabel(dateStr, type) {
  if (type === 'recurring') return dateStr.slice(0, 3);
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateSubLabel(dateStr, type) {
  if (type === 'recurring') return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

// ─── Create view ─────────────────────────────────────────────────────────────

function initCreateView() {
  // Time dropdowns
  for (let h = 0; h <= 23; h++) {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = formatHour(h);
    startHourSel.appendChild(opt);
  }
  for (let h = 1; h <= 24; h++) {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = formatHour(h);
    endHourSel.appendChild(opt);
  }
  startHourSel.value = 9;
  endHourSel.value   = 17;

  startHourSel.addEventListener('change', () => { state.startHour = parseInt(startHourSel.value); });
  endHourSel.addEventListener('change',   () => { state.endHour   = parseInt(endHourSel.value); });

  // Timezone select (default to user's local tz)
  const localTz = localTzValue();
  state.eventTz = localTz;
  populateTzSelect(eventTzSel, localTz);
  // If local tz isn't in our list, prepend it
  if (!TIMEZONES.find(([v]) => v === localTz)) {
    const opt = document.createElement('option');
    opt.value = localTz; opt.textContent = tzLabel(localTz); opt.selected = true;
    eventTzSel.prepend(opt);
  }
  eventTzSel.addEventListener('change', () => { state.eventTz = eventTzSel.value; });

  // Init calendar
  const now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth();
  renderCalendar();

  // Date type toggle
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.eventType = btn.dataset.type;
      state.selectedDates.clear();
      if (state.eventType === 'specific') {
        specificPicker.classList.remove('hidden');
        recurringPicker.classList.add('hidden');
        renderCalendar();
      } else {
        specificPicker.classList.add('hidden');
        recurringPicker.classList.remove('hidden');
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      }
    });
  });

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.day;
      if (state.selectedDates.has(day)) {
        state.selectedDates.delete(day); btn.classList.remove('active');
      } else {
        state.selectedDates.add(day); btn.classList.add('active');
      }
    });
  });

  createBtn.addEventListener('click', handleCreate);
  eventNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });
}

// ─── Calendar (month view) ────────────────────────────────────────────────────

function renderCalendar() {
  dateGridEl.innerHTML = '';

  const year  = state.calYear;
  const month = state.calMonth; // 0-indexed

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nowYear  = today.getFullYear();
  const nowMonth = today.getMonth();

  // Nav bar
  const nav = document.createElement('div');
  nav.className = 'cal-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'cal-nav-btn';
  prevBtn.textContent = '‹';
  const isCurrentMonth = year === nowYear && month === nowMonth;
  if (isCurrentMonth) prevBtn.disabled = true;
  prevBtn.addEventListener('click', () => {
    let m = state.calMonth - 1, y = state.calYear;
    if (m < 0) { m = 11; y--; }
    state.calYear = y; state.calMonth = m;
    renderCalendar();
  });

  const label = document.createElement('span');
  label.className = 'cal-month-label';
  label.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'cal-nav-btn';
  nextBtn.textContent = '›';
  nextBtn.addEventListener('click', () => {
    let m = state.calMonth + 1, y = state.calYear;
    if (m > 11) { m = 0; y++; }
    state.calYear = y; state.calMonth = m;
    renderCalendar();
  });

  nav.append(prevBtn, label, nextBtn);
  dateGridEl.appendChild(nav);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  // Day-of-week headers: Sun–Sat
  ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
    const hdr = document.createElement('div');
    hdr.className = 'cal-day-hdr';
    hdr.textContent = d;
    grid.appendChild(hdr);
  });

  // Leading empty cells
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // Day cells
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    date.setHours(0, 0, 0, 0);
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    if (date < today) {
      cell.classList.add('past');
    } else {
      if (date.getTime() === today.getTime()) cell.classList.add('today');
      if (state.selectedDates.has(iso)) cell.classList.add('active');

      cell.addEventListener('click', () => {
        if (state.selectedDates.has(iso)) {
          state.selectedDates.delete(iso); cell.classList.remove('active');
        } else {
          state.selectedDates.add(iso); cell.classList.add('active');
        }
      });
    }

    grid.appendChild(cell);
  }

  dateGridEl.appendChild(grid);
}

// ─── Create handler ───────────────────────────────────────────────────────────

async function handleCreate() {
  const name = eventNameInput.value.trim();
  if (!name)                           { showCreateError('Please enter an event name.'); return; }
  if (state.selectedDates.size === 0)  { showCreateError('Please select at least one date or day.'); return; }
  if (state.startHour >= state.endHour){ showCreateError('End time must be after start time.'); return; }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';
  createError.classList.add('hidden');

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type: state.eventType,
        dates: state.eventType === 'recurring'
          ? [...state.selectedDates].sort((a, b) =>
              ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(a) -
              ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(b))
          : [...state.selectedDates].sort(),
        startHour: state.startHour,
        endHour: state.endHour,
        timezone: state.eventTz,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { id } = await res.json();
    history.pushState(null, '', `/?id=${id}`);
    await showEventView(id);
  } catch {
    showCreateError('Failed to create event. Please try again.');
    createBtn.disabled = false;
    createBtn.textContent = 'Create event';
  }
}

function showCreateError(msg) {
  createError.textContent = msg;
  createError.classList.remove('hidden');
}

// ─── Event view ──────────────────────────────────────────────────────────────

async function showEventView(id) {
  createSection.classList.add('hidden');
  eventSection.classList.remove('hidden');

  try {
    const res = await fetch(`/api/events/${id}`);
    if (!res.ok) { eventTitle.textContent = 'Event not found.'; return; }

    const data = await res.json();
    state.event = data.event;
    state.responses = data.responses || [];
    state.eventTz   = data.event.timezone || 'UTC';
    state.displayTz = localTzValue(); // default to viewer's local tz

    const savedId = localStorage.getItem(`meetgrid_${id}`);
    const savedResponse = state.responses.find(r => r.id === savedId);
    if (savedResponse) {
      state.myResponseId = savedResponse.id;
      state.myAvailability = JSON.parse(savedResponse.availability || '{}');
      if (savedResponse.name) participantName.value = savedResponse.name;
    }

    renderEventHeader(id);
    initTzControls();
    renderMyGrid();
    renderResultsGrid();
    renderResponseList();

    submitBtn.addEventListener('click', handleSubmit);
    eventCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(eventShareUrl.value).then(() => {
        eventCopyConfirm.classList.remove('hidden');
        setTimeout(() => eventCopyConfirm.classList.add('hidden'), 2000);
      });
    });
  } catch {
    eventTitle.textContent = 'Failed to load event.';
  }
}

function renderEventHeader(id) {
  const ev = state.event;
  eventTitle.textContent = ev.name;
  document.title = `${ev.name} – MeetGrid`;

  const dateList = ev.dates.length <= 5
    ? ev.dates.map(d => formatDateLabel(d, ev.type)).join(', ')
    : `${ev.dates.length} ${ev.type === 'recurring' ? 'days' : 'dates'}`;
  eventMeta.textContent = `${dateList} · ${formatHour(ev.start_hour)} – ${formatHour(ev.end_hour)}`;

  eventShareUrl.value = `${location.origin}/?id=${id}`;
  responseCount.textContent = `${state.responses.length} response${state.responses.length !== 1 ? 's' : ''}`;
}

// ─── Timezone controls ────────────────────────────────────────────────────────

function initTzControls() {
  updateTzLabel();

  // Populate the change-tz dropdown, including the event's own tz if not in list
  const allTzs = [...TIMEZONES];
  if (!allTzs.find(([v]) => v === state.eventTz)) {
    allTzs.unshift([state.eventTz, tzLabel(state.eventTz)]);
  }
  displayTzSelect.innerHTML = '';
  allTzs.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    if (value === state.displayTz) opt.selected = true;
    displayTzSelect.appendChild(opt);
  });

  changeTzBtn.addEventListener('click', () => {
    const showing = !displayTzSelect.classList.contains('hidden');
    if (showing) {
      displayTzSelect.classList.add('hidden');
      changeTzBtn.textContent = 'Change';
    } else {
      displayTzSelect.classList.remove('hidden');
      changeTzBtn.textContent = 'Done';
      displayTzSelect.focus();
    }
  });

  displayTzSelect.addEventListener('change', () => {
    state.displayTz = displayTzSelect.value;
    updateTzLabel();
    renderMyGrid();
    renderResultsGrid();
  });
}

function updateTzLabel() {
  displayTzName.textContent = tzLabel(state.displayTz);
}

// ─── Grid rendering ──────────────────────────────────────────────────────────

function buildGrid(container, event, opts = {}) {
  const { interactive = false, responses = [], myAvailability = {} } = opts;
  const slots = timeSlots(event.start_hour, event.end_hour);
  const dates = event.dates;
  const shift = displayShift(); // minutes to add to slot labels

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'avail-grid';
  grid.style.setProperty('--num-dates', dates.length);

  // Header row
  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  dates.forEach(date => {
    const hdr = document.createElement('div');
    hdr.className = 'grid-date-header';
    const sub = formatDateSubLabel(date, event.type);
    hdr.innerHTML = sub
      ? `<span class="date-hdr-sub">${sub}</span><span class="date-hdr-main">${formatDateLabel(date, event.type)}</span>`
      : `<span class="date-hdr-main">${formatDateLabel(date, event.type)}</span>`;
    grid.appendChild(hdr);
  });

  // Slot rows
  slots.forEach(slot => {
    const displayedSlot = shiftSlot(slot, shift);

    const timeEl = document.createElement('div');
    timeEl.className = 'grid-time-label';
    timeEl.textContent = slotShortLabel(displayedSlot);
    grid.appendChild(timeEl);

    dates.forEach(date => {
      const key = cellKey(date, slot); // key always uses event-tz slot
      const cell = document.createElement('div');
      cell.className = 'grid-cell';

      if (interactive) {
        cell.dataset.key = key;
        cell.dataset.state = myAvailability[key] || 0;
      } else {
        cell.dataset.date = date;
        cell.dataset.slot = slot;
        if (responses.length > 0) {
          let score = 0;
          responses.forEach(r => {
            const av = JSON.parse(r.availability || '{}');
            const v = av[key] || 0;
            if (v === 1) score += 1;
            else if (v === 2) score += 0.5;
          });
          const pct = score / responses.length;
          cell.dataset.score = pct.toFixed(2);
          cell.style.setProperty('--score', pct);
        } else {
          cell.dataset.score = '0';
          cell.style.setProperty('--score', 0);
        }
      }

      grid.appendChild(cell);
    });
  });

  container.appendChild(grid);

  if (interactive) {
    attachDragInteraction(grid, myAvailability);
  } else {
    attachTooltipInteraction(grid, responses);
  }
}

function renderMyGrid() {
  buildGrid(myGridWrap, state.event, { interactive: true, myAvailability: state.myAvailability });
}

function renderResultsGrid() {
  buildGrid(resultsGridWrap, state.event, { interactive: false, responses: state.responses });
  responseCount.textContent = `${state.responses.length} response${state.responses.length !== 1 ? 's' : ''}`;
}

// ─── Drag interaction ─────────────────────────────────────────────────────────

function attachDragInteraction(grid, myAvailability) {
  let dragTarget = null;

  function applyCell(cell) {
    const key = cell.dataset.key;
    if (dragTarget === 0) delete myAvailability[key];
    else myAvailability[key] = dragTarget;
    cell.dataset.state = dragTarget;
  }

  grid.addEventListener('mousedown', e => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    dragTarget = (parseInt(cell.dataset.state || '0') + 1) % 3;
    applyCell(cell);
  });

  grid.addEventListener('mouseover', e => {
    if (dragTarget === null) return;
    const cell = e.target.closest('.grid-cell');
    if (cell) applyCell(cell);
  });

  document.addEventListener('mouseup', () => { dragTarget = null; });

  grid.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    dragTarget = (parseInt(cell.dataset.state || '0') + 1) % 3;
    applyCell(cell);
  }, { passive: false });

  grid.addEventListener('touchmove', e => {
    if (dragTarget === null) return;
    e.preventDefault();
    const t = e.touches[0];
    const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest('.grid-cell');
    if (cell) applyCell(cell);
  }, { passive: false });

  document.addEventListener('touchend', () => { dragTarget = null; });
}

// ─── Tooltip interaction ──────────────────────────────────────────────────────

function attachTooltipInteraction(grid, responses) {
  const shift = displayShift();

  grid.addEventListener('mousemove', e => {
    const cell = e.target.closest('.grid-cell[data-score]');
    if (!cell || responses.length === 0) { hoverTooltip.classList.add('hidden'); return; }

    const key = cellKey(cell.dataset.date, cell.dataset.slot);
    const available = [], tentative = [], unavailable = [];

    responses.forEach(r => {
      const av = JSON.parse(r.availability || '{}');
      const v = av[key] || 0;
      const name = r.name || 'Anonymous';
      if (v === 1) available.push(name);
      else if (v === 2) tentative.push(name);
      else unavailable.push(name);
    });

    const displayedSlot = shiftSlot(cell.dataset.slot, shift);
    const timeStr = slotFullLabel(displayedSlot);

    let html = `<div class="tooltip-time">${timeStr}</div>`;
    if (available.length)   html += `<div class="tooltip-group"><span class="tt-avail">Available:</span> ${available.join(', ')}</div>`;
    if (tentative.length)   html += `<div class="tooltip-group"><span class="tt-tentative">Tentative:</span> ${tentative.join(', ')}</div>`;
    if (unavailable.length) html += `<div class="tooltip-group"><span class="tt-unavail">Unavailable:</span> ${unavailable.join(', ')}</div>`;

    hoverTooltip.innerHTML = html;
    hoverTooltip.classList.remove('hidden');

    const tw = hoverTooltip.offsetWidth || 180;
    const th = hoverTooltip.offsetHeight || 80;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 14;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - 14;
    hoverTooltip.style.left = x + 'px';
    hoverTooltip.style.top  = y + 'px';
  });

  grid.addEventListener('mouseleave', () => { hoverTooltip.classList.add('hidden'); });
}

// ─── Response list ────────────────────────────────────────────────────────────

function renderResponseList() {
  const container = document.getElementById('response-list');
  container.innerHTML = '';

  if (state.responses.length === 0) return;

  const header = document.createElement('div');
  header.className = 'response-list-header';
  header.textContent = 'Responses';
  container.appendChild(header);

  state.responses.forEach(r => {
    const row = document.createElement('div');
    row.className = 'response-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'response-name';
    nameEl.textContent = r.name || 'Anonymous';
    if (r.id === state.myResponseId) {
      const you = document.createElement('span');
      you.className = 'response-you';
      you.textContent = 'you';
      nameEl.appendChild(you);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'response-del-btn';
    delBtn.title = 'Remove response';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => deleteResponse(r.id));

    row.append(nameEl, delBtn);
    container.appendChild(row);
  });
}

async function deleteResponse(responseId) {
  if (!confirm('Remove this response?')) return;

  try {
    const res = await fetch(`/api/events/${state.event.id}/responses/${responseId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error();

    if (responseId === state.myResponseId) {
      state.myResponseId = null;
      state.myAvailability = {};
      localStorage.removeItem(`meetgrid_${state.event.id}`);
      renderMyGrid();
    }

    const evRes = await fetch(`/api/events/${state.event.id}`);
    const evData = await evRes.json();
    state.responses = evData.responses || [];
    renderResultsGrid();
    renderResponseList();
    responseCount.textContent = `${state.responses.length} response${state.responses.length !== 1 ? 's' : ''}`;
  } catch {
    // silent
  }
}

// ─── Submit ──────────────────────────────────────────────────────────────────

async function handleSubmit() {
  if (!state.event) return;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const res = await fetch(`/api/events/${state.event.id}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: participantName.value.trim() || null,
        availability: JSON.stringify(state.myAvailability),
        responseId: state.myResponseId || null,
      }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.myResponseId = data.id;
    localStorage.setItem(`meetgrid_${state.event.id}`, data.id);

    const evRes = await fetch(`/api/events/${state.event.id}`);
    const evData = await evRes.json();
    state.responses = evData.responses || [];
    renderResultsGrid();
    renderResponseList();

    submitConfirm.classList.remove('hidden');
    setTimeout(() => submitConfirm.classList.add('hidden'), 2000);
  } catch {
    // silent
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save availability';
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

(function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (id) showEventView(id);
  else initCreateView();
})();
