const { pushActivity, recordBankPnl } = require("../gameState");
const { awardPoints } = require("../scoring");
const { getDifficultyPreset } = require("../difficulty");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";

const TICK_MIN_MS = 20 * 1000;
const TICK_MAX_MS = 35 * 1000;
const MAX_HISTORY = 60;
let nextPositionId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function findInstrument(gameState, instrumentId) {
  return gameState.markets.instruments.find(i => i.id === instrumentId);
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
  console.log("Marché de trading activé (variation des prix toutes les 20-35s).");
}

function registerMarketsHandlers(io, socket, gameState) {
  socket.on("markets:buy", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
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
}

module.exports = { registerMarketsHandlers, startMarketsLoop, tickPrices };
