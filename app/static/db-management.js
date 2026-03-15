const table = document.getElementById('db-connection-table');
const form = document.getElementById('db-connection-form');
const formTitle = document.getElementById('db-form-title');
const typeSelect = document.getElementById('db-type');
const sqliteFields = document.getElementById('sqlite-fields');
const postgresFields = document.getElementById('postgres-fields');
const clearButton = document.getElementById('db-clear-form');
const toast = document.getElementById('toast');

let connections = [];

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

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

const syncTypeFields = () => {
  const type = typeSelect.value;
  sqliteFields.classList.toggle('hidden', type !== 'sqlite');
  postgresFields.classList.toggle('hidden', type !== 'postgresql');
  document.getElementById('db-sqlite-path').required = type === 'sqlite';
  ['db-postgres-host', 'db-postgres-database', 'db-postgres-username'].forEach((id) => {
    document.getElementById(id).required = type === 'postgresql';
  });
};

const resetForm = () => {
  form.reset();
  form.entity_id.value = '';
  formTitle.textContent = 'Add Connection';
  document.getElementById('db-submit').textContent = 'Save Connection';
  document.getElementById('db-postgres-port').value = '5432';
  document.getElementById('db-postgres-sslmode').value = 'prefer';
  typeSelect.value = 'sqlite';
  syncTypeFields();
};

const renderTable = () => {
  if (!connections.length) {
    table.innerHTML = '<tr><td colspan="5">No database connections configured yet.</td></tr>';
    return;
  }
  table.innerHTML = connections.map((connection) => `
    <tr>
      <td><strong>${escapeHtml(connection.name)}</strong></td>
      <td>${escapeHtml(connection.db_type)}</td>
      <td>${escapeHtml(connection.connection_summary)}</td>
      <td>${connection.is_active ? '<span class="badge">Active</span>' : '<span class="muted">Inactive</span>'}</td>
      <td class="actions">
        ${connection.is_active ? '' : `<button type="button" data-action="activate" data-id="${connection.id}">Activate</button>`}
        <button type="button" data-action="edit" data-id="${connection.id}">Edit</button>
        ${connection.is_active ? '' : `<button type="button" class="secondary" data-action="delete" data-id="${connection.id}">Delete</button>`}
      </td>
    </tr>
  `).join('');
};

const loadConnections = async () => {
  connections = await apiFetch('/db-connections');
  renderTable();
};

const populateForm = (id) => {
  const connection = connections.find((item) => item.id === Number(id));
  if (!connection) return;
  form.entity_id.value = connection.id;
  form.name.value = connection.name;
  typeSelect.value = connection.db_type;
  form.sqlite_path.value = connection.sqlite_path || '';
  form.postgres_host.value = connection.postgres_host || '';
  form.postgres_port.value = connection.postgres_port || 5432;
  form.postgres_database.value = connection.postgres_database || '';
  form.postgres_username.value = connection.postgres_username || '';
  form.postgres_password.value = connection.postgres_password || '';
  form.postgres_sslmode.value = connection.postgres_sslmode || 'prefer';
  formTitle.textContent = 'Update Connection';
  document.getElementById('db-submit').textContent = 'Update Connection';
  syncTypeFields();
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = {
    name: formData.get('name').trim(),
    db_type: formData.get('db_type'),
    sqlite_path: formData.get('sqlite_path').trim() || null,
    postgres_host: formData.get('postgres_host').trim() || null,
    postgres_port: Number(formData.get('postgres_port')) || 5432,
    postgres_database: formData.get('postgres_database').trim() || null,
    postgres_username: formData.get('postgres_username').trim() || null,
    postgres_password: formData.get('postgres_password') || null,
    postgres_sslmode: formData.get('postgres_sslmode').trim() || 'prefer',
  };
  const id = formData.get('entity_id');
  try {
    if (id) {
      await apiFetch(`/db-connections/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Connection updated');
    } else {
      await apiFetch('/db-connections', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Connection added');
    }
    resetForm();
    await loadConnections();
  } catch (err) {
    alert(err.message);
  }
});

table.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'edit') populateForm(id);
    if (action === 'activate') {
      await apiFetch(`/db-connections/${id}/activate`, { method: 'POST' });
      showToast('Connection activated');
      await loadConnections();
    }
    if (action === 'delete') {
      if (!confirm('Delete this database connection?')) return;
      await apiFetch(`/db-connections/${id}`, { method: 'DELETE' });
      showToast('Connection deleted');
      await loadConnections();
    }
  } catch (err) {
    alert(err.message);
  }
});

typeSelect.addEventListener('change', syncTypeFields);
clearButton.addEventListener('click', resetForm);

resetForm();
loadConnections().catch((err) => alert(err.message));
