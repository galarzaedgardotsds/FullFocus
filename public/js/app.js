// ══════════════════════════════════════════════════════════
//  app.js  —  OrganizadorTareas dashboard logic
// ══════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────
let currentUser = null;
let subjects = [];
let activities = [];
let exams = [];
let stats = {};
let currentFilter = 'all';
let sortAsc = true;
let selectedSubjectFilter = null;
let currentDate = todayStr();

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login.html'; return; }

  try {
    currentUser = await API.get('/auth/me');
  } catch {
    window.location.href = '/login.html';
    return;
  }

  updateGreeting();
  await refreshAll();
  setupEventListeners();
  lucide.createIcons();
});

async function refreshAll() {
  await Promise.all([
    loadSubjects(),
    loadActivities(),
    loadExams(),
    loadStats()
  ]);
}

// ── Greeting ──────────────────────────────────────────────
function updateGreeting() {
  const hour = new Date().getHours();
  let g = 'Buenas noches';
  if (hour >= 6 && hour < 12) g = 'Buenos días';
  else if (hour >= 12 && hour < 19) g = 'Buenas tardes';

  document.getElementById('greeting-text').textContent = `${g}, ${currentUser.name}`;

  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  let dateStr = new Date().toLocaleDateString('es-ES', opts);
  dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  document.getElementById('greeting-date').textContent = dateStr;

  updateDateLabel();
}

function updateDateLabel() {
  const isToday = currentDate === todayStr();
  const label = document.getElementById('cycle-label');
  const sectionTitle = document.getElementById('activities-section-title');
  const dateInput = document.getElementById('date-selector');
  if (dateInput) dateInput.value = currentDate;

  if (isToday) {
    label.textContent = 'Hoy';
    if (sectionTitle) sectionTitle.textContent = 'Actividades de hoy';
  } else {
    const [y, m, d] = currentDate.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const formatted = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    label.textContent = formatted;
    if (sectionTitle) sectionTitle.textContent = `Actividades del ${formatted}`;
  }
}

// ══════════════════════════════════════════════════════════
//  SUBJECTS
// ══════════════════════════════════════════════════════════
async function loadSubjects() {
  try {
    subjects = await API.get('/subjects');
    renderSubjects();
    populateSubjectDropdowns();
  } catch (err) {
    console.error('Error loading subjects:', err);
  }
}

function renderSubjects() {
  const list = document.getElementById('subjects-list');
  if (subjects.length === 0) {
    list.innerHTML = '<li class="empty-hint">Añadí tu primera materia</li>';
    return;
  }
  list.innerHTML = subjects.map(s => `
    <li>
      <a href="#" class="subject-item ${selectedSubjectFilter === s.id ? 'active-subject' : ''}" data-id="${s.id}">
        <span class="subject-left"><span class="dot dot-${s.color}"></span> ${esc(s.name)}</span>
        <span class="subject-count">${s.activity_count}</span>
      </a>
    </li>
  `).join('');

  document.getElementById('nav-subjects-count').textContent = subjects.length;

  // Click to filter
  list.querySelectorAll('.subject-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = parseInt(el.dataset.id);
      selectedSubjectFilter = selectedSubjectFilter === id ? null : id;
      renderSubjects();
      await loadActivities();
    });
  });
}

function populateSubjectDropdowns() {
  const selects = [document.getElementById('act-subject'), document.getElementById('exam-subject')];
  selects.forEach(sel => {
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Sin materia</option>' +
      subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.value = val;
  });
}

// ══════════════════════════════════════════════════════════
//  ACTIVITIES
// ══════════════════════════════════════════════════════════
async function loadActivities() {
  try {
    // Si hay una materia seleccionada en el sidebar, traemos todas sus actividades (o las de la fecha si no)
    let url = `/activities?`;
    if (selectedSubjectFilter) {
      url += `subject_id=${selectedSubjectFilter}`;
    } else {
      url += `date=${currentDate}`;
    }
    activities = await API.get(url);
    renderActivities();
  } catch (err) {
    console.error('Error loading activities:', err);
  }
}

