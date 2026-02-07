// Check URL parameters for mode
const urlParams = new URLSearchParams(window.location.search);
const isDemo = urlParams.get('demo') === 'true';
const isNew = urlParams.get('new') === 'true';

// Board collection name based on mode (fixed self-reference bug)
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

const DEFAULT_PROJECTS = [
    { id: 'project-1', name: 'Project 1', emoji: '📊', color: '#667eea', order: 0, archived: false },
    { id: 'project-2', name: 'Project 2', emoji: '🌍', color: '#ed8936', order: 1, archived: false },
    { id: 'project-3', name: 'Project 3', emoji: '📸', color: '#9f7aea', order: 2, archived: false },
    { id: 'project-4', name: 'Project 4', emoji: '🚀', color: '#48bb78', order: 3, archived: false },
    { id: 'project-5', name: 'Project 5', emoji: '💡', color: '#a0aec0', order: 4, archived: false }
];

// Old hardcoded project IDs that need migration
const OLD_PROJECT_IDS = ['earnings-digest', 'relocation-helper', 'photo-journey', 'unblocked', 'other'];

// Color palette for project swatches
const COLOR_PALETTE = [
    '#667eea', '#5a67d8', '#4c51bf',
    '#ed8936', '#dd6b20', '#e53e3e',
    '#48bb78', '#38a169', '#319795',
    '#9f7aea', '#805ad5', '#d53f8c',
    '#ecc94b', '#a0aec0', '#718096'
];

const EMOJI_OPTIONS = [
    '📊', '🌍', '📸', '🚀', '💡', '📁', '🎯', '💰',
    '🏠', '✈️', '🎨', '📱', '🖥️', '🎬', '📝', '🔬',
    '🛒', '📈', '🎓', '🏋️', '🍳', '🎵', '📧', '🤖',
    '⚡', '🔧', '🌱', '🎮', '📦', '🔒', '❤️', '⭐',
    '🧪', '🎪'
];

let boardProjects = [];
let currentCard = null;
let editingCard = null;
let activeFilter = '';
let searchQuery = '';
let selectedLabels = [];
let isFirebaseReady = false;
let selectedAddEmoji = '📁';
let selectedAddColor = COLOR_PALETTE[0];
let openContextMenuId = null;

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
    // Set title immediately (no flash of wrong title)
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

    // Close context menus on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.pr-context-menu') && !e.target.closest('.pr-menu-btn')) {
            closeAllContextMenus();
        }
        if (!e.target.closest('.emoji-popover') && !e.target.closest('.pm-emoji-btn') && !e.target.closest('.pe-emoji-btn')) {
            closeEmojiPopover();
        }
    });
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

            // Migration: detect old hardcoded projects and replace
            migrateOldProjects();
        } else {
            // First time: seed with defaults
            boardProjects = [...DEFAULT_PROJECTS];
            await saveProjects();
        }
    } catch (err) {
        console.warn('Failed to load projects, using defaults:', err);
        boardProjects = [...DEFAULT_PROJECTS];
    }
}

function migrateOldProjects() {
    // Check if all projects match old hardcoded IDs with no custom additions
    const currentIds = boardProjects.map(p => p.id);
    const isOldDefaults = OLD_PROJECT_IDS.every(id => currentIds.includes(id))
        && boardProjects.length === OLD_PROJECT_IDS.length;

    if (isOldDefaults) {
        const idMap = {};
        boardProjects = DEFAULT_PROJECTS.map((dp, i) => {
            const oldId = OLD_PROJECT_IDS[i];
            idMap[oldId] = dp.id;
            return { ...dp };
        });

        // Update card references across all columns
        let cardsUpdated = false;
        for (const column of ['ideas', 'progress', 'done', 'archived']) {
            boards[column].forEach(card => {
                if (card.project && idMap[card.project]) {
                    card.project = idMap[card.project];
                    cardsUpdated = true;
                }
            });
        }

        // Save everything
        saveProjects();
        if (cardsUpdated) {
            saveToFirestore();
        }
        console.log('Migrated old hardcoded projects to generic defaults');
    }
}

