const employeeOrganizationSelect = document.querySelector('#employee-organization');
const employeeManagerSelect = document.querySelector('#employee-manager');
const employeeTypeSelect = document.querySelector('#employee-type');
const employeeManagerHelp = document.querySelector('#employee-manager-help');
const employeeTable = document.querySelector('#employee-table');
const employeeOrgFilter = document.querySelector('#employee-org-filter');
const employeeForm = document.querySelector('#employee-form');
const bulkEmployeeForm = document.querySelector('#bulk-employee-form');
const bulkEmployeeOrganizationSelect = document.querySelector('#bulk-employee-organization');
const bulkEmployeeManagerSelect = document.querySelector('#bulk-employee-manager');
const bulkEmployeeTypeSelect = document.querySelector('#bulk-employee-type');
const bulkSelectionStatus = document.querySelector('#bulk-selection-status');
const bulkApplyButton = document.querySelector('#bulk-apply-button');
const bulkClearSelectionButton = document.querySelector('#bulk-clear-selection');
const selectAllEmployeesCheckbox = document.querySelector('#select-all-employees');
const expandAllVisibleButton = document.querySelector('#expand-all-visible');
const collapseAllVisibleButton = document.querySelector('#collapse-all-visible');
const toast = document.querySelector('#toast');

let organizations = [];
let employees = [];
let expandedEmployees = new Set();
let selectedEmployees = new Set();

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
const getVisibleEmployees = () => {
  const selectedOrg = employeeOrgFilter?.value || '';
  return employees.filter((emp) => !selectedOrg || String(emp.organization_id) === selectedOrg);
};
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
const getDescendantIds = (employeeId, directReports) => {
  const descendants = [];
  const walk = (id) => {
    const children = directReports.get(id) || [];
    children.forEach((child) => {
      descendants.push(child.id);
      walk(child.id);
    });
  };
  walk(employeeId);
  return descendants;
};
const expandEmployeeBranch = (employeeId, directReports) => {
  expandedEmployees.add(employeeId);
  getDescendantIds(employeeId, directReports).forEach((id) => expandedEmployees.add(id));
};
const collapseEmployeeBranch = (employeeId, directReports) => {
  expandedEmployees.delete(employeeId);
  getDescendantIds(employeeId, directReports).forEach((id) => expandedEmployees.delete(id));
};
const updateBulkSelectionState = () => {
  const visibleEmployeeIds = new Set(getVisibleEmployees().map((employee) => employee.id));
  selectedEmployees = new Set([...selectedEmployees].filter((id) => employees.some((employee) => employee.id === id)));
  const visibleSelectedCount = [...selectedEmployees].filter((id) => visibleEmployeeIds.has(id)).length;
  bulkSelectionStatus.textContent = visibleSelectedCount
    ? `${visibleSelectedCount} selected on this view · ${selectedEmployees.size} total selected.`
    : selectedEmployees.size
      ? `${selectedEmployees.size} selected outside this filter.`
      : 'No employees selected.';
  bulkApplyButton.disabled = selectedEmployees.size === 0;
  bulkClearSelectionButton.disabled = selectedEmployees.size === 0;
  if (!visibleEmployeeIds.size) {
    selectAllEmployeesCheckbox.checked = false;
    selectAllEmployeesCheckbox.indeterminate = false;
    return;
  }
  selectAllEmployeesCheckbox.checked = visibleSelectedCount === visibleEmployeeIds.size;
  selectAllEmployeesCheckbox.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleEmployeeIds.size;
};
const renderEmployees = () => {
  const filteredEmployees = getVisibleEmployees();
  if (!filteredEmployees.length) {
    employeeTable.innerHTML = '<tr><td colspan="9">No employees match this filter.</td></tr>';
    updateBulkSelectionState();
    return;
  }
  const { roots, directReports } = buildHierarchy(filteredEmployees);
  const rows = [];
  const appendEmployeeRow = (employee, level = 0) => {
    const children = directReports.get(employee.id) || [];
    const hasChildren = children.length > 0;
    const expanded = hasChildren && expandedEmployees.has(employee.id);
    const indent = level * 20;
    rows.push(`
      <tr data-employee-row="${employee.id}" data-level="${level}">
        <td class="checkbox-cell">
          <input type="checkbox" class="employee-select-checkbox" data-id="${employee.id}" ${selectedEmployees.has(employee.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(employee.name)}" />
        </td>
        <td>
          <div class="employee-name-cell" style="padding-left:${indent}px">
            ${hasChildren ? `<button type="button" class="hierarchy-toggle hierarchy-toggle-small" data-action="toggle-employee" data-id="${employee.id}" aria-expanded="${expanded ? 'true' : 'false'}" title="Toggle direct reports"><span class="chevron">${expanded ? '▾' : '▸'}</span></button>` : '<span class="hierarchy-leaf hierarchy-leaf-small">•</span>'}
            <div class="employee-name-stack">
              <div class="employee-name-row">
                <strong>${escapeHtml(employee.name)}</strong>
                ${hasChildren ? `<button type="button" class="link-button" data-action="toggle-employee-recursive" data-id="${employee.id}">${expanded ? 'Collapse all' : 'Expand all'}</button>` : ''}
              </div>
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
  updateBulkSelectionState();
};
const updateOrganizationSelect = () => {
  const options = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
  const previousOrg = employeeOrganizationSelect.value;
  employeeOrganizationSelect.innerHTML = '<option value="">Select organization</option>' + options;
  if (previousOrg && organizations.some((org) => String(org.id) === previousOrg)) employeeOrganizationSelect.value = previousOrg;
  const previousFilter = employeeOrgFilter.value;
  employeeOrgFilter.innerHTML = ['<option value="">All organizations</option>'].concat(organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`)).join('');
  if (previousFilter && organizations.some((org) => String(org.id) === previousFilter)) employeeOrgFilter.value = previousFilter;
  bulkEmployeeOrganizationSelect.innerHTML = '<option value="">No change</option>' + options;
};
const updateManagerSelect = (selectedId = '', currentEmployeeId = null) => {
  const leaders = getLeaderEmployees(currentEmployeeId);
  const options = ['<option value="">No manager</option>'].concat(leaders.map((emp) => `<option value="${emp.id}">${escapeHtml(emp.name + (emp.organization_name ? ` · ${emp.organization_name}` : ''))}</option>`)).join('');
  employeeManagerSelect.innerHTML = options;
  employeeManagerSelect.value = selectedId && leaders.some((emp) => String(emp.id) === String(selectedId)) ? String(selectedId) : '';
  bulkEmployeeManagerSelect.innerHTML = '<option value="">No change</option><option value="__CLEAR__">Clear manager</option>' + leaders.map((emp) => `<option value="${emp.id}">${escapeHtml(emp.name + (emp.organization_name ? ` · ${emp.organization_name}` : ''))}</option>`).join('');
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
const resetBulkForm = () => {
  bulkEmployeeForm.reset();
  bulkEmployeeTypeSelect.value = '';
  bulkEmployeeOrganizationSelect.value = '';
  bulkEmployeeManagerSelect.value = '';
};
const loadOrganizations = async () => {
  organizations = await apiFetch('/organizations');
  updateOrganizationSelect();
};
const loadEmployees = async () => {
  employees = await apiFetch('/employees');
  const managerIds = new Set(employees.filter((employee) => employee.direct_report_count > 0).map((employee) => employee.id));
  expandedEmployees = new Set([...expandedEmployees].filter((id) => managerIds.has(id)));
  selectedEmployees = new Set([...selectedEmployees].filter((id) => employees.some((employee) => employee.id === id)));
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
bulkEmployeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedEmployees.size) {
    alert('Select at least one employee to bulk edit.');
    return;
  }
  const updates = [...selectedEmployees].map((employeeId) => {
    const payload = {};
    if (bulkEmployeeTypeSelect.value) payload.employee_type = bulkEmployeeTypeSelect.value;
    if (bulkEmployeeOrganizationSelect.value) payload.organization_id = Number(bulkEmployeeOrganizationSelect.value);
    if (bulkEmployeeManagerSelect.value === '__CLEAR__') payload.manager_id = null;
    else if (bulkEmployeeManagerSelect.value) payload.manager_id = Number(bulkEmployeeManagerSelect.value);
    const locationValue = bulkEmployeeForm.location.value.trim();
    if (locationValue) payload.location = locationValue;
    const capacityValue = bulkEmployeeForm.capacity.value;
    if (capacityValue) payload.capacity = Number(capacityValue);
    return { employeeId, payload };
  }).filter((entry) => Object.keys(entry.payload).length > 0);
  if (!updates.length) {
    alert('Choose at least one field to update.');
    return;
  }
  try {
    for (const update of updates) {
      await apiFetch(`/employees/${update.employeeId}`, { method: 'PUT', body: JSON.stringify(update.payload) });
    }
    showToast(`Updated ${updates.length} employee${updates.length === 1 ? '' : 's'}`);
    selectedEmployees.clear();
    resetBulkForm();
    await loadEmployees();
  } catch (err) {
    alert(err.message);
  }
});
employeeTable.addEventListener('click', async (event) => {
  const checkbox = event.target.closest('.employee-select-checkbox');
  if (checkbox) {
    const employeeId = Number(checkbox.dataset.id);
    if (checkbox.checked) selectedEmployees.add(employeeId);
    else selectedEmployees.delete(employeeId);
    updateBulkSelectionState();
    return;
  }
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
  if (action === 'toggle-employee-recursive') {
    const filteredEmployees = getVisibleEmployees();
    const { directReports } = buildHierarchy(filteredEmployees);
    const employeeId = Number(id);
    const currentlyExpanded = expandedEmployees.has(employeeId);
    if (currentlyExpanded) collapseEmployeeBranch(employeeId, directReports);
    else expandEmployeeBranch(employeeId, directReports);
    renderEmployees();
    return;
  }
  if (action === 'edit-employee') populateEmployeeForm(id);
  if (action === 'delete-employee') {
    if (!confirm('Delete this employee and related assignments? Direct reports will become unassigned.')) return;
    await apiFetch(`/employees/${id}`, { method: 'DELETE' });
    selectedEmployees.delete(Number(id));
    showToast('Employee deleted');
    await loadEmployees();
  }
});
employeeTable.addEventListener('change', (event) => {
  const checkbox = event.target.closest('.employee-select-checkbox');
  if (!checkbox) return;
  const employeeId = Number(checkbox.dataset.id);
  if (checkbox.checked) selectedEmployees.add(employeeId);
  else selectedEmployees.delete(employeeId);
  updateBulkSelectionState();
});
selectAllEmployeesCheckbox.addEventListener('change', () => {
  const visibleEmployees = getVisibleEmployees();
  if (selectAllEmployeesCheckbox.checked) visibleEmployees.forEach((employee) => selectedEmployees.add(employee.id));
  else visibleEmployees.forEach((employee) => selectedEmployees.delete(employee.id));
  renderEmployees();
});
bulkClearSelectionButton.addEventListener('click', () => {
  selectedEmployees.clear();
  updateBulkSelectionState();
  renderEmployees();
});
expandAllVisibleButton.addEventListener('click', () => {
  const filteredEmployees = getVisibleEmployees();
  const { roots, directReports } = buildHierarchy(filteredEmployees);
  roots.forEach((employee) => expandEmployeeBranch(employee.id, directReports));
  renderEmployees();
});
collapseAllVisibleButton.addEventListener('click', () => {
  const filteredEmployees = getVisibleEmployees();
  const { roots, directReports } = buildHierarchy(filteredEmployees);
  roots.forEach((employee) => collapseEmployeeBranch(employee.id, directReports));
  renderEmployees();
});
employeeTypeSelect.addEventListener('change', syncManagerFieldState);
employeeOrgFilter.addEventListener('change', () => {
  renderEmployees();
});
(async function init() {
  await loadOrganizations();
  await loadEmployees();
  syncManagerFieldState();
  resetBulkForm();
})();
