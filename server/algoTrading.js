// Algorithmic & HFT Trading (Patch 23) -- Traders configure and launch bots
// (instrument + strategy + size per trade) that then execute autonomously on
// their own schedule. A separate lever -- "infrastructure de latence", gated to
// HR/IT/Board Of Directors per the request ("DRH / IT") -- shortens that
// schedule in tiers, a direct, real speed-up rather than a cosmetic upgrade.
const { pushActivity } = require("./gameState");

const BASE_TICK_MIN_MS = 30 * 1000;
const BASE_TICK_MAX_MS = 45 * 1000;
const STRATEGIES = ["momentum", "meanReversion"];
const MIN_SIZE = 10;
const MAX_SIZE = 200;
const MEAN_REVERSION_WINDOW = 8;

// Each tier halves-ish the execution interval; cost drawn from netIncome, same
// convention as every other "invest in X" lever in this game (e.g. globalBank
// capital transfers, Central Bank ripple).
const LATENCY_TIERS = [
  { tier: 0, label: "Standard", cost: 0, intervalMultiplier: 1 },
  { tier: 1, label: "Colocation", cost: 150, intervalMultiplier: 0.7 },
  { tier: 2, label: "Fibre dédiée", cost: 400, intervalMultiplier: 0.45 },
  { tier: 3, label: "Micro-ondes propriétaire", cost: 900, intervalMultiplier: 0.25 }
];

let nextBotId = 1;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function canManageLatency(player) {
  return !!player && (player.dept === "Board Of Directors" || player.dept === "Ressources Humaines" || player.dept === "Sécurité Informatique");
}

function currentTier(gameState) {
  return LATENCY_TIERS[gameState.algoInfrastructure.latencyTier] || LATENCY_TIERS[0];
}

function findInstrument(gameState, id) {
  return gameState.markets.instruments.find(i => i.id === id);
}

function broadcastAlgo(io, gameState) {
  io.to("access:markets").emit("algoTrading:update", { bots: gameState.algoBots, infrastructure: gameState.algoInfrastructure });
}

function registerAlgoTradingHandlers(io, socket, gameState) {
  socket.on("algo:createBot", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const instrument = findInstrument(gameState, payload.instrumentId);
    const strategy = STRATEGIES.includes(payload.strategy) ? payload.strategy : "momentum";
    const sizePerTrade = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number(payload.sizePerTrade) || MIN_SIZE));
    if (!instrument) return;
    const name = (payload.name || "").trim().slice(0, 40) || ("Bot " + instrument.name);

    const bot = {
      id: "bot" + (nextBotId++),
      name, instrumentId: instrument.id, instrumentName: instrument.name, strategy, sizePerTrade,
      active: true, ownerPlayerId: player.id, ownerName: player.fullName,
      createdAt: Date.now(), tradeCount: 0
    };
    gameState.algoBots.unshift(bot);
    if (gameState.algoBots.length > 20) gameState.algoBots.length = 20;

    pushActivity(gameState, { actorPlayerId: player.id, page: "markets", text: player.fullName + " lance le bot « " + name + " » (" + strategy + ", " + sizePerTrade + " M$/trade) sur " + instrument.name + "." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastAlgo(io, gameState);
  });

  socket.on("algo:toggleBot", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const bot = gameState.algoBots.find(b => b.id === payload.botId);
    if (!player || !bot) return;
    bot.active = !bot.active;
    pushActivity(gameState, { actorPlayerId: player.id, page: "markets", text: player.fullName + (bot.active ? " relance" : " met en pause") + " le bot « " + bot.name + " »." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastAlgo(io, gameState);
  });

  socket.on("algo:investLatency", () => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!canManageLatency(player)) return;
    const infra = gameState.algoInfrastructure;
    const nextTier = LATENCY_TIERS[infra.latencyTier + 1];
    if (!nextTier) return;
    const kpis = gameState.financeKPIs;
    if (kpis.netIncome < nextTier.cost) {
      socket.emit("algo:investLatency:rejected", { reason: "Résultat net insuffisant (" + nextTier.cost + " M$ requis)." });
      return;
    }

    const oldNetIncome = kpis.netIncome;
    kpis.netIncome = round1(kpis.netIncome - nextTier.cost);
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: player.id, byName: "Infrastructure latence — " + nextTier.label });
    if (kpis.history.length > 100) kpis.history.length = 100;

    infra.latencyTier = nextTier.tier;
    infra.investedTotal = round1(infra.investedTotal + nextTier.cost);

    pushActivity(gameState, { actorPlayerId: player.id, page: "markets", text: player.fullName + " investit " + nextTier.cost + " M$ dans l'infrastructure de latence (" + nextTier.label + ") — bots plus rapides." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
    broadcastAlgo(io, gameState);
  });
}

