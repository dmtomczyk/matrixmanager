const organizationTable = document.querySelector('#organization-table');
const organizationForm = document.querySelector('#organization-form');
const employeeOrganizationSelect = document.querySelector('#employee-organization');
const employeeManagerSelect = document.querySelector('#employee-manager');
const employeeTable = document.querySelector('#employee-table');
const projectTable = document.querySelector('#project-table');
const assignmentTable = document.querySelector('#assignment-table');
const employeeOrgFilter = document.querySelector('#employee-org-filter');
const employeeForm = document.querySelector('#employee-form');
const projectForm = document.querySelector('#project-form');
const assignmentForm = document.querySelector('#assignment-form');
const assignmentEmployeeSelect = document.querySelector('#assignment-employee');
const assignmentProjectSelect = document.querySelector('#assignment-project');
const assignmentStartInput = assignmentForm?.querySelector('input[name="start_date"]');
const assignmentEndInput = assignmentForm?.querySelector('input[name="end_date"]');
const projectStartInput = projectForm?.querySelector('input[name="start_date"]');
const assignmentExportBtn = document.querySelector('#assignment-export');
const assignmentGraph = document.querySelector('#assignment-graph');
const assignmentGraphEmpty = document.querySelector('#assignment-graph-empty');
const scheduleEmployeeSelect = document.querySelector('#schedule-employee');
const scheduleProjectSelect = document.querySelector('#schedule-project');
const employeeScheduleList = document.querySelector('#employee-schedule');
const projectScheduleList = document.querySelector('#project-schedule');
const toast = document.querySelector('#toast');

const allocationCanvas = document.querySelector('#allocation-chart');
const allocationEmpty = document.querySelector('#allocation-chart-empty');
const allocationPresetSelect = document.querySelector('#allocation-preset');
const allocationStartInput = document.querySelector('#allocation-start');
const allocationEndInput = document.querySelector('#allocation-end');
const allocationApplyBtn = document.querySelector('#allocation-apply');
const allocationRangeLabel = document.querySelector('#allocation-range-label');
const DEFAULT_WINDOW_DAYS = 28;
const DAY_MS = 86400000;
const COLOR_PALETTE = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#14b8a6', '#ef4444', '#eab308', '#0ea5e9', '#f472b6', '#8b5cf6'];
let allocationChart;
let allocationWindow = { mode: 'preset', days: DEFAULT_WINDOW_DAYS };

let organizations = [];
let employees = [];
let projects = [];
let assignments = [];

const formatISODate = (date) => date.toISOString().split('T')[0];

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);

const apiFetch = async (url, options = {}) => {
  const opts = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  const response = await fetch(url, opts);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  if (response.status === 204) return null;
  return response.json();
};

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
};

const resetForm = (form, buttonLabel = 'Save') => {
  form.reset();
  const hidden = form.querySelector('input[type="hidden"][name="entity_id"]');
  if (hidden) hidden.value = '';
  form.querySelector('button[type="submit"]').textContent = buttonLabel;
};

const renderEmployees = () => {
  const selectedOrg = employeeOrgFilter?.value || '';
  const rows = employees
    .filter((emp) => !selectedOrg || String(emp.organization_id) === selectedOrg)
    .map(
      (emp) => `
      <tr>
        <td>${escapeHtml(emp.name)}</td>
        <td>${escapeHtml(emp.role || '')}</td>
        <td>${escapeHtml(emp.organization_name || '')}</td>
        <td>${escapeHtml(emp.manager_name || '—')}</td>
        <td>${escapeHtml(emp.location || '')}</td>
        <td>${emp.capacity?.toFixed(1) || '1.0'}</td>
        <td class="actions">
          <button type="button" data-action="edit-employee" data-id="${emp.id}">Edit</button>
          <button type="button" class="secondary" data-action="delete-employee" data-id="${emp.id}">Delete</button>
        </td>
      </tr>`
    )
    .join('');
  employeeTable.innerHTML = rows || '<tr><td colspan="7">No employees match this filter.</td></tr>';
};

