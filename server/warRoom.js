// "Crise Majeure" (War Room) — a company-wide emergency, distinct from every other
// crisis mechanic in this game (server/events.js's page-scoped crises, Patch 10's
// claimable live-event cards): this one is global and role-based. Every connected
// player sees the same 180-second countdown regardless of which page they're on,
// and each of the 6 operational clusters (not each individual player) needs to
// validate one critical action before time runs out.
const { pushActivity, postTeamChat } = require("./gameState");
const { applyHealthDelta, awardPoints } = require("./scoring");
const { OPERATIONAL_CLUSTERS } = require("./strategy");
const { getDifficultyPreset } = require("./difficulty");

const SPAWN_MIN_MS = 8 * 60 * 1000;
const SPAWN_MAX_MS = 12 * 60 * 1000;
const SWEEP_MIN_MS = 3 * 1000;
const SWEEP_MAX_MS = 5 * 1000;
const RESPONSE_WINDOW_MS = 180 * 1000;
const MAJORITY_THRESHOLD = 4; // out of 6 operational clusters

const SCENARIOS = [
  "🚨 Le régulateur annonce un contrôle surprise sur l'ensemble de la banque.",
  "🚨 Une cyberattaque touche l'infrastructure de trading.",
  "🚨 Un scandale médiatique éclabousse un client majeur de la banque.",
  "🚨 Une chute soudaine et généralisée des marchés menace toutes les positions ouvertes."
];

let nextWarRoomId = 1;

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function broadcastWarRoom(io, gameState) {
  io.to("game").emit("warRoom:update", gameState.warRoom);
}

function spawnWarRoom(io, gameState) {
  if (gameState.warRoom) return; // one at a time
  const label = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  gameState.warRoom = {
    id: "wr" + (nextWarRoomId++),
    label,
    startedAt: Date.now(),
    deadline: Date.now() + RESPONSE_WINDOW_MS,
    respondedClusters: []
  };
  pushActivity(gameState, { actorPlayerId: null, page: "overview", text: "🆘 CRISE MAJEURE déclenchée — " + label + " Chaque département doit valider une action sous 3 minutes." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastWarRoom(io, gameState);
}

// Pure-ish core, unit-testable directly — same convention as resolveQuarter()/
// settleMarketDay(). Called either when every operational cluster has validated
// (pace lever, resolved immediately) or when the 180s deadline passes.
function resolveWarRoom(io, gameState) {
  const warRoom = gameState.warRoom;
  if (!warRoom) return null;

  const respondedCount = OPERATIONAL_CLUSTERS.filter(c => warRoom.respondedClusters.includes(c)).length;
  const missingCount = OPERATIONAL_CLUSTERS.length - respondedCount;
  const allResponded = missingCount === 0;
  const mitigated = respondedCount >= MAJORITY_THRESHOLD;

  const kpis = gameState.financeKPIs;
  let healthDelta, netIncomePct, outcomeText;
  if (allResponded) {
    healthDelta = 5;
    netIncomePct = 0;
    outcomeText = "Crise totalement maîtrisée — tous les départements ont réagi à temps.";
  } else if (mitigated) {
    healthDelta = 2;
    netIncomePct = 0;
    outcomeText = "Crise maîtrisée de justesse (" + respondedCount + "/" + OPERATIONAL_CLUSTERS.length + " départements mobilisés).";
  } else {
    healthDelta = -(missingCount * 4);
    netIncomePct = -(missingCount * 0.02);
    outcomeText = "Crise mal maîtrisée (" + respondedCount + "/" + OPERATIONAL_CLUSTERS.length + " départements mobilisés seulement) — dégâts réels.";
  }

  if (netIncomePct) {
    const oldNetIncome = kpis.netIncome;
    kpis.netIncome = Math.round(kpis.netIncome * (1 + netIncomePct) * 10) / 10;
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Crise Majeure" });
    if (kpis.history.length > 100) kpis.history.length = 100;
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
  }

  applyHealthDelta(io, gameState, healthDelta);
  postTeamChat(gameState, {
    authorName: "IA — Direction des opérations",
    text: "🆘 Crise Majeure clôturée — " + outcomeText,
    tone: mitigated ? "congrats" : "alert"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  pushActivity(gameState, { actorPlayerId: null, page: "overview", text: "🆘 " + outcomeText });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });

  const report = { respondedCount, missingCount, mitigated, healthDelta };
  gameState.warRoom = null;
  broadcastWarRoom(io, gameState);
  return report;
}

function registerWarRoomHandlers(io, socket, gameState) {
  socket.on("warRoom:validate", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.cluster || !gameState.warRoom) return;
    if (gameState.warRoom.respondedClusters.includes(player.cluster)) return;

    gameState.warRoom.respondedClusters.push(player.cluster);
    pushActivity(gameState, { actorPlayerId: player.id, page: "overview", text: player.fullName + " a validé une action critique pour son département en pleine Crise Majeure." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastWarRoom(io, gameState);
    awardPoints(io, gameState, player, "warroom_validate");

    const allResponded = OPERATIONAL_CLUSTERS.every(c => gameState.warRoom.respondedClusters.includes(c));
    if (allResponded) resolveWarRoom(io, gameState);
  });
}

function sweepWarRoom(io, gameState) {
  if (!gameState.warRoom) return;
  if (Date.now() >= gameState.warRoom.deadline) resolveWarRoom(io, gameState);
}

function scheduleWarRoomLoops(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnWarRoom(io, gameState);
    setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS) * getDifficultyPreset(gameState.difficulty).eventFreq);
  }
  setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) sweepWarRoom(io, gameState);
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
}

function startWarRoomLoop(io, gameState) {
  if (process.env.WAR_ROOM_ENABLED === "false") {
    console.log("War Room désactivée (WAR_ROOM_ENABLED=false).");
    return;
  }
  scheduleWarRoomLoops(io, gameState);
  console.log("War Room activée (crise majeure toutes les 8-12 min, réponse sous 180s).");
}

module.exports = { registerWarRoomHandlers, startWarRoomLoop, spawnWarRoom, resolveWarRoom, sweepWarRoom, RESPONSE_WINDOW_MS, MAJORITY_THRESHOLD };
