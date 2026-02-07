// Check URL parameters for mode
const urlParams = new URLSearchParams(window.location.search);
const isDemo = urlParams.get('demo') === 'true';
const isNew = urlParams.get('new') === 'true';

// Board collection name based on mode
const boardCollectionName = isDemo ? 'demo-boards' : (isNew ? 'user-boards' : 'boards');

// Data structure
let boards = {
    ideas: [],
    progress: [],
    done: [],
    archived: []
};

let boardConfig = {
    name: isDemo ? "🚀 Unblocked Demo Board" : (isNew ? "My Project Board" : "🦊 MJ's Project Board")
};

// ============================================
// DYNAMIC PROJECT SYSTEM
// ============================================

// Default projects (used for new boards or migration)
const DEFAULT_PROJECTS = [
    { id: 'project-1', name: 'Project 1', emoji: '📊', color: '#667eea', order: 0, archived: false },
    { id: 'project-2', name: 'Project 2', emoji: '🌍', color: '#ed8936', order: 1, archived: false },
    { id: 'project-3', name: 'Project 3', emoji: '📸', color: '#9f7aea', order: 2, archived: false },
    { id: 'project-4', name: 'Project 4', emoji: '🚀', color: '#48bb78', order: 3, archived: false },
    { id: 'project-5', name: 'Project 5', emoji: '💡', color: '#a0aec0', order: 4, archived: false }
];

// Curated emoji set for the picker
const EMOJI_OPTIONS = [
    '📊', '🌍', '📸', '🚀', '💡', '📁', '🎯', '💰',
    '🏠', '✈️', '🎨', '📱', '🖥️', '🎬', '📝', '🔬',
    '🛒', '📈', '🎓', '🏋️', '🍳', '🎵', '📧', '🤖',
    '⚡', '🔧', '🌱', '🎮', '📦', '🔒', '❤️', '⭐'
];

let boardProjects = []; // Dynamic projects array

let currentCard = null;
let editingCard = null;
let activeFilter = '';
let searchQuery = '';
let selectedLabels = [];
let isFirebaseReady = false;
let selectedEmoji = '📁'; // For the add-project emoji picker

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.firebaseDB) {
                isFirebaseReady = true;
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Set title immediately from boardConfig (no flash of wrong title)
    updateBoardTitle();
    
    await waitForFirebase();
    
    // Show demo banner if in demo mode
    if (isDemo && document.getElementById('demoBanner')) {
        document.getElementById('demoBanner').style.display = 'block';
    }
    
    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').textContent = '☀️';
    }
    
    // Load data from Firestore
    if (isDemo) {
        loadFromFirestore();
    } else {
        await loadFromFirestore();
    }
    await loadBoardConfig();
    await loadProjects();
    
    populateProjectDropdowns();
    renderAllColumns();
    setupEventListeners();
    updateAllCounts();
    updateBoardTitle();
    
    // Setup real-time sync
    setupFirestoreSync();
    setupBoardConfigSync();
    setupProjectSync();
});

// ============================================
// PROJECT LOAD / SAVE / SYNC
// ============================================

async function loadProjects() {
    if (!isFirebaseReady) {
        boardProjects = [...DEFAULT_PROJECTS];
        return;
    }
    
    try {
        const db = window.firebaseDB;
        const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'projects');
        
        const snapshot = await new Promise((resolve) => {
            window.firebaseOnSnapshot(configRef, resolve, { includeMetadataChanges: false });
        });
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            boardProjects = data.list || [];
            // Ensure all projects have required fields
            boardProjects = boardProjects.map((p, i) => ({
                id: p.id,
                name: p.name || p.id,
                emoji: p.emoji || '📁',
                color: p.color || '#48bb78',
                order: p.order !== undefined ? p.order : i,
                archived: p.archived || false
            }));
            boardProjects.sort((a, b) => a.order - b.order);
        } else {
            // First time: migrate from hardcoded defaults
            boardProjects = [...DEFAULT_PROJECTS];
            await saveProjects();
        }
    } catch (err) {
        console.warn('Failed to load projects, using defaults:', err);
        boardProjects = [...DEFAULT_PROJECTS];
    }
}