const renderOrganizations = () => {
  if (!organizationTable) return;
  const headcounts = employees.reduce((acc, emp) => {
    if (!acc[emp.organization_id]) acc[emp.organization_id] = 0;
    acc[emp.organization_id] += 1;
    return acc;
  }, {});
  organizationTable.innerHTML = organizations
    .map((org) => {
      const count = headcounts[org.id] || 0;
      return `
        <tr>
          <td>${escapeHtml(org.name)}</td>
          <td>${escapeHtml(org.description || '')}</td>
          <td>${count}</td>
          <td class="actions">
            <button type="button" data-action="edit-organization" data-id="${org.id}">Edit</button>
            <button type="button" class="secondary" data-action="delete-organization" data-id="${org.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join('');
};

const updateOrganizationSelect = () => {
  if (employeeOrganizationSelect) {
    const placeholder = '<option value="">Select organization</option>';
    const options = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
    const current = employeeOrganizationSelect.value;
    employeeOrganizationSelect.innerHTML = placeholder + options;
    if (current && organizations.some((org) => String(org.id) === current)) {
      employeeOrganizationSelect.value = current;
    } else {
      employeeOrganizationSelect.value = '';
    }
  }
  if (employeeOrgFilter) {
    const previous = employeeOrgFilter.value;
    const filterOptions = ['<option value="">All organizations</option>']
      .concat(organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`))
      .join('');
    employeeOrgFilter.innerHTML = filterOptions;
    if (previous && organizations.some((org) => String(org.id) === previous)) {
      employeeOrgFilter.value = previous;
    } else {
      employeeOrgFilter.value = '';
    }
  }
};

