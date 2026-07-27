// "Moteur d'Événements Vivants" — a global, page-agnostic feed of claimable action
// cards, distinct from server/events.js's page-scoped crisis/opportunity events.
// Anyone connected (any department, any page) can claim a card the instant it
// appears; if nobody does, the ambient AI eventually grabs the positive ones —
// the risk-type card is deliberately never AI-claimed, so ignoring it has a real
// consequence, mirroring how server/events.js's crises only resolve through a human.
const { pushActivity } = require("./gameState");
const { applyHealthDelta, awardPoints } = require("./scoring");
const { createBonusDeal } = require("./handlers/ma");
const { adjustMorale } = require("./handlers/hr");
const { getDifficultyPreset } = require("./difficulty");

const SPAWN_MIN_MS = 60 * 1000;
const SPAWN_MAX_MS = 180 * 1000;
const SWEEP_MIN_MS = 10 * 1000;
const SWEEP_MAX_MS = 15 * 1000;
const CLAIM_DEADLINE_MS = 3 * 60 * 1000;
const AI_CLAIM_DELAY_MS = 75 * 1000;
const HIRE_SIGNING_COST = 15;

const AI_ACTOR_NAME = "IA — Veille de marché";
let nextCardId = 1;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

const CARD_TYPES = [
  {
    id: "market_funding",
    icon: "📈",
    label: "Alerte Marché",
    text: "Un client du secteur Énergie veut lever 500 M$ en urgence suite à une acquisition.",
    aiClaimable: true,
    resolve(io, gameState) {
      const deal = createBonusDeal(io, gameState, { name: "⚡ Levée urgente — secteur Énergie", valuation: 500 });
      return "Nouveau mandat M&A créé : « " + deal.name + " » (500 M$) — visible sur la page M&A.";
    }
  },
  {
    id: "hr_poach",
    icon: "🎯",
    label: "Alerte RH",
    text: "Le Head of Trading d'une banque concurrente est mécontent — opportunité de le débaucher.",
    aiClaimable: true,
    resolve(io, gameState) {
      gameState.hr.headcountNPC += 1;
      gameState.financeKPIs.netIncome = round1(gameState.financeKPIs.netIncome - HIRE_SIGNING_COST);
      adjustMorale(gameState, 5);
      io.to("access:finance").emit("finance:update", gameState.financeKPIs);
      io.to("game").emit("overview:kpis", gameState.financeKPIs);
      io.to("access:hr").emit("hr:update", gameState.hr);
      return "Débauchage réussi — prime de signature de " + HIRE_SIGNING_COST + " M$, moral en hausse.";
    }
  },
  {
    id: "var_breach",
    icon: "⚠️",
    label: "Alerte Risque",
    text: "Une position du desk Trading dépasse la VaR autorisée suite à une annonce de la BCE.",
    aiClaimable: false,
    isEligible(gameState) {
      return gameState.markets.positions.length > 0;
    },
    resolve(io, gameState) {
      const positions = gameState.markets.positions;
      if (!positions.length) return "Aucune position à réduire — alerte levée d'elle-même.";
      const biggest = positions.reduce((a, b) => (b.notional > a.notional ? b : a));
      const instrument = gameState.markets.instruments.find(i => i.id === biggest.instrumentId);
      const currentPrice = instrument ? instrument.price : biggest.entryPrice;
      const pnl = round1(biggest.notional * (currentPrice / biggest.entryPrice - 1));
      gameState.markets.cash = round1(gameState.markets.cash + biggest.notional + pnl);
      gameState.markets.realizedPnL = round1(gameState.markets.realizedPnL + pnl);
      gameState.markets.positions = gameState.markets.positions.filter(p => p.id !== biggest.id);
      gameState.markets.tradeLog.unshift({ instrumentName: instrument ? instrument.name : "—", notional: biggest.notional, pnl, closedByName: "Réduction de risque", ts: Date.now() });
      io.to("access:markets").emit("markets:update", gameState.markets);
      applyHealthDelta(io, gameState, 3);
      return "Position réduite à temps (" + (pnl >= 0 ? "+" : "") + pnl + " M$) — santé de la banque +3.";
    },
    onExpire(io, gameState) {
      applyHealthDelta(io, gameState, -8);
      return "Position non réduite à temps — la VaR a réellement été dépassée, santé de la banque -8.";
    }
  }
];

