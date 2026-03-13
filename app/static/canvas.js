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

const HOURS_PER_FTE = 40;

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

const formatISODate = (date) => new Date(date).toISOString().split('T')[0];

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);

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

const openEmployeeModal = (employeeId) => {
  const employee = state.employees.find((emp) => emp.id === employeeId);
  if (!employee) {
    alert('Employee not found');
    return;
  }
  modalBody.innerHTML = `
    <h3>Edit employee</h3>
    <form id="employee-modal-form">
      <label>Name<input name="name" value="${employee.name}" required /></label>
      <label>Role<input name="role" value="${employee.role || ''}" /></label>
      <label>Location<input name="location" value="${employee.location || ''}" /></label>
      <label>Capacity<input type="number" name="capacity" step="0.1" min="0.1" value="${employee.capacity}" required /></label>
      <button type="submit">Save changes</button>
    </form>`;
  modal.classList.remove('hidden');
  const form = document.querySelector('#employee-modal-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name').trim(),
      role: formData.get('role').trim() || null,
      location: formData.get('location').trim() || null,
      capacity: Number(formData.get('capacity')) || 1,
    };
    try {
      await apiFetch(`/employees/${employeeId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Employee updated');
      closeModal();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
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
  const employeeColumnX = 60;
  const employeeSpacing = 110;
  const baseX = 280;
  const baseY = 80;
  const colWidth = 320;
  const rowHeight = 260;
  const availableWidth = Math.max(stageWidth - (baseX + 240), colWidth);
  const projectCols = Math.max(1, Math.floor(availableWidth / colWidth));

  state.employees.forEach((employee, index) => {
    const node = document.createElement('div');
    node.className = 'employee-node';
    node.style.left = `${employeeColumnX}px`;
    node.style.top = `${80 + index * employeeSpacing}px`;
    node.dataset.nodeType = 'employee';
    node.dataset.id = employee.id;
    node.setAttribute('draggable', 'true');
    node.innerHTML = `
      <h4>${escapeHtml(employee.name)}</h4>
      <p>${escapeHtml(employee.role || employee.location || '')}</p>`;
    fragment.appendChild(node);
  });

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
    box.innerHTML = `
      <div>
        <h4>${escapeHtml(project.name)}</h4>
        <p class="muted small-text">${project.start_date || '—'} → ${project.end_date || '—'}</p>
      </div>`;
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
    renderCanvas();
  } catch (err) {
    alert(err.message);
  }
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
  if (editEmployeeBtn) {
    if (contextTarget.type === 'employee') {
      editEmployeeBtn.classList.remove('hidden');
    } else {
      editEmployeeBtn.classList.add('hidden');
    }
  }
  if (editProjectBtn) {
    if (contextTarget.type === 'project') {
      editProjectBtn.classList.remove('hidden');
    } else {
      editProjectBtn.classList.add('hidden');
    }
  }
  if (removeAssignmentBtn) {
    if (contextTarget.type === 'assignment') {
      removeAssignmentBtn.classList.remove('hidden');
    } else {
      removeAssignmentBtn.classList.add('hidden');
    }
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
  } else if (action === 'edit-employee' && contextTarget.type === 'employee') {
    openEmployeeModal(Number(contextTarget.id));
  } else if (action === 'edit-project' && contextTarget.type === 'project') {
    openProjectModal(Number(contextTarget.id));
  } else if (action === 'remove-assignment' && contextTarget.type === 'assignment') {
    deleteAssignment(contextTarget.id);
  }
};

const handlePointerDown = (event) => {
  if (event.button !== 0) return;
  if (event.target.closest('button, input, select, textarea')) return;
  if (event.target.closest('.employee-node')) return;
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
  const node = event.target.closest('.employee-node');
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
