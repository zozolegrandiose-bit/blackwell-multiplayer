// Sauvegarde & Historique -- no external database is configured for this project
// (no DATABASE_URL/managed DB service), so this is an honest, working substitute:
// a local JSON file. It survives across `resetGame()` calls and server restarts
// within the same deployment/disk, which is the case that actually matters for
// "garder l'historique de partie en partie" -- it does NOT survive a fresh Render
// redeploy, since that provisions a new disk. Reputation (Hall of Fame) and every
// session's Trophy Ceremony results are appended here.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const MAX_SESSION_HISTORY = 20;

function loadHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      hallOfFame: Array.isArray(parsed.hallOfFame) ? parsed.hallOfFame : [],
      sessionHistory: Array.isArray(parsed.sessionHistory) ? parsed.sessionHistory : []
    };
  } catch (e) {
    return { hallOfFame: [], sessionHistory: [] };
  }
}

function saveHistory(gameState) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      hallOfFame: gameState.hallOfFame || [],
      sessionHistory: gameState.sessionHistory || []
    };
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.log("Sauvegarde de l'historique impossible (non bloquant) :", e.message);
  }
}

// Called once at server boot -- seeds gameState with whatever survived from
// before (a restart, not necessarily a redeploy).
function primeGameStateFromHistory(gameState) {
  const history = loadHistory();
  if (history.hallOfFame.length) gameState.hallOfFame = history.hallOfFame;
  gameState.sessionHistory = history.sessionHistory;
}

// Called from server/trophies.js's endSession() -- appends the just-finished
// session's trophies to the running history and persists immediately.
function recordSessionHistory(gameState, trophies) {
  gameState.sessionHistory = gameState.sessionHistory || [];
  gameState.sessionHistory.unshift({ ts: Date.now(), trophies });
  if (gameState.sessionHistory.length > MAX_SESSION_HISTORY) gameState.sessionHistory.length = MAX_SESSION_HISTORY;
  saveHistory(gameState);
}

module.exports = { loadHistory, saveHistory, primeGameStateFromHistory, recordSessionHistory, HISTORY_FILE };
