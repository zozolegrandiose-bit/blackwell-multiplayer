// IPO ("Entry in Stock Market") -- banks compete for the underwriting mandate of a
// client company going public. Distinct from the M&A pipeline's own occasional IPO
// flavor deals: this is a real head-to-head competition against rival banks, with a
// genuine skill step (pricing) that determines whether the listing pops or flops.
const { pushActivity, postTeamChat, recordBankPnl } = require("./gameState");
const { awardPoints } = require("./scoring");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const IPO_SPAWN_MIN_MS = 5 * 60 * 1000;
const IPO_SPAWN_MAX_MS = 8 * 60 * 1000;
const SWEEP_MIN_MS = 3 * 1000;
const SWEEP_MAX_MS = 5 * 1000;
const BIDDING_WINDOW_MS = 45 * 1000;
const BOOKBUILDING_WINDOW_MS = 45 * 1000;
const IPO_FEE_PCT = 0.035;
const OFFERING_SIZE_PCT = 0.25;
const BASE_WIN_PROBABILITY = 0.3;
const PITCH_WIN_BONUS = 0.4;
const AI_INTENTION_MIN_MS = 5 * 1000;
const AI_INTENTION_MAX_MS = 10 * 1000;

const COMPANY_POOL = [
  { name: "Solstice Renewable Energy", industry: "Énergies renouvelables" },
  { name: "Vertex Biotech Holdings", industry: "Biotechnologie" },
  { name: "Meridian Logistics Group", industry: "Logistique" },
  { name: "Halcyon Consumer Brands", industry: "Biens de consommation" },
  { name: "Zenith Data Systems", industry: "Technologie" },
  { name: "Atlas Infrastructure Partners", industry: "Infrastructures" }
];

const INSTITUTIONAL_INVESTORS = [
  "Meridian Pension Fund", "Ashford Asset Management", "Northfield Endowment",
  "Solenne Family Office", "Ironhall Sovereign Fund", "Compass Insurance Group"
];

let nextIpoId = 1;
let nextAiIntentionAt = 0;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function broadcastIpo(io, gameState) {
  io.to("game").emit("ipo:update", gameState.ipo);
}

function spawnIpo(io, gameState) {
  if (gameState.ipo) return;
  const company = COMPANY_POOL[Math.floor(Math.random() * COMPANY_POOL.length)];
  const companyValuation = Math.round((200 + Math.random() * 600) / 10) * 10;
  const rivalBanks = Object.keys(gameState.leagueTable).filter(name => name !== PLAYER_BANK_NAME);

  gameState.ipo = {
    id: "ipo" + (nextIpoId++),
    companyName: company.name,
    industry: company.industry,
    companyValuation,
    phase: "bidding",
    biddingDeadline: Date.now() + BIDDING_WINDOW_MS,
    blackwellPitchSubmitted: false,
    blackwellPitchByName: null,
    rivalBanks,
    winningBank: null,
    offeringSize: round1(companyValuation * OFFERING_SIZE_PCT),
    priceRangeLow: round1(companyValuation * 0.9 / 100),
    priceRangeHigh: round1(companyValuation * 1.1 / 100),
    finalPrice: null,
    pricedByPlayerId: null,
    pricedByName: null,
    bookbuildingDeadline: null,
    intentions: [],
    listingPopPct: null,
    listedAt: null
  };

  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "🔔 " + company.name + " (" + company.industry + ") lance un appel d'offres pour son introduction en bourse — les banques peuvent soumettre leur pitch sous 45s." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastIpo(io, gameState);
}

