// Data structure
let boards = {
    ideas: [],
    progress: [],
    done: []
};

let currentCard = null;
let editingCard = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    renderAllColumns();
    setupEventListeners();
    updateAllCounts();
    
    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').textContent = '☀️';
    }
});

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

    // Click outside modal to close
    document.getElementById('cardModal').addEventListener('click', (e) => {
        if (e.target.id === 'cardModal') closeModal();
    });

    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

    // Export/Import
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importData);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// Modal functions
function openModal(column, card = null) {
    const modal = document.getElementById('cardModal');
    const title = document.getElementById('modalTitle');
    const cardTitle = document.getElementById('cardTitle');
    const cardDescription = document.getElementById('cardDescription');
    const deleteBtn = document.getElementById('deleteCard');

    currentCard = column;
    editingCard = card;

    if (card) {
        title.textContent = 'Edit Card';
        cardTitle.value = card.title;
        cardDescription.value = card.description || '';
        deleteBtn.style.display = 'block';
    } else {
        title.textContent = 'New Card';
        cardTitle.value = '';
        cardDescription.value = '';
        deleteBtn.style.display = 'none';
    }

    modal.classList.add('active');
    cardTitle.focus();
}

function closeModal() {
    const modal = document.getElementById('cardModal');
    modal.classList.remove('active');
    currentCard = null;
    editingCard = null;
}

function saveCard() {
    const title = document.getElementById('cardTitle').value.trim();
    const description = document.getElementById('cardDescription').value.trim();

    if (!title) {
        alert('Please enter a card title');
        return;
    }

    if (editingCard) {
        // Update existing card
        editingCard.title = title;
        editingCard.description = description;
    } else {
        // Create new card
        const newCard = {
            id: Date.now().toString(),
            title,
            description,
            createdAt: new Date().toISOString()
        };
        boards[currentCard].push(newCard);
    }

    saveToStorage();
    renderColumn(currentCard);
    updateCount(currentCard);
    closeModal();
}

function deleteCard() {
    if (!confirm('Delete this card?')) return;

    const column = Object.keys(boards).find(col => 
        boards[col].some(card => card === editingCard)
    );

    if (column) {
        boards[column] = boards[column].filter(card => card !== editingCard);
        saveToStorage();
        renderColumn(column);
        updateCount(column);
        closeModal();
    }
}

// Render functions
function renderAllColumns() {
    Object.keys(boards).forEach(column => renderColumn(column));
}

function renderColumn(column) {
    const container = document.getElementById(`${column}-cards`);
    container.innerHTML = '';

    boards[column].forEach(card => {
        const cardEl = createCardElement(card, column);
        container.appendChild(cardEl);
    });

    // Setup drag and drop
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
    boards[toColumn].push(card);

    saveToStorage();
    renderColumn(fromColumn);
    renderColumn(toColumn);
    updateCount(fromColumn);
    updateCount(toColumn);
}

// Counter updates
function updateCount(column) {
    const columnEl = document.querySelector(`[data-column="${column}"]`);
    const countEl = columnEl.querySelector('.card-count');
    countEl.textContent = boards[column].length;
}

function updateAllCounts() {
    Object.keys(boards).forEach(updateCount);
}

// Storage
function saveToStorage() {
    localStorage.setItem('kanbanData', JSON.stringify(boards));
}

function loadFromStorage() {
    const stored = localStorage.getItem('kanbanData');
    if (stored) {
        try {
            boards = JSON.parse(stored);
        } catch (err) {
            console.error('Failed to load data:', err);
        }
    }
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
                saveToStorage();
                renderAllColumns();
                updateAllCounts();
            }
        } catch (err) {
            alert('Failed to import: Invalid file format');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
}