function eligibleTypes(gameState) {
  return CARD_TYPES.filter(t => !t.isEligible || t.isEligible(gameState));
}

function broadcastLiveEvents(io, gameState) {
  io.to("game").emit("liveEvents:update", gameState.liveEvents);
}

function spawnCard(io, gameState) {
  const pool = eligibleTypes(gameState);
  if (!pool.length) return;
  const type = pool[Math.floor(Math.random() * pool.length)];
  const card = {
    id: "live" + (nextCardId++),
    typeId: type.id,
    icon: type.icon,
    label: type.label,
    text: type.text,
    createdAt: Date.now(),
    expiresAt: Date.now() + CLAIM_DEADLINE_MS,
    claimedByName: null
  };
  gameState.liveEvents.push(card);
  pushActivity(gameState, { actorPlayerId: null, page: "overview", text: type.icon + " " + type.label + " — " + type.text });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastLiveEvents(io, gameState);
}

function resolveCard(io, gameState, card, claimerName, actor) {
  const type = CARD_TYPES.find(t => t.id === card.typeId);
  const outcome = type.resolve(io, gameState);
  gameState.liveEvents = gameState.liveEvents.filter(c => c.id !== card.id);
  pushActivity(gameState, { actorPlayerId: actor ? actor.id : null, page: "overview", text: claimerName + " s'est saisi de « " + card.label + " » — " + outcome });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastLiveEvents(io, gameState);
  if (actor) awardPoints(io, gameState, actor, "live_event_claimed");
}

function sweepLiveEvents(io, gameState) {
  const now = Date.now();
  gameState.liveEvents.slice().forEach(card => {
    if (card.claimedByName) return;
    const type = CARD_TYPES.find(t => t.id === card.typeId);
    if (now >= card.expiresAt) {
      gameState.liveEvents = gameState.liveEvents.filter(c => c.id !== card.id);
      const outcome = type.onExpire ? type.onExpire(io, gameState) : null;
      pushActivity(gameState, { actorPlayerId: null, page: "overview", text: "⌛ « " + card.label + " » a expiré sans être traitée." + (outcome ? " " + outcome : "") });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
      broadcastLiveEvents(io, gameState);
    } else if (type.aiClaimable && now - card.createdAt >= AI_CLAIM_DELAY_MS) {
      resolveCard(io, gameState, card, AI_ACTOR_NAME, null);
    }
  });
}

function scheduleSpawnLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) spawnCard(io, gameState);
    setTimeout(tick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS) * getDifficultyPreset(gameState.difficulty).eventFreq);
  }
  setTimeout(tick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
}

function scheduleSweepLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepLiveEvents(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
}

function startLiveEventsLoop(io, gameState) {
  if (process.env.LIVE_EVENTS_ENABLED === "false") {
    console.log("Moteur d'événements vivants désactivé (LIVE_EVENTS_ENABLED=false).");
    return;
  }
  scheduleSpawnLoop(io, gameState);
  scheduleSweepLoop(io, gameState);
  console.log("Moteur d'événements vivants activé (apparition 1-3 min).");
}

function registerLiveEventsHandlers(io, socket, gameState) {
  socket.on("liveEvents:claim", payload => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const card = gameState.liveEvents.find(c => c.id === payload.cardId);
    if (!card || card.claimedByName) return;
    card.claimedByName = player.fullName; // synchronous claim lock — no await between check and set
    resolveCard(io, gameState, card, player.fullName, player);
  });
}

module.exports = { registerLiveEventsHandlers, startLiveEventsLoop, CARD_TYPES, spawnCard, sweepLiveEvents, resolveCard, CLAIM_DEADLINE_MS, AI_CLAIM_DELAY_MS };