async function saveProjects() {
    if (isDemo) {
        console.log('Demo mode: Project changes not saved');
        return;
    }
    
    if (!isFirebaseReady) return;
    
    try {
        const db = window.firebaseDB;
        const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'projects');
        
        // Ensure order is sequential before saving
        boardProjects.forEach((p, i) => p.order = i);
        
        await window.firebaseSetDoc(configRef, {
            list: boardProjects,
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('Failed to save projects:', err);
    }
}

function setupProjectSync() {
    if (!isFirebaseReady) return;
    
    const db = window.firebaseDB;
    const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'projects');
    
    window.firebaseOnSnapshot(configRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const incoming = (data.list || []).map((p, i) => ({
                id: p.id,
                name: p.name || p.id,
                emoji: p.emoji || '📁',
                color: p.color || '#48bb78',
                order: p.order !== undefined ? p.order : i,
                archived: p.archived || false
            }));
            incoming.sort((a, b) => a.order - b.order);
            
            if (JSON.stringify(boardProjects) !== JSON.stringify(incoming)) {
                boardProjects = incoming;
                populateProjectDropdowns();
                renderAllColumns();
                // Refresh project modal if open
                if (document.getElementById('projectModal').classList.contains('active')) {
                    renderProjectList();
                }
            }
        }
    });
}

// ============================================
// POPULATE DROPDOWNS DYNAMICALLY
// ============================================

function populateProjectDropdowns() {
    const filterSelect = document.getElementById('projectFilter');
    const cardSelect = document.getElementById('cardProject');
    
    // Save current selections
    const currentFilterVal = filterSelect.value;
    const currentCardVal = cardSelect ? cardSelect.value : '';
    
    // Clear all options except "All Projects" / "None"
    filterSelect.innerHTML = '<option value="">All Projects</option>';
    cardSelect.innerHTML = '<option value="">None</option>';
    
    // Add active (non-archived) projects
    const activeProjects = boardProjects.filter(p => !p.archived);
    
    activeProjects.forEach(project => {
        // Filter dropdown
        const filterOpt = document.createElement('option');
        filterOpt.value = project.id;
        filterOpt.textContent = `${project.emoji} ${project.name}`;
        filterSelect.appendChild(filterOpt);
        
        // Card modal dropdown
        const cardOpt = document.createElement('option');
        cardOpt.value = project.id;
        cardOpt.textContent = `${project.emoji} ${project.name}`;
        cardSelect.appendChild(cardOpt);
    });
    
    // Restore selections
    filterSelect.value = currentFilterVal;
    if (cardSelect) cardSelect.value = currentCardVal;
}

// ============================================
// PROJECT LOOKUP HELPER
// ============================================

function getProject(projectId) {
    if (!projectId) return null;
    return boardProjects.find(p => p.id === projectId) || null;
}

function getProjectLabel(projectId) {
    const proj = getProject(projectId);
    if (proj) return `${proj.emoji} ${proj.name}`;
    // Fallback for cards with project ids that no longer exist
    return projectId;
}

function getProjectColor(projectId) {
    const proj = getProject(projectId);
    return proj ? proj.color : null;
}

function getCardCountForProject(projectId) {
    let count = 0;
    for (const col of ['ideas', 'progress', 'done']) {
        count += boards[col].filter(c => c.project === projectId).length;
    }
    return count;
}

// ============================================
// PROJECT MANAGEMENT MODAL
// ============================================

function openProjectModal() {
    const modal = document.getElementById('projectModal');
    renderProjectList();
    updateProjectCountInfo();
    modal.classList.add('active');
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    modal.classList.remove('active');
    // Close emoji picker if open
    document.getElementById('emojiPicker').style.display = 'none';
}

function updateProjectCountInfo() {
    const total = boardProjects.length;
    const active = boardProjects.filter(p => !p.archived).length;
    const el = document.getElementById('projectCountInfo');
    el.textContent = `${active} active project${active !== 1 ? 's' : ''}${total !== active ? ` (${total - active} archived)` : ''}`;
}

function renderProjectList() {
    const listEl = document.getElementById('projectList');
    listEl.innerHTML = '';
    
    if (boardProjects.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No projects yet. Add one below!</p>';
        return;
    }
    
    // Render active projects first, then archived
    const sorted = [...boardProjects].sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        return a.order - b.order;
    });
    
    sorted.forEach(project => {
        const item = createProjectItemElement(project);
        listEl.appendChild(item);
    });
    
    updateProjectCountInfo();
}

