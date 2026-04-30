// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  eventType: 'specific',
  selectedDates: new Set(),
  startHour: 9,
  endHour: 17,
  event: null,
  responses: [],
  myAvailability: {},   // key -> 1 (available) | 2 (tentative)
  myResponseId: null,
};

// ─── DOM refs ────────────────────────────────────────────────────────────────

const createSection   = document.getElementById('create-section');
const eventSection    = document.getElementById('event-section');
const eventNameInput  = document.getElementById('event-name');
const createBtn       = document.getElementById('create-btn');
const createError     = document.getElementById('create-error');
const specificPicker  = document.getElementById('specific-picker');
const recurringPicker = document.getElementById('recurring-picker');
const dateGridEl      = document.getElementById('date-grid');
const startHourSel    = document.getElementById('start-hour');
const endHourSel      = document.getElementById('end-hour');
const eventTitle      = document.getElementById('event-title');
const eventMeta       = document.getElementById('event-meta');
const eventShareUrl   = document.getElementById('event-share-url');
const eventCopyBtn    = document.getElementById('event-copy-btn');
const eventCopyConfirm = document.getElementById('event-copy-confirm');
const participantName = document.getElementById('participant-name');
const submitBtn       = document.getElementById('submit-btn');
const submitConfirm   = document.getElementById('submit-confirm');
const responseCount   = document.getElementById('response-count');
const myGridWrap      = document.getElementById('my-grid-wrap');
const resultsGridWrap = document.getElementById('results-grid-wrap');
const hoverTooltip    = document.getElementById('hover-tooltip');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHour(h) {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  if (h === 24) return '12:00 AM (next day)';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function formatSlotLabel(slot) {
  const [h, m] = slot.split(':').map(Number);
  if (m !== 0) return '';
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function formatSlotFull(slot) {
  const [h, m] = slot.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${suffix}`;
}

function timeSlots(startHour, endHour) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

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

function cellKey(date, slot) {
  return `${date}_${slot}`;
}

// ─── Create view ─────────────────────────────────────────────────────────────

function initCreateView() {
  for (let h = 0; h <= 23; h++) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = formatHour(h);
    startHourSel.appendChild(opt);
  }
  for (let h = 1; h <= 24; h++) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = formatHour(h);
    endHourSel.appendChild(opt);
  }
  startHourSel.value = 9;
  endHourSel.value = 17;

  startHourSel.addEventListener('change', () => { state.startHour = parseInt(startHourSel.value); });
  endHourSel.addEventListener('change',   () => { state.endHour   = parseInt(endHourSel.value); });

  renderDatePicker();

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.eventType = btn.dataset.type;
      state.selectedDates.clear();
      if (state.eventType === 'specific') {
        specificPicker.classList.remove('hidden');
        recurringPicker.classList.add('hidden');
        renderDatePicker();
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
        state.selectedDates.delete(day);
        btn.classList.remove('active');
      } else {
        state.selectedDates.add(day);
        btn.classList.add('active');
      }
    });
  });

  createBtn.addEventListener('click', handleCreate);
  eventNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });
}

function renderDatePicker() {
  dateGridEl.innerHTML = '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);

    const btn = document.createElement('button');
    btn.className = 'date-btn';
    btn.dataset.date = iso;
    btn.innerHTML = `
      <span class="date-weekday">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      <span class="date-monthday">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
    `;
    if (state.selectedDates.has(iso)) btn.classList.add('active');

    btn.addEventListener('click', () => {
      if (state.selectedDates.has(iso)) {
        state.selectedDates.delete(iso);
        btn.classList.remove('active');
      } else {
        state.selectedDates.add(iso);
        btn.classList.add('active');
      }
    });

    dateGridEl.appendChild(btn);
  }
}

async function handleCreate() {
  const name = eventNameInput.value.trim();
  if (!name)                             { showCreateError('Please enter an event name.'); return; }
  if (state.selectedDates.size === 0)    { showCreateError('Please select at least one date or day.'); return; }
  if (state.startHour >= state.endHour)  { showCreateError('End time must be after start time.'); return; }

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
        dates: [...state.selectedDates].sort(),
        startHour: state.startHour,
        endHour: state.endHour,
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

    const savedId = localStorage.getItem(`meetgrid_${id}`);
    const savedResponse = state.responses.find(r => r.id === savedId);
    if (savedResponse) {
      state.myResponseId = savedResponse.id;
      state.myAvailability = JSON.parse(savedResponse.availability || '{}');
      if (savedResponse.name) participantName.value = savedResponse.name;
    }

    renderEventHeader(id);
    renderMyGrid();
    renderResultsGrid();

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

  const shareUrl = `${location.origin}/?id=${id}`;
  eventShareUrl.value = shareUrl;

  responseCount.textContent = `${state.responses.length} response${state.responses.length !== 1 ? 's' : ''}`;
}

// ─── Grid rendering ──────────────────────────────────────────────────────────

function buildGrid(container, event, opts = {}) {
  const { interactive = false, responses = [], myAvailability = {} } = opts;
  const slots = timeSlots(event.start_hour, event.end_hour);
  const dates = event.dates;

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
    const timeEl = document.createElement('div');
    timeEl.className = 'grid-time-label';
    timeEl.textContent = formatSlotLabel(slot);
    grid.appendChild(timeEl);

    dates.forEach(date => {
      const key = cellKey(date, slot);
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
  let dragTargetState = null;

  function applyCell(cell) {
    const key = cell.dataset.key;
    if (dragTargetState === 0) {
      delete myAvailability[key];
    } else {
      myAvailability[key] = dragTargetState;
    }
    cell.dataset.state = dragTargetState;
  }

  grid.addEventListener('mousedown', e => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    dragTargetState = (parseInt(cell.dataset.state || '0') + 1) % 3;
    applyCell(cell);
  });

  grid.addEventListener('mouseover', e => {
    if (dragTargetState === null) return;
    const cell = e.target.closest('.grid-cell');
    if (cell) applyCell(cell);
  });

  document.addEventListener('mouseup', () => { dragTargetState = null; });

  // Touch support
  grid.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    dragTargetState = (parseInt(cell.dataset.state || '0') + 1) % 3;
    applyCell(cell);
  }, { passive: false });

  grid.addEventListener('touchmove', e => {
    if (dragTargetState === null) return;
    e.preventDefault();
    const t = e.touches[0];
    const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest('.grid-cell');
    if (cell) applyCell(cell);
  }, { passive: false });

  document.addEventListener('touchend', () => { dragTargetState = null; });
}

// ─── Tooltip interaction ──────────────────────────────────────────────────────

function attachTooltipInteraction(grid, responses) {
  grid.addEventListener('mousemove', e => {
    const cell = e.target.closest('.grid-cell[data-score]');
    if (!cell || responses.length === 0) { hoverTooltip.classList.add('hidden'); return; }

    const key = cellKey(cell.dataset.date, cell.dataset.slot);
    const available = [], tentative = [], unavailable = [];

    responses.forEach(r => {
      const av = JSON.parse(r.availability || '{}');
      const v = av[key] || 0;
      const name = r.name || 'Anonymous';
      if (v === 1)      available.push(name);
      else if (v === 2) tentative.push(name);
      else              unavailable.push(name);
    });

    const slotTime = formatSlotFull(cell.dataset.slot);
    let html = `<div class="tooltip-time">${slotTime}</div>`;
    if (available.length)   html += `<div class="tooltip-group"><span class="tt-avail">Available:</span> ${available.join(', ')}</div>`;
    if (tentative.length)   html += `<div class="tooltip-group"><span class="tt-tentative">Tentative:</span> ${tentative.join(', ')}</div>`;
    if (unavailable.length) html += `<div class="tooltip-group"><span class="tt-unavail">Unavailable:</span> ${unavailable.join(', ')}</div>`;

    hoverTooltip.innerHTML = html;
    hoverTooltip.classList.remove('hidden');

    // Position near cursor, keep within viewport
    const tw = hoverTooltip.offsetWidth || 180;
    const th = hoverTooltip.offsetHeight || 80;
    let x = e.clientX + 12;
    let y = e.clientY + 12;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 12;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - 12;
    hoverTooltip.style.left = x + 'px';
    hoverTooltip.style.top  = y + 'px';
  });

  grid.addEventListener('mouseleave', () => { hoverTooltip.classList.add('hidden'); });
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

    // Refresh results
    const evRes = await fetch(`/api/events/${state.event.id}`);
    const evData = await evRes.json();
    state.responses = evData.responses || [];
    renderResultsGrid();

    submitConfirm.classList.remove('hidden');
    setTimeout(() => submitConfirm.classList.add('hidden'), 2000);
  } catch {
    // silent — could show an error here
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save availability';
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (id) {
    showEventView(id);
  } else {
    initCreateView();
  }
}

init();
