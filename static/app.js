// State Management
const state = {
    currentUser: null,
    tasks: []
};

const API_URL = '/api';

// DOM Elements
const elements = {
    app: document.getElementById('app'),
    authContainer: document.getElementById('auth-container'),
    loginView: document.getElementById('login-view'),
    registerView: document.getElementById('register-view'),

    // Main Layout
    appLayout: document.getElementById('app-layout'),
    sidebar: document.getElementById('sidebar'),
    mainContent: document.getElementById('main-content'),
    navUsername: document.getElementById('nav-username'),

    // Views
    views: {
        'dashboard-view': document.getElementById('dashboard-view'),
        'today-view': document.getElementById('today-view'),
        'upcoming-view': document.getElementById('upcoming-view'),
        'calendar-view': document.getElementById('calendar-view'),
        'projects-view': document.getElementById('projects-view'),
        'settings-view': document.getElementById('settings-view')
    },

    // Dashboard Specifics
    taskList: document.getElementById('task-list'),
    taskStats: document.getElementById('task-stats'),
    statToday: document.getElementById('stat-today'),
    statPending: document.getElementById('stat-pending'),
    statCompleted: document.getElementById('stat-completed'),

    // Modals & Forms
    modal: document.getElementById('task-modal'),
    taskForm: document.getElementById('task-form'),
    modalTitle: document.getElementById('modal-title'),
    toast: document.getElementById('toast')
};

// --- Authentication ---

function initAuth() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        state.currentUser = JSON.parse(storedUser);
        loadTasks();
        showAppLayout();
    } else {
        showLogin();
    }
}

async function register(username, password) {
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            login(username, password);
        } else {
            showToast(data.error || 'Registration failed');
        }
    } catch (err) {
        showToast('Server error. Is the backend running?');
        console.error(err);
    }
}

async function login(username, password) {
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            state.currentUser = data;
            localStorage.setItem('currentUser', JSON.stringify(data));
            loadTasks();
            showAppLayout();
            showToast(`Welcome back, ${data.username}!`);
        } else {
            showToast(data.error || 'Login failed');
        }
    } catch (err) {
        showToast('Server error. Is the backend running?');
        console.error(err);
    }
}

function logout() {
    state.currentUser = null;
    state.tasks = [];
    localStorage.removeItem('currentUser');
    showLogin();
}

// --- Task Management ---

async function loadTasks() {
    if (!state.currentUser) return;
    try {
        const res = await fetch(`${API_URL}/tasks?userId=${state.currentUser.id}`);
        if (res.ok) {
            state.tasks = await res.json();
            renderDashboard();
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to load tasks');
    }
}

async function saveTask(task) {
    try {
        let url = `${API_URL}/tasks`;
        let method = 'POST';

        if (task.id) {
            url = `${API_URL}/tasks/${task.id}`;
            method = 'PUT';
        } else {
            task.userId = state.currentUser.id;
            task.status = 'pending';
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });

        if (res.ok) {
            loadTasks();
            closeModal();
            showToast('Task saved successfully');
        } else {
            showToast('Failed to save task');
        }
    } catch (err) {
        console.error(err);
        showToast('Server error');
    }
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        const res = await fetch(`${API_URL}/tasks/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadTasks();
            showToast('Task deleted');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to delete task');
    }
}

async function toggleTaskStatus(id) {
    const task = state.tasks.find(t => t.id == id);
    if (task) {
        const newStatus = task.status === 'pending' ? 'completed' : 'pending';
        // Optimistic update
        task.status = newStatus;
        renderDashboard();

        try {
            await fetch(`${API_URL}/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...task, status: newStatus })
            });
        } catch (err) {
            console.error(err);
            showToast('Failed to update status');
            loadTasks(); // Revert on error
        }
    }
}

// --- UI Logic ---

function showLogin() {
    elements.authContainer.classList.remove('hidden');
    elements.appLayout.classList.add('hidden');
    elements.loginView.classList.add('active');
    elements.registerView.classList.remove('active');
}

function showAppLayout() {
    elements.authContainer.classList.add('hidden');
    elements.appLayout.classList.remove('hidden');
    elements.navUsername.textContent = state.currentUser.username;
    switchView('dashboard-view'); // Default view
}