// Pure-ish: one decision for one bot given its instrument's price history --
// directly unit-testable, same convention as centralBank.js/regulatoryStressTest.js.
function decideBotAction(bot, instrument) {
  const history = instrument.history;
  if (bot.strategy === "momentum") {
    if (history.length < 3) return null;
    const trendingUp = history[history.length - 1] > history[history.length - 2] && history[history.length - 2] > history[history.length - 3];
    const trendingDown = history[history.length - 1] < history[history.length - 2] && history[history.length - 2] < history[history.length - 3];
    if (trendingUp) return "long";
    if (trendingDown) return "short";
    return null;
  }
  // meanReversion: bet against a large deviation from the recent average.
  const window = history.slice(-MEAN_REVERSION_WINDOW);
  if (window.length < 4) return null;
  const avg = window.reduce((s, v) => s + v, 0) / window.length;
  const deviation = (instrument.price - avg) / avg;
  if (deviation <= -0.02) return "long";
  if (deviation >= 0.02) return "short";
  return null;
}

function runBotTick(io, gameState, bot) {
  if (!bot.active) return;
  const instrument = findInstrument(gameState, bot.instrumentId);
  if (!instrument) return;
  const side = decideBotAction(bot, instrument);
  if (!side) return;
  const markets = gameState.markets;
  if (bot.sizePerTrade > markets.cash) return;

  markets.cash = round2(markets.cash - bot.sizePerTrade);
  markets.positions.push({
    id: "pos-bot-" + Date.now() + Math.round(Math.random() * 1000),
    instrumentId: instrument.id, notional: bot.sizePerTrade, side, entryPrice: instrument.price,
    openedByPlayerId: bot.ownerPlayerId, openedByName: bot.name + " (Bot IA de " + bot.ownerName + ")", openedAt: Date.now()
  });
  bot.tradeCount += 1;

  pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "🤖 Bot « " + bot.name + " » ouvre une position " + (side === "short" ? "courte" : "longue") + " de " + bot.sizePerTrade + " M$ sur " + instrument.name + " (" + bot.strategy + ")." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:markets").emit("markets:update", markets);
}

function startAlgoTradingLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) {
      const multiplier = currentTier(gameState).intervalMultiplier;
      gameState.algoBots.forEach(bot => runBotTick(io, gameState, bot));
      setTimeout(tick, randomDelay(BASE_TICK_MIN_MS, BASE_TICK_MAX_MS) * multiplier);
      return;
    }
    setTimeout(tick, randomDelay(BASE_TICK_MIN_MS, BASE_TICK_MAX_MS));
  }
  setTimeout(tick, randomDelay(BASE_TICK_MIN_MS, BASE_TICK_MAX_MS));
  console.log("Algorithmic & HFT Trading activé (bots configurables, infrastructure de latence).");
}

module.exports = {
  registerAlgoTradingHandlers, startAlgoTradingLoop, decideBotAction, runBotTick, canManageLatency, currentTier,
  LATENCY_TIERS, STRATEGIES, MIN_SIZE, MAX_SIZE
};
