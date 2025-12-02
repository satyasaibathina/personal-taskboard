// State Management
const state = {
    currentUser: null,
    tasks: [],
    projects: []
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
        loadData();
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
            loadData();
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
    state.projects = [];
    localStorage.removeItem('currentUser');
    showLogin();
}

// --- Data Management ---

async function loadData() {
    if (!state.currentUser) return;
    await Promise.all([loadTasks(), loadProjects()]);
    renderDashboard(); // Initial render
}

async function loadTasks() {
    try {
        const res = await fetch(`${API_URL}/tasks?userId=${state.currentUser.id}`);
        if (res.ok) state.tasks = await res.json();
    } catch (err) {
        console.error(err);
        showToast('Failed to load tasks');
    }
}

async function loadProjects() {
    try {
        const res = await fetch(`${API_URL}/projects?userId=${state.currentUser.id}`);
        if (res.ok) state.projects = await res.json();
    } catch (err) {
        console.error(err);
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
            await loadTasks();
            closeModal();
            showToast('Task saved successfully');
            refreshCurrentView();
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
            await loadTasks();
            showToast('Task deleted');
            refreshCurrentView();
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
        task.status = newStatus; // Optimistic
        refreshCurrentView();

        try {
            await fetch(`${API_URL}/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...task, status: newStatus })
            });
        } catch (err) {
            console.error(err);
            showToast('Failed to update status');
            await loadTasks();
            refreshCurrentView();
        }
    }
}

async function createProject(name, color) {
    try {
        const res = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color, userId: state.currentUser.id })
        });
        if (res.ok) {
            await loadProjects();
            renderProjectsView();
            showToast('Project created');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to create project');
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
    switchView('dashboard-view');
}

function switchView(viewId) {
    Object.values(elements.views).forEach(el => el.classList.add('hidden'));

    const targetView = elements.views[viewId];
    if (targetView) targetView.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) item.classList.add('active');
    });

    // Render specific view content
    if (viewId === 'dashboard-view') renderDashboard();
    if (viewId === 'today-view') renderTodayView();
    if (viewId === 'upcoming-view') renderUpcomingView();
    if (viewId === 'projects-view') renderProjectsView();
    if (viewId === 'calendar-view') renderCalendarView();
    if (viewId === 'settings-view') renderSettingsView();
}

function refreshCurrentView() {
    const activeView = document.querySelector('.nav-item.active').dataset.view;
    switchView(activeView);
}

// --- Renderers ---

function renderDashboard() {
    const pending = state.tasks.filter(t => t.status === 'pending').length;
    const completed = state.tasks.filter(t => t.status === 'completed').length;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = state.tasks.filter(t => t.dueDate === todayStr).length;

    elements.statPending.textContent = pending;
    elements.statCompleted.textContent = completed;
    elements.statToday.textContent = todayCount;
    elements.taskStats.textContent = `You have ${pending} pending task${pending !== 1 ? 's' : ''}`;

    elements.taskList.innerHTML = '';
    if (state.tasks.length === 0) {
        elements.taskList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No tasks found.</p>';
        return;
    }

    const sortedTasks = [...state.tasks].sort((a, b) => {
        if (a.status === b.status) return new Date(a.dueDate) - new Date(b.dueDate);
        return a.status === 'pending' ? -1 : 1;
    });

    sortedTasks.forEach(task => renderTaskCard(task, elements.taskList));
}

function renderTodayView() {
    const container = elements.views['today-view'];
    container.innerHTML = `
        <header class="view-header">
            <div><h2>Today's Tasks</h2><p>Focus on what matters today.</p></div>
            <button class="btn btn-primary" onclick="openModal()">+ New Task</button>
        </header>
        <div class="task-grid" id="today-task-list"></div>
    `;
    const list = document.getElementById('today-task-list');
    const todayStr = new Date().toISOString().split('T')[0];
    const tasks = state.tasks.filter(t => t.dueDate === todayStr);

    if (tasks.length === 0) list.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No tasks due today.</p>';
    else tasks.forEach(t => renderTaskCard(t, list));
}

function renderUpcomingView() {
    const container = elements.views['upcoming-view'];
    container.innerHTML = `
        <header class="view-header">
            <div><h2>Upcoming Tasks</h2><p>Plan ahead.</p></div>
            <button class="btn btn-primary" onclick="openModal()">+ New Task</button>
        </header>
        <div class="task-grid" id="upcoming-task-list"></div>
    `;
    const list = document.getElementById('upcoming-task-list');
    const todayStr = new Date().toISOString().split('T')[0];
    const tasks = state.tasks.filter(t => t.dueDate > todayStr).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    if (tasks.length === 0) list.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No upcoming tasks.</p>';
    else tasks.forEach(t => renderTaskCard(t, list));
}

function renderProjectsView() {
    const container = elements.views['projects-view'];
    container.innerHTML = `
        <header class="view-header">
            <div><h2>Projects</h2><p>Organize your work.</p></div>
            <button class="btn btn-primary" onclick="promptNewProject()">+ New Project</button>
        </header>
        <div class="stats-grid" id="project-list"></div>
        <div id="project-tasks-container" style="margin-top: 2rem;"></div>
    `;

    const list = document.getElementById('project-list');
    if (state.projects.length === 0) {
        list.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No projects yet.</p>';
        return;
    }

    state.projects.forEach(p => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `<h3>${p.name}</h3>`;
        card.onclick = () => renderProjectTasks(p.id);
        list.appendChild(card);
    });
}

function renderProjectTasks(projectId) {
    const container = document.getElementById('project-tasks-container');
    const project = state.projects.find(p => p.id === projectId);
    const tasks = state.tasks.filter(t => t.projectId === projectId);

    container.innerHTML = `
        <h3 class="section-title">${project.name} Tasks</h3>
        <div class="task-grid">
            ${tasks.length ? '' : '<p style="color: var(--text-muted);">No tasks in this project.</p>'}
        </div>
    `;

    const grid = container.querySelector('.task-grid');
    tasks.forEach(t => renderTaskCard(t, grid));
}

function renderCalendarView() {
    const container = elements.views['calendar-view'];
    // Simple list view grouped by date for now
    container.innerHTML = `
        <header class="view-header">
            <div><h2>Calendar</h2><p>Timeline view.</p></div>
            <button class="btn btn-primary" onclick="openModal()">+ New Task</button>
        </header>
        <div id="calendar-grid"></div>
    `;

    const grid = document.getElementById('calendar-grid');
    const tasksByDate = {};
    state.tasks.forEach(t => {
        if (!tasksByDate[t.dueDate]) tasksByDate[t.dueDate] = [];
        tasksByDate[t.dueDate].push(t);
    });

    const sortedDates = Object.keys(tasksByDate).sort();

    sortedDates.forEach(date => {
        const dateSection = document.createElement('div');
        dateSection.style.marginBottom = '2rem';
        dateSection.innerHTML = `<h3 style="margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">${new Date(date).toDateString()}</h3><div class="task-grid"></div>`;
        const taskGrid = dateSection.querySelector('.task-grid');
        tasksByDate[date].forEach(t => renderTaskCard(t, taskGrid));
        grid.appendChild(dateSection);
    });
}

function renderSettingsView() {
    elements.views['settings-view'].innerHTML = `
        <header class="view-header"><h2>Settings</h2></header>
        <div class="auth-card active" style="max-width: 600px;">
            <div class="form-group">
                <label>Theme</label>
                <select class="form-control" onchange="alert('Theme switching coming soon!')">
                    <option>Light</option>
                    <option>Dark</option>
                </select>
            </div>
            <p style="color: var(--text-muted);">More settings coming soon.</p>
        </div>
    `;
}

function renderTaskCard(task, container) {
    const card = document.createElement('div');
    card.className = 'task-card';
    if (task.status === 'completed') card.style.opacity = '0.6';

    const project = state.projects.find(p => p.id === task.projectId);
    const projectTag = project ? `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 12px; margin-left: 8px;">${project.name}</span>` : '';

    card.innerHTML = `
        <div class="task-header">
            <div class="task-title" style="${task.status === 'completed' ? 'text-decoration: line-through' : ''}">${task.title}</div>
            <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        </div>
        <div class="task-desc">${task.description || 'No description'}</div>
        <div class="task-meta">
            <span>📅 ${new Date(task.dueDate).toLocaleDateString()} ${projectTag}</span>
            <div class="task-actions">
                <button class="btn btn-secondary btn-icon" onclick="toggleTaskStatus(${task.id})">${task.status === 'pending' ? '✅' : '↩️'}</button>
                <button class="btn btn-secondary btn-icon" onclick="editTask(${task.id})">✏️</button>
                <button class="btn btn-secondary btn-icon" onclick="deleteTask(${task.id})">🗑️</button>
            </div>
        </div>
    `;
    container.appendChild(card);
}
// --- Helpers ---

function closeModal() { elements.modal.classList.add('hidden'); }

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    setTimeout(() => elements.toast.classList.add('hidden'), 3000);
}

function promptNewProject() {
    const name = prompt("Enter project name:");
    if (name) createProject(name, "#6366f1");
}

// --- Subtask & Recurrence Logic ---

const taskRecurring = document.getElementById('task-recurring');
if (taskRecurring) {
    taskRecurring.addEventListener('change', (e) => {
        const rule = document.getElementById('task-recurrence-rule');
        if (rule) rule.disabled = !e.target.checked;
    });
}

const addSubtaskBtn = document.getElementById('add-subtask-btn');
if (addSubtaskBtn) {
    addSubtaskBtn.addEventListener('click', async () => {
        const input = document.getElementById('new-subtask-input');
        const title = input.value.trim();
        const parentId = document.getElementById('task-id').value;

        if (title && parentId) {
            // Create subtask immediately
            await saveTask({
                title: title,
                parentId: parseInt(parentId),
                status: 'pending',
                priority: 'medium',
                dueDate: document.getElementById('task-date').value, // Inherit date?
                userId: state.currentUser.id
            });
            input.value = '';
            // Refresh subtask list
            renderSubtasksInModal(parentId);
        } else if (!parentId) {
            alert("Please save the main task first before adding subtasks.");
        }
    });
}

function renderSubtasksInModal(parentId) {
    const list = document.getElementById('subtask-list');
    if (!list) return;
    list.innerHTML = '';
    const subtasks = state.tasks.filter(t => t.parentId == parentId);

    subtasks.forEach(st => {
        const item = document.createElement('div');
        item.className = 'subtask-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        item.style.marginBottom = '5px';
        item.innerHTML = `
            <input type="checkbox" ${st.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus(${st.id})">
            <span style="${st.status === 'completed' ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${st.title}</span>
            <button onclick="deleteTask(${st.id})" style="margin-left: auto; background: none; border: none; cursor: pointer;">🗑️</button>
        `;
        list.appendChild(item);
    });
}

if (elements.taskForm) {
    elements.taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTask({
            id: document.getElementById('task-id').value,
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-desc').value,
            dueDate: document.getElementById('task-date').value,
            priority: document.getElementById('task-priority').value,
            projectId: document.getElementById('task-project').value ? parseInt(document.getElementById('task-project').value) : null,
            isRecurring: document.getElementById('task-recurring') ? document.getElementById('task-recurring').checked : false,
            recurrenceRule: document.getElementById('task-recurrence-rule') ? document.getElementById('task-recurrence-rule').value : null
        });
    });
}