function renderActivities() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-activities');
  const search = (document.getElementById('search-input').value || '').toLowerCase();

  let filtered = [...activities];

  // Apply subject filter if any
  if (selectedSubjectFilter) {
    filtered = filtered.filter(a => a.subject_id === selectedSubjectFilter);
  }

  // Apply tab filter
  if (currentFilter === 'pending') {
    filtered = filtered.filter(a => !a.completed);
  } else if (currentFilter === 'completed') {
    filtered = filtered.filter(a => a.completed);
  }

  // Apply search
  if (search) {
    filtered = filtered.filter(a =>
      a.title.toLowerCase().includes(search) ||
      (a.subject_name || '').toLowerCase().includes(search) ||
      (a.description || '').toLowerCase().includes(search)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    // Completed at bottom
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // Then by time
    const ta = a.scheduled_time || '99:99';
    const tb = b.scheduled_time || '99:99';
    return sortAsc ? ta.localeCompare(tb) : tb.localeCompare(ta);
  });

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    const emptyP = empty.querySelector('p');
    if (emptyP) {
      if (selectedSubjectFilter) {
        const subjObj = subjects.find(s => s.id === selectedSubjectFilter);
        emptyP.textContent = `No hay actividades para ${subjObj ? subjObj.name : 'esta materia'}.`;
      } else {
        emptyP.textContent = 'No hay actividades para esta fecha. ¡Añadí una!';
      }
    }
  } else {
    empty.classList.add('hidden');
    list.innerHTML = filtered.map(a => activityHTML(a)).join('');
    bindActivityEvents();
  }

  // Update pill and header title
  const countPill = document.getElementById('activities-count-pill');
  countPill.textContent = `${filtered.length} actividad${filtered.length !== 1 ? 'es' : ''}`;

  const sectionTitle = document.getElementById('activities-section-title');
  if (sectionTitle) {
    if (selectedSubjectFilter) {
      const subjObj = subjects.find(s => s.id === selectedSubjectFilter);
      sectionTitle.textContent = `Actividades de ${subjObj ? subjObj.name : 'Materia'}`;
    } else {
      updateDateLabel();
    }
  }

  lucide.createIcons();
}

function activityHTML(a) {
  const priorityClass = a.priority === 'alta' ? 'badge-high' : a.priority === 'baja' ? 'badge-low' : 'badge-medium';
  const priorityLabel = a.priority.charAt(0).toUpperCase() + a.priority.slice(1);
  const completedClass = a.completed ? 'completed' : '';
  const checkedClass = a.completed ? 'checked' : '';
  const checkIcon = a.completed ? '<i data-lucide="check"></i>' : '';

  const timeHTML = a.completed
    ? `<span class="status-done"><i data-lucide="check-circle-2"></i> Estudiado</span>`
    : (a.scheduled_time ? `<span class="task-time"><i data-lucide="clock"></i> ${a.scheduled_time}</span>` : '');

  const subjectMeta = a.subject_name
    ? `${esc(a.subject_name)}${a.description ? ' <span class="muted">• ' + esc(a.description) + '</span>' : ''}`
    : (a.description ? `<span class="muted">${esc(a.description)}</span>` : '');

  return `
    <li class="task-item ${completedClass}" data-id="${a.id}">
      <div class="task-left">
        <button class="checkbox ${checkedClass}" data-toggle="${a.id}" aria-label="Marcar completada">${checkIcon}</button>
        <div class="task-text">
          <span class="task-title">${esc(a.title)}</span>
          <span class="task-meta">${subjectMeta}</span>
        </div>
      </div>
      <div class="task-right">
        <span class="badge ${priorityClass}">• ${priorityLabel}</span>
        ${timeHTML}
        <button class="more-btn" data-delete-activity="${a.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
      </div>
    </li>
  `;
}

function bindActivityEvents() {
  // Toggle completed
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggle;
      const act = activities.find(a => String(a.id) === String(id));
      if (act) {
        // Actualización optimista inmediata
        act.completed = act.completed ? 0 : 1;
        const total = activities.length;
        const completed = activities.filter(a => a.completed).length;
        updateFocusBanner(completed, total);
        renderActivities();
      }
      try {
        await API.patch(`/activities/${id}/toggle`);
        await Promise.all([loadActivities(), loadStats(), loadSubjects()]);
      } catch (err) {
        toast('Error al actualizar actividad');
        await loadActivities();
      }
    });
  });

  // Delete
  document.querySelectorAll('[data-delete-activity]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteActivity;
      if (!confirm('¿Eliminar esta actividad?')) return;
      try {
        await API.delete(`/activities/${id}`);
        await loadActivities();
        await loadStats();
        await loadSubjects();
        toast('Actividad eliminada');
      } catch (err) {
        toast('Error al eliminar');
      }
    });
  });
}

// ══════════════════════════════════════════════════════════
//  EXAMS
// ══════════════════════════════════════════════════════════
async function loadExams() {
  try {
    exams = await API.get('/exams?upcoming=true');
    renderExams();
  } catch (err) {
    console.error('Error loading exams:', err);
  }
}

