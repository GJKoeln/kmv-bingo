/** General Game Constants **/
const WINNING_LINES = [
    // Horizontal
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    // Vertical
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
    // Diagonal
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20]
];

let wordList = null;
let boardWords = [];
let markedState = Array(25).fill(false);

/** Utility Functions **/
function shuffle(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Storage Constants and Functions **/
const STORAGE_PREFIX = "bingo:state:";
const MAX_SAVED_LISTS = 10;
const STATE_MAX_AGE_DAYS = 90;

function getStateKey(listId) {
    return `${STORAGE_PREFIX}${listId}`;
}

function loadGameState(listId) {
    const key = getStateKey(listId);

    try {
        const raw = localStorage.getItem(key);

        // No saved state found
        if (!raw)
            return {savedWords: null, savedMarked: null};

        const state = JSON.parse(raw);

        // Reset incompatible state format
        if (
            state.v !== 1 ||
            !Array.isArray(state.savedWords) ||
            !Array.isArray(state.savedMarked)
        ) {
            localStorage.removeItem(key);
            return {savedWords: null, savedMarked: null};
        }

        const maxAge = STATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

        // Reset state if it's too old
        if (
            !Number.isFinite(state.updatedAt) ||
            Date.now() - state.updatedAt > maxAge
        ) {
            localStorage.removeItem(key);
            return {savedWords: null, savedMarked: null};
        }

        return { savedWords: state.savedWords, savedMarked: state.savedMarked };
    } catch (error) {
        console.warn("Spielstand konnte nicht geladen werden.", error);
        return { savedWords: null, savedMarked: null };
    }
}

function saveGameState(listId, words, marked) {
    const key = getStateKey(listId);

    const state = {
        v: 1,
        savedWords: words,
        savedMarked: marked,
        updatedAt: Date.now()
    };

    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
        console.warn("Spielstand konnte nicht gespeichert werden.", error);
    }
}

function pruneGameStates(currentKey = null) {
    const prefix = STORAGE_PREFIX;
    const maxAge = STATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    const entries = [];

    // Load all saved states and filter out invalid or expired ones
    const allKeys = Object.keys(localStorage);

    for (let i = 0; i < allKeys.length; i++) {
        const key = allKeys[i];

        if (!key || !key.startsWith(prefix)) continue;

        try {
            const state = JSON.parse(localStorage.getItem(key));

            if (
                !state ||
                state.v !== 1 ||
                !Number.isFinite(state.updatedAt) ||
                !Array.isArray(state.savedWords) ||
                !Array.isArray(state.savedMarked) ||
                Date.now() - state.updatedAt > maxAge
            ) {
                localStorage.removeItem(key);
                continue;
            }

            entries.push({
                key,
                updatedAt: state.updatedAt
            });
        } catch {
            localStorage.removeItem(key);
        }
    }

    // Sort entries by last updated time (most recent first)
    entries.sort((a, b) => b.updatedAt - a.updatedAt);

    const current = entries.find(entry => entry.key === currentKey);
    const others = entries.filter(entry => entry.key !== currentKey);

    // Keep the current state if it exists,
    // and then the most recent states up to the maximum allowed
    const keep = current
        ? [current, ...others.slice(0, MAX_SAVED_LISTS - 1)]
        : entries.slice(0, MAX_SAVED_LISTS);
    const keepKeys = new Set(keep.map(entry => entry.key));

    for (const entry of entries) {
        if (!keepKeys.has(entry.key)) {
            localStorage.removeItem(entry.key);
        }
    }
}

/** Word List Resolution Functions **/
function getLocalDateString() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getWordListById(id) {
    return WORD_POOL[id] ?? null;
}

function resolveWordList() {
    const params = new URLSearchParams(window.location.search);

    // 1. Explicit code parameter in URL
    const code = params.get("code");

    if (code) {
        const list = getWordListById(code);
        if (list) return list;
    }

    // 2. Explicit date parameter in URL or fallback to today's date
    const date = params.get("date") || getLocalDateString();
    const dateListId = dateToListID[date];

    if (dateListId) {
        const list = getWordListById(dateListId);
        if (list) return list;
    }

    // 3. Fallback to default list
    return getWordListById(DEFAULT_LIST_ID);
}

/** Bingo Board Functions **/
function initBoard(forceRegenerate = false) {
    wordList = resolveWordList();
    const listId = wordList.id;
    const {savedWords, savedMarked} = loadGameState(listId);
    pruneGameStates(getStateKey(listId));

    $("#bingo-title").text(wordList.title);
    $("#bingo-subtitle").text(wordList.subtitle);

    if (!forceRegenerate && savedWords && savedMarked) {
        boardWords = savedWords;
        markedState = savedMarked;
    } else {
        boardWords = shuffle(wordList.words).slice(0, 25);
        markedState = Array(25).fill(false);
        saveState();
    }
    renderBoard();
}

function saveState() {
    saveGameState(wordList.id, boardWords, markedState);
}

function evaluateBoard() {
    const winningIndices = new Set();
    let lineCount = 0;

    WINNING_LINES.forEach(line => {
        const isComplete = line.every(index => markedState[index]);
        if (isComplete) {
            lineCount++;
            line.forEach(idx => winningIndices.add(idx));
        }
    });

    return {winningIndices, lineCount};
}

function renderBoard() {
    const $board = $("#bingoBoard").empty();
    const {winningIndices, lineCount} = evaluateBoard();

    boardWords.forEach((word, index) => {
        const isMarked = markedState[index];
        const isWinner = winningIndices.has(index);

        const $cell = $("<button>")
            .addClass("cell")
            .text(word)
            .attr("data-index", index);

        if (isMarked) $cell.addClass("cell--marked");
        if (isWinner) $cell.addClass("cell--winner");

        $board.append($cell);
    });

    if (lineCount > 0) {
        $("#winCountMessage").text(lineCount);
        $("#bingoBanner").show();
    } else {
        $("#bingoBanner").hide();
    }
}

$(document).ready(function () {
    initBoard();

    $("#bingoBoard").on("click", ".cell", function () {
        const index = $(this).data("index");
        markedState[index] = !markedState[index];
        saveState();
        renderBoard();
    });

    $("#regenerateBtn").on("click", function () {
        if (confirm("Generate a new board? Your current board progress will be reset.")) {
            initBoard(true);
        }
    });
});
