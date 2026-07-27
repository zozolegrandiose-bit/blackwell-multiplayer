const { resetGame, pushActivity } = require("../gameState");
const { buildSnapshot } = require("./join");
const { QUARTER_LENGTH_MS, CLUSTER_LABELS, OPERATIONAL_CLUSTERS } = require("../strategy");
const { spawnRandomEvent } = require("../events");
const { DIFFICULTY_LEVELS } = require("../difficulty");

const HALL_OF_FAME_MAX = 10;

function registerGameHandlers(io, socket, gameState) {
  socket.on("game:requestReset", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess) return;

    const topScore = Object.values(gameState.playerScores).sort((a, b) => b.score - a.score)[0] || null;

    // Hall of Fame: recorded onto the current gameState.hallOfFame BEFORE resetGame()
    // runs — resetGame() explicitly preserves this array across the wipe (see
    // server/gameState.js), the same way it preserves connected players.
    if (topScore && topScore.score > 0) {
      gameState.hallOfFame.push({ fullName: topScore.fullName, score: topScore.score, quarter: gameState.currentQuarter, ts: Date.now() });
      gameState.hallOfFame.sort((a, b) => b.score - a.score);
      gameState.hallOfFame.length = Math.min(gameState.hallOfFame.length, HALL_OF_FAME_MAX);
    }

    resetGame(gameState);
    gameState.quarterDeadline = Date.now() + QUARTER_LENGTH_MS;

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "overview",
      text: player.fullName + " a lancé une nouvelle partie." +
        (topScore ? " Meilleur score de la partie précédente : " + topScore.fullName + " (" + topScore.score + " pts)." : "")
    });

    gameState.players.forEach(p => {
      const targetSocket = io.sockets.sockets.get(p.socketId);
      if (!targetSocket) return;
      targetSocket.emit("game:reset", { player: p, snapshot: buildSnapshot(gameState, p) });
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  // GM control panel (Board Of Directors only) — pause/resume freezes every
  // self-rescheduling loop's guarded action (tasks, events, quarter resolution,
  // deal/client risk sweeps all check gameState.paused each tick) without tearing
  // down any timers, and shifts the visible quarter countdown by the paused duration
  // on resume so players don't lose deciding time to a pause.
  socket.on("game:pause", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess || gameState.paused) return;
    gameState.paused = true;
    gameState.pausedAt = Date.now();
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: "⏸ " + player.fullName + " a mis la partie en pause." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("game:pauseState", { paused: true });
  });

  socket.on("game:resume", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess || !gameState.paused) return;
    const elapsed = Date.now() - (gameState.pausedAt || Date.now());
    gameState.paused = false;
    gameState.pausedAt = null;
    if (gameState.quarterDeadline) gameState.quarterDeadline += elapsed;
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: "▶️ " + player.fullName + " a repris la partie." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("game:pauseState", { paused: false });
    io.to("game").emit("strategy:update", { quarterDeadline: gameState.quarterDeadline });
  });

  socket.on("game:setDifficulty", payload => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess) return;
    if (!DIFFICULTY_LEVELS.includes(payload.difficulty)) return;
    gameState.difficulty = payload.difficulty;
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: player.fullName + " a changé la difficulté de la partie." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("game:difficultyChanged", { difficulty: gameState.difficulty });
  });

  socket.on("game:triggerEvent", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess) return;
    spawnRandomEvent(io, gameState);
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: "🎛 " + player.fullName + " a déclenché un événement manuellement." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  // Board Of Directors's standing directive — a real executive lever, not just a
  // display: server/scoring.js's awardPoints() gives +50% points on every scored
  // action from the prioritized department for as long as this directive stands.
  socket.on("game:setDirective", payload => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess) return;
    if (!OPERATIONAL_CLUSTERS.includes(payload.cluster)) return;
    gameState.directive = { cluster: payload.cluster, setAt: Date.now(), setByName: player.fullName };
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: "📢 " + player.fullName + " a fait de " + CLUSTER_LABELS[payload.cluster] + " la priorité de la direction (+50% de points pour ce département)." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("game:directiveChanged", gameState.directive);
  });

  socket.on("game:clearDirective", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess || !gameState.directive) return;
    gameState.directive = null;
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: "📢 " + player.fullName + " a levé la directive prioritaire de la direction." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("game:directiveChanged", null);
  });
}

module.exports = { registerGameHandlers, HALL_OF_FAME_MAX };
