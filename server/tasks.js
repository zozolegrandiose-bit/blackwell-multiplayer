const { pushActivity } = require("./gameState");
const { awardPoints } = require("./scoring");
const { getDifficultyPreset } = require("./difficulty");

// The "always something to do" layer: small, fast, purely positive micro-tasks —
// unlike the Patch 3 crisis events, these never penalize if left unaddressed, they
// just expire quietly. One click each, no forms, modest points. Deliberately much
// more frequent than crisis events (every 15-30s vs 4-8min) to keep every
// operational page feeling alive between quarters/events.
const TASK_SPAWN_MIN_MS = 15 * 1000;
const TASK_SPAWN_MAX_MS = 30 * 1000;
const TASK_SWEEP_MIN_MS = 8 * 1000;
const TASK_SWEEP_MAX_MS = 12 * 1000;
const TASK_EXPIRY_MS = 75 * 1000;
const MAX_ACTIVE_TASKS_PER_PAGE = 3;

const TASK_PAGES = ["ma", "clients", "compliance", "hr", "finance", "markets"];

const TASK_LABELS = {
  ma: [
    "Un client attend un point rapide sur un mandat en cours.",
    "Une banque partenaire demande une confirmation express.",
    "Relecture rapide d'un teaser avant envoi."
  ],
  clients: [
    "Un client attend un rappel.",
    "Mise à jour rapide d'une fiche client.",
    "Question client à traiter en urgence."
  ],
  compliance: [
    "Vérification rapide sur une transaction récente.",
    "Un desk demande une validation express.",
    "Contrôle de routine à effectuer."
  ],
  hr: [
    "Un collaborateur a une question RH urgente.",
    "Validation rapide d'une demande interne.",
    "Point rapide sur une intégration en cours."
  ],
  finance: [
    "Rapprochement bancaire rapide à faire.",
    "Un desk demande une vérification de chiffres.",
    "Validation express d'un reporting."
  ],
  markets: [
    "Un client institutionnel demande un cours indicatif.",
    "Vérification rapide d'une position ouverte.",
    "Point rapide sur l'exposition du desk."
  ]
};

let nextTaskId = 1;

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function tasksForPage(gameState, page) {
  return gameState.taskQueue.filter(t => t.page === page);
}

function summarizeTasks(gameState) {
  const summary = {};
  TASK_PAGES.forEach(p => { summary[p] = 0; });
  gameState.taskQueue.forEach(t => { summary[t.page] = (summary[t.page] || 0) + 1; });
  return summary;
}

function spawnTask(io, gameState) {
  const page = TASK_PAGES[Math.floor(Math.random() * TASK_PAGES.length)];
  if (tasksForPage(gameState, page).length >= MAX_ACTIVE_TASKS_PER_PAGE) return;

  const labels = TASK_LABELS[page];
  const task = {
    id: "task" + (nextTaskId++),
    page,
    label: labels[Math.floor(Math.random() * labels.length)],
    createdAt: Date.now(),
    expiresAt: Date.now() + TASK_EXPIRY_MS
  };
  gameState.taskQueue.push(task);

  io.to("access:" + page).emit("tasks:update", { page, tasks: tasksForPage(gameState, page) });
  io.to("game").emit("tasks:summary", summarizeTasks(gameState));
}

function sweepExpiredTasks(io, gameState) {
  const now = Date.now();
  const expired = gameState.taskQueue.filter(t => now >= t.expiresAt);
  if (!expired.length) return;

  const affectedPages = new Set(expired.map(t => t.page));
  gameState.taskQueue = gameState.taskQueue.filter(t => now < t.expiresAt);
  affectedPages.forEach(page => {
    io.to("access:" + page).emit("tasks:update", { page, tasks: tasksForPage(gameState, page) });
  });
  io.to("game").emit("tasks:summary", summarizeTasks(gameState));
}

function scheduleTaskSpawnLoop(io, gameState) {
  function tick() {
    const freq = getDifficultyPreset(gameState.difficulty).taskFreq;
    if (!gameState.paused) spawnTask(io, gameState);
    setTimeout(tick, randomDelay(TASK_SPAWN_MIN_MS, TASK_SPAWN_MAX_MS) * freq);
  }
  setTimeout(tick, randomDelay(TASK_SPAWN_MIN_MS, TASK_SPAWN_MAX_MS));
}

function scheduleTaskSweepLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepExpiredTasks(io, gameState);
    setTimeout(tick, randomDelay(TASK_SWEEP_MIN_MS, TASK_SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(TASK_SWEEP_MIN_MS, TASK_SWEEP_MAX_MS));
}

function startTaskLoop(io, gameState) {
  if (process.env.TASKS_ENABLED === "false") {
    console.log("File de tâches désactivée (TASKS_ENABLED=false).");
    return;
  }
  scheduleTaskSpawnLoop(io, gameState);
  scheduleTaskSweepLoop(io, gameState);
  console.log("File de tâches rapides activée (apparition 15-30s, expiration 75s).");
}

function registerTaskHandlers(io, socket, gameState) {
  socket.on("tasks:complete", payload => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const idx = gameState.taskQueue.findIndex(t => t.id === payload.taskId);
    if (idx === -1) return;
    const task = gameState.taskQueue[idx];
    if (!socket.rooms.has("access:" + task.page)) return;

    gameState.taskQueue.splice(idx, 1);
    awardPoints(io, gameState, player, "task_completed");
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: task.page,
      text: player.fullName + " a traité une tâche rapide."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:" + task.page).emit("tasks:update", { page: task.page, tasks: tasksForPage(gameState, task.page) });
    io.to("game").emit("tasks:summary", summarizeTasks(gameState));
  });
}

module.exports = { registerTaskHandlers, startTaskLoop, tasksForPage, summarizeTasks, TASK_PAGES, TASK_EXPIRY_MS };
