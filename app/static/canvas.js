const canvasStage = document.querySelector('#canvas-stage');
const canvasContent = document.querySelector('#canvas-content');
const contextMenu = document.querySelector('#context-menu');
const modal = document.querySelector('#canvas-modal');
const modalBody = document.querySelector('#modal-body');
const modalClose = document.querySelector('#modal-close');
const resetViewBtn = document.querySelector('#reset-view');
const toast = document.querySelector('#toast');
const removeAssignmentBtn = contextMenu?.querySelector('[data-action="remove-assignment"]');
const editEmployeeBtn = contextMenu?.querySelector('[data-action="edit-employee"]');
const editProjectBtn = contextMenu?.querySelector('[data-action="edit-project"]');
const allocationUnitsSelect = document.querySelector('#allocation-units');
const resourceList = document.querySelector('#resource-list');

const HOURS_PER_FTE = 40;
const DAY_MS = 86400000;
const WEEK_MS = DAY_MS * 7;

const state = {
  employees: [],
  projects: [],
  assignments: [],
};

let pan = { x: 0, y: 0 };
let isPanning = false;
let pointerId = null;
let panStart = { x: 0, y: 0 };
let contextTarget = { type: 'canvas', id: null };
let panInitialized = false;
let dragEmployeeId = null;
let allocationUnits = 'percent';
let projectChart = null;

const formatISODate = (date) => new Date(date).toISOString().split('T')[0];

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);

const toDateValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return NaN;
  date.setHours(0, 0, 0, 0);
  return date.valueOf();
};

const getWeekRangeForValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  const weekStartValue = date.valueOf();
  const weekEnd = new Date(date);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return {
    weekStartValue,
    weekEndValue: weekEnd.valueOf(),
    weekStartDate: new Date(weekStartValue),
  };
};

const getCurrentWeekRange = () => getWeekRangeForValue(Date.now());

const overlapsRange = (startValue, endValue, rangeStart, rangeEnd) =>
  startValue <= rangeEnd && endValue >= rangeStart;

const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
};

const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  if (response.status === 204) return null;
  return response.json();
};

const applyTransform = () => {
  canvasContent.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
};

const hideContextMenu = () => {
  contextMenu?.classList.add('hidden');
};

const closeModal = () => {
  modal?.classList.add('hidden');
  modalBody.innerHTML = '';
  modal?.querySelector('.modal-content')?.classList.remove('modal-wide');
  if (projectChart) {
    projectChart.destroy();
    projectChart = null;
  }
};


const buildOptions = (items, selectedId) =>
  items
    .map((item) => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${item.name}</option>`)
    .join('');

const openProjectModal = (projectId = null) => {
  const editing = Boolean(projectId);
  const project = editing ? state.projects.find((proj) => proj.id === projectId) : null;
  if (editing && !project) {
    alert('Project not found');
    return;
  }
  modalBody.innerHTML = `
    <h3>${editing ? 'Edit project' : 'Create project'}</h3>
    <form id="project-modal-form">
      <label>Name<input name="name" value="${project?.name || ''}" required /></label>
      <label>Description<textarea name="description" rows="2">${project?.description || ''}</textarea></label>
      <label>Start Date<input type="date" name="start_date" value="${project?.start_date || ''}" /></label>
      <label>End Date<input type="date" name="end_date" value="${project?.end_date || ''}" /></label>
      <button type="submit">${editing ? 'Save changes' : 'Create project'}</button>
    </form>`;
  modal.classList.remove('hidden');
  const form = document.querySelector('#project-modal-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name').trim(),
      description: formData.get('description').trim() || null,
      start_date: formData.get('start_date') || null,
      end_date: formData.get('end_date') || null,
    };
    try {
      if (editing) {
        await apiFetch(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Project updated');
      } else {
        await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Project created');
      }
      closeModal();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });
};

const openProjectEditModal = (projectId = null) => {
  if (!state.projects.length) {
    alert('No projects available yet.');
    return;
  }
  let currentProjectId = projectId || null;
  const pickerOptions = ['<option value="">Select project...</option>']
    .concat(
      state.projects.map(
        (proj) => `<option value="${proj.id}" ${proj.id === currentProjectId ? 'selected' : ''}>${escapeHtml(proj.name)}</option>`
      )
    )
    .join('');
  modalBody.innerHTML = `
    <h3>Edit project</h3>
    <label class="muted small-text">Project<select id="project-picker">${pickerOptions}</select></label>
    <form id="project-edit-form">
      <label>Name<input name="name" required /></label>
      <label>Description<textarea name="description" rows="2"></textarea></label>
      <label>Start Date<input type="date" name="start_date" /></label>
      <label>End Date<input type="date" name="end_date" /></label>
      <button type="submit">Save changes</button>
    </form>`;
  modal.classList.remove('hidden');
  const picker = document.querySelector('#project-picker');
  const form = document.querySelector('#project-edit-form');
  const populateFields = (id) => {
    const project = state.projects.find((proj) => proj.id === id);
    if (!project) {
      form.reset();
      currentProjectId = null;
      return;
    }
    currentProjectId = id;
    form.elements.name.value = project.name || '';
    form.elements.description.value = project.description || '';
    form.elements.start_date.value = project.start_date || '';
    form.elements.end_date.value = project.end_date || '';
  };
  picker.addEventListener('change', (event) => {
    const nextId = Number(event.target.value);
    populateFields(Number.isNaN(nextId) ? null : nextId);
  });
  if (currentProjectId) {
    picker.value = String(currentProjectId);
    populateFields(currentProjectId);
  } else {
    picker.value = '';
    form.reset();
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentProjectId) {
      alert('Select a project to edit.');
      return;
    }
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name').trim(),
      description: formData.get('description').trim() || null,
      start_date: formData.get('start_date') || null,
      end_date: formData.get('end_date') || null,
    };
    try {
      await apiFetch(`/projects/${currentProjectId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Project updated');
      closeModal();
      await loadProjects();
      await loadAssignments();
    } catch (err) {
      alert(err.message);
    }
  });
};

