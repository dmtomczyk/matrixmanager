const chartCanvas = document.getElementById('dashboard-chart');
const projectPickerBtn = document.getElementById('project-picker-btn');
const projectPickerPanel = document.getElementById('project-picker-panel');
const projectSearch = document.getElementById('project-search');
const projectCheckboxes = document.getElementById('project-checkboxes');
const projectSelectAll = document.getElementById('project-select-all');
const projectClearBtn = document.getElementById('project-clear');
const startInput = document.getElementById('dashboard-start');
const endInput = document.getElementById('dashboard-end');
const applyBtn = document.getElementById('apply-range');
const resetBtn = document.getElementById('reset-range');
const toast = document.getElementById('toast');

const DAY_MS = 86400000;
const WEEK_MS = DAY_MS * 7;

let projects = [];
let assignments = [];
let selectedProjectIds = new Set();
let chart;
let defaultRange = { start: null, end: null };

const apiFetch = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Request failed');
  }
  return res.json();
};

const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
};

const toDateValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return NaN;
  date.setHours(0, 0, 0, 0);
  return date.valueOf();
};

const overlapsRange = (startValue, endValue, rangeStart, rangeEnd) =>
  startValue <= rangeEnd && endValue >= rangeStart;

const formatISODate = (date) => date.toISOString().split('T')[0];

const buildColor = (index) => {
  const palette = ['#2563eb', '#16a34a', '#f97316', '#a855f7', '#0ea5e9', '#f43f5e', '#14b8a6'];
  return palette[index % palette.length];
};

const computeDefaultRange = () => {
  const startValues = projects
    .map((proj) => toDateValue(proj.start_date))
    .filter((value) => Number.isFinite(value));
  const endValues = projects
    .map((proj) => toDateValue(proj.end_date))
    .filter((value) => Number.isFinite(value));
  defaultRange.start = startValues.length ? Math.min(...startValues) : Date.now();
  defaultRange.end = endValues.length ? Math.max(...endValues) : Date.now();
};

const getRange = () => {
  const startValue = toDateValue(startInput.value) || defaultRange.start;
  const endValue = toDateValue(endInput.value) || defaultRange.end;
  return { start: Math.min(startValue, endValue), end: Math.max(startValue, endValue) };
};

const updatePickerSummary = () => {
  if (!projectPickerBtn) return;
  if (selectedProjectIds.size === projects.length) {
    projectPickerBtn.textContent = 'All projects';
  } else if (!selectedProjectIds.size) {
    projectPickerBtn.textContent = 'No projects selected';
  } else {
    projectPickerBtn.textContent = `${selectedProjectIds.size} of ${projects.length} projects`;
  }
};

const renderProjectCheckboxes = (query = '') => {
  if (!projectCheckboxes) return;
  const filterText = query.toLowerCase();
  projectCheckboxes.innerHTML = '';
  projects
    .filter((project) => project.name.toLowerCase().includes(filterText))
    .forEach((project, index) => {
      const id = project.id;
      const wrapper = document.createElement('label');
      wrapper.className = 'filter-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = id;
      checkbox.checked = selectedProjectIds.has(id);
      checkbox.addEventListener('change', (event) => {
        if (event.target.checked) {
          selectedProjectIds.add(id);
        } else {
          selectedProjectIds.delete(id);
        }
        updatePickerSummary();
        renderChart();
      });
      const name = document.createElement('span');
      name.textContent = project.name;
      wrapper.append(checkbox, name);
      projectCheckboxes.appendChild(wrapper);
    });
};

const renderFilters = () => {
  renderProjectCheckboxes(projectSearch?.value || '');
  updatePickerSummary();
  if (!startInput.value && defaultRange.start) {
    startInput.value = formatISODate(new Date(defaultRange.start));
  }
  if (!endInput.value && defaultRange.end) {
    endInput.value = formatISODate(new Date(defaultRange.end));
  }
};

const computeDatasets = (rangeStart, rangeEnd) => {
  const weeks = [];
  let cursor = rangeStart;
  const MAX_WEEKS = 520;
  while (cursor <= rangeEnd && weeks.length < MAX_WEEKS) {
    const weekStart = cursor;
    const weekEnd = Math.min(cursor + WEEK_MS - DAY_MS, rangeEnd);
    weeks.push({ start: weekStart, end: weekEnd });
    cursor += WEEK_MS;
  }
  const labels = weeks.map((week) => new Date(week.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const datasets = projects
    .filter((proj) => selectedProjectIds.has(proj.id))
    .map((project, index) => {
      const projectAssignments = assignments.filter((asg) => asg.project_id === project.id);
      const data = weeks.map((week) => {
        const fte = projectAssignments.reduce((sum, asg) => {
          const startValue = toDateValue(asg.start_date);
          const endValue = toDateValue(asg.end_date);
          if (Number.isNaN(startValue) || Number.isNaN(endValue)) return sum;
          if (overlapsRange(startValue, endValue, week.start, week.end)) {
            return sum + (asg.allocation || 0);
          }
          return sum;
        }, 0);
        return Number(fte.toFixed(2));
      });
      const color = buildColor(index);
      return {
        label: project.name,
        data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        pointRadius: 0,
      };
    });
  return { labels, datasets };
};

const renderChart = () => {
  if (!chartCanvas) return;
  const { start, end } = getRange();
  const { labels, datasets } = computeDatasets(start, end);
  if (chart) chart.destroy();
  chart = new Chart(chartCanvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'FTE' } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue} FTE`,
          },
        },
      },
    },
  });
};

const loadData = async () => {
  try {
    const [projectData, assignmentData] = await Promise.all([apiFetch('/projects'), apiFetch('/assignments')]);
    projects = projectData;
    assignments = assignmentData;
    selectedProjectIds = new Set(projects.map((proj) => proj.id));
    computeDefaultRange();
    renderFilters();
    renderChart();
  } catch (err) {
    showToast(err.message);
  }
};

applyBtn.addEventListener('click', () => renderChart());
resetBtn.addEventListener('click', () => {
  startInput.value = defaultRange.start ? formatISODate(new Date(defaultRange.start)) : '';
  endInput.value = defaultRange.end ? formatISODate(new Date(defaultRange.end)) : '';
  renderChart();
});

projectPickerBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  projectPickerPanel?.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
  if (!projectPickerPanel || projectPickerPanel.classList.contains('hidden')) return;
  if (event.target === projectPickerPanel || projectPickerPanel.contains(event.target) || event.target === projectPickerBtn) return;
  projectPickerPanel.classList.add('hidden');
});

projectSearch?.addEventListener('input', (event) => {
  renderProjectCheckboxes(event.target.value);
});

projectSelectAll?.addEventListener('click', () => {
  selectedProjectIds = new Set(projects.map((proj) => proj.id));
  renderProjectCheckboxes(projectSearch?.value || '');
  updatePickerSummary();
  renderChart();
});

projectClearBtn?.addEventListener('click', () => {
  selectedProjectIds.clear();
  renderProjectCheckboxes(projectSearch?.value || '');
  updatePickerSummary();
  renderChart();
});
loadData();
