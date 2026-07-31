const { pushActivity } = require("../gameState");
const { awardPoints, checkEventResolution, applyHealthDelta } = require("../scoring");
const { recomputeAum } = require("./finance");
const { createBonusDeal } = require("./ma");
const { getDifficultyPreset } = require("../difficulty");

const CROSS_SELL_AUM_THRESHOLD = 1500;
const CROSS_SELL_PROBABILITY = 0.35;
const CHURN_SWEEP_MIN_MS = 60 * 1000;
const CHURN_SWEEP_MAX_MS = 90 * 1000;
const CHURN_THRESHOLD_MS = 4 * 60 * 1000;
const CHURN_PROBABILITY = 0.2;

// AI Client Trust gauge (Patch 30) -- a client isn't just "Actif/Inactif", it has
// a 0-100 confidence level that erodes with neglect and recovers with genuine
// service (a note, a successful re-engagement). At 0, the client doesn't just go
// quiet -- it's lost outright to a rival bank, same "guerre inter-banques" flavor
// already established by server/rivalAggression.js's poaching of players.
const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const DEFAULT_TRUST = 70;
const TRUST_CHURN_PENALTY = 25;
const TRUST_LOST_HEALTH_PENALTY = 6;
const TRUST_NOTE_GAIN = 3;
const TRUST_REACTIVATION_GAIN = 10;
const TRUST_REVIEW_PENALTY = 12;

const CLIENT_STATUSES = ["Prospect", "Actif", "En revue", "Inactif"];
const CLIENT_RISKS = ["Low", "Medium", "High"];
const KYC_ITEMS = ["Vérification d'identité", "Origine des fonds", "Sanctions & PEP", "Validation Conformité"];
const AMBIENT_NOTES = [
  "Suivi de routine effectué, rien à signaler.",
  "Relance programmée pour le prochain trimestre.",
  "Point de synthèse partagé avec l'équipe.",
  "Dossier vérifié, aucune action requise pour l'instant."
];
let nextClientId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "clients" page.
function addRandomClientNote(io, gameState, actor) {
  if (!gameState.clients.length) return false;
  const client = gameState.clients[Math.floor(Math.random() * gameState.clients.length)];
  const text = AMBIENT_NOTES[Math.floor(Math.random() * AMBIENT_NOTES.length)];
  client.notes.push({ authorPlayerId: actor.id, authorName: actor.fullName, ts: Date.now(), text });
  client.lastTouchedAt = Date.now();
  io.to("access:clients").emit("clients:update", gameState.clients);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "clients",
    text: actor.fullName + " a ajouté une note sur « " + client.name + " »."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return true;
}

// Ambient churn risk: an "Actif" client nobody has touched (note or status change)
// in a while can quietly go inactive on its own — symmetric to the task queue's
// "always something to do" pressure, but as a cost for neglect rather than a reward.
function sweepChurnRisk(io, gameState) {
  const now = Date.now();
  const atRisk = gameState.clients.filter(c => c.status === "Actif" && now - (c.lastTouchedAt || 0) >= CHURN_THRESHOLD_MS);
  let aumChanged = false;
  let healthPenalty = 0;
  const lostClientIds = [];

  atRisk.forEach(client => {
    if (Math.random() >= CHURN_PROBABILITY) return;
    client.trust = Math.max(0, (client.trust == null ? DEFAULT_TRUST : client.trust) - TRUST_CHURN_PENALTY);
    aumChanged = true;

    if (client.trust <= 0) {
      const rivalBanks = Object.keys(gameState.leagueTable).filter(name => name !== PLAYER_BANK_NAME);
      const rival = rivalBanks[Math.floor(Math.random() * rivalBanks.length)];
      lostClientIds.push(client.id);
      healthPenalty += TRUST_LOST_HEALTH_PENALTY;
      pushActivity(gameState, { actorPlayerId: null, page: "clients", text: "🚪 « " + client.name + " » a perdu toute confiance et est parti chez " + rival + " — mandat de " + client.aum + " M$ perdu définitivement." });
      return;
    }

    client.status = "Inactif";
    client.aum = Math.round(client.aum * 0.85);
    client.lastTouchedAt = now;
    healthPenalty += 2;
    pushActivity(gameState, { actorPlayerId: null, page: "clients", text: "📉 « " + client.name + " » est passé inactif, faute de suivi (confiance : " + client.trust + "%)." });
  });

  if (lostClientIds.length) {
    gameState.clients = gameState.clients.filter(c => !lostClientIds.includes(c.id));
  }
  if (!atRisk.length) return;

  io.to("access:clients").emit("clients:update", gameState.clients);
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  if (aumChanged) {
    applyHealthDelta(io, gameState, -healthPenalty);
    recomputeAum(gameState);
    io.to("access:finance").emit("finance:update", gameState.financeKPIs);
    io.to("game").emit("overview:kpis", gameState.financeKPIs);
    io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
  }
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function scheduleChurnRiskLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepChurnRisk(io, gameState);
    setTimeout(tick, randomDelay(CHURN_SWEEP_MIN_MS, CHURN_SWEEP_MAX_MS) * getDifficultyPreset(gameState.difficulty).eventFreq);
  }
  setTimeout(tick, randomDelay(CHURN_SWEEP_MIN_MS, CHURN_SWEEP_MAX_MS));
}