function renderExams() {
  const list = document.getElementById('exams-list');
  const empty = document.getElementById('empty-exams');

  document.getElementById('nav-exams-count').textContent = exams.length;

  if (exams.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = exams.map(e => {
    const d = new Date(e.exam_date + 'T12:00:00');
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const month = monthNames[d.getMonth()];
    const diff = Math.ceil((d - new Date().setHours(0,0,0,0)) / 86400000);
    const diffText = diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : `en ${diff} días`;
    const colorClass = e.subject_color ? `dot-${e.subject_color}` : 'dot-blue';

    return `
      <li class="exam-item">
        <div class="date-box">
          <strong>${day}</strong>
          <span>${month}</span>
        </div>
        <div class="exam-info">
          <span class="exam-title">${esc(e.title)}</span>
          <span class="exam-meta">${e.subject_name ? esc(e.subject_name) + ' · ' : ''}${diffText}</span>
        </div>
        <button class="dot-btn" data-delete-exam="${e.id}" title="Eliminar">
          <span class="dot ${colorClass}"></span>
        </button>
      </li>
    `;
  }).join('');

  // Delete exam
  document.querySelectorAll('[data-delete-exam]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteExam;
      if (!confirm('¿Eliminar este examen?')) return;
      try {
        await API.delete(`/exams/${id}`);
        await loadExams();
        await loadStats();
        toast('Examen eliminado');
      } catch (err) {
        toast('Error al eliminar');
      }
    });
  });

  lucide.createIcons();
}