function switchView(viewId) {
    // Hide all views
    Object.values(elements.views).forEach(el => el.classList.add('hidden'));
    Object.values(elements.views).forEach(el => el.classList.remove('active'));

    // Show target view
    const targetView = elements.views[viewId];
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active'); // For CSS animations if needed
    }

    // Update Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) {
            item.classList.add('active');
        }
    });
}

function renderDashboard() {
    // Update Stats
    const total = state.tasks.length;
    const pending = state.tasks.filter(t => t.status === 'pending').length;
    const completed = state.tasks.filter(t => t.status === 'completed').length;

    // Simple "Today" check (local date string match)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = state.tasks.filter(t => t.dueDate === todayStr).length;

    elements.statPending.textContent = pending;
    elements.statCompleted.textContent = completed;
    elements.statToday.textContent = todayCount;
    elements.taskStats.textContent = `You have ${pending} pending task${pending !== 1 ? 's' : ''}`;

    // Render Task List (Recent 5 or all?)
    // For now, render all pending tasks first, then completed
    elements.taskList.innerHTML = '';

    if (state.tasks.length === 0) {
        elements.taskList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No tasks found. Create one to get started!</p>';
        return;
    }

    // Sort: Pending first, then by date
    const sortedTasks = [...state.tasks].sort((a, b) => {
        if (a.status === b.status) {
            return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return a.status === 'pending' ? -1 : 1;
    });

    sortedTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        if (task.status === 'completed') card.style.opacity = '0.6';

        card.innerHTML = `
            <div class="task-header">
                <div class="task-title" style="${task.status === 'completed' ? 'text-decoration: line-through' : ''}">${task.title}</div>
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
            </div>
            <div class="task-desc">${task.description || 'No description'}</div>
            <div class="task-meta">
                <span>📅 ${new Date(task.dueDate).toLocaleDateString()}</span>
                <div class="task-actions">
                    <button class="btn btn-secondary btn-icon" onclick="toggleTaskStatus(${task.id})" title="${task.status === 'pending' ? 'Mark Complete' : 'Mark Pending'}">
                        ${task.status === 'pending' ? '✅' : '↩️'}
                    </button>
                    <button class="btn btn-secondary btn-icon" onclick="editTask(${task.id})" title="Edit">✏️</button>
                    <button class="btn btn-secondary btn-icon" onclick="deleteTask(${task.id})" title="Delete">🗑️</button>
                </div>
            </div>
        `;
        elements.taskList.appendChild(card);
    });
}

function openModal(task = null) {
    elements.modal.classList.remove('hidden');
    if (task) {
        elements.modalTitle.textContent = 'Edit Task';
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.description;
        document.getElementById('task-date').value = task.dueDate;
        document.getElementById('task-priority').value = task.priority;
    } else {
        elements.modalTitle.textContent = 'New Task';
        elements.taskForm.reset();
        document.getElementById('task-id').value = '';
        // Default date to today
        document.getElementById('task-date').value = new Date().toISOString().split('T')[0];
    }
}

function closeModal() {
    elements.modal.classList.add('hidden');
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    setTimeout(() => elements.toast.classList.add('hidden'), 3000);
}

// Global scope for HTML onclick handlers
window.editTask = (id) => {
    const task = state.tasks.find(t => t.id == id);
    openModal(task);
};
window.deleteTask = deleteTask;
window.toggleTaskStatus = toggleTaskStatus;

// --- Event Listeners ---

// Navigation
document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.dataset.view;
        if (viewId) switchView(viewId);
    });
});

document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    elements.loginView.classList.remove('active');
    elements.registerView.classList.add('active');
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    elements.registerView.classList.remove('active');
    elements.loginView.classList.add('active');
});

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    login(u, p);
});

document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('reg-username').value;
    const p = document.getElementById('reg-password').value;
    register(u, p);
});

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('add-task-btn').addEventListener('click', () => openModal());
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('cancel-task').addEventListener('click', closeModal);

elements.taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = {
        id: document.getElementById('task-id').value,
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-desc').value,
        dueDate: document.getElementById('task-date').value,
        priority: document.getElementById('task-priority').value
    };
    saveTask(task);
});

// Init
initAuth();