async function saveProjects() {
    if (!isFirebaseReady) return;

    try {
        const db = window.firebaseDB;
        const configRef = window.firebaseDoc(window.firebaseCollection(db, boardCollectionName), 'projects');

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
            const newList = data.list || [];

            if (JSON.stringify(boardProjects) !== JSON.stringify(newList)) {
                boardProjects = newList.map((p, i) => ({
                    id: p.id,
                    name: p.name || p.id,
                    emoji: p.emoji || '📁',
                    color: p.color || '#48bb78',
                    order: p.order !== undefined ? p.order : i,
                    archived: p.archived || false
                }));
                boardProjects.sort((a, b) => a.order - b.order);
                populateProjectDropdowns();
                renderAllColumns();
                // Refresh modal if open
                if (document.getElementById('projectModal').classList.contains('active')) {
                    renderProjectList();
                }
            }
        }
    });
}

// ============================================
// PROJECT HELPERS
// ============================================

function getProject(id) {
    return boardProjects.find(p => p.id === id) || null;
}

function getProjectColor(id) {
    const p = getProject(id);
    return p ? p.color : null;
}

function getCardCountForProject(projectId) {
    let count = 0;
    for (const column of ['ideas', 'progress', 'done']) {
        count += boards[column].filter(c => c.project === projectId).length;
    }
    return count;
}

function populateProjectDropdowns() {
    const activeProjects = boardProjects.filter(p => !p.archived);

    // Header filter dropdown
    const filterSelect = document.getElementById('projectFilter');
    const currentFilter = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Projects</option>';
    activeProjects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.emoji} ${p.name}`;
        filterSelect.appendChild(opt);
    });
    filterSelect.value = currentFilter;

    // Card modal project dropdown
    const cardProject = document.getElementById('cardProject');
    const currentProject = cardProject.value;
    cardProject.innerHTML = '<option value="">None</option>';
    activeProjects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.emoji} ${p.name}`;
        cardProject.appendChild(opt);
    });
    cardProject.value = currentProject;
}

// ============================================
// PROJECT MANAGEMENT MODAL — REDESIGNED
// ============================================

function openProjectModal() {
    const modal = document.getElementById('projectModal');
    renderProjectList();
    renderAddProjectBar();
    updateProjectCountInfo();
    modal.classList.add('active');
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    modal.classList.remove('active');
    closeEmojiPopover();
    closeAllContextMenus();
}

function updateProjectCountInfo() {
    const total = boardProjects.length;
    const active = boardProjects.filter(p => !p.archived).length;
    const el = document.getElementById('projectCountInfo');
    el.textContent = `${active} project${active !== 1 ? 's' : ''}${total !== active ? ` · ${total - active} archived` : ''}`;
}

function renderProjectList() {
    const listEl = document.getElementById('projectList');
    listEl.innerHTML = '';

    if (boardProjects.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No projects yet. Add one below!</p>';
        return;
    }

    const activeProjects = boardProjects.filter(p => !p.archived).sort((a, b) => a.order - b.order);
    const archivedProjects = boardProjects.filter(p => p.archived);

    activeProjects.forEach(project => {
        const row = createProjectRow(project);
        listEl.appendChild(row);
    });

    if (archivedProjects.length > 0) {
        const label = document.createElement('div');
        label.className = 'project-section-label';
        label.textContent = `Archived (${archivedProjects.length})`;
        listEl.appendChild(label);

        archivedProjects.forEach(project => {
            const row = createProjectRow(project);
            listEl.appendChild(row);
        });
    }

    updateProjectCountInfo();
}