const openEmployeeModal = (employeeId = null) => {
  if (!state.employees.length) {
    alert('No employees available yet.');
    return;
  }
  let currentEmployeeId = employeeId || null;
  const pickerOptions = ['<option value="">Select employee...</option>']
    .concat(
      state.employees.map(
        (emp) => `<option value="${emp.id}" ${emp.id === currentEmployeeId ? 'selected' : ''}>${escapeHtml(emp.name)}</option>`
      )
    )
    .join('');
  modalBody.innerHTML = `
    <h3>Edit employee</h3>
    <label class="muted small-text">Employee<select id="employee-picker">${pickerOptions}</select></label>
    <form id="employee-modal-form">
      <label>Name<input name="name" required /></label>
      <label>Role<input name="role" /></label>
      <label>Location<input name="location" /></label>
      <label>Capacity<input type="number" name="capacity" step="0.1" min="0.1" required /></label>
      <button type="submit">Save changes</button>
    </form>`;
  modal.classList.remove('hidden');
  const picker = document.querySelector('#employee-picker');
  const form = document.querySelector('#employee-modal-form');
  const populateFields = (id) => {
    const employee = state.employees.find((emp) => emp.id === id);
    if (!employee) {
      form.reset();
      currentEmployeeId = null;
      return;
    }
    currentEmployeeId = id;
    form.elements.name.value = employee.name || '';
    form.elements.role.value = employee.role || '';
    form.elements.location.value = employee.location || '';
    form.elements.capacity.value = employee.capacity || 1;
  };
  picker.addEventListener('change', (event) => {
    const nextId = Number(event.target.value);
    populateFields(Number.isNaN(nextId) ? null : nextId);
  });
  if (currentEmployeeId) {
    picker.value = String(currentEmployeeId);
    populateFields(currentEmployeeId);
  } else {
    picker.value = '';
    form.reset();
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentEmployeeId) {
      alert('Select an employee to edit.');
      return;
    }
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name').trim(),
      role: formData.get('role').trim() || null,
      location: formData.get('location').trim() || null,
      capacity: Number(formData.get('capacity')) || 1,
    };
    try {
      await apiFetch(`/employees/${currentEmployeeId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Employee updated');
      closeModal();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });
};

const renderResources = () => {
  if (!resourceList) return;
  resourceList.innerHTML = '';
  state.employees.forEach((employee) => {
    const item = document.createElement('div');
    item.className = 'resource-item';
    item.setAttribute('draggable', 'true');
    item.dataset.dragType = 'employee';
    item.dataset.id = employee.id;
    const details = document.createElement('div');
    details.className = 'resource-details';
    details.innerHTML = `<strong>${escapeHtml(employee.name)}</strong><span class="resource-meta">${escapeHtml(employee.role || '')}</span>`;
    const capacity = document.createElement('span');
    capacity.className = 'resource-meta';
    capacity.textContent = `${Math.round((employee.capacity || 1) * 100)}%`;
    item.append(details, capacity);
    resourceList.appendChild(item);
  });
};

const openProjectTimeline = (projectId) => {
  const project = state.projects.find((proj) => proj.id === projectId);
  if (!project) {
    alert('Project not found');
    return;
  }
  const projectAssignments = state.assignments.filter((asg) => asg.project_id === projectId);
  if (!projectAssignments.length) {
    alert('No assignments for this project yet.');
    return;
  }
  const assignmentRanges = [];
  const projectStartValue = toDateValue(project.start_date);
  const projectEndValue = toDateValue(project.end_date);
  let minStart = Number.isFinite(projectStartValue) ? projectStartValue : Infinity;
  let maxEnd = Number.isFinite(projectEndValue) ? projectEndValue : -Infinity;
  let minAssignmentStart = Infinity;
  let maxAssignmentEnd = -Infinity;
  projectAssignments.forEach((asg) => {
    const startValue = toDateValue(asg.start_date);
    const endValue = toDateValue(asg.end_date);
    if (Number.isNaN(startValue) || Number.isNaN(endValue)) return;
    assignmentRanges.push({ startValue, endValue, allocation: asg.allocation || 0 });
    if (startValue < minAssignmentStart) minAssignmentStart = startValue;
    if (endValue > maxAssignmentEnd) maxAssignmentEnd = endValue;
  });
  if (!Number.isFinite(minStart)) minStart = minAssignmentStart;
  if (!Number.isFinite(maxEnd)) maxEnd = maxAssignmentEnd;
  if (!assignmentRanges.length || !Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    alert('No schedulable assignments for this project yet.');
    return;
  }
  const timelineStart = minStart;
  const timelineEnd = maxEnd;
  let cursorValue = timelineStart;
  const labels = [];
  const values = [];
  const MAX_WEEKS = 520;
  const formatWeekLabel = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  while (cursorValue <= timelineEnd && labels.length < MAX_WEEKS) {
    const rangeStart = cursorValue;
    const rangeEnd = Math.min(cursorValue + WEEK_MS - DAY_MS, timelineEnd);
    const fte = assignmentRanges.reduce((sum, rangeData) => {
      if (overlapsRange(rangeData.startValue, rangeData.endValue, rangeStart, rangeEnd)) {
        return sum + rangeData.allocation;
      }
      return sum;
    }, 0);
    labels.push(formatWeekLabel(rangeStart));
    values.push(Number(fte.toFixed(2)));
    cursorValue += WEEK_MS;
  }
  if (labels.length) {
    labels[0] = formatWeekLabel(timelineStart);
    labels[labels.length - 1] = formatWeekLabel(timelineEnd);
  }
  modalBody.innerHTML = `
    <h3>${escapeHtml(project.name)} · weekly FTE</h3>
    <div class="chart-panel">
      <canvas id="project-chart"></canvas>
    </div>`;
  modal.querySelector('.modal-content')?.classList.add('modal-wide');
  modal.classList.remove('hidden');
  const ctx = document.getElementById('project-chart');
  if (!ctx) return;
  projectChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'FTE',
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          borderWidth: 2,
          tension: 0.25,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'FTE' },
        },
        x: {
          ticks: { autoSkip: true, maxTicksLimit: 6 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.formattedValue} FTE`,
          },
        },
      },
    },
  });
};

