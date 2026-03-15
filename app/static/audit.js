const auditTable = document.getElementById('audit-table');
const entityTypeSelect = document.getElementById('audit-entity-type');
const actionSelect = document.getElementById('audit-action');
const actorInput = document.getElementById('audit-actor');
const queryInput = document.getElementById('audit-query');
const exportButton = document.getElementById('audit-export');
const clearButton = document.getElementById('audit-clear');
const toast = document.getElementById('toast');
const body = document.body;

const isAdmin = body.dataset.isAdmin === 'true';
const currentUser = body.dataset.currentUser || '';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
const prettyJson = (raw) => {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};
const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
};
const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  if (response.status === 204) return null;
  return response.json();
};
const currentFilters = () => {
  const params = new URLSearchParams();
  if (entityTypeSelect.value) params.set('entity_type', entityTypeSelect.value);
  if (actionSelect.value) params.set('action', actionSelect.value);
  if (actorInput.value.trim()) params.set('actor', actorInput.value.trim());
  if (queryInput.value.trim()) params.set('query', queryInput.value.trim());
  return params;
};
const renderRows = (entries) => {
  if (!entries.length) {
    auditTable.innerHTML = '<tr><td colspan="7">No audit entries match this filter.</td></tr>';
    return;
  }
  auditTable.innerHTML = entries.map((entry) => `
    <tr>
      <td>${escapeHtml(new Date(entry.occurred_at).toLocaleString())}</td>
      <td>${escapeHtml(entry.actor_username || '—')}</td>
      <td><span class="badge">${escapeHtml(entry.entity_type)}</span>${entry.entity_id ? ` <span class="muted small-text">#${entry.entity_id}</span>` : ''}</td>
      <td>${escapeHtml(entry.action)}</td>
      <td>${escapeHtml(entry.entity_label || '—')}</td>
      <td><pre class="audit-json">${escapeHtml(prettyJson(entry.before_json))}</pre></td>
      <td><pre class="audit-json">${escapeHtml(prettyJson(entry.after_json))}</pre></td>
    </tr>
  `).join('');
};
const loadAuditEntries = async () => {
  const params = currentFilters();
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const entries = await apiFetch(`/audit-log${suffix}`);
  renderRows(entries);
};
const exportCsv = () => {
  const params = currentFilters();
  const suffix = params.toString() ? `?${params.toString()}` : '';
  window.location.href = `/audit-log/export${suffix}`;
};
const clearAuditHistory = async () => {
  if (!isAdmin) return;
  if (!confirm('Clear the audit history? This action is restricted to admin and will keep only a record of the clear itself.')) return;
  await apiFetch('/audit-log', { method: 'DELETE' });
  showToast('Audit history cleared');
  await loadAuditEntries();
};

if (isAdmin) {
  clearButton.classList.remove('hidden');
}
actorInput.placeholder = currentUser || 'admin';

[entityTypeSelect, actionSelect].forEach((element) => element.addEventListener('change', () => loadAuditEntries().catch((err) => alert(err.message))));
let filterTimer;
[actorInput, queryInput].forEach((element) => element.addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => loadAuditEntries().catch((err) => alert(err.message)), 180);
}));
exportButton.addEventListener('click', exportCsv);
clearButton.addEventListener('click', () => clearAuditHistory().catch((err) => alert(err.message)));

loadAuditEntries().catch((err) => alert(err.message));