function createProjectItemElement(project) {
    const div = document.createElement('div');
    div.className = `project-item${project.archived ? ' archived-project' : ''}`;
    div.dataset.projectId = project.id;
    div.draggable = !project.archived;
    
    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'project-drag-handle';
    handle.textContent = '⋮⋮';
    div.appendChild(handle);
    
    // Color dot
    const colorDot = document.createElement('span');
    colorDot.className = 'project-color-dot';
    colorDot.style.backgroundColor = project.color;
    div.appendChild(colorDot);
    
    // Emoji
    const emoji = document.createElement('span');
    emoji.className = 'project-emoji';
    emoji.textContent = project.emoji;
    div.appendChild(emoji);
    
    // Name
    const name = document.createElement('span');
    name.className = 'project-item-name';
    name.textContent = project.name;
    div.appendChild(name);
    
    // Card count
    const count = getCardCountForProject(project.id);
    const countBadge = document.createElement('span');
    countBadge.className = 'project-card-count';
    countBadge.textContent = `${count} card${count !== 1 ? 's' : ''}`;
    div.appendChild(countBadge);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'project-item-actions';
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'project-action-btn';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit project';
    editBtn.onclick = (e) => { e.stopPropagation(); startEditProject(project.id); };
    actions.appendChild(editBtn);
    
    // Archive/Unarchive button
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'project-action-btn';
    archiveBtn.textContent = project.archived ? '📤' : '📥';
    archiveBtn.title = project.archived ? 'Restore project' : 'Archive project';
    archiveBtn.onclick = (e) => { e.stopPropagation(); toggleArchiveProject(project.id); };
    actions.appendChild(archiveBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'project-action-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete project';
    deleteBtn.onclick = (e) => { e.stopPropagation(); deleteProject(project.id); };
    actions.appendChild(deleteBtn);
    
    div.appendChild(actions);
    
    // Drag events for reordering
    if (!project.archived) {
        div.addEventListener('dragstart', (e) => {
            div.classList.add('dragging-project');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', project.id);
        });
        
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging-project');
            document.querySelectorAll('.project-item').forEach(el => el.classList.remove('drag-over-project'));
        });
        
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = document.querySelector('.dragging-project');
            if (dragging && dragging !== div) {
                div.classList.add('drag-over-project');
            }
        });
        
        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over-project');
        });
        
        div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('drag-over-project');
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = project.id;
            if (draggedId !== targetId) {
                reorderProject(draggedId, targetId);
            }
        });
    }
    
    return div;
}

// ============================================
// PROJECT CRUD OPERATIONS
// ============================================

function addProject() {
    const nameInput = document.getElementById('newProjectName');
    const colorInput = document.getElementById('newProjectColor');
    const name = nameInput.value.trim();
    
    if (!name) {
        nameInput.focus();
        return;
    }
    
    // Generate a slug-style ID
    const id = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Date.now().toString(36);
    
    const newProject = {
        id,
        name,
        emoji: selectedEmoji,
        color: colorInput.value,
        order: boardProjects.filter(p => !p.archived).length,
        archived: false
    };
    
    boardProjects.push(newProject);
    saveProjects();
    populateProjectDropdowns();
    renderProjectList();
    renderAllColumns();
    
    // Reset inputs
    nameInput.value = '';
    selectedEmoji = '📁';
    document.getElementById('projectEmojiBtn').textContent = '📁';
    document.getElementById('emojiPicker').style.display = 'none';
    nameInput.focus();
}

function startEditProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;
    
    const itemEl = document.querySelector(`.project-item[data-project-id="${projectId}"]`);
    if (!itemEl) return;
    
    // Replace name span with input
    const nameEl = itemEl.querySelector('.project-item-name');
    const emojiEl = itemEl.querySelector('.project-emoji');
    const colorDot = itemEl.querySelector('.project-color-dot');
    
    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'project-edit-input';
    nameInput.value = project.name;
    nameInput.maxLength = 40;
    nameEl.replaceWith(nameInput);
    
    // Color picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'project-color-edit';
    colorPicker.value = project.color;
    colorDot.replaceWith(colorPicker);
    
    // Make emoji clickable to change
    let currentEditEmoji = project.emoji;
    emojiEl.style.cursor = 'pointer';
    emojiEl.title = 'Click to change emoji';
    emojiEl.onclick = () => {
        // Simple prompt for emoji change during edit
        const newEmoji = prompt('Enter an emoji:', currentEditEmoji);
        if (newEmoji && newEmoji.trim()) {
            currentEditEmoji = newEmoji.trim().substring(0, 2);
            emojiEl.textContent = currentEditEmoji;
        }
    };
    
    // Replace action buttons with Save/Cancel
    const actionsEl = itemEl.querySelector('.project-item-actions');
    actionsEl.innerHTML = '';
    actionsEl.style.opacity = '1';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'project-action-btn';
    saveBtn.textContent = '✅';
    saveBtn.title = 'Save';
    saveBtn.onclick = (e) => {
        e.stopPropagation();
        const newName = nameInput.value.trim();
        if (newName) {
            project.name = newName;
            project.color = colorPicker.value;
            project.emoji = currentEditEmoji;
            saveProjects();
            populateProjectDropdowns();
            renderProjectList();
            renderAllColumns();
        }
    };
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'project-action-btn';
    cancelBtn.textContent = '❌';
    cancelBtn.title = 'Cancel';
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        renderProjectList();
    };
    
    actionsEl.appendChild(saveBtn);
    actionsEl.appendChild(cancelBtn);
    
    nameInput.focus();
    nameInput.select();
    
    // Enter to save, Escape to cancel
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
    });
}

function toggleArchiveProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;
    
    if (!project.archived) {
        const count = getCardCountForProject(projectId);
        const msg = count > 0
            ? `Archive "${project.name}"? It has ${count} card(s). Cards will keep this project tag but it won't appear in dropdowns.`
            : `Archive "${project.name}"?`;
        if (!confirm(msg)) return;
    }
    
    project.archived = !project.archived;
    saveProjects();
    populateProjectDropdowns();
    renderProjectList();
    
    // If currently filtering by this project, reset filter
    if (activeFilter === projectId && project.archived) {
        activeFilter = '';
        document.getElementById('projectFilter').value = '';
        renderAllColumns();
        updateAllCounts();
    }
}

function deleteProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;
    
    const count = getCardCountForProject(projectId);
    let msg = `Permanently delete "${project.name}"?`;
    if (count > 0) {
        msg += `\n\n⚠️ ${count} card(s) use this project. They'll lose their project tag.`;
    }
    
    if (!confirm(msg)) return;
    
    // Remove project tag from all cards
    if (count > 0) {
        for (const col of ['ideas', 'progress', 'done', 'archived']) {
            boards[col].forEach(card => {
                if (card.project === projectId) {
                    card.project = '';
                }
            });
        }
        saveToFirestore();
    }
    
    boardProjects = boardProjects.filter(p => p.id !== projectId);
    saveProjects();
    populateProjectDropdowns();
    renderProjectList();
    renderAllColumns();
    updateAllCounts();
    
    // Reset filter if needed
    if (activeFilter === projectId) {
        activeFilter = '';
        document.getElementById('projectFilter').value = '';
    }
}

function reorderProject(draggedId, targetId) {
    const activeProjects = boardProjects.filter(p => !p.archived);
    const draggedIdx = activeProjects.findIndex(p => p.id === draggedId);
    const targetIdx = activeProjects.findIndex(p => p.id === targetId);
    
    if (draggedIdx === -1 || targetIdx === -1) return;
    
    // Remove dragged from active list
    const [dragged] = activeProjects.splice(draggedIdx, 1);
    // Insert at target position
    activeProjects.splice(targetIdx, 0, dragged);
    
    // Update order values
    activeProjects.forEach((p, i) => p.order = i);
    
    // Rebuild full list: active (reordered) + archived
    const archivedProjects = boardProjects.filter(p => p.archived);
    boardProjects = [...activeProjects, ...archivedProjects];
    
    saveProjects();
    populateProjectDropdowns();
    renderProjectList();
}

// ============================================
// EMOJI PICKER
// ============================================

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    
    if (picker.style.display === 'none' || !picker.style.display) {
        // Build picker grid
        picker.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'emoji-picker-grid';
        
        EMOJI_OPTIONS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `emoji-option${emoji === selectedEmoji ? ' selected' : ''}`;
            btn.textContent = emoji;
            btn.onclick = () => {
                selectedEmoji = emoji;
                document.getElementById('projectEmojiBtn').textContent = emoji;
                // Update selected state
                grid.querySelectorAll('.emoji-option').forEach(el => el.classList.remove('selected'));
                btn.classList.add('selected');
                picker.style.display = 'none';
            };
            grid.appendChild(btn);
        });
        
        picker.appendChild(grid);
        picker.style.display = 'block';
    } else {
        picker.style.display = 'none';
    }
}

// ============================================
// FIRESTORE FUNCTIONS (existing, preserved)
// ============================================

async function loadFromFirestore() {
    if (isDemo) {
        try {
            const response = await fetch('demo-data.json');
            const demoData = await response.json();
            boards = demoData;
            console.log('Demo data loaded successfully');
            return;
        } catch (err) {
            console.error('Failed to load demo data:', err);
        }
    }
    
    if (!isFirebaseReady) return;
    
    try {
        const db = window.firebaseDB;
        const boardsRef = window.firebaseCollection(db, boardCollectionName);
        
        for (const column of ['ideas', 'progress', 'done', 'archived']) {
            const colRef = window.firebaseDoc(boardsRef, column);
            
            const snapshot = await new Promise((resolve) => {
                window.firebaseOnSnapshot(colRef, resolve, { includeMetadataChanges: false });
            });
            
            if (snapshot.exists()) {
                const data = snapshot.data();
                boards[column] = data.cards || [];
            }
        }
    } catch (err) {
        console.warn('Firestore load failed, using localStorage fallback:', err);
        loadFromLocalStorage();
    }
}

