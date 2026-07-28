const { pushActivity, postTeamChat, recordBankPnl } = require("../gameState");
const { awardPoints, applyHealthDelta } = require("../scoring");
const { getDifficultyPreset } = require("../difficulty");
const { createUrgentComplianceItem } = require("./compliance");
const { adjustSatisfaction } = require("../satisfaction");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";

const TICK_MIN_MS = 20 * 1000;
const TICK_MAX_MS = 35 * 1000;
const MAX_HISTORY = 60;
let nextPositionId = 1;

// Information Privilégiée -- a Trader can already see maDeals not yet public
// (deal.stage !== "Clôturé") via the shared snapshot (Patch 11). Front-running the
// announcement is a real edge (better than any ordinary trade) but a real risk:
// a flat, generous gain if it goes uncaught, a real fine + health hit + score
// penalty + a public compliance alert if Surveillance catches it.
const INSIDER_GAIN_PCT = 0.15;
const INSIDER_CATCH_PROBABILITY = 0.35;
const INSIDER_FINE_MULTIPLIER = 1.5;

// Dark Pool -- large anonymous block orders, distinct from markets:buy/sell (which
// trade openly against the visible instrument price). Real dark pools exist to move
// big size without moving the public tape; here that's modeled as a short window
// (a few seconds) during which a rival bank may anonymously take the other side
// OTC. A match gives Blackwell a small guaranteed edge (avoided market impact) and
// books the counterparty bank a smaller profit of its own for providing the
// liquidity -- no match, no cost, just a missed opportunity.
const DARK_POOL_MIN_NOTIONAL = 300;
const DARK_POOL_WINDOW_MS = 8 * 1000;
const DARK_POOL_SWEEP_MIN_MS = 2 * 1000;
const DARK_POOL_SWEEP_MAX_MS = 3 * 1000;
const DARK_POOL_MATCH_PROBABILITY = 0.55;
const DARK_POOL_GAIN_PCT = 0.01;
const DARK_POOL_RIVAL_PROFIT_PCT = 0.004;
const MAX_DARK_POOL_LOG = 20;
let nextDarkPoolOrderId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function findInstrument(gameState, instrumentId) {
  return gameState.markets.instruments.find(i => i.id === instrumentId);
}

// Global Ticker Tape -- a lightweight, universally-broadcast subset of the
// instrument list (id/name/price/category only, no cash/positions/P&L) so every
// connected player sees the header ticker regardless of whether they hold
// "markets" access, without leaking the full (gated) gameState.markets object.
function publicInstrumentTicker(gameState) {
  return gameState.markets.instruments.map(i => ({ id: i.id, name: i.name, price: i.price, category: i.category }));
}

// Random walk per instrument, scaled by its own volatility — self-rescheduling loop,
// same convention as every other timed system in this game (tasks/events/strategy).
function tickPrices(io, gameState) {
  gameState.markets.instruments.forEach(instrument => {
    const drift = (Math.random() * 2 - 1) * instrument.volatility;
    instrument.price = Math.max(1, round2(instrument.price * (1 + drift)));
    instrument.history.push(instrument.price);
    if (instrument.history.length > MAX_HISTORY) instrument.history.shift();
  });
  io.to("access:markets").emit("markets:update", gameState.markets);
  io.to("game").emit("globalTicker:update", publicInstrumentTicker(gameState));
}

function scheduleMarketTickLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) tickPrices(io, gameState);
    setTimeout(tick, (TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS)) * getDifficultyPreset(gameState.difficulty).eventFreq);
  }
  setTimeout(tick, TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS));
}

function startMarketsLoop(io, gameState) {
  if (process.env.MARKETS_ENABLED === "false") {
    console.log("Marché de trading désactivé (MARKETS_ENABLED=false).");
    return;
  }
  scheduleMarketTickLoop(io, gameState);
  scheduleDarkPoolSweepLoop(io, gameState);
  console.log("Marché de trading activé (variation des prix toutes les 20-35s).");
}