function openModal(task = null) {
    elements.modal.classList.remove('hidden');

    // Populate Projects Dropdown
    const projectSelect = document.getElementById('task-project');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No Project</option>';
        state.projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            projectSelect.appendChild(option);
        });
    }

    if (task) {
        elements.modalTitle.textContent = 'Edit Task';
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.description;
        document.getElementById('task-date').value = task.dueDate;
        document.getElementById('task-priority').value = task.priority;
        if (document.getElementById('task-project')) document.getElementById('task-project').value = task.projectId || '';

        // Recurrence
        if (document.getElementById('task-recurring')) {
            document.getElementById('task-recurring').checked = task.isRecurring || false;
            document.getElementById('task-recurrence-rule').value = task.recurrenceRule || 'daily';
            document.getElementById('task-recurrence-rule').disabled = !task.isRecurring;
        }

        // Subtasks
        if (document.getElementById('subtasks-section')) {
            document.getElementById('subtasks-section').classList.remove('hidden');
            renderSubtasksInModal(task.id);
        }
    } else {
        elements.modalTitle.textContent = 'New Task';
        elements.taskForm.reset();
        document.getElementById('task-id').value = '';
        document.getElementById('task-date').value = new Date().toISOString().split('T')[0];
        if (document.getElementById('subtasks-section')) document.getElementById('subtasks-section').classList.add('hidden');
        if (document.getElementById('task-recurrence-rule')) document.getElementById('task-recurrence-rule').disabled = true;
    }
}