// Cross-sell: a client that just became a real Actif relationship, with enough AUM
// to matter, occasionally surfaces a related M&A opportunity — a thematic bridge
// between the Clients and M&A desks rather than two isolated pages.
function maybeSpawnCrossSellDeal(io, gameState, client) {
  if (client.aum < CROSS_SELL_AUM_THRESHOLD) return;
  if (Math.random() >= CROSS_SELL_PROBABILITY) return;
  const valuation = Math.round(client.aum * (0.15 + Math.random() * 0.25));
  const deal = createBonusDeal(io, gameState, { name: "🔗 Cross-sell — " + client.name, valuation });
  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "🔗 « " + client.name + " » ouvre une piste M&A (" + valuation + " M$)." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return deal;
}

function registerClientsHandlers(io, socket, gameState) {
  socket.on("clients:create", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const name = (payload.name || "").trim();
    if (!name) {
      socket.emit("clients:create:rejected", { reason: "Le nom du client est requis." });
      return;
    }

    const client = {
      id: "cl" + (nextClientId++),
      name,
      industry: (payload.industry || "").trim() || "—",
      aum: Number(payload.aum) || 0,
      rmPlayerId: player.id,
      rmName: player.fullName,
      risk: CLIENT_RISKS.includes(payload.risk) ? payload.risk : "Medium",
      status: "Prospect",
      trust: 70,
      notes: [],
      kycChecklist: KYC_ITEMS.map(item => ({ item, done: false })),
      lastTouchedAt: Date.now()
    };
    gameState.clients.push(client);

    io.to("access:clients").emit("clients:update", gameState.clients);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "clients",
      text: player.fullName + " a ajouté un nouveau client."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "clients_create");
  });

  socket.on("clients:updateStatus", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    if (!client || !CLIENT_STATUSES.includes(payload.status)) return;
    const wasActive = client.status === "Actif";
    client.status = payload.status;
    client.lastTouchedAt = Date.now();
    client.trust = client.trust == null ? DEFAULT_TRUST : client.trust;
    if (!wasActive && client.status === "Actif") client.trust = Math.min(100, client.trust + TRUST_REACTIVATION_GAIN);
    else if (client.status === "En revue") client.trust = Math.max(0, client.trust - TRUST_REVIEW_PENALTY);
    io.to("access:clients").emit("clients:update", gameState.clients);
    if (wasActive !== (client.status === "Actif")) {
      recomputeAum(gameState);
      io.to("access:finance").emit("finance:update", gameState.financeKPIs);
      io.to("game").emit("overview:kpis", gameState.financeKPIs);
      if (!wasActive && client.status === "Actif") maybeSpawnCrossSellDeal(io, gameState, client);
    }
    if (payload.status !== "En revue") checkEventResolution(io, gameState, client.id, player);
  });

  socket.on("clients:addNote", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    const text = (payload.text || "").trim();
    if (!player || !client || !text) return;

    client.notes.push({ authorPlayerId: player.id, authorName: player.fullName, ts: Date.now(), text });
    client.lastTouchedAt = Date.now();
    client.trust = Math.min(100, (client.trust == null ? DEFAULT_TRUST : client.trust) + TRUST_NOTE_GAIN);
    io.to("access:clients").emit("clients:update", gameState.clients);
    awardPoints(io, gameState, player, "clients_note");
    checkEventResolution(io, gameState, client.id, player);
  });

  socket.on("clients:toggleKyc", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    if (!client || !client.kycChecklist || !client.kycChecklist[payload.index]) return;

    const wasDone = client.kycChecklist[payload.index].done;
    client.kycChecklist[payload.index].done = !wasDone;
    io.to("access:clients").emit("clients:update", gameState.clients);
    if (!wasDone) awardPoints(io, gameState, player, "clients_kycDone");
  });
}

module.exports = {
  registerClientsHandlers, CLIENT_STATUSES, CLIENT_RISKS, KYC_ITEMS, addRandomClientNote, scheduleChurnRiskLoop, sweepChurnRisk, maybeSpawnCrossSellDeal, CHURN_THRESHOLD_MS, CROSS_SELL_AUM_THRESHOLD,
  DEFAULT_TRUST, TRUST_CHURN_PENALTY, TRUST_NOTE_GAIN, TRUST_REACTIVATION_GAIN, TRUST_REVIEW_PENALTY
};