function resolveBidding(io, gameState) {
  const ipo = gameState.ipo;
  const winProbability = Math.min(0.9, BASE_WIN_PROBABILITY + (ipo.blackwellPitchSubmitted ? PITCH_WIN_BONUS : 0));
  const blackwellWins = Math.random() < winProbability;

  if (blackwellWins) {
    ipo.winningBank = PLAYER_BANK_NAME;
    ipo.phase = "bookbuilding";
    ipo.bookbuildingDeadline = Date.now() + BOOKBUILDING_WINDOW_MS;
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "🏆 Blackwell & Co remporte le mandat d'introduction en bourse de " + ipo.companyName + " ! Fixez le prix pour lancer la collecte d'intentions d'achat." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, {
      authorName: "IA — Marché des Capitaux Actions",
      text: "🏆 Mandat IPO remporté sur " + ipo.companyName + " (" + ipo.companyValuation + " M$) — à vous de fixer le prix !",
      tone: "congrats"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    broadcastIpo(io, gameState);
  } else {
    const rival = ipo.rivalBanks[Math.floor(Math.random() * ipo.rivalBanks.length)];
    ipo.winningBank = rival;
    const rivalFee = round1(ipo.companyValuation * IPO_FEE_PCT * 0.5);
    recordBankPnl(gameState, rival, rivalFee, 1);
    io.to("game").emit("leagueTable:update", gameState.leagueTable);
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "😔 " + rival + " remporte le mandat d'introduction en bourse de " + ipo.companyName + " — Blackwell & Co n'a pas été retenu." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastIpo(io, gameState);
    gameState.ipo = null;
    broadcastIpo(io, gameState);
  }
}

function resolveListing(io, gameState) {
  const ipo = gameState.ipo;
  const totalDemand = ipo.intentions.reduce((sum, i) => sum + i.amount, 0);
  const demandRatio = ipo.offeringSize > 0 ? totalDemand / ipo.offeringSize : 0;

  let popPct;
  if (demandRatio >= 1.5) popPct = 15;
  else if (demandRatio >= 1.0) popPct = 5;
  else popPct = -10;
  ipo.listingPopPct = popPct;
  ipo.listedAt = Date.now();
  ipo.phase = "listed";

  const fee = round1(ipo.companyValuation * IPO_FEE_PCT);
  const kpis = gameState.financeKPIs;
  const oldNetIncome = kpis.netIncome;
  kpis.revenue = round1(kpis.revenue + fee);
  kpis.netIncome = round1(kpis.netIncome + fee);
  kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "IPO — " + ipo.companyName });
  if (kpis.history.length > 100) kpis.history.length = 100;
  recordBankPnl(gameState, PLAYER_BANK_NAME, fee, 1);

  if (ipo.pricedByPlayerId) {
    const pricer = gameState.players.find(p => p.id === ipo.pricedByPlayerId);
    if (pricer) awardPoints(io, gameState, pricer, "ipo_priced");
  }

  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  io.to("game").emit("leagueTable:update", gameState.leagueTable);

  const outcomeText = popPct >= 15 ? "un bond de +" + popPct + "% à la cotation — sursouscription forte !"
    : popPct >= 0 ? "une hausse de +" + popPct + "% à la cotation."
    : "une chute de " + popPct + "% à la cotation — prix mal calibré, demande insuffisante.";
  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "📈 " + ipo.companyName + " coté en bourse à " + ipo.finalPrice + " €/action — " + outcomeText + " Frais d'introduction : +" + fee + " M$." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, {
    authorName: "IA — Marché des Capitaux Actions",
    text: "📈 Introduction en bourse de " + ipo.companyName + " finalisée — " + outcomeText,
    tone: popPct >= 0 ? "congrats" : "alert"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });

  broadcastIpo(io, gameState);
  gameState.ipo = null;
  broadcastIpo(io, gameState);
}