const openAssignmentModal = (defaults = {}) => {
  if (!state.employees.length || !state.projects.length) {
    alert('Add employees and projects before creating assignments.');
    return;
  }
  const defaultEmployeeId = defaults.employeeId ?? (contextTarget.type === 'employee' ? Number(contextTarget.id) : null);
  const defaultProjectId = defaults.projectId ?? (contextTarget.type === 'project' ? Number(contextTarget.id) : null);
  modalBody.innerHTML = `
    <h3>Add assignment</h3>
    <form id="assignment-modal-form">
      <label>Employee
        <select name="employee_id" required>${buildOptions(state.employees, defaultEmployeeId)}</select>
      </label>
      <label>Project
        <select name="project_id" required>${buildOptions(state.projects, defaultProjectId)}</select>
      </label>
      <label>Start Date<input type="date" name="start_date" value="${formatISODate(new Date())}" required /></label>
      <label>End Date<input type="date" name="end_date" value="${formatISODate(new Date())}" required /></label>
      <label>Allocation (%)<input type="number" name="allocation" min="1" max="100" value="100" required /></label>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
      <button type="submit">Save assignment</button>
    </form>`;
  modal.classList.remove('hidden');
  const form = document.querySelector('#assignment-modal-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      employee_id: Number(formData.get('employee_id')),
      project_id: Number(formData.get('project_id')),
      start_date: formData.get('start_date'),
      end_date: formData.get('end_date'),
      allocation: (Number(formData.get('allocation')) || 0) / 100,
      notes: formData.get('notes').trim() || null,
    };
    try {
      await apiFetch('/assignments', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Assignment added');
      closeModal();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });
};

