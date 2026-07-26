const { pushActivity } = require("./gameState");
const { applyHealthDelta } = require("./scoring");
const { createUrgentComplianceItem, escalateComplianceItem } = require("./handlers/compliance");
const { createBonusDeal, removeDeal } = require("./handlers/ma");
const { getDifficultyPreset } = require("./difficulty");

const SPAWN_MIN_MS = 4 * 60 * 1000;
const SPAWN_MAX_MS = 8 * 60 * 1000;
const SWEEP_MIN_MS = 20 * 1000;
const SWEEP_MAX_MS = 30 * 1000;
const EVENT_DEADLINE_MS = 3 * 60 * 1000;

let nextEventId = 1;

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function broadcastEvent(io, gameState, eventPayload) {
  io.to("game").emit("event:triggered", eventPayload);
  io.to("game").emit("events:update", gameState.activeEvents);
}

function spawnRegulatoryEvent(io, gameState) {
  const item = createUrgentComplianceItem(io, gameState, "🚨 Contrôle réglementaire surprise — délai de résolution 3 minutes.");
  const event = {
    id: "ev" + (nextEventId++),
    type: "regulatory",
    label: "Contrôle réglementaire",
    description: "Une alerte de conformité urgente vient d'apparaître. Quelqu'un ayant accès à la Conformité doit la résoudre sous 3 minutes.",
    targetId: item.id,
    deadline: Date.now() + EVENT_DEADLINE_MS
  };
  gameState.activeEvents.push(event);
  pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: "⚠️ Contrôle réglementaire déclenché — résolution requise sous 3 minutes." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastEvent(io, gameState, event);
}

