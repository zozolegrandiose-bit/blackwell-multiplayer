// Private Equity, LBO & Merchant Banking (Patch 31) -- the bank's own
// Principal Investments desk, wholly new (nothing like it existed before this
// patch). A player structures a leveraged buyout (equity + senior + mezzanine
// debt against a target's EBITDA), the deal holds for a compressed "3-5 ans"
// exit horizon (4-7 real minutes -- same time-compression convention as every
// other multi-year mechanic in this game, e.g. server/ipo.js), then
// auto-resolves at a rolled exit multiple. Debt paydown during the hold and
// carrying interest cost are both modeled as flat assumptions rather than
// tick-by-tick simulation (documented simplification, same spirit as the M&A
// page's simplified DCF slider from Patch 2) -- what matters is that the P&L
// swing at exit is real, risky, and can go either way, not a guaranteed win.
const { pushActivity, postTeamChat, recordBankPnl } = require("./gameState");
const { awardPoints, applyHealthDelta } = require("./scoring");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";

const EQUITY_PCT = 0.4;
const SENIOR_DEBT_PCT = 0.4;
const MEZZ_DEBT_PCT = 0.2;
const SENIOR_SPREAD_BPS = 250;
const MEZZ_SPREAD_BPS = 550;
const HOLD_YEARS_EQUIVALENT = 4; // flat "3-5 ans" assumption for the interest-cost calc
const DEBT_PAYDOWN_PCT = 0.3; // fraction of original debt assumed repaid from the target's own cash flow by exit
const HOLD_MIN_MS = 4 * 60 * 1000;
const HOLD_MAX_MS = 7 * 60 * 1000;
const EXIT_MULTIPLE_MIN = 0.75;
const EXIT_MULTIPLE_MAX = 1.45;
const MIN_ENTRY_MULTIPLE = 5;
const MAX_ENTRY_MULTIPLE = 14;
const SWEEP_MIN_MS = 15 * 1000;
const SWEEP_MAX_MS = 25 * 1000;
let nextDealId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function blendedRatePct(fedRateBps) {
  const seniorRate = (fedRateBps + SENIOR_SPREAD_BPS) / 100;
  const mezzRate = (fedRateBps + MEZZ_SPREAD_BPS) / 100;
  return round1((seniorRate * SENIOR_DEBT_PCT + mezzRate * MEZZ_DEBT_PCT) / (SENIOR_DEBT_PCT + MEZZ_DEBT_PCT));
}

// Pure-ish core (only touches the deal object, no io) so it's directly unit
// testable, same convention as server/centralBank.js's runMonetaryPolicyDecision.
function resolveExit(deal) {
  const exitMultiple = round1(deal.entryMultiple * (EXIT_MULTIPLE_MIN + Math.random() * (EXIT_MULTIPLE_MAX - EXIT_MULTIPLE_MIN)));
  const exitEnterpriseValue = round1(deal.ebitda * exitMultiple);
  const totalDebt = deal.seniorDebt + deal.mezzanineDebt;
  const debtRemaining = round1(totalDebt * (1 - DEBT_PAYDOWN_PCT));
  const interestCost = round1(totalDebt * (deal.blendedRatePct / 100) * HOLD_YEARS_EQUIVALENT);
  const equityValueAtExit = round1(Math.max(0, exitEnterpriseValue - debtRemaining));
  const realizedGain = round1(equityValueAtExit - deal.equityContribution - interestCost);

  deal.stage = "Clôturé";
  deal.exitMultiple = exitMultiple;
  deal.exitEnterpriseValue = exitEnterpriseValue;
  deal.equityValueAtExit = equityValueAtExit;
  deal.interestCost = interestCost;
  deal.realizedGain = realizedGain;
  deal.exitedAt = Date.now();
  return deal;
}