const renderCanvas = () => {
  canvasContent.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const stageRect = canvasStage.getBoundingClientRect();
  const stageWidth = stageRect.width || window.innerWidth;
  const stageHeight = stageRect.height || window.innerHeight;
  const currentWeek = getCurrentWeekRange();
  const weekStartValue = currentWeek?.weekStartValue ?? toDateValue(Date.now());
  const weekEndValue = currentWeek?.weekEndValue ?? weekStartValue;
  const employeeColumnX = 60;
  const employeeSpacing = 110;
  const baseX = 280;
  const baseY = 80;
  const colWidth = 320;
  const rowHeight = 260;
  const availableWidth = Math.max(stageWidth - (baseX + 240), colWidth);
  const projectCols = Math.max(1, Math.floor(availableWidth / colWidth));

  state.projects.forEach((project, index) => {
    const col = projectCols ? index % projectCols : 0;
    const row = projectCols ? Math.floor(index / projectCols) : index;
    const projectAssignments = state.assignments.filter((asg) => asg.project_id === project.id);
    const box = document.createElement('div');
    box.className = 'project-box';
    box.style.left = `${baseX + col * colWidth}px`;
    box.style.top = `${baseY + row * rowHeight}px`;
    box.dataset.nodeType = 'project';
    box.dataset.id = project.id;
    const activeFte = projectAssignments.reduce((sum, asg) => {
      const startValue = toDateValue(asg.start_date);
      const endValue = toDateValue(asg.end_date);
      if (Number.isNaN(startValue) || Number.isNaN(endValue)) return sum;
      if (overlapsRange(startValue, endValue, weekStartValue, weekEndValue)) {
        return sum + (asg.allocation || 0);
      }
      return sum;
    }, 0);
    const header = document.createElement('div');
    header.className = 'project-head';
    const info = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = project.name;
    const dates = document.createElement('p');
    dates.className = 'muted small-text';
    dates.textContent = `${project.start_date || '—'} → ${project.end_date || '—'}`;
    const rollupText = document.createElement('p');
    rollupText.className = 'muted small-text';
    rollupText.textContent = `FTE rollup (this week): ${activeFte.toFixed(2)}`;
    info.appendChild(title);
    info.appendChild(dates);
    info.appendChild(rollupText);
    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className = 'project-details';
    detailsBtn.textContent = 'Show details';
    detailsBtn.addEventListener('click', (event) => {
      event.preventDefault();
      openProjectTimeline(project.id);
    });
    header.appendChild(info);
    header.appendChild(detailsBtn);
    box.appendChild(header);
    const assignmentGroup = document.createElement('div');
    assignmentGroup.className = 'assignment-nodes';
    projectAssignments.forEach((asg) => {
      const employee = state.employees.find((emp) => emp.id === asg.employee_id);
      const chip = document.createElement('div');
      chip.className = 'assignment-node';
      chip.dataset.nodeType = 'assignment';
      chip.dataset.id = asg.id;
      const percent = Math.round(asg.allocation * 100);
      const capacity = Math.round((employee?.capacity || 1) * 100);
      if (percent > capacity) chip.classList.add('over');
      const employeeName = employee?.name || asg.employee_name || 'Employee';
      let chipLabel = `${employeeName} · ${percent}%`;
      if (allocationUnits === 'percent-hours') {
        const hours = Math.round((employee?.capacity || 1) * HOURS_PER_FTE * asg.allocation);
        chipLabel = `${employeeName} · ${percent}% (${hours}h)`;
      }
      chip.textContent = chipLabel;
      assignmentGroup.appendChild(chip);
    });
    if (!projectAssignments.length) {
      const empty = document.createElement('p');
      empty.className = 'muted small-text';
      empty.textContent = 'No assignments yet';
      assignmentGroup.appendChild(empty);
    }
    box.appendChild(assignmentGroup);
    fragment.appendChild(box);
  });

  const totalProjects = state.projects.length || 1;
  const colsUsed = Math.min(projectCols || 1, totalProjects);
  const rowsUsed = Math.ceil(totalProjects / (projectCols || 1));
  const contentWidth = baseX + colsUsed * colWidth + 200;
  const contentHeight = baseY + rowsUsed * rowHeight + 200;
  canvasContent.style.width = `${Math.max(contentWidth, stageWidth)}px`;
  canvasContent.style.height = `${Math.max(contentHeight, stageHeight)}px`;

  canvasContent.appendChild(fragment);

  if (!panInitialized) {
    const extraX = Math.max((stageWidth - contentWidth) / 2, 0);
    const extraY = Math.max((stageHeight - contentHeight) / 2, 0);
    pan = { x: extraX, y: extraY };
    applyTransform();
    panInitialized = true;
  }
};