function registerIpoHandlers(io, socket, gameState) {
  socket.on("ipo:submitPitch", () => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !gameState.ipo || gameState.ipo.phase !== "bidding" || gameState.ipo.blackwellPitchSubmitted) return;

    gameState.ipo.blackwellPitchSubmitted = true;
    gameState.ipo.blackwellPitchByName = player.fullName;
    awardPoints(io, gameState, player, "ipo_pitchSubmitted");
    pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: player.fullName + " a soumis le pitch de Blackwell & Co pour le mandat IPO de " + gameState.ipo.companyName + "." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastIpo(io, gameState);
  });

  socket.on("ipo:setPrice", payload => {
    if (!requireAccess(socket, "ma") && !requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const ipo = gameState.ipo;
    if (!player || !ipo || ipo.phase !== "bookbuilding" || ipo.finalPrice !== null) return;
    const price = Number(payload.price);
    if (Number.isNaN(price) || price <= 0) return;

    ipo.finalPrice = round1(price);
    ipo.pricedByPlayerId = player.id;
    ipo.pricedByName = player.fullName;
    pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: player.fullName + " a fixé le prix de l'IPO " + ipo.companyName + " à " + ipo.finalPrice + " €/action — collecte des intentions d'achat ouverte." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastIpo(io, gameState);
  });

  socket.on("ipo:submitIntention", payload => {
    if (!requireAccess(socket, "ma") && !requireAccess(socket, "markets") && !requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const ipo = gameState.ipo;
    if (!player || !ipo || ipo.phase !== "bookbuilding" || ipo.finalPrice === null) return;
    const amount = Number(payload.amount);
    if (Number.isNaN(amount) || amount <= 0) return;

    ipo.intentions.unshift({ investorName: player.fullName, amount: round1(amount), isAI: false, ts: Date.now() });
    awardPoints(io, gameState, player, "ipo_intentionSubmitted");
    broadcastIpo(io, gameState);
  });
}

// Ambient institutional demand during bookbuilding -- purely additive flavor that
// makes the demand-ratio outcome feel alive even with few human participants,
// same spirit as every other ambient-AI behavior in this codebase.
function maybeAddAiIntention(io, gameState) {
  const ipo = gameState.ipo;
  if (!ipo || ipo.phase !== "bookbuilding" || ipo.finalPrice === null) return;
  if (Date.now() < nextAiIntentionAt) return;
  nextAiIntentionAt = Date.now() + randomDelay(AI_INTENTION_MIN_MS, AI_INTENTION_MAX_MS);

  const investor = INSTITUTIONAL_INVESTORS[Math.floor(Math.random() * INSTITUTIONAL_INVESTORS.length)];
  const amount = round1(ipo.offeringSize * (0.05 + Math.random() * 0.25));
  ipo.intentions.unshift({ investorName: investor, amount, isAI: true, ts: Date.now() });
  broadcastIpo(io, gameState);
}

function sweepIpo(io, gameState) {
  const ipo = gameState.ipo;
  if (!ipo) return;
  const now = Date.now();
  if (ipo.phase === "bidding" && now >= ipo.biddingDeadline) {
    resolveBidding(io, gameState);
    return;
  }
  if (ipo.phase === "bookbuilding") {
    maybeAddAiIntention(io, gameState);
    if (now >= ipo.bookbuildingDeadline) resolveListing(io, gameState);
  }
}

function scheduleIpoLoops(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnIpo(io, gameState);
    setTimeout(spawnTick, randomDelay(IPO_SPAWN_MIN_MS, IPO_SPAWN_MAX_MS));
  }
  setTimeout(spawnTick, randomDelay(IPO_SPAWN_MIN_MS, IPO_SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) sweepIpo(io, gameState);
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
}

function startIpoLoop(io, gameState) {
  scheduleIpoLoops(io, gameState);
  console.log("Système IPO activé (nouvelle opportunité toutes les 5-8 min).");
}

module.exports = {
  registerIpoHandlers, startIpoLoop, spawnIpo, resolveBidding, resolveListing, sweepIpo,
  BIDDING_WINDOW_MS, BOOKBUILDING_WINDOW_MS, IPO_FEE_PCT, OFFERING_SIZE_PCT, BASE_WIN_PROBABILITY, PITCH_WIN_BONUS
};