// ══════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════
async function loadStats() {
  try {
    stats = await API.get(`/stats?date=${currentDate}`);
    renderStats();
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function updateFocusBanner(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const ring = document.getElementById('focus-ring');
  if (ring) {
    ring.style.setProperty('--percent', pct);
    ring.style.background = `conic-gradient(#e7efe8 ${pct}%, rgba(255, 255, 255, 0.14) 0)`;
  }
  const pctEl = document.getElementById('focus-percent');
  if (pctEl) pctEl.textContent = `${pct}%`;

  const titleEl = document.getElementById('focus-title');
  if (titleEl) titleEl.textContent = `${completed} de ${total} actividades completadas`;

  const descEl = document.getElementById('focus-desc');
  if (descEl) {
    if (total === 0) {
      descEl.textContent = 'Añadí actividades para comenzar tu día.';
    } else if (completed === total) {
      descEl.textContent = '¡Felicitaciones! Completaste todas las actividades. 🎉';
    } else {
      const remaining = total - completed;
      descEl.textContent = `Vas bien. Te quedan ${remaining} actividad${remaining > 1 ? 'es' : ''} por completar.`;
    }
  }
}

function renderStats() {
  const s = stats;

  // Cards
  document.getElementById('stat-completed').textContent = s.today.completed;
  document.getElementById('stat-completed-sub').textContent = `de ${s.today.total} actividades`;

  document.getElementById('stat-pending').textContent = s.today.pending;
  document.getElementById('stat-pending-sub').textContent = s.upcomingExams > 0 ? `${s.upcomingExams} examen${s.upcomingExams > 1 ? 'es' : ''}` : '';

  document.getElementById('stat-streak').textContent = s.streak;

  document.getElementById('stat-cycle').textContent = s.cycle.activities;
  document.getElementById('stat-cycle-sub').textContent = s.cycle.exams > 0 ? `${s.cycle.exams} entrega${s.cycle.exams > 1 ? 's' : ''}` : '';

  // Focus banner
  updateFocusBanner(s.today.completed, s.today.total);

  // Subjects progress
  const progressContainer = document.getElementById('subjects-progress');
  const emptyProgress = document.getElementById('empty-progress');

  if (s.subjectsProgress.length === 0) {
    progressContainer.innerHTML = '';
    emptyProgress.classList.remove('hidden');
  } else {
    emptyProgress.classList.add('hidden');
    const colorMap = { blue: 'blue', terracotta: 'amber', amber: 'amber', purple: 'purple', green: 'blue', red: 'amber', pink: 'purple', teal: 'blue' };
    progressContainer.innerHTML = s.subjectsProgress.map(sp => {
      const pct = sp.total > 0 ? Math.round((sp.completed / sp.total) * 100) : 0;
      const ringClass = `ring-${colorMap[sp.color] || 'blue'}`;
      const fillClass = `fill-${colorMap[sp.color] || 'blue'}`;
      return `
        <div class="progress-item">
          <div class="progress-header">
            <span class="subject-left"><span class="ring-dot ${ringClass}"></span> ${esc(sp.name)}</span>
            <span class="progress-count">${sp.completed} de ${sp.total}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${fillClass}" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ══════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════
function setupEventListeners() {
  // ── Date Selector ──
  const dateInput = document.getElementById('date-selector');
  const dateTrigger = document.getElementById('btn-date-trigger');
  
  if (dateTrigger && dateInput) {
    dateTrigger.addEventListener('click', () => {
      if (typeof dateInput.showPicker === 'function') {
        dateInput.showPicker();
      } else {
        dateInput.focus();
        dateInput.click();
      }
    });
  }

  if (dateInput) {
    dateInput.addEventListener('change', async (e) => {
      if (e.target.value) {
        currentDate = e.target.value;
        selectedSubjectFilter = null; // Reiniciar filtro de materia para ver ese día
        renderSubjects();
        updateDateLabel();
        await Promise.all([loadActivities(), loadStats()]);
      }
    });
  }

  // ── New Activity ──
  document.getElementById('btn-new-activity').addEventListener('click', () => openModal('modal-activity'));
  document.getElementById('btn-add-task-inline').addEventListener('click', () => openModal('modal-activity'));

  document.getElementById('form-activity').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('act-title').value.trim(),
      subject_id: document.getElementById('act-subject').value || null,
      priority: document.getElementById('act-priority').value,
      scheduled_date: document.getElementById('act-date').value || todayStr(),
      scheduled_time: document.getElementById('act-time').value || null,
      description: document.getElementById('act-desc').value.trim()
    };
    if (!data.title) return;
    try {
      await API.post('/activities', data);
      closeModal('modal-activity');
      e.target.reset();
      document.getElementById('act-date').value = todayStr();
      await Promise.all([loadActivities(), loadStats(), loadSubjects()]);
      toast('Actividad creada');
    } catch (err) {
      toast(err.message);
    }
  });

  // ── New Subject ──
  document.getElementById('btn-add-subject').addEventListener('click', () => openModal('modal-subject'));

  let selectedColor = 'blue';
  document.getElementById('color-picker').addEventListener('click', (e) => {
    const dot = e.target.closest('[data-color]');
    if (!dot) return;
    document.querySelectorAll('#color-picker .color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
    selectedColor = dot.dataset.color;
  });

  document.getElementById('form-subject').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('subj-name').value.trim();
    if (!name) return;
    try {
      await API.post('/subjects', { name, color: selectedColor });
      closeModal('modal-subject');
      e.target.reset();
      selectedColor = 'blue';
      document.querySelectorAll('#color-picker .color-dot').forEach(d => d.classList.remove('selected'));
      document.querySelector('#color-picker [data-color="blue"]').classList.add('selected');
      await loadSubjects();
      toast('Materia creada');
    } catch (err) {
      toast(err.message);
    }
  });

  // ── New Exam ──
  document.getElementById('btn-add-exam').addEventListener('click', () => openModal('modal-exam'));

  document.getElementById('form-exam').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('exam-title').value.trim(),
      subject_id: document.getElementById('exam-subject').value || null,
      exam_date: document.getElementById('exam-date').value,
      description: document.getElementById('exam-desc').value.trim()
    };
    if (!data.title || !data.exam_date) return;
    try {
      await API.post('/exams', data);
      closeModal('modal-exam');
      e.target.reset();
      await Promise.all([loadExams(), loadStats()]);
      toast('Examen creado');
    } catch (err) {
      toast(err.message);
    }
  });

  // ── Filters ──
  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderActivities();
  });

  // ── Sort ──
  document.getElementById('btn-sort').addEventListener('click', () => {
    sortAsc = !sortAsc;
    renderActivities();
  });

  // ── Search ──
  document.getElementById('search-input').addEventListener('input', () => {
    renderActivities();
  });

  // ── Logout ──
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login.html';
    }
  });

  // ── Modal close buttons ──
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // ── Close modal on overlay click ──
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', (e) => {
    // Escape closes modal
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));
    }
    // N opens new activity (when not in an input)
    if (e.key === 'n' && !isTyping(e)) {
      e.preventDefault();
      openModal('modal-activity');
    }
    // Cmd/Ctrl + K focuses search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
  });

  // Set default date to today in activity form
  document.getElementById('act-date').value = todayStr();
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  // Focus first input
  setTimeout(() => {
    const input = modal.querySelector('input, select');
    if (input) input.focus();
  }, 100);
  // Refresh subject dropdowns
  populateSubjectDropdowns();
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isTyping(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