function spawnClientCrisisEvent(io, gameState) {
  if (!gameState.clients.length) return;
  const client = gameState.clients[Math.floor(Math.random() * gameState.clients.length)];
  client.risk = "High";
  client.status = "En revue";
  io.to("access:clients").emit("clients:update", gameState.clients);

  const event = {
    id: "ev" + (nextEventId++),
    type: "client_unhappy",
    label: "Client mécontent — " + client.name,
    description: "« " + client.name + " » est passé en risque élevé. Quelqu'un ayant accès aux Clients doit intervenir (note ou changement de statut) sous 3 minutes.",
    targetId: client.id,
    deadline: Date.now() + EVENT_DEADLINE_MS
  };
  gameState.activeEvents.push(event);
  pushActivity(gameState, { actorPlayerId: null, page: "clients", text: "⚠️ « " + client.name + " » est mécontent — intervention requise sous 3 minutes." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastEvent(io, gameState, event);
}

function spawnMarketCrashEvent(io, gameState) {
  gameState.financeKPIs.aum = Math.round(gameState.financeKPIs.aum * 0.95);
  io.to("access:finance").emit("finance:update", gameState.financeKPIs);
  io.to("game").emit("overview:kpis", gameState.financeKPIs);
  applyHealthDelta(io, gameState, -10);

  pushActivity(gameState, { actorPlayerId: null, page: "finance", text: "📉 Krach boursier — AUM en baisse de 5 %." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });

  broadcastEvent(io, gameState, {
    id: "ev" + (nextEventId++),
    type: "market_crash",
    label: "Krach boursier",
    description: "L'AUM du groupe vient de chuter de 5 % — aucune action possible, encaissez le choc.",
    targetId: null,
    deadline: null
  });
}

function spawnOpportunityEvent(io, gameState) {
  const valuation = 50 + Math.floor(Math.random() * 200);
  const deal = createBonusDeal(io, gameState, { name: "⭐ Opportunité — deal express (" + valuation + " M$)", valuation });
  const event = {
    id: "ev" + (nextEventId++),
    type: "opportunity",
    label: "Opportunité de marché",
    description: "Un deal bonus à durée limitée vient d'apparaître en M&A. Faites-le avancer sous 3 minutes pour toucher le bonus avant qu'il n'expire.",
    targetId: deal.id,
    deadline: Date.now() + EVENT_DEADLINE_MS
  };
  gameState.activeEvents.push(event);
  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "⭐ Opportunité de marché — deal bonus disponible pendant 3 minutes." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastEvent(io, gameState, event);
}

// Competing bidder: a rival bank threatens to steal an early-stage deal already on
// the board. Resolving it is just advancing the deal's stage — ma:updateStage
// already calls checkEventResolution() unconditionally after any stage change, so
// this reuses that existing generic resolution path with no new wiring needed there.
function spawnCompetingBidEvent(io, gameState) {
  const eligible = gameState.maDeals.filter(d => d.stage === "Screening" || d.stage === "Due Diligence");
  if (!eligible.length) return;
  const deal = eligible[Math.floor(Math.random() * eligible.length)];
  const event = {
    id: "ev" + (nextEventId++),
    type: "competing_bid",
    label: "Enchère concurrente — " + deal.name,
    description: "Une banque concurrente menace de rafler « " + deal.name + " ». Faites-le avancer sous 3 minutes pour le sécuriser.",
    targetId: deal.id,
    deadline: Date.now() + EVENT_DEADLINE_MS
  };
  gameState.activeEvents.push(event);
  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "⚔️ Une banque concurrente convoite « " + deal.name + " » — réagissez sous 3 minutes." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastEvent(io, gameState, event);
}

const SPAWN_POOL = [spawnRegulatoryEvent, spawnClientCrisisEvent, spawnMarketCrashEvent, spawnOpportunityEvent, spawnCompetingBidEvent];

function applyTimeoutPenalty(io, gameState, event) {
  if (event.type === "regulatory") {
    escalateComplianceItem(io, gameState, event.targetId);
    applyHealthDelta(io, gameState, -15);
    pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: "❌ Contrôle réglementaire non traité à temps — conséquences pour la banque." });
  } else if (event.type === "client_unhappy") {
    const client = gameState.clients.find(c => c.id === event.targetId);
    if (client) {
      client.status = "Inactif";
      client.aum = Math.round(client.aum * 0.8);
      io.to("access:clients").emit("clients:update", gameState.clients);
    }
    applyHealthDelta(io, gameState, -10);
    pushActivity(gameState, { actorPlayerId: null, page: "clients", text: "❌ Client mécontent non traité à temps — perte d'AUM." });
  } else if (event.type === "opportunity") {
    removeDeal(io, gameState, event.targetId);
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "⌛ L'opportunité de marché a expiré, personne ne l'a saisie." });
  } else if (event.type === "competing_bid") {
    const deal = gameState.maDeals.find(d => d.id === event.targetId);
    removeDeal(io, gameState, event.targetId);
    applyHealthDelta(io, gameState, -5);
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "❌ « " + (deal ? deal.name : "Un deal") + " » a été raflé par la concurrence." });
  }
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
  io.to("game").emit("event:expired", { id: event.id, type: event.type, label: event.label });
}

function spawnRandomEvent(io, gameState) {
  const spawn = SPAWN_POOL[Math.floor(Math.random() * SPAWN_POOL.length)];
  spawn(io, gameState);
}

function scheduleSpawnLoop(io, gameState) {
  function tick() {
    const freq = getDifficultyPreset(gameState.difficulty).eventFreq;
    if (!gameState.paused) spawnRandomEvent(io, gameState);
    setTimeout(tick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS) * freq);
  }
  setTimeout(tick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
}

function scheduleSweepLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) {
      const now = Date.now();
      const expired = gameState.activeEvents.filter(e => e.deadline !== null && now >= e.deadline);
      if (expired.length) {
        gameState.activeEvents = gameState.activeEvents.filter(e => !expired.includes(e));
        expired.forEach(e => applyTimeoutPenalty(io, gameState, e));
        io.to("game").emit("events:update", gameState.activeEvents);
      }
    }
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
}

function startEventLoops(io, gameState) {
  if (process.env.EVENTS_ENABLED === "false") {
    console.log("Événements aléatoires désactivés (EVENTS_ENABLED=false).");
    return;
  }
  scheduleSpawnLoop(io, gameState);
  scheduleSweepLoop(io, gameState);
  console.log("Événements aléatoires activés (apparition 4-8 min, balayage 20-30s).");
}

module.exports = { startEventLoops, EVENT_DEADLINE_MS, SPAWN_POOL, spawnRandomEvent, spawnCompetingBidEvent, applyTimeoutPenalty };