function registerPrivateEquityHandlers(io, socket, gameState) {
  socket.on("pe:structureDeal", payload => {
    if (!requireAccess(socket, "privateEquity")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const targetName = (payload.targetName || "").trim();
    const sector = (payload.sector || "").trim() || "Diversifié";
    const enterpriseValue = Number(payload.enterpriseValue);
    const entryMultiple = Number(payload.entryMultiple);

    if (!targetName) {
      socket.emit("pe:structureDeal:rejected", { reason: "Le nom de la cible est requis." });
      return;
    }
    if (!enterpriseValue || enterpriseValue <= 0) {
      socket.emit("pe:structureDeal:rejected", { reason: "La valeur d'entreprise (EV) doit être positive." });
      return;
    }
    if (!entryMultiple || entryMultiple < MIN_ENTRY_MULTIPLE || entryMultiple > MAX_ENTRY_MULTIPLE) {
      socket.emit("pe:structureDeal:rejected", { reason: "Le multiple d'entrée doit être compris entre " + MIN_ENTRY_MULTIPLE + "x et " + MAX_ENTRY_MULTIPLE + "x EBITDA." });
      return;
    }

    const pe = gameState.privateEquity;
    const equityContribution = round1(enterpriseValue * EQUITY_PCT);
    if (equityContribution > pe.fundCapital) {
      socket.emit("pe:structureDeal:rejected", { reason: "Capital du fonds Principal Investments insuffisant — il reste " + round1(pe.fundCapital) + " M$ (ticket équity requis : " + equityContribution + " M$)." });
      return;
    }

    const ebitda = round1(enterpriseValue / entryMultiple);
    const seniorDebt = round1(enterpriseValue * SENIOR_DEBT_PCT);
    const mezzanineDebt = round1(enterpriseValue * MEZZ_DEBT_PCT);
    const rate = blendedRatePct(gameState.centralBank.fedRateBps);

    pe.fundCapital = round1(pe.fundCapital - equityContribution);

    const deal = {
      id: "lbo" + (nextDealId++),
      targetName,
      sector,
      enterpriseValue,
      entryMultiple,
      ebitda,
      equityContribution,
      seniorDebt,
      mezzanineDebt,
      blendedRatePct: rate,
      stage: "Détenu",
      openedByPlayerId: player.id,
      openedByName: player.fullName,
      heldSince: Date.now(),
      exitAt: Date.now() + randomDelay(HOLD_MIN_MS, HOLD_MAX_MS),
      exitMultiple: null,
      realizedGain: null
    };
    pe.deals.unshift(deal);

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "privateEquity",
      text: player.fullName + " a structuré un LBO sur « " + targetName + " » (EV " + enterpriseValue + " M$, ticket équity " + equityContribution + " M$)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:privateEquity").emit("privateEquity:update", pe);
    awardPoints(io, gameState, player, "pe_structureDeal");
  });
}

// Resolves each held LBO once its exit horizon elapses. Exported for direct
// unit testing, same convention as every other sweep function in this codebase.
function sweepPrivateEquityExits(io, gameState) {
  const now = Date.now();
  const pe = gameState.privateEquity;
  const due = pe.deals.filter(d => d.stage === "Détenu" && now >= d.exitAt);
  if (!due.length) return;

  due.forEach(deal => {
    resolveExit(deal);
    pe.fundCapital = round1(pe.fundCapital + deal.equityContribution + deal.realizedGain);
    pe.realizedPnL = round1(pe.realizedPnL + deal.realizedGain);

    const kpis = gameState.financeKPIs;
    kpis.netIncome = round1(kpis.netIncome + deal.realizedGain);
    kpis.revenue = round1(kpis.revenue + Math.max(0, deal.realizedGain));
    kpis.history.unshift({ ts: now, field: "netIncome", oldValue: round1(kpis.netIncome - deal.realizedGain), newValue: kpis.netIncome, byPlayerId: null, byName: "Exit LBO — " + deal.targetName });
    if (kpis.history.length > 100) kpis.history.length = 100;
    recordBankPnl(gameState, PLAYER_BANK_NAME, deal.realizedGain, 0);

    const win = deal.realizedGain >= 0;
    const actor = gameState.players.find(p => p.id === deal.openedByPlayerId);
    if (actor) awardPoints(io, gameState, actor, win ? "pe_exitProfit" : "pe_exitLoss");
    if (!win) applyHealthDelta(io, gameState, -3);

    postTeamChat(gameState, {
      authorName: "IA — Principal Investments",
      text: (win ? "💰 " : "📉 ") + "Exit LBO sur « " + deal.targetName + " » (" + deal.openedByName + ") — multiple " + deal.entryMultiple + "x → " + deal.exitMultiple + "x, plus-value " + (deal.realizedGain >= 0 ? "+" : "") + deal.realizedGain + " M$.",
      tone: win ? "congrats" : "alert"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    pushActivity(gameState, {
      actorPlayerId: null,
      page: "privateEquity",
      text: "🏦 Exit LBO clôturé sur « " + deal.targetName + " » — " + (deal.realizedGain >= 0 ? "+" : "") + deal.realizedGain + " M$."
    });
  });

  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:privateEquity").emit("privateEquity:update", pe);
  io.to("access:finance").emit("finance:update", gameState.financeKPIs);
  io.to("game").emit("overview:kpis", gameState.financeKPIs);
  io.to("game").emit("leagueTable:update", gameState.leagueTable);
}

function startPrivateEquityLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepPrivateEquityExits(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Private Equity & LBO activé (exits résolus automatiquement à échéance).");
}

module.exports = {
  registerPrivateEquityHandlers, startPrivateEquityLoop, sweepPrivateEquityExits, resolveExit, blendedRatePct,
  EQUITY_PCT, SENIOR_DEBT_PCT, MEZZ_DEBT_PCT, MIN_ENTRY_MULTIPLE, MAX_ENTRY_MULTIPLE, DEBT_PAYDOWN_PCT, HOLD_YEARS_EQUIVALENT
};