// Global scope
window.editTask = (id) => openModal(state.tasks.find(t => t.id == id));
window.deleteTask = deleteTask;
window.toggleTaskStatus = toggleTaskStatus;
window.promptNewProject = promptNewProject;
window.openModal = openModal;

// Event Listeners
document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.dataset.view;
        if (viewId) switchView(viewId);
    });
});

const showRegisterBtn = document.getElementById('show-register');
if (showRegisterBtn) showRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); elements.loginView.classList.remove('active'); elements.registerView.classList.add('active'); });

const showLoginBtn = document.getElementById('show-login');
if (showLoginBtn) showLoginBtn.addEventListener('click', (e) => { e.preventDefault(); elements.registerView.classList.remove('active'); elements.loginView.classList.add('active'); });

const loginForm = document.getElementById('login-form');
if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); login(document.getElementById('login-username').value, document.getElementById('login-password').value); });

const registerForm = document.getElementById('register-form');
if (registerForm) registerForm.addEventListener('submit', (e) => { e.preventDefault(); register(document.getElementById('reg-username').value, document.getElementById('reg-password').value); });

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

const addTaskBtn = document.getElementById('add-task-btn');
if (addTaskBtn) addTaskBtn.addEventListener('click', () => openModal());

const closeModalBtn = document.getElementById('close-modal');
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

const cancelTaskBtn = document.getElementById('cancel-task');
if (cancelTaskBtn) cancelTaskBtn.addEventListener('click', closeModal);

initAuth();