function setupFirestoreSync() {
    if (!isFirebaseReady) return;
    
    const db = window.firebaseDB;
    const boardsRef = window.firebaseCollection(db, boardCollectionName);
    
    for (const column of ['ideas', 'progress', 'done', 'archived']) {
        const colRef = window.firebaseDoc(boardsRef, column);
        
        window.firebaseOnSnapshot(colRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const newCards = data.cards || [];
                
                if (JSON.stringify(boards[column]) !== JSON.stringify(newCards)) {
                    boards[column] = newCards;
                    if (column !== 'archived') {
                        renderColumn(column);
                        updateCount(column);
                    }
                }
            }
        });
    }
}

async function saveToFirestore() {
    if (isDemo) {
        console.log('Demo mode: Changes not saved to Firebase');
        saveToLocalStorage();
        return;
    }
    
    if (!isFirebaseReady) {
        console.warn('Firebase not ready, saving to localStorage');
        saveToLocalStorage();
        return;
    }
    
    try {
        const db = window.firebaseDB;
        const boardsRef = window.firebaseCollection(db, boardCollectionName);
        
        for (const column of ['ideas', 'progress', 'done', 'archived']) {
            const colRef = window.firebaseDoc(boardsRef, column);
            await window.firebaseSetDoc(colRef, {
                cards: boards[column],
                updatedAt: new Date().toISOString()
            });
        }
        
        saveToLocalStorage();
    } catch (err) {
        console.error('Firestore save failed:', err);
        saveToLocalStorage();
    }
}

// Board Config Functions
async function loadBoardConfig() {
    if (!isFirebaseReady) return;
    
    try {
        const db = window.firebaseDB;
        const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'config');
        
        const snapshot = await new Promise((resolve) => {
            window.firebaseOnSnapshot(configRef, resolve, { includeMetadataChanges: false });
        });
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            boardConfig.name = data.name || "🦊 MJ's Project Board";
        }
    } catch (err) {
        console.warn('Failed to load board config:', err);
    }
}

async function saveBoardConfig() {
    if (!isFirebaseReady) return;
    
    try {
        const db = window.firebaseDB;
        const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'config');
        
        await window.firebaseSetDoc(configRef, {
            name: boardConfig.name,
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('Failed to save board config:', err);
    }
}

function setupBoardConfigSync() {
    if (!isFirebaseReady) return;
    
    const db = window.firebaseDB;
    const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'config');
    
    window.firebaseOnSnapshot(configRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.name && data.name !== boardConfig.name) {
                boardConfig.name = data.name;
                updateBoardTitle();
            }
        }
    });
}

function updateBoardTitle() {
    document.getElementById('boardTitle').textContent = boardConfig.name;
    document.title = boardConfig.name;
}

function editBoardTitle() {
    const newName = prompt('Enter new board name:', boardConfig.name);
    if (newName && newName.trim()) {
        boardConfig.name = newName.trim();
        updateBoardTitle();
        saveBoardConfig();
    }
}

// LocalStorage fallback
function saveToLocalStorage() {
    localStorage.setItem('kanbanData', JSON.stringify(boards));
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('kanbanData');
    if (stored) {
        try {
            const loaded = JSON.parse(stored);
            boards = { ...boards, ...loaded };
        } catch (err) {
            console.error('Failed to load from localStorage:', err);
        }
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Add card buttons
    document.querySelectorAll('.add-card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const column = e.target.dataset.column;
            openModal(column);
        });
    });

    // Modal controls
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelCard').addEventListener('click', closeModal);
    document.getElementById('saveCard').addEventListener('click', saveCard);
    document.getElementById('deleteCard').addEventListener('click', deleteCard);
    document.getElementById('archiveCard').addEventListener('click', archiveCard);

    // Archive modal
    document.getElementById('showArchiveBtn').addEventListener('click', showArchiveModal);
    document.getElementById('closeArchive').addEventListener('click', closeArchiveModal);
    document.getElementById('closeArchiveBtn').addEventListener('click', closeArchiveModal);

    // Project management modal
    document.getElementById('manageProjectsBtn').addEventListener('click', openProjectModal);
    document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
    document.getElementById('closeProjectModalBtn').addEventListener('click', closeProjectModal);
    document.getElementById('addProjectBtn').addEventListener('click', addProject);
    document.getElementById('projectEmojiBtn').addEventListener('click', toggleEmojiPicker);
    
    // Enter key to add project
    document.getElementById('newProjectName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addProject();
    });

    // Click outside modals to close
    document.getElementById('cardModal').addEventListener('click', (e) => {
        if (e.target.id === 'cardModal') closeModal();
    });
    
    document.getElementById('archiveModal').addEventListener('click', (e) => {
        if (e.target.id === 'archiveModal') closeArchiveModal();
    });
    
    document.getElementById('projectModal').addEventListener('click', (e) => {
        if (e.target.id === 'projectModal') closeProjectModal();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderAllColumns();
        updateAllCounts();
    });

    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

    // Board title edit
    document.getElementById('editBoardTitleBtn').addEventListener('click', editBoardTitle);

    // Project filter
    document.getElementById('projectFilter').addEventListener('change', (e) => {
        activeFilter = e.target.value;
        renderAllColumns();
        updateAllCounts();
    });

    // Label buttons in modal
    document.querySelectorAll('.label-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const label = e.target.dataset.label;
            if (selectedLabels.includes(label)) {
                selectedLabels = selectedLabels.filter(l => l !== label);
                e.target.classList.remove('active');
            } else {
                selectedLabels.push(label);
                e.target.classList.add('active');
            }
        });
    });

    // Export/Import
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importData);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeArchiveModal();
            closeProjectModal();
        }
    });
}