function registerMarketsHandlers(io, socket, gameState) {
  socket.on("markets:buy", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    if (gameState.repoStatus.blocked) {
      socket.emit("markets:buy:rejected", { reason: "Marché interbancaire fermé — les lignes de crédit Repo sont coupées, impossible d'ouvrir une nouvelle position." });
      return;
    }
    if (player.tradingFrozen) {
      socket.emit("markets:buy:rejected", { reason: "Kill Switch actif — le Risk Manager vous a interdit de trader temporairement." });
      return;
    }
    const instrument = findInstrument(gameState, payload.instrumentId);
    const notional = Number(payload.notional);
    if (!instrument || Number.isNaN(notional) || notional <= 0) return;

    const markets = gameState.markets;
    if (notional > markets.cash) {
      socket.emit("markets:buy:rejected", { reason: "Capital de trading insuffisant — il reste " + round2(markets.cash) + " M$." });
      return;
    }

    markets.cash = round2(markets.cash - notional);
    const position = {
      id: "pos" + (nextPositionId++),
      instrumentId: instrument.id,
      notional,
      entryPrice: instrument.price,
      openedByPlayerId: player.id,
      openedByName: player.fullName,
      openedAt: Date.now()
    };
    markets.positions.push(position);

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "markets",
      text: player.fullName + " a ouvert une position de " + notional + " M$ sur " + instrument.name + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:markets").emit("markets:update", markets);
    awardPoints(io, gameState, player, "markets_open");
  });

  socket.on("markets:sell", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const markets = gameState.markets;
    const idx = markets.positions.findIndex(p => p.id === payload.positionId);
    if (idx === -1) return;
    const position = markets.positions[idx];
    const instrument = findInstrument(gameState, position.instrumentId);
    if (!instrument) return;

    const pnl = round2(position.notional * (instrument.price / position.entryPrice - 1));
    const proceeds = round2(position.notional + pnl);
    markets.cash = round2(markets.cash + proceeds);
    markets.realizedPnL = round2(markets.realizedPnL + pnl);
    markets.positions.splice(idx, 1);
    markets.tradeLog.unshift({ instrumentName: instrument.name, notional: position.notional, pnl, closedByName: player.fullName, ts: Date.now() });
    if (markets.tradeLog.length > 30) markets.tradeLog.length = 30;

    const kpis = gameState.financeKPIs;
    kpis.netIncome = round2(kpis.netIncome + pnl);
    kpis.revenue = round2(kpis.revenue + Math.max(0, pnl));
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: round2(kpis.netIncome - pnl), newValue: kpis.netIncome, byPlayerId: null, byName: "Clôture position — " + instrument.name });
    if (kpis.history.length > 100) kpis.history.length = 100;

    recordBankPnl(gameState, PLAYER_BANK_NAME, pnl, 0);
    io.to("game").emit("leagueTable:update", gameState.leagueTable);

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "markets",
      text: player.fullName + " a clôturé une position sur " + instrument.name + " (" + (pnl >= 0 ? "+" : "") + pnl + " M$)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:markets").emit("markets:update", markets);
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
    awardPoints(io, gameState, player, "markets_trade");
  });

  socket.on("markets:insiderTrade", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    const notional = Number(payload.notional);
    if (!deal || deal.stage === "Clôturé" || Number.isNaN(notional) || notional <= 0) return;

    const markets = gameState.markets;
    if (notional > markets.cash) {
      socket.emit("markets:buy:rejected", { reason: "Capital de trading insuffisant — il reste " + round2(markets.cash) + " M$." });
      return;
    }

    const caught = Math.random() < INSIDER_CATCH_PROBABILITY;

    if (caught) {
      const fine = round2(notional * INSIDER_FINE_MULTIPLIER);
      markets.cash = round2(Math.max(0, markets.cash - fine));
      applyHealthDelta(io, gameState, -3);
      awardPoints(io, gameState, player, "markets_insiderCaught");
      adjustSatisfaction(io, gameState, player, -15);
      createUrgentComplianceItem(io, gameState, "Délit d'initié détecté : " + player.fullName + " a négocié en amont de l'annonce de « " + deal.name + " » — amende de " + fine + " M$ appliquée.", player.id, player.fullName);
      postTeamChat(gameState, {
        authorName: "IA — Contrôle des risques",
        text: "🚨 Contrôle Compliance : " + player.fullName + " a été pris en flagrant délit d'initié sur « " + deal.name + " » — amende de " + fine + " M$.",
        tone: "alert"
      });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
      pushActivity(gameState, {
        actorPlayerId: player.id,
        page: "markets",
        text: "🚨 " + player.fullName + " sanctionné pour délit d'initié sur « " + deal.name + " » (amende " + fine + " M$)."
      });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
      socket.emit("markets:insiderResult", { caught: true, fine });
    } else {
      const gain = round2(notional * INSIDER_GAIN_PCT);
      markets.cash = round2(markets.cash + gain);
      markets.realizedPnL = round2(markets.realizedPnL + gain);
      markets.tradeLog.unshift({ instrumentName: "Information privilégiée — " + deal.name, notional, pnl: gain, closedByName: player.fullName, ts: Date.now() });
      if (markets.tradeLog.length > 30) markets.tradeLog.length = 30;

      const kpis = gameState.financeKPIs;
      kpis.netIncome = round2(kpis.netIncome + gain);
      kpis.revenue = round2(kpis.revenue + gain);
      kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: round2(kpis.netIncome - gain), newValue: kpis.netIncome, byPlayerId: null, byName: "Position anticipée — " + deal.name });
      if (kpis.history.length > 100) kpis.history.length = 100;
      recordBankPnl(gameState, PLAYER_BANK_NAME, gain, 0);

      io.to("access:finance").emit("finance:update", kpis);
      io.to("game").emit("overview:kpis", kpis);
      io.to("game").emit("leagueTable:update", gameState.leagueTable);
      socket.emit("markets:insiderResult", { caught: false, gain });
    }

    io.to("access:markets").emit("markets:update", markets);
  });

  socket.on("markets:placeDarkPoolOrder", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const instrument = findInstrument(gameState, payload.instrumentId);
    const notional = Number(payload.notional);
    if (!instrument || !["buy", "sell"].includes(payload.side) || Number.isNaN(notional)) return;
    if (notional < DARK_POOL_MIN_NOTIONAL) {
      socket.emit("markets:darkPoolOrder:rejected", { reason: "Le Dark Pool est réservé aux ordres de gros volume (≥ " + DARK_POOL_MIN_NOTIONAL + " M$)." });
      return;
    }

    const order = {
      id: "dp" + (nextDarkPoolOrderId++),
      side: payload.side,
      instrumentId: instrument.id,
      instrumentName: instrument.name,
      notional: round2(notional),
      placedByPlayerId: player.id,
      placedByName: player.fullName,
      status: "pending",
      placedAt: Date.now(),
      deadline: Date.now() + DARK_POOL_WINDOW_MS,
      matchedBank: null,
      gain: null
    };
    gameState.markets.darkPoolOrders.unshift(order);
    if (gameState.markets.darkPoolOrders.length > MAX_DARK_POOL_LOG) gameState.markets.darkPoolOrders.length = MAX_DARK_POOL_LOG;

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "markets",
      text: player.fullName + " a soumis un ordre Dark Pool anonyme (" + (order.side === "buy" ? "achat" : "vente") + ", " + order.notional + " M$) sur " + instrument.name + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:markets").emit("markets:update", gameState.markets);
  });
}

