const userTable = document.getElementById('user-table');
const userForm = document.getElementById('user-form');
const resetButton = document.getElementById('user-form-reset');
const toast = document.getElementById('toast');

let users = [];

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

const resetForm = () => {
  userForm.reset();
  userForm.entity_id.value = '';
  userForm.is_active.checked = true;
  userForm.username.disabled = false;
  document.getElementById('user-form-title').textContent = 'Add User';
  userForm.querySelector('button[type="submit"]').textContent = 'Save User';
};

const renderUsers = () => {
  if (!users.length) {
    userTable.innerHTML = '<tr><td colspan="4">No database users created yet.</td></tr>';
    return;
  }
  userTable.innerHTML = users.map((user) => `
    <tr>
      <td>${user.username}</td>
      <td>${user.is_admin ? 'Yes' : 'No'}</td>
      <td>${user.is_active ? 'Yes' : 'No'}</td>
      <td class="actions">
        <button type="button" data-action="edit" data-id="${user.id}">Edit</button>
        <button type="button" class="secondary" data-action="delete" data-id="${user.id}">Delete</button>
      </td>
    </tr>
  `).join('');
};

const loadUsers = async () => {
  users = await apiFetch('/users-api');
  renderUsers();
};

userForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(userForm);
  const id = formData.get('entity_id');
  try {
    if (id) {
      const payload = {
        is_admin: userForm.is_admin.checked,
        is_active: userForm.is_active.checked,
      };
      if (formData.get('password')) payload.password = formData.get('password');
      await apiFetch(`/users-api/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('User updated');
    } else {
      await apiFetch('/users-api', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username').trim(),
          password: formData.get('password'),
          is_admin: userForm.is_admin.checked,
        }),
      });
      showToast('User created');
    }
    resetForm();
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
});

userTable.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const user = users.find((entry) => entry.id === Number(button.dataset.id));
  if (!user) return;
  try {
    if (button.dataset.action === 'edit') {
      userForm.entity_id.value = user.id;
      userForm.username.value = user.username;
      userForm.username.disabled = true;
      userForm.password.value = '';
      userForm.is_admin.checked = user.is_admin;
      userForm.is_active.checked = user.is_active;
      document.getElementById('user-form-title').textContent = 'Update User';
      userForm.querySelector('button[type="submit"]').textContent = 'Update User';
    }
    if (button.dataset.action === 'delete') {
      if (!confirm(`Delete user ${user.username}?`)) return;
      await apiFetch(`/users-api/${user.id}`, { method: 'DELETE' });
      showToast('User deleted');
      await loadUsers();
    }
  } catch (err) {
    alert(err.message);
  }
});

resetButton.addEventListener('click', resetForm);

resetForm();
loadUsers().catch((err) => alert(err.message));