function createProjectRow(project) {
    const div = document.createElement('div');
    div.className = `project-row${project.archived ? ' is-archived' : ''}`;
    div.dataset.projectId = project.id;
    div.draggable = !project.archived;

    // Color stripe
    const color = document.createElement('div');
    color.className = 'pr-color';
    color.style.backgroundColor = project.color;
    div.appendChild(color);

    // Emoji
    const emoji = document.createElement('span');
    emoji.className = 'pr-emoji';
    emoji.textContent = project.emoji;
    div.appendChild(emoji);

    // Name
    const name = document.createElement('span');
    name.className = 'pr-name';
    name.textContent = project.name;
    div.appendChild(name);

    // Card count
    const count = getCardCountForProject(project.id);
    if (count > 0) {
        const countEl = document.createElement('span');
        countEl.className = 'pr-count';
        countEl.textContent = count;
        div.appendChild(countEl);
    }

    // ··· menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'pr-menu-btn';
    menuBtn.textContent = '···';
    menuBtn.title = 'Options';
    menuBtn.onclick = (e) => {
        e.stopPropagation();
        toggleContextMenu(project.id, menuBtn);
    };
    div.appendChild(menuBtn);

    // Drag events for reordering (active projects only)
    if (!project.archived) {
        div.addEventListener('dragstart', (e) => {
            div.classList.add('dragging-project');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', project.id);
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging-project');
            document.querySelectorAll('.project-row').forEach(el => el.classList.remove('drag-over-project'));
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
            if (draggedId !== project.id) {
                reorderProject(draggedId, project.id);
            }
        });
    }

    return div;
}

// ============================================
// CONTEXT MENU (three-dot menu per project)
// ============================================

function toggleContextMenu(projectId, anchorBtn) {
    closeAllContextMenus();

    if (openContextMenuId === projectId) {
        openContextMenuId = null;
        return;
    }

    openContextMenuId = projectId;
    const project = getProject(projectId);
    if (!project) return;

    const menu = document.createElement('div');
    menu.className = 'pr-context-menu';
    menu.dataset.menuFor = projectId;

    // Edit
    const editItem = document.createElement('button');
    editItem.className = 'pr-context-item';
    editItem.innerHTML = '✏️ <span>Edit</span>';
    editItem.onclick = (e) => { e.stopPropagation(); closeAllContextMenus(); startEditProject(projectId); };
    menu.appendChild(editItem);

    // Archive / Restore
    const archiveItem = document.createElement('button');
    archiveItem.className = 'pr-context-item';
    archiveItem.innerHTML = project.archived ? '📤 <span>Restore</span>' : '📥 <span>Archive</span>';
    archiveItem.onclick = (e) => { e.stopPropagation(); closeAllContextMenus(); toggleArchiveProject(projectId); };
    menu.appendChild(archiveItem);

    // Delete
    const deleteItem = document.createElement('button');
    deleteItem.className = 'pr-context-item danger';
    deleteItem.innerHTML = '🗑️ <span>Delete</span>';
    deleteItem.onclick = (e) => { e.stopPropagation(); closeAllContextMenus(); deleteProject(projectId); };
    menu.appendChild(deleteItem);

    // Position the menu next to the button's parent row
    const row = anchorBtn.closest('.project-row');
    row.style.position = 'relative';
    row.appendChild(menu);
}

function closeAllContextMenus() {
    document.querySelectorAll('.pr-context-menu').forEach(el => el.remove());
    openContextMenuId = null;
}

// ============================================
// EXPAND-TO-EDIT
// ============================================

function startEditProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;

    const row = document.querySelector(`.project-row[data-project-id="${projectId}"]`);
    if (!row) return;

    let editEmoji = project.emoji;
    let editColor = project.color;

    // Create edit form
    const editDiv = document.createElement('div');
    editDiv.className = 'project-edit-expanded';
    editDiv.dataset.projectId = projectId;

    // Top row: emoji, name input, save/cancel
    const topRow = document.createElement('div');
    topRow.className = 'pe-top-row';

    const emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.className = 'pe-emoji-btn';
    emojiBtn.textContent = editEmoji;
    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        showEmojiPopover(emojiBtn, (emoji) => {
            editEmoji = emoji;
            emojiBtn.textContent = emoji;
        });
    };
    topRow.appendChild(emojiBtn);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'pe-name-input';
    nameInput.value = project.name;
    nameInput.maxLength = 40;
    topRow.appendChild(nameInput);

    const actions = document.createElement('div');
    actions.className = 'pe-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'pe-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
        const newName = nameInput.value.trim();
        if (!newName) { nameInput.focus(); return; }
        project.name = newName;
        project.emoji = editEmoji;
        project.color = editColor;
        saveProjects();
        populateProjectDropdowns();
        renderProjectList();
        renderAllColumns();
    };
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'pe-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => renderProjectList();
    actions.appendChild(cancelBtn);

    topRow.appendChild(actions);
    editDiv.appendChild(topRow);

    // Color swatches row
    const colorRow = document.createElement('div');
    colorRow.className = 'pe-color-row';

    const colorLabel = document.createElement('span');
    colorLabel.className = 'pe-color-row-label';
    colorLabel.textContent = 'Color';
    colorRow.appendChild(colorLabel);

    COLOR_PALETTE.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch${c === editColor ? ' selected' : ''}`;
        swatch.style.backgroundColor = c;
        swatch.onclick = () => {
            editColor = c;
            colorRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
        };
        colorRow.appendChild(swatch);
    });

    editDiv.appendChild(colorRow);

    // Replace row with edit form
    row.replaceWith(editDiv);
    nameInput.focus();
    nameInput.select();

    // Enter to save, Escape to cancel
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
    });
}

// ============================================
// PROJECT CRUD OPERATIONS
// ============================================

function renderAddProjectBar() {
    const swatchContainer = document.getElementById('addColorSwatches');
    swatchContainer.innerHTML = '';

    const quickColors = COLOR_PALETTE.slice(0, 6);
    quickColors.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch${c === selectedAddColor ? ' selected' : ''}`;
        swatch.style.backgroundColor = c;
        swatch.onclick = () => {
            selectedAddColor = c;
            swatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
        };
        swatchContainer.appendChild(swatch);
    });
}

function addProject() {
    const nameInput = document.getElementById('newProjectName');
    const name = nameInput.value.trim();

    if (!name) {
        nameInput.focus();
        return;
    }

    const id = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Date.now().toString(36);

    const newProject = {
        id,
        name,
        emoji: selectedAddEmoji,
        color: selectedAddColor,
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
    selectedAddEmoji = '📁';
    document.getElementById('projectEmojiBtn').textContent = '📁';
    nameInput.focus();
}

function toggleArchiveProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;

    project.archived = !project.archived;
    saveProjects();
    populateProjectDropdowns();
    renderProjectList();
}

function deleteProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;

    const count = getCardCountForProject(projectId);
    const msg = count > 0
        ? `Delete "${project.name}"? ${count} card${count > 1 ? 's' : ''} will lose their project tag.`
        : `Delete "${project.name}"?`;

    if (!confirm(msg)) return;

    // Clear project from all cards
    for (const column of ['ideas', 'progress', 'done', 'archived']) {
        boards[column].forEach(card => {
            if (card.project === projectId) {
                card.project = '';
            }
        });
    }

    boardProjects = boardProjects.filter(p => p.id !== projectId);
    saveProjects();
    saveToFirestore();
    populateProjectDropdowns();
    renderProjectList();
    renderAllColumns();
}

function reorderProject(draggedId, targetId) {
    const activeProjects = boardProjects.filter(p => !p.archived);
    const draggedIdx = activeProjects.findIndex(p => p.id === draggedId);
    const targetIdx = activeProjects.findIndex(p => p.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1) return;

    const [dragged] = activeProjects.splice(draggedIdx, 1);
    activeProjects.splice(targetIdx, 0, dragged);

    // Update order values
    activeProjects.forEach((p, i) => { p.order = i; });

    saveProjects();
    renderProjectList();
    populateProjectDropdowns();
}

// ============================================
// EMOJI POPOVER
// ============================================

function showEmojiPopover(anchorEl, onSelect) {
    const popover = document.getElementById('emojiPickerPopover');
    popover.innerHTML = '';
    popover.classList.add('visible');

    const grid = document.createElement('div');
    grid.className = 'emoji-popover-grid';

    EMOJI_OPTIONS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = emoji;
        btn.onclick = (e) => {
            e.stopPropagation();
            onSelect(emoji);
            closeEmojiPopover();
        };
        grid.appendChild(btn);
    });

    popover.appendChild(grid);

    // Position near anchor
    const modalBody = document.querySelector('.project-modal-body');
    const anchorRect = anchorEl.getBoundingClientRect();
    const modalRect = modalBody.getBoundingClientRect();

    popover.style.left = (anchorRect.left - modalRect.left) + 'px';
    popover.style.top = (anchorRect.bottom - modalRect.top + 4) + 'px';
}