// Resolves each pending dark pool order once its (short) response window elapses --
// a rival bank either takes the other side OTC (a match) or the opportunity simply
// expires unfilled. Exported for direct unit testing, same convention as every other
// sweep function in this codebase.
function sweepDarkPoolOrders(io, gameState) {
  const now = Date.now();
  const markets = gameState.markets;
  let changed = false;

  markets.darkPoolOrders.forEach(order => {
    if (order.status !== "pending" || now < order.deadline) return;
    changed = true;
    const matched = Math.random() < DARK_POOL_MATCH_PROBABILITY;

    if (matched) {
      const rivalBanks = Object.keys(gameState.leagueTable).filter(name => name !== PLAYER_BANK_NAME);
      const matchedBank = rivalBanks[Math.floor(Math.random() * rivalBanks.length)];
      const gain = round2(order.notional * DARK_POOL_GAIN_PCT);
      order.status = "matched";
      order.matchedBank = matchedBank;
      order.gain = gain;

      markets.cash = round2(markets.cash + gain);
      markets.realizedPnL = round2(markets.realizedPnL + gain);
      markets.tradeLog.unshift({ instrumentName: "Dark Pool — " + order.instrumentName, notional: order.notional, pnl: gain, closedByName: order.placedByName, ts: now });
      if (markets.tradeLog.length > 30) markets.tradeLog.length = 30;

      const kpis = gameState.financeKPIs;
      kpis.netIncome = round2(kpis.netIncome + gain);
      kpis.revenue = round2(kpis.revenue + gain);
      kpis.history.unshift({ ts: now, field: "netIncome", oldValue: round2(kpis.netIncome - gain), newValue: kpis.netIncome, byPlayerId: null, byName: "Dark Pool — " + order.instrumentName });
      if (kpis.history.length > 100) kpis.history.length = 100;
      recordBankPnl(gameState, PLAYER_BANK_NAME, gain, 0);

      const rivalProfit = round2(order.notional * DARK_POOL_RIVAL_PROFIT_PCT);
      recordBankPnl(gameState, matchedBank, rivalProfit, 0);

      io.to("access:finance").emit("finance:update", kpis);
      io.to("game").emit("overview:kpis", kpis);
      io.to("game").emit("leagueTable:update", gameState.leagueTable);
      pushActivity(gameState, {
        actorPlayerId: null,
        page: "markets",
        text: "🌑 Ordre Dark Pool de " + order.placedByName + " (" + order.notional + " M$, " + order.instrumentName + ") exécuté OTC avec " + matchedBank + " — +" + gain + " M$."
      });
    } else {
      order.status = "expired";
      pushActivity(gameState, {
        actorPlayerId: null,
        page: "markets",
        text: "🌑 Ordre Dark Pool de " + order.placedByName + " (" + order.notional + " M$, " + order.instrumentName + ") expiré sans contrepartie."
      });
    }
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  if (changed) io.to("access:markets").emit("markets:update", markets);
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function scheduleDarkPoolSweepLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepDarkPoolOrders(io, gameState);
    setTimeout(tick, randomDelay(DARK_POOL_SWEEP_MIN_MS, DARK_POOL_SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(DARK_POOL_SWEEP_MIN_MS, DARK_POOL_SWEEP_MAX_MS));
}

module.exports = {
  registerMarketsHandlers, startMarketsLoop, tickPrices, sweepDarkPoolOrders, publicInstrumentTicker,
  INSIDER_GAIN_PCT, INSIDER_CATCH_PROBABILITY, INSIDER_FINE_MULTIPLIER,
  DARK_POOL_MIN_NOTIONAL, DARK_POOL_WINDOW_MS, DARK_POOL_MATCH_PROBABILITY, DARK_POOL_GAIN_PCT
};