const loadData = async () => {
  try {
    const [employees, projects, assignments] = await Promise.all([
      apiFetch('/employees'),
      apiFetch('/projects'),
      apiFetch('/assignments'),
    ]);
    state.employees = employees;
    state.projects = projects;
    state.assignments = assignments;
    renderResources();
    renderCanvas();
  } catch (err) {
    alert(err.message);
  }
};

const openAssignmentRemovalModal = (assignmentId = null) => {
  if (!state.assignments.length) {
    alert('No assignments available to remove.');
    return;
  }
  let currentAssignmentId = assignmentId || null;
  const options = ['<option value="">Select assignment...</option>']
    .concat(
      state.assignments.map((asg) => {
        const employee = state.employees.find((emp) => emp.id === asg.employee_id);
        const project = state.projects.find((proj) => proj.id === asg.project_id);
        const label = `${employee?.name || asg.employee_name || 'Employee'} → ${project?.name || asg.project_name || 'Project'}`;
        return `<option value="${asg.id}" ${asg.id === currentAssignmentId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      })
    )
    .join('');
  modalBody.innerHTML = `
    <h3>Remove assignment</h3>
    <label class="muted small-text">Assignment<select id="assignment-picker">${options}</select></label>
    <p class="muted small-text">Removing an assignment immediately frees up the allocation.</p>
    <div class="modal-actions">
      <button type="button" id="assignment-remove-confirm" class="danger">Remove assignment</button>
    </div>`;
  modal.classList.remove('hidden');
  const picker = document.querySelector('#assignment-picker');
  const confirmBtn = document.querySelector('#assignment-remove-confirm');
  picker.addEventListener('change', (event) => {
    const nextId = Number(event.target.value);
    currentAssignmentId = Number.isNaN(nextId) ? null : nextId;
  });
  confirmBtn.addEventListener('click', async () => {
    if (!currentAssignmentId) {
      alert('Select an assignment to remove.');
      return;
    }
    await deleteAssignment(currentAssignmentId);
    closeModal();
  });
};

const deleteAssignment = async (assignmentId) => {
  const assignment = state.assignments.find((asg) => asg.id === Number(assignmentId));
  if (!assignment) return;
  const employee = state.employees.find((emp) => emp.id === assignment.employee_id);
  const project = state.projects.find((proj) => proj.id === assignment.project_id);
  const label = `${employee?.name || 'Employee'} → ${project?.name || 'Project'}`;
  if (!confirm(`Remove assignment ${label}?`)) return;
  try {
    await apiFetch(`/assignments/${assignmentId}`, { method: 'DELETE' });
    showToast('Assignment removed');
    await loadData();
  } catch (err) {
    alert(err.message);
  }
};

const handleContextMenu = (event) => {
  event.preventDefault();
  hideContextMenu();
  const node = event.target.closest('[data-node-type]');
  if (node) {
    contextTarget = {
      type: node.dataset.nodeType,
      id: node.dataset.id,
    };
  } else {
    contextTarget = { type: 'canvas', id: null };
  }
  contextMenu.style.left = `${event.clientX}px`;
  contextMenu.style.top = `${event.clientY}px`;
  contextMenu.classList.remove('hidden');
};

const handleMenuClick = (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  hideContextMenu();
  if (action === 'create-project') {
    openProjectModal();
  } else if (action === 'add-assignment') {
    openAssignmentModal();
  } else if (action === 'edit-employee') {
    const defaultId = contextTarget.type === 'employee' ? Number(contextTarget.id) : null;
    openEmployeeModal(defaultId);
  } else if (action === 'edit-project') {
    const defaultId = contextTarget.type === 'project' ? Number(contextTarget.id) : null;
    openProjectEditModal(defaultId);
  } else if (action === 'remove-assignment') {
    const defaultId = contextTarget.type === 'assignment' ? Number(contextTarget.id) : null;
    openAssignmentRemovalModal(defaultId);
  }
};

const handlePointerDown = (event) => {
  if (event.button !== 0) return;
  if (event.target.closest('button, input, select, textarea')) return;
  isPanning = true;
  pointerId = event.pointerId;
  panStart = { x: event.clientX, y: event.clientY };
  canvasContent.classList.add('dragging');
  canvasStage.setPointerCapture(pointerId);
};

const handlePointerMove = (event) => {
  if (!isPanning || event.pointerId !== pointerId) return;
  const dx = event.clientX - panStart.x;
  const dy = event.clientY - panStart.y;
  pan.x += dx;
  pan.y += dy;
  panStart = { x: event.clientX, y: event.clientY };
  applyTransform();
};

const handlePointerUp = (event) => {
  if (!isPanning || event.pointerId !== pointerId) return;
  isPanning = false;
  canvasContent.classList.remove('dragging');
  canvasStage.releasePointerCapture(pointerId);
};

const handleDragStart = (event) => {
  const node = event.target.closest('[data-drag-type="employee"]');
  if (!node) return;
  dragEmployeeId = Number(node.dataset.id);
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', String(dragEmployeeId));
};

const handleDragEnd = () => {
  dragEmployeeId = null;
  canvasStage.querySelectorAll('.project-box-droppable').forEach((box) => box.classList.remove('project-box-droppable'));
};

const handleDragOver = (event) => {
  if (!dragEmployeeId) return;
  const project = event.target.closest('.project-box');
  if (!project) return;
  event.preventDefault();
};

const handleDragEnter = (event) => {
  if (!dragEmployeeId) return;
  const project = event.target.closest('.project-box');
  if (!project) return;
  event.preventDefault();
  project.classList.add('project-box-droppable');
};

const handleDragLeave = (event) => {
  if (!dragEmployeeId) return;
  const project = event.target.closest('.project-box');
  if (!project) return;
  if (project.contains(event.relatedTarget)) return;
  project.classList.remove('project-box-droppable');
};

const handleDrop = (event) => {
  if (!dragEmployeeId) return;
  const project = event.target.closest('.project-box');
  if (!project) return;
  event.preventDefault();
  const employeeId = dragEmployeeId;
  const projectId = Number(project.dataset.id);
  dragEmployeeId = null;
  canvasStage.querySelectorAll('.project-box-droppable').forEach((box) => box.classList.remove('project-box-droppable'));
  openAssignmentModal({ employeeId, projectId });
};


const init = () => {
  applyTransform();
  loadData();

  canvasStage.addEventListener('pointerdown', handlePointerDown);
  canvasStage.addEventListener('pointermove', handlePointerMove);
  canvasStage.addEventListener('pointerup', handlePointerUp);
  canvasStage.addEventListener('pointerleave', handlePointerUp);
  canvasStage.addEventListener('contextmenu', handleContextMenu);
  canvasStage.addEventListener('dragstart', handleDragStart);
  canvasStage.addEventListener('dragend', handleDragEnd);
  canvasStage.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);
  canvasStage.addEventListener('dragenter', handleDragEnter);
  canvasStage.addEventListener('dragleave', handleDragLeave);
  canvasStage.addEventListener('drop', handleDrop);

  allocationUnitsSelect?.addEventListener('change', (event) => {
    allocationUnits = event.target.value;
    renderCanvas();
  });

  contextMenu.addEventListener('click', handleMenuClick);
  document.addEventListener('click', hideContextMenu);
  contextMenu.addEventListener('click', (event) => event.stopPropagation());

  modalClose.addEventListener('click', () => {
    closeModal();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideContextMenu();
      closeModal();
    }
  });

  window.addEventListener('resize', () => {
    renderCanvas();
  });

  resetViewBtn.addEventListener('click', () => {
    pan = { x: 0, y: 0 };
    panInitialized = false;
    renderCanvas();
  });
};

init();
