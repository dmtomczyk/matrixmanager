const employeeOrganizationSelect = document.querySelector('#employee-organization');
const employeeManagerSelect = document.querySelector('#employee-manager');
const employeeTypeSelect = document.querySelector('#employee-type');
const employeeManagerHelp = document.querySelector('#employee-manager-help');
const employeeTable = document.querySelector('#employee-table');
const employeeOrgFilter = document.querySelector('#employee-org-filter');
const employeeForm = document.querySelector('#employee-form');
const toast = document.querySelector('#toast');

let organizations = [];
let employees = [];
let expandedEmployees = new Set();

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
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
const getLeaderEmployees = (currentEmployeeId = null) => employees.filter((emp) => emp.employee_type === 'L' && emp.id !== currentEmployeeId).sort((a, b) => a.name.localeCompare(b.name));
const getCurrentEmployeeTypeValue = () => employeeTypeSelect?.value || 'IC';
const syncManagerFieldState = () => {
  const isIc = getCurrentEmployeeTypeValue() === 'IC';
  employeeManagerSelect.required = isIc;
  if (employeeManagerHelp) employeeManagerHelp.textContent = isIc ? 'Required for ICs. Optional for leaders without reports above them.' : 'Optional for leaders.';
};
const buildHierarchy = (items) => {
  const byId = new Map(items.map((employee) => [employee.id, employee]));
  const directReports = new Map(items.map((employee) => [employee.id, []]));
  const roots = [];
  items.forEach((employee) => {
    if (employee.manager_id && byId.has(employee.manager_id)) {
      directReports.get(employee.manager_id).push(employee);
    } else {
      roots.push(employee);
    }
  });
  const sorter = (a, b) => {
    if (a.employee_type !== b.employee_type) return a.employee_type === 'L' ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
  roots.sort(sorter);
  directReports.forEach((list) => list.sort(sorter));
  return { roots, directReports };
};
const renderEmployees = () => {
  const selectedOrg = employeeOrgFilter?.value || '';
  const filteredEmployees = employees.filter((emp) => !selectedOrg || String(emp.organization_id) === selectedOrg);
  if (!filteredEmployees.length) {
    employeeTable.innerHTML = '<tr><td colspan="8">No employees match this filter.</td></tr>';
    return;
  }
  const { roots, directReports } = buildHierarchy(filteredEmployees);
  const rows = [];
  const appendEmployeeRow = (employee, level = 0) => {
    const children = directReports.get(employee.id) || [];
    const hasChildren = children.length > 0;
    const expanded = hasChildren && expandedEmployees.has(employee.id);
    const indent = level * 22;
    rows.push(`
      <tr data-employee-row="${employee.id}" data-level="${level}">
        <td>
          <div class="employee-name-cell" style="padding-left:${indent}px">
            ${hasChildren ? `<button type="button" class="hierarchy-toggle" data-action="toggle-employee" data-id="${employee.id}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? '▾' : '▸'}</button>` : '<span class="hierarchy-leaf">•</span>'}
            <div class="employee-name-stack">
              <strong>${escapeHtml(employee.name)}</strong>
              ${hasChildren ? `<span class="employee-subtle">${children.length} direct report${children.length === 1 ? '' : 's'}</span>` : ''}
            </div>
          </div>
        </td>
        <td>${escapeHtml(employee.role || '')}</td>
        <td>${escapeHtml(employee.employee_type || 'IC')}</td>
        <td>${escapeHtml(employee.organization_name || '')}</td>
        <td>${escapeHtml(employee.manager_name || '—')}</td>
        <td>${escapeHtml(employee.location || '')}</td>
        <td>${employee.capacity?.toFixed(1) || '1.0'}</td>
        <td class="actions">
          <button type="button" data-action="edit-employee" data-id="${employee.id}">Edit</button>
          <button type="button" class="secondary" data-action="delete-employee" data-id="${employee.id}">Delete</button>
        </td>
      </tr>`);
    if (expanded) {
      children.forEach((child) => appendEmployeeRow(child, level + 1));
    }
  };
  roots.forEach((employee) => appendEmployeeRow(employee, 0));
  employeeTable.innerHTML = rows.join('');
};
const updateOrganizationSelect = () => {
  const options = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
  const previousOrg = employeeOrganizationSelect.value;
  employeeOrganizationSelect.innerHTML = '<option value="">Select organization</option>' + options;
  if (previousOrg && organizations.some((org) => String(org.id) === previousOrg)) employeeOrganizationSelect.value = previousOrg;
  const previousFilter = employeeOrgFilter.value;
  employeeOrgFilter.innerHTML = ['<option value="">All organizations</option>'].concat(organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`)).join('');
  if (previousFilter && organizations.some((org) => String(org.id) === previousFilter)) employeeOrgFilter.value = previousFilter;
};
const updateManagerSelect = (selectedId = '', currentEmployeeId = null) => {
  const leaders = getLeaderEmployees(currentEmployeeId);
  employeeManagerSelect.innerHTML = ['<option value="">No manager</option>'].concat(leaders.map((emp) => `<option value="${emp.id}">${escapeHtml(emp.name + (emp.organization_name ? ` · ${emp.organization_name}` : ''))}</option>`)).join('');
  employeeManagerSelect.value = selectedId && leaders.some((emp) => String(emp.id) === String(selectedId)) ? String(selectedId) : '';
  syncManagerFieldState();
};
const resetForm = () => {
  employeeForm.reset();
  employeeForm.querySelector('input[name="entity_id"]').value = '';
  employeeForm.querySelector('button[type="submit"]').textContent = 'Save Employee';
  employeeTypeSelect.value = 'IC';
  syncManagerFieldState();
  updateManagerSelect();
};
const loadOrganizations = async () => {
  organizations = await apiFetch('/organizations');
  updateOrganizationSelect();
};
const loadEmployees = async () => {
  employees = await apiFetch('/employees');
  const managerIds = new Set(employees.filter((employee) => employee.direct_report_count > 0).map((employee) => employee.id));
  expandedEmployees = new Set([...expandedEmployees].filter((id) => managerIds.has(id)));
  renderEmployees();
  updateManagerSelect(employeeManagerSelect?.value || '', Number(employeeForm?.querySelector('input[name="entity_id"]')?.value) || null);
};
const populateEmployeeForm = (id) => {
  const employee = employees.find((e) => e.id === Number(id));
  if (!employee) return;
  employeeForm.name.value = employee.name;
  employeeForm.role.value = employee.role || '';
  employeeTypeSelect.value = employee.employee_type || 'IC';
  employeeOrganizationSelect.value = employee.organization_id || '';
  employeeForm.location.value = employee.location || '';
  employeeForm.capacity.value = employee.capacity || 1;
  employeeForm.querySelector('input[name="entity_id"]').value = employee.id;
  employeeForm.querySelector('button[type="submit"]').textContent = 'Update Employee';
  updateManagerSelect(employee.manager_id || '', employee.id);
  syncManagerFieldState();
};
employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(employeeForm);
  const organizationId = Number(formData.get('organization_id'));
  if (!organizationId) return alert('Select an organization for this employee.');
  const payload = {
    name: formData.get('name').trim(),
    role: formData.get('role').trim() || null,
    employee_type: getCurrentEmployeeTypeValue(),
    location: formData.get('location').trim() || null,
    capacity: Number(formData.get('capacity')) || 1,
    organization_id: organizationId,
    manager_id: employeeManagerSelect.value ? Number(employeeManagerSelect.value) : null,
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
    resetForm();
    await loadEmployees();
  } catch (err) {
    alert(err.message);
  }
});
employeeTable.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'toggle-employee') {
    const employeeId = Number(id);
    if (expandedEmployees.has(employeeId)) expandedEmployees.delete(employeeId);
    else expandedEmployees.add(employeeId);
    renderEmployees();
    return;
  }
  if (action === 'edit-employee') populateEmployeeForm(id);
  if (action === 'delete-employee') {
    if (!confirm('Delete this employee and related assignments? Direct reports will become unassigned.')) return;
    await apiFetch(`/employees/${id}`, { method: 'DELETE' });
    showToast('Employee deleted');
    await loadEmployees();
  }
});
employeeTypeSelect.addEventListener('change', syncManagerFieldState);
employeeOrgFilter.addEventListener('change', renderEmployees);
(async function init() {
  await loadOrganizations();
  await loadEmployees();
  syncManagerFieldState();
})();
