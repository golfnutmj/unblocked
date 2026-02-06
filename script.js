// Check URL parameters for mode
const urlParams = new URLSearchParams(window.location.search);
const isDemo = urlParams.get('demo') === 'true';
const isNew = urlParams.get('new') === 'true';

// Board collection name based on mode
const boardCollectionName = isDemo ? 'demo-boards' : (isNew ? 'user-boards' : boardCollectionName);

// Data structure
let boards = {
    ideas: [],
    progress: [],
    done: [],
    archived: [] // New: archived cards
};

let boardConfig = {
    name: isDemo ? "🚀 Unblocked Demo Board" : (isNew ? "My Project Board" : "🦊 MJ's Project Board")
};

let currentCard = null;
let editingCard = null;
let activeFilter = ''; // For project filtering
let searchQuery = ''; // For text search
let selectedLabels = []; // Temporary labels during edit
let isFirebaseReady = false;

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

// Demo Data

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
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
    
    // Load data from Firestore (or demo data)
    if (isDemo) {
        loadFromFirestore();
    } else {
        await loadFromFirestore();
    }
    await loadBoardConfig();
    
    renderAllColumns();
    setupEventListeners();
    updateAllCounts();
    updateBoardTitle();
    
    // Setup real-time sync
    setupFirestoreSync();
    setupBoardConfigSync();
});

// Firestore Functions
async function loadFromFirestore() {
    // If demo mode, load from demo-data.json instead
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
        
        // Listen for changes in each column including archived
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
    
    // Real-time listeners for each column
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
    // Demo mode: Don't save changes to Firebase
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
        
        // Save each column to Firestore including archived
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

// Event Listeners
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
        }
    });
}

// Modal functions
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
        // Update existing card
        editingCard.title = title;
        editingCard.description = description;
        editingCard.project = project;
        editingCard.priority = priority;
        editingCard.effort = effort;
        editingCard.dueDate = dueDate;
        editingCard.labels = [...selectedLabels];
    } else {
        // Create new card
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
        // Remove from current column
        boards[column] = boards[column].filter(card => card !== editingCard);
        
        // Add to archived
        editingCard.archivedAt = new Date().toISOString();
        boards.archived.push(editingCard);
        
        saveToFirestore();
        renderColumn(column);
        updateCount(column);
        closeModal();
    }
}

// Archive Modal
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
    showArchiveModal(); // Refresh archive view
}

function deleteArchivedCard(card) {
    if (!confirm('Permanently delete this card?')) return;
    
    boards.archived = boards.archived.filter(c => c !== card);
    saveToFirestore();
    showArchiveModal(); // Refresh archive view
}

// Render functions
function renderAllColumns() {
    Object.keys(boards).filter(k => k !== 'archived').forEach(column => renderColumn(column));
}

function renderColumn(column) {
    const container = document.getElementById(`${column}-cards`);
    container.innerHTML = '';

    let filteredCards = boards[column];
    
    // Apply project filter
    if (activeFilter) {
        filteredCards = filteredCards.filter(card => card.project === activeFilter);
    }
    
    // Apply search
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
    
    // Project badge
    if (card.project) {
        const projectBadge = document.createElement('span');
        projectBadge.className = 'badge badge-project';
        const projectLabels = {
            'earnings-digest': '📊 Earnings',
            'relocation-helper': '🌍 Relocation',
            'photo-journey': '📸 Photo',
            'unblocked': '🚀 Unblocked',
            'other': '💡 Other'
        };
        projectBadge.textContent = projectLabels[card.project] || card.project;
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

// Drag and Drop
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

// Counter updates
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

// Export/Import
function exportData() {
    const dataStr = JSON.stringify(boards, null, 2);
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
                boards = imported;
                saveToFirestore();
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