// ============================================
// CARD MODAL FUNCTIONS
// ============================================

function openModal(column, card = null) {
    const modal = document.getElementById('cardModal');
    const title = document.getElementById('modalTitle');
    const cardTitle = document.getElementById('cardTitle');
    const cardDescription = document.getElementById('cardDescription');
    const cardProject = document.getElementById('cardProject');
    const cardPriority = document.getElementById('cardPriority');
    const cardEffort = document.getElementById('cardEffort');
    const cardDueDate = document.getElementById('cardDueDate');
    const deleteBtn = document.getElementById('deleteCard');
    const archiveBtn = document.getElementById('archiveCard');

    currentCard = column;
    editingCard = card;
    selectedLabels = card ? (card.labels || []) : [];

    // Refresh project dropdown in case projects changed
    populateProjectDropdowns();

    // Update label buttons
    document.querySelectorAll('.label-btn').forEach(btn => {
        if (selectedLabels.includes(btn.dataset.label)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (card) {
        title.textContent = 'Edit Card';
        cardTitle.value = card.title;
        cardDescription.value = card.description || '';
        cardProject.value = card.project || '';
        cardPriority.value = card.priority || '';
        cardEffort.value = card.effort || '';
        cardDueDate.value = card.dueDate || '';
        deleteBtn.style.display = 'block';
        archiveBtn.style.display = 'block';
    } else {
        title.textContent = 'New Card';
        cardTitle.value = '';
        cardDescription.value = '';
        cardProject.value = '';
        cardPriority.value = '';
        cardEffort.value = '';
        cardDueDate.value = '';
        deleteBtn.style.display = 'none';
        archiveBtn.style.display = 'none';
    }

    modal.classList.add('active');
    cardTitle.focus();
}

function closeModal() {
    const modal = document.getElementById('cardModal');
    modal.classList.remove('active');
    currentCard = null;
    editingCard = null;
    selectedLabels = [];
}

function saveCard() {
    const title = document.getElementById('cardTitle').value.trim();
    const description = document.getElementById('cardDescription').value.trim();
    const project = document.getElementById('cardProject').value;
    const priority = document.getElementById('cardPriority').value;
    const effort = document.getElementById('cardEffort').value;
    const dueDate = document.getElementById('cardDueDate').value;

    if (!title) {
        alert('Please enter a card title');
        return;
    }

    if (editingCard) {
        editingCard.title = title;
        editingCard.description = description;
        editingCard.project = project;
        editingCard.priority = priority;
        editingCard.effort = effort;
        editingCard.dueDate = dueDate;
        editingCard.labels = [...selectedLabels];
    } else {
        const newCard = {
            id: Date.now().toString(),
            title,
            description,
            project,
            priority,
            effort,
            dueDate,
            labels: [...selectedLabels],
            createdAt: new Date().toISOString(),
            movedToColumnAt: new Date().toISOString()
        };
        boards[currentCard].push(newCard);
    }

    saveToFirestore();
    renderColumn(currentCard);
    updateCount(currentCard);
    closeModal();
}

function deleteCard() {
    if (!confirm('Delete this card permanently?')) return;

    const column = Object.keys(boards).find(col => 
        boards[col].some(card => card === editingCard)
    );

    if (column) {
        boards[column] = boards[column].filter(card => card !== editingCard);
        saveToFirestore();
        renderColumn(column);
        updateCount(column);
        closeModal();
    }
}

function archiveCard() {
    if (!confirm('Archive this card?')) return;

    const column = Object.keys(boards).find(col => 
        boards[col].some(card => card === editingCard)
    );

    if (column && column !== 'archived') {
        boards[column] = boards[column].filter(card => card !== editingCard);
        editingCard.archivedAt = new Date().toISOString();
        boards.archived.push(editingCard);
        
        saveToFirestore();
        renderColumn(column);
        updateCount(column);
        closeModal();
    }
}

// ============================================
// ARCHIVE MODAL
// ============================================

function showArchiveModal() {
    const modal = document.getElementById('archiveModal');
    const listEl = document.getElementById('archiveList');
    
    listEl.innerHTML = '';
    
    if (boards.archived.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No archived cards</p>';
    } else {
        boards.archived.forEach(card => {
            const cardEl = createArchiveCardElement(card);
            listEl.appendChild(cardEl);
        });
    }
    
    modal.classList.add('active');
}

function closeArchiveModal() {
    const modal = document.getElementById('archiveModal');
    modal.classList.remove('active');
}

function createArchiveCardElement(card) {
    const div = document.createElement('div');
    div.className = 'archive-card';
    
    const title = document.createElement('div');
    title.className = 'archive-card-title';
    title.textContent = card.title;
    div.appendChild(title);
    
    const actions = document.createElement('div');
    actions.className = 'archive-card-actions';
    
    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = '↩️ Restore';
    restoreBtn.className = 'btn-secondary btn-small';
    restoreBtn.onclick = () => restoreCard(card);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️ Delete';
    deleteBtn.className = 'btn-danger btn-small';
    deleteBtn.onclick = () => deleteArchivedCard(card);
    
    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);
    div.appendChild(actions);
    
    return div;
}

function restoreCard(card) {
    if (!confirm('Restore this card to Ideas?')) return;
    
    boards.archived = boards.archived.filter(c => c !== card);
    delete card.archivedAt;
    card.movedToColumnAt = new Date().toISOString();
    boards.ideas.push(card);
    
    saveToFirestore();
    renderColumn('ideas');
    updateCount('ideas');
    showArchiveModal();
}

function deleteArchivedCard(card) {
    if (!confirm('Permanently delete this card?')) return;
    
    boards.archived = boards.archived.filter(c => c !== card);
    saveToFirestore();
    showArchiveModal();
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderAllColumns() {
    Object.keys(boards).filter(k => k !== 'archived').forEach(column => renderColumn(column));
}

function renderColumn(column) {
    const container = document.getElementById(`${column}-cards`);
    container.innerHTML = '';

    let filteredCards = boards[column];
    
    if (activeFilter) {
        filteredCards = filteredCards.filter(card => card.project === activeFilter);
    }
    
    if (searchQuery) {
        filteredCards = filteredCards.filter(card => 
            card.title.toLowerCase().includes(searchQuery) ||
            (card.description && card.description.toLowerCase().includes(searchQuery))
        );
    }

    filteredCards.forEach(card => {
        const cardEl = createCardElement(card, column);
        container.appendChild(cardEl);
    });

    setupDragAndDrop(container, column);
}

function createCardElement(card, column) {
    const div = document.createElement('div');
    div.className = 'card';
    div.draggable = true;
    div.dataset.id = card.id;

    // Apply project color stripe
    const projColor = getProjectColor(card.project);
    if (projColor) {
        div.setAttribute('data-project-color', 'true');
        div.style.setProperty('--card-project-color', projColor);
        div.style.paddingLeft = '1.25rem'; // Extra padding for the stripe
    }

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = card.title;
    div.appendChild(title);

    if (card.description) {
        const desc = document.createElement('div');
        desc.className = 'card-description';
        desc.textContent = card.description;
        div.appendChild(desc);
    }

    // Card badges
    const badges = document.createElement('div');
    badges.className = 'card-badges';
    
    // Labels
    if (card.labels && card.labels.length > 0) {
        card.labels.forEach(label => {
            const labelBadge = document.createElement('span');
            labelBadge.className = `badge badge-label label-${label}`;
            const labelIcons = {
                urgent: '🔥',
                research: '📚',
                blocked: '🚧',
                review: '👀',
                bug: '🐛'
            };
            labelBadge.textContent = labelIcons[label] || label;
            badges.appendChild(labelBadge);
        });
    }
    
    // Due date
    if (card.dueDate) {
        const dueBadge = document.createElement('span');
        dueBadge.className = 'badge badge-due';
        const dueDate = new Date(card.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            dueBadge.classList.add('overdue');
            dueBadge.textContent = `⚠️ Overdue`;
        } else if (diffDays === 0) {
            dueBadge.classList.add('due-today');
            dueBadge.textContent = `📅 Today`;
        } else if (diffDays <= 3) {
            dueBadge.classList.add('due-soon');
            dueBadge.textContent = `📅 ${diffDays}d`;
        } else {
            dueBadge.textContent = `📅 ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
        badges.appendChild(dueBadge);
    }
    
    // Project badge (dynamic lookup)
    if (card.project) {
        const projectBadge = document.createElement('span');
        projectBadge.className = 'badge badge-project';
        const proj = getProject(card.project);
        if (proj) {
            projectBadge.textContent = `${proj.emoji} ${proj.name}`;
            // Use project color for the badge
            projectBadge.style.background = proj.color + '1a'; // ~10% opacity
            projectBadge.style.color = proj.color;
        } else {
            projectBadge.textContent = card.project;
            projectBadge.style.background = 'rgba(72, 187, 120, 0.1)';
            projectBadge.style.color = '#48bb78';
        }
        badges.appendChild(projectBadge);
    }
    
    // Priority badge
    if (card.priority) {
        const priorityBadge = document.createElement('span');
        priorityBadge.className = `badge badge-priority priority-${card.priority}`;
        const priorityIcons = { high: '🔴', medium: '🟡', low: '🟢' };
        priorityBadge.textContent = `${priorityIcons[card.priority]} ${card.priority.toUpperCase()}`;
        badges.appendChild(priorityBadge);
    }
    
    // Effort badge
    if (card.effort) {
        const effortBadge = document.createElement('span');
        effortBadge.className = 'badge badge-effort';
        effortBadge.textContent = card.effort;
        badges.appendChild(effortBadge);
    }
    
    // Time in column badge
    if (card.movedToColumnAt) {
        const daysInColumn = calculateDaysInColumn(card.movedToColumnAt);
        if (daysInColumn >= 0) {
            const timeBadge = document.createElement('span');
            timeBadge.className = 'badge badge-time';
            timeBadge.textContent = daysInColumn === 0 ? 'Today' : daysInColumn === 1 ? '1 day' : `${daysInColumn} days`;
            badges.appendChild(timeBadge);
        }
    }
    
    if (badges.children.length > 0) {
        div.appendChild(badges);
    }

    // Click to edit
    div.addEventListener('click', () => openModal(column, card));

    // Drag events
    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ cardId: card.id, fromColumn: column }));
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    return div;
}

function calculateDaysInColumn(movedAt) {
    const moved = new Date(movedAt);
    const now = new Date();
    const diffMs = now - moved;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
}

// ============================================
// DRAG AND DROP (cards between columns)
// ============================================

function setupDragAndDrop(container, column) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('dragleave', () => {
        container.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');

        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.cardId && data.fromColumn) {
                moveCard(data.cardId, data.fromColumn, column);
            }
        } catch (err) {
            // Might be a project reorder drag, ignore
        }
    });
}

function moveCard(cardId, fromColumn, toColumn) {
    if (fromColumn === toColumn) return;

    const cardIndex = boards[fromColumn].findIndex(card => card.id === cardId);
    if (cardIndex === -1) return;

    const [card] = boards[fromColumn].splice(cardIndex, 1);
    card.movedToColumnAt = new Date().toISOString();
    boards[toColumn].push(card);

    saveToFirestore();
    renderColumn(fromColumn);
    renderColumn(toColumn);
    updateCount(fromColumn);
    updateCount(toColumn);
}

// ============================================
// COUNTER UPDATES
// ============================================

function updateCount(column) {
    const columnEl = document.querySelector(`[data-column="${column}"]`);
    if (!columnEl) return;
    
    const countEl = columnEl.querySelector('.card-count');
    
    let cards = boards[column];
    if (activeFilter) {
        cards = cards.filter(card => card.project === activeFilter);
    }
    if (searchQuery) {
        cards = cards.filter(card => 
            card.title.toLowerCase().includes(searchQuery) ||
            (card.description && card.description.toLowerCase().includes(searchQuery))
        );
    }
    
    countEl.textContent = cards.length;
}

function updateAllCounts() {
    Object.keys(boards).filter(k => k !== 'archived').forEach(updateCount);
}

// ============================================
// DARK MODE
// ============================================

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    document.getElementById('darkModeToggle').textContent = isDark ? '☀️' : '🌙';
}

// ============================================
// EXPORT / IMPORT
// ============================================

function exportData() {
    const exportPayload = {
        boards,
        projects: boardProjects,
        config: boardConfig
    };
    const dataStr = JSON.stringify(exportPayload, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `kanban-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            if (confirm('This will replace your current board. Continue?')) {
                // Support both old format (just boards) and new format (boards + projects)
                if (imported.boards) {
                    boards = imported.boards;
                    if (imported.projects) {
                        boardProjects = imported.projects;
                        saveProjects();
                    }
                    if (imported.config) {
                        boardConfig = imported.config;
                        saveBoardConfig();
                    }
                } else {
                    // Legacy format: just the boards object
                    boards = imported;
                }
                
                saveToFirestore();
                populateProjectDropdowns();
                renderAllColumns();
                updateAllCounts();
                updateBoardTitle();
            }
        } catch (err) {
            alert('Failed to import: Invalid file format');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
    
    e.target.value = '';
}