function closeEmojiPopover() {
    const popover = document.getElementById('emojiPickerPopover');
    if (popover) {
        popover.classList.remove('visible');
    }
}

// ============================================
// FIRESTORE FUNCTIONS
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
            boardConfig.name = data.name || boardConfig.name;
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

    // Click outside modal to close
    document.getElementById('cardModal').addEventListener('click', (e) => {
        if (e.target.id === 'cardModal') closeModal();
    });

    document.getElementById('archiveModal').addEventListener('click', (e) => {
        if (e.target.id === 'archiveModal') closeArchiveModal();
    });

    // Project Management Modal
    document.getElementById('manageProjectsBtn').addEventListener('click', openProjectModal);
    document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
    document.getElementById('closeProjectModalBtn').addEventListener('click', closeProjectModal);
    document.getElementById('projectModal').addEventListener('click', (e) => {
        if (e.target.id === 'projectModal') closeProjectModal();
    });

    // Add project
    document.getElementById('addProjectBtn').addEventListener('click', addProject);
    document.getElementById('newProjectName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addProject();
    });

    // Emoji picker for add bar
    document.getElementById('projectEmojiBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showEmojiPopover(e.target, (emoji) => {
            selectedAddEmoji = emoji;
            document.getElementById('projectEmojiBtn').textContent = emoji;
        });
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
// CARD MODAL
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

    // Project color stripe
    const projectColor = getProjectColor(card.project);
    if (projectColor) {
        div.dataset.projectColor = 'true';
        div.style.setProperty('--card-project-color', projectColor);
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
            const labelIcons = { urgent: '🔥', research: '📚', blocked: '🚧', review: '👀', bug: '🐛' };
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
            dueBadge.textContent = '⚠️ Overdue';
        } else if (diffDays === 0) {
            dueBadge.classList.add('due-today');
            dueBadge.textContent = '📅 Today';
        } else if (diffDays <= 3) {
            dueBadge.classList.add('due-soon');
            dueBadge.textContent = `📅 ${diffDays}d`;
        } else {
            dueBadge.textContent = `📅 ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
        badges.appendChild(dueBadge);
    }

    // Project badge (dynamic from project data)
    if (card.project) {
        const project = getProject(card.project);
        const projectBadge = document.createElement('span');
        projectBadge.className = 'badge badge-project';

        if (project) {
            projectBadge.textContent = `${project.emoji} ${project.name}`;
            projectBadge.style.background = project.color + '18';
            projectBadge.style.color = project.color;
        } else {
            projectBadge.textContent = card.project;
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

    div.addEventListener('click', () => openModal(column, card));

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
    return Math.floor((now - moved) / (1000 * 60 * 60 * 24));
}

// ============================================
// DRAG AND DROP
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
            moveCard(data.cardId, data.fromColumn, column);
        } catch (err) {
            console.error('Drop error:', err);
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

// Dark mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    document.getElementById('darkModeToggle').textContent = isDark ? '☀️' : '🌙';
}

// ============================================
// EXPORT / IMPORT (with projects)
// ============================================

function exportData() {
    const exportObj = {
        boards,
        projects: boardProjects,
        config: boardConfig,
        exportedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(exportObj, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `unblocked-backup-${new Date().toISOString().split('T')[0]}.json`;
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
                if (imported.boards) {
                    boards = imported.boards;
                    if (imported.projects) {
                        boardProjects = imported.projects;
                        saveProjects();
                    }
                    if (imported.config) {
                        boardConfig = imported.config;
                        saveBoardConfig();
                        updateBoardTitle();
                    }
                } else {
                    boards = imported;
                }

                saveToFirestore();
                populateProjectDropdowns();
                renderAllColumns();
                updateAllCounts();
            }
        } catch (err) {
            alert('Failed to import: Invalid file format');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);

    e.target.value = '';
}