const updateManagerSelect = (selectedId = '', currentEmployeeId = null) => {
  if (!employeeManagerSelect) return;
  const options = ['<option value="">No manager</option>']
    .concat(
      employees
        .filter((emp) => emp.id !== currentEmployeeId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((emp) => {
          const suffix = emp.organization_name ? ` · ${emp.organization_name}` : '';
          return `<option value="${emp.id}">${escapeHtml(emp.name + suffix)}</option>`;
        })
    )
    .join('');
  employeeManagerSelect.innerHTML = options;
  if (selectedId && employees.some((emp) => String(emp.id) === String(selectedId) && emp.id !== currentEmployeeId)) {
    employeeManagerSelect.value = String(selectedId);
  } else {
    employeeManagerSelect.value = '';
  }
};

const renderProjects = () => {
  projectTable.innerHTML = projects
    .map((proj) => {
      const dates = [proj.start_date, proj.end_date].filter(Boolean).join(' → ');
      return `
        <tr>
          <td>${escapeHtml(proj.name)}</td>
          <td>${escapeHtml(dates || '—')}</td>
          <td>${escapeHtml(proj.description || '')}</td>
          <td class="actions">
            <button type="button" data-action="edit-project" data-id="${proj.id}">Edit</button>
            <button type="button" class="secondary" data-action="delete-project" data-id="${proj.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join('');
};

const renderAssignments = () => {
  assignmentTable.innerHTML = assignments
    .map((asg) => {
      const dates = `${asg.start_date} → ${asg.end_date}`;
      return `
        <tr>
          <td>${escapeHtml(asg.employee_name || String(asg.employee_id))}</td>
          <td>${escapeHtml(asg.project_name || String(asg.project_id))}</td>
          <td>${escapeHtml(dates)}</td>
          <td><span class="badge">${Math.round(asg.allocation * 100)}%</span></td>
          <td>${escapeHtml(asg.notes || '')}</td>
          <td class="actions">
            <button type="button" data-action="edit-assignment" data-id="${asg.id}">Edit</button>
            <button type="button" class="secondary" data-action="delete-assignment" data-id="${asg.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join('');
};

const updateSelectOptions = () => {
  const buildOptions = (items, placeholder) =>
    [`<option value="">${placeholder}</option>`]
      .concat(items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`))
      .join('');

  const employeeOptions = buildOptions(employees, 'Select employee');
  const projectOptions = buildOptions(projects, 'Select project');

  assignmentEmployeeSelect.innerHTML = employeeOptions;
  scheduleEmployeeSelect.innerHTML = employeeOptions;
  assignmentProjectSelect.innerHTML = projectOptions;
  scheduleProjectSelect.innerHTML = projectOptions;
};

const renderScheduleList = (items, container, labelKey = 'project_name') => {
  if (!items.length) {
    container.innerHTML = '<li>No scheduled items.</li>';
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
      <li>
        <strong>${escapeHtml(item[labelKey] || '')}</strong>
        <div class="subtitle">${escapeHtml(item.start_date)} → ${escapeHtml(item.end_date)} · ${Math.round(item.allocation * 100)}%</div>
        <div class="subtitle">${escapeHtml(item.notes || '')}</div>
      </li>`
    )
    .join('');
};

const applyProjectDefaults = () => {
  if (projectStartInput) {
    projectStartInput.value = formatISODate(new Date());
  }
};

const applyAssignmentDefaults = () => {
  if (!assignmentStartInput || !assignmentEndInput) return;
  const today = formatISODate(new Date());
  assignmentStartInput.value = today;
  const selectedProject = projects.find((p) => p.id === Number(assignmentProjectSelect.value));
  if (selectedProject?.end_date) {
    assignmentEndInput.value = selectedProject.end_date;
  } else {
    assignmentEndInput.value = today;
  }
};

const handleAssignmentProjectChange = () => {
  const project = projects.find((p) => p.id === Number(assignmentProjectSelect.value));
  if (project?.end_date && assignmentEndInput) {
    assignmentEndInput.value = project.end_date;
  }
  if (assignmentStartInput && !assignmentStartInput.value) {
    assignmentStartInput.value = formatISODate(new Date());
  }
};

const renderAssignmentGraph = () => {
  if (!assignmentGraph) return;
  assignmentGraph.innerHTML = '';
  const hasData = assignments.length && employees.length && projects.length;
  if (!hasData) {
    assignmentGraphEmpty?.classList.remove('hidden');
    return;
  }
  assignmentGraphEmpty?.classList.add('hidden');
  const width = assignmentGraph.clientWidth || 760;
  const leftX = 140;
  const rightX = Math.max(leftX + 260, width - 140);
  const rowGap = 70;
  const topPadding = 50;
  const employeePositions = employees.map((emp, idx) => ({
    id: emp.id,
    name: emp.name || `Employee ${emp.id}`,
    x: leftX,
    y: topPadding + idx * rowGap,
    capacity: emp.capacity || 1,
  }));
  const projectPositions = projects.map((proj, idx) => ({
    id: proj.id,
    name: proj.name || `Project ${proj.id}`,
    x: rightX,
    y: topPadding + idx * rowGap,
  }));
  if (!employeePositions.length || !projectPositions.length) {
    assignmentGraphEmpty?.classList.remove('hidden');
    return;
  }
  const spanCount = Math.max(employeePositions.length, projectPositions.length);
  const height = spanCount > 1 ? topPadding * 2 + (spanCount - 1) * rowGap : 200;
  const employeeById = new Map(employeePositions.map((node) => [node.id, node]));
  const projectById = new Map(projectPositions.map((node) => [node.id, node]));
  const edges = assignments
    .map((asg) => {
      const employeeNode = employeeById.get(asg.employee_id);
      const projectNode = projectById.get(asg.project_id);
      if (!employeeNode || !projectNode) return null;
      const percent = Math.round(asg.allocation * 100);
      const employeeCap = Math.round((employeeNode.capacity || 1) * 100);
      const isOver = percent > employeeCap;
      return { employeeNode, projectNode, percent, isOver };
    })
    .filter(Boolean);
  const linesMarkup = edges
    .map(
      ({ employeeNode, projectNode, percent, isOver }) => `
        <line x1="${employeeNode.x + 18}" y1="${employeeNode.y}" x2="${projectNode.x - 18}" y2="${projectNode.y}" stroke="${isOver ? '#ef4444' : '#94a3b8'}" stroke-width="${Math.max(2, percent / 25)}" stroke-linecap="round">
          <title>${escapeHtml(employeeNode.name)} → ${escapeHtml(projectNode.name)} (${percent}%)</title>
        </line>`
    )
    .join('');
  const employeeNodes = employeePositions
    .map(
      (node) => `
        <g class="node employee">
          <circle cx="${node.x}" cy="${node.y}" r="18"></circle>
          <text x="${node.x - 28}" y="${node.y + 4}" text-anchor="end">${escapeHtml(node.name)}</text>
        </g>`
    )
    .join('');
  const projectNodes = projectPositions
    .map(
      (node) => `
        <g class="node project">
          <circle cx="${node.x}" cy="${node.y}" r="18"></circle>
          <text x="${node.x + 28}" y="${node.y + 4}" text-anchor="start">${escapeHtml(node.name)}</text>
        </g>`
    )
    .join('');
  const svgHeight = Math.max(height, 220);
  assignmentGraph.innerHTML = `<svg width="100%" height="${svgHeight}" viewBox="0 0 ${width} ${svgHeight}" preserveAspectRatio="xMidYMid meet">${linesMarkup}${employeeNodes}${projectNodes}</svg>`;
};

const exportAssignmentsCsv = () => {
  if (!assignments.length) {
    alert('No assignments to export yet.');
    return;
  }
  const rows = assignments.map((asg) => {
    const employee = employees.find((emp) => emp.id === asg.employee_id);
    const project = projects.find((proj) => proj.id === asg.project_id);
    return {
      employee: employee?.name || asg.employee_name || `Employee ${asg.employee_id}`,
      project: project?.name || asg.project_name || `Project ${asg.project_id}`,
      start: asg.start_date,
      end: asg.end_date,
      allocation: Math.round(asg.allocation * 100),
    };
  });
  const header = ['Employee', 'Project', 'Start Date', 'End Date', 'Allocation (%)'];
  const csvLines = [header]
    .concat(rows.map((row) => [row.employee, row.project, row.start, row.end, row.allocation]))
    .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `assignments_${formatISODate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const computeAllocationDataset = () => {
  const bounds = getAllocationBounds();
  const windowStart = new Date(bounds.start);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(bounds.end);
  windowEnd.setHours(0, 0, 0, 0);
  const dayCount = Math.max(1, Math.floor((windowEnd - windowStart) / DAY_MS) + 1);

  const dateLabels = Array.from({ length: dayCount }, (_, idx) => {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + idx);
    return formatISODate(d);
  });

  const loadMap = new Map();
  employees.forEach((emp) => {
    loadMap.set(emp.id, { info: emp, buckets: new Array(dayCount).fill(0) });
  });

  assignments.forEach((asg) => {
    const entry = loadMap.get(asg.employee_id);
    if (!entry) return;
    const assignStart = new Date(asg.start_date);
    const assignEnd = new Date(asg.end_date);
    if (Number.isNaN(assignStart.valueOf()) || Number.isNaN(assignEnd.valueOf())) return;
    let startIdx = Math.floor((assignStart - windowStart) / DAY_MS);
    let endIdx = Math.floor((assignEnd - windowStart) / DAY_MS);
    if (endIdx < 0 || startIdx > dayCount - 1) return;
    startIdx = Math.max(0, startIdx);
    endIdx = Math.min(dayCount - 1, endIdx);
    for (let i = startIdx; i <= endIdx; i += 1) {
      entry.buckets[i] += asg.allocation;
    }
  });

  const datasets = [];
  let colorIndex = 0;
  loadMap.forEach(({ info, buckets }) => {
    const capacity = info.capacity && info.capacity > 0 ? info.capacity : 1;
    const percentSeries = buckets.map((value) => Math.round(((value / capacity) * 100) * 10) / 10);
    datasets.push({
      label: info.name,
      data: percentSeries,
      capacity,
      color: COLOR_PALETTE[colorIndex % COLOR_PALETTE.length],
    });
    colorIndex += 1;
  });

  return { labels: dateLabels, datasets, bounds };
};

const normalizeDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getAllocationBounds = () => {
  const today = normalizeDate(new Date());
  if (allocationWindow.mode === 'custom' && allocationWindow.start && allocationWindow.end) {
    const start = normalizeDate(allocationWindow.start);
    const end = normalizeDate(allocationWindow.end);
    if (start && end) return { start, end };
  }
  if (allocationWindow.mode === 'all') {
    let minDate = null;
    let maxDate = null;
    assignments.forEach((asg) => {
      const start = normalizeDate(asg.start_date);
      const end = normalizeDate(asg.end_date);
      if (!start || !end) return;
      if (!minDate || start < minDate) minDate = start;
      if (!maxDate || end > maxDate) maxDate = end;
    });
    if (minDate && maxDate) {
      return { start: minDate, end: maxDate };
    }
  }
  const days = allocationWindow.mode === 'preset' && allocationWindow.days ? allocationWindow.days : DEFAULT_WINDOW_DAYS;
  const end = new Date(today);
  end.setDate(end.getDate() + (days - 1));
  return { start: today, end };
};

const updateRangeLabel = (bounds) => {
  if (!allocationRangeLabel || !bounds) return;
  const days = Math.max(1, Math.floor((bounds.end - bounds.start) / DAY_MS) + 1);
  allocationRangeLabel.textContent = `Window: ${formatISODate(bounds.start)} → ${formatISODate(bounds.end)} (${days} days)`;
};

const handlePresetChange = (event) => {
  const value = event.target.value;
  if (value === 'custom') return;
  if (value === 'all') {
    allocationWindow = { mode: 'all' };
  } else {
    const days = Number(value);
    if (Number.isNaN(days) || days <= 0) return;
    allocationWindow = { mode: 'preset', days };
  }
  renderAllocationChart();
};

const handleCustomRange = () => {
  if (!allocationStartInput?.value || !allocationEndInput?.value) {
    alert('Select both start and end dates for a custom range.');
    return;
  }
  const start = normalizeDate(allocationStartInput.value);
  const end = normalizeDate(allocationEndInput.value);
  if (!start || !end) {
    alert('Invalid dates.');
    return;
  }
  if (end < start) {
    alert('End date must be on or after the start date.');
    return;
  }
  allocationWindow = { mode: 'custom', start, end };
  if (allocationPresetSelect) allocationPresetSelect.value = 'custom';
  renderAllocationChart();
};

const datasetLabelPlugin = {
  id: 'datasetLabelPlugin',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (dataset.label === '100% capacity') return;
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;
      const points = meta.data;
      if (!points || !points.length) return;
      const lastPoint = points[points.length - 1];
      if (!lastPoint) return;
      const { x, y } = lastPoint.tooltipPosition();
      ctx.save();
      ctx.fillStyle = dataset.borderColor || '#0f172a';
      ctx.font = '12px "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      const text = dataset.label;
      const targetX = Math.min(x + 6, chartArea.right - 30);
      ctx.fillText(text, targetX, y - 8);
      ctx.restore();
    });
  },
};

const renderAllocationChart = () => {
  if (!allocationCanvas) return;
  const dataset = computeAllocationDataset();
  updateRangeLabel(dataset.bounds);
  if (!dataset.labels.length || !dataset.datasets.length) {
    if (allocationChart) allocationChart.destroy();
    allocationEmpty?.classList.remove('hidden');
    return;
  }
  allocationEmpty?.classList.add('hidden');
  const ctx = allocationCanvas.getContext('2d');
  const lineDatasets = dataset.datasets.map((series) => ({
    label: series.label,
    data: series.data,
    borderColor: series.color,
    backgroundColor: 'transparent',
    borderWidth: 2,
    tension: 0.25,
    pointRadius: 0,
    spanGaps: true,
    cap: Math.round(series.capacity * 100),
    segment: {
      borderColor: (ctx) => ((ctx.p0.parsed.y > 100 || ctx.p1.parsed.y > 100) ? '#ef4444' : series.color),
    },
  }));
  lineDatasets.push({
    label: '100% capacity',
    data: new Array(dataset.labels.length).fill(100),
    borderColor: '#1d4ed8',
    borderDash: [6, 4],
    pointRadius: 0,
    borderWidth: 1.5,
  });
  const maxValue = Math.max(100, ...lineDatasets.flatMap((ds) => ds.data || []));
  if (allocationChart) allocationChart.destroy();
  allocationChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dataset.labels,
      datasets: lineDatasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(110, Math.ceil(maxValue / 10) * 10),
          ticks: {
            callback: (value) => `${value}%`,
          },
          title: {
            display: true,
            text: 'Allocation (%)',
          },
        },
        x: {
          ticks: { maxRotation: 45, minRotation: 45 },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === '100% capacity') {
                return ctx.dataset.label;
              }
              if (ctx.dataset.cap) {
                return `${ctx.dataset.label}: ${ctx.formattedValue}% (cap ${ctx.dataset.cap}%)`;
              }
              return `${ctx.dataset.label}: ${ctx.formattedValue}%`;
            },
          },
        },
      },
    },
    plugins: [datasetLabelPlugin],
  });
};

const loadOrganizations = async () => {
  organizations = await apiFetch('/organizations');
  renderOrganizations();
  updateOrganizationSelect();
};

const loadEmployees = async () => {
  employees = await apiFetch('/employees');
  renderEmployees();
  renderOrganizations();
  updateSelectOptions();
  updateManagerSelect(employeeManagerSelect?.value || '');
};

const loadProjects = async () => {
  projects = await apiFetch('/projects');
  renderProjects();
  updateSelectOptions();
  applyProjectDefaults();
  applyAssignmentDefaults();
};

const loadAssignments = async () => {
  assignments = await apiFetch('/assignments');
  renderAssignments();
  renderAllocationChart();
  renderAssignmentGraph();
};

const handleEmployeeSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(employeeForm);
  const organizationId = Number(formData.get('organization_id'));
  if (!organizationId) {
    alert('Select an organization for this employee.');
    return;
  }
  const managerIdRaw = formData.get('manager_id');
  const payload = {
    name: formData.get('name').trim(),
    role: formData.get('role').trim() || null,
    location: formData.get('location').trim() || null,
    capacity: Number(formData.get('capacity')) || 1,
    organization_id: organizationId,
    manager_id: managerIdRaw ? Number(managerIdRaw) : null,
  };
  const id = formData.get('entity_id');
  try {
    if (id) {
      await apiFetch(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Employee updated');
    } else {
      await apiFetch('/employees', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Employee added');
    }
    resetForm(employeeForm, 'Save Employee');
    updateManagerSelect();
    await loadEmployees();
    await loadAssignments();
  } catch (err) {
    alert(err.message);
  }
};

const handleProjectSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const payload = {
    name: formData.get('name').trim(),
    description: formData.get('description').trim() || null,
    start_date: formData.get('start_date') || null,
    end_date: formData.get('end_date') || null,
  };
  const id = formData.get('entity_id');
  try {
    if (id) {
      await apiFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Project updated');
    } else {
      await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Project added');
    }
    resetForm(projectForm, 'Save Project');
    applyProjectDefaults();
    await loadProjects();
    await loadAssignments();
  } catch (err) {
    alert(err.message);
  }
};

const handleAssignmentSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(assignmentForm);
  const payload = {
    employee_id: Number(formData.get('employee_id')),
    project_id: Number(formData.get('project_id')),
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date'),
    allocation: (Number(formData.get('allocation')) || 0) / 100,
    notes: formData.get('notes').trim() || null,
  };
  const id = formData.get('entity_id');
  try {
    if (id) {
      await apiFetch(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Assignment updated');
    } else {
      await apiFetch('/assignments', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Assignment added');
    }
    resetForm(assignmentForm, 'Save Assignment');
    applyAssignmentDefaults();
    await loadAssignments();
  } catch (err) {
    alert(err.message);
  }
};

const handleOrganizationSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(organizationForm);
  const payload = {
    name: formData.get('name').trim(),
    description: formData.get('description').trim() || null,
  };
  const id = formData.get('entity_id');
  try {
    if (id) {
      await apiFetch(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Organization updated');
    } else {
      await apiFetch('/organizations', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Organization added');
    }
    resetForm(organizationForm, 'Save Organization');
    await loadOrganizations();
    await loadEmployees();
  } catch (err) {
    alert(err.message);
  }
};

const deleteOrganization = async (id) => {
  if (!confirm('Delete this organization? Employees must be moved first.')) return;
  try {
    await apiFetch(`/organizations/${id}`, { method: 'DELETE' });
    await loadOrganizations();
    await loadEmployees();
    showToast('Organization deleted');
  } catch (err) {
    alert(err.message);
  }
};

const populateOrganizationForm = (id) => {
  const organization = organizations.find((org) => org.id === Number(id));
  if (!organization) return;
  organizationForm.name.value = organization.name;
  organizationForm.description.value = organization.description || '';
  organizationForm.querySelector('input[name="entity_id"]').value = organization.id;
  organizationForm.querySelector('button[type="submit"]').textContent = 'Update Organization';
};

const tableClickHandler = (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (!id) return;

  if (action === 'delete-employee') return deleteEmployee(id);
  if (action === 'edit-employee') return populateEmployeeForm(id);
  if (action === 'delete-project') return deleteProject(id);
  if (action === 'edit-project') return populateProjectForm(id);
  if (action === 'delete-assignment') return deleteAssignment(id);
  if (action === 'edit-assignment') return populateAssignmentForm(id);
  if (action === 'delete-organization') return deleteOrganization(id);
  if (action === 'edit-organization') return populateOrganizationForm(id);
};

const deleteEmployee = async (id) => {
  if (!confirm('Delete this employee and related assignments? Direct reports will become unassigned.')) return;
  try {
    await apiFetch(`/employees/${id}`, { method: 'DELETE' });
    await loadEmployees();
    await loadAssignments();
    showToast('Employee deleted');
  } catch (err) {
    alert(err.message);
  }
};

const deleteProject = async (id) => {
  if (!confirm('Delete this project and related assignments?')) return;
  try {
    await apiFetch(`/projects/${id}`, { method: 'DELETE' });
    await loadProjects();
    await loadAssignments();
    showToast('Project deleted');
  } catch (err) {
    alert(err.message);
  }
};

const deleteAssignment = async (id) => {
  if (!confirm('Remove this assignment?')) return;
  try {
    await apiFetch(`/assignments/${id}`, { method: 'DELETE' });
    await loadAssignments();
    showToast('Assignment removed');
  } catch (err) {
    alert(err.message);
  }
};

const populateEmployeeForm = (id) => {
  const employee = employees.find((e) => e.id === Number(id));
  if (!employee) return;
  employeeForm.name.value = employee.name;
  employeeForm.role.value = employee.role || '';
  if (employeeOrganizationSelect) {
    employeeOrganizationSelect.value = employee.organization_id || '';
  }
  updateManagerSelect(employee.manager_id || '', employee.id);
  employeeForm.location.value = employee.location || '';
  employeeForm.capacity.value = employee.capacity || 1;
  employeeForm.querySelector('input[name="entity_id"]').value = employee.id;
  employeeForm.querySelector('button[type="submit"]').textContent = 'Update Employee';
};

const populateProjectForm = (id) => {
  const project = projects.find((p) => p.id === Number(id));
  if (!project) return;
  projectForm.name.value = project.name;
  projectForm.description.value = project.description || '';
  projectForm.start_date.value = project.start_date || '';
  projectForm.end_date.value = project.end_date || '';
  projectForm.querySelector('input[name="entity_id"]').value = project.id;
  projectForm.querySelector('button[type="submit"]').textContent = 'Update Project';
};

const populateAssignmentForm = (id) => {
  const assignment = assignments.find((a) => a.id === Number(id));
  if (!assignment) return;
  assignmentEmployeeSelect.value = assignment.employee_id;
  assignmentProjectSelect.value = assignment.project_id;
  assignmentForm.start_date.value = assignment.start_date;
  assignmentForm.end_date.value = assignment.end_date;
  assignmentForm.allocation.value = Math.round(assignment.allocation * 100);
  assignmentForm.notes.value = assignment.notes || '';
  assignmentForm.querySelector('input[name="entity_id"]').value = assignment.id;
  assignmentForm.querySelector('button[type="submit"]').textContent = 'Update Assignment';
};

const loadEmployeeSchedule = async (id) => {
  if (!id) {
    employeeScheduleList.innerHTML = '<li>Select an employee</li>';
    return;
  }
  try {
    const data = await apiFetch(`/schedule/employee/${id}`);
    renderScheduleList(data, employeeScheduleList, 'project_name');
  } catch (err) {
    alert(err.message);
  }
};

const loadProjectSchedule = async (id) => {
  if (!id) {
    projectScheduleList.innerHTML = '<li>Select a project</li>';
    return;
  }
  try {
    const data = await apiFetch(`/schedule/project/${id}`);
    renderScheduleList(data, projectScheduleList, 'employee_name');
  } catch (err) {
    alert(err.message);
  }
};

if (allocationPresetSelect) allocationPresetSelect.addEventListener('change', handlePresetChange);
if (allocationApplyBtn) allocationApplyBtn.addEventListener('click', handleCustomRange);
if (assignmentExportBtn) assignmentExportBtn.addEventListener('click', exportAssignmentsCsv);

organizationForm.addEventListener('submit', handleOrganizationSubmit);
employeeForm.addEventListener('submit', handleEmployeeSubmit);
projectForm.addEventListener('submit', handleProjectSubmit);
assignmentForm.addEventListener('submit', handleAssignmentSubmit);
if (assignmentProjectSelect) assignmentProjectSelect.addEventListener('change', handleAssignmentProjectChange);
organizationTable.addEventListener('click', tableClickHandler);
employeeTable.addEventListener('click', tableClickHandler);
projectTable.addEventListener('click', tableClickHandler);
assignmentTable.addEventListener('click', tableClickHandler);
scheduleEmployeeSelect.addEventListener('change', (event) => loadEmployeeSchedule(event.target.value));
scheduleProjectSelect.addEventListener('change', (event) => loadProjectSchedule(event.target.value));
if (employeeOrgFilter) employeeOrgFilter.addEventListener('change', () => renderEmployees());

const init = async () => {
  await loadOrganizations();
  await Promise.all([loadEmployees(), loadProjects()]);
  await loadAssignments();
  applyProjectDefaults();
  applyAssignmentDefaults();
  updateManagerSelect();
};

init();
