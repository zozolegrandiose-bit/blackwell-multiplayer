const { pushActivity, postTeamChat, recordBankPnl } = require("../gameState");
const { awardPoints, checkEventResolution, applyHealthDelta } = require("../scoring");
const { applyDealRevenue } = require("./finance");
const { getDifficultyPreset } = require("../difficulty");

const MA_STAGES = ["Screening", "Due Diligence", "Négociation", "Signing", "Clôturé"];
const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const IC_VOTE_ITEMS = ["Validation Risques", "Validation Juridique", "Validation Board Of Directors"];
let nextDealId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "ma" page.
function advanceRandomDeal(io, gameState, actor) {
  const eligible = gameState.maDeals.filter(d => d.stage !== "Clôturé");
  if (!eligible.length) return false;
  const deal = eligible[Math.floor(Math.random() * eligible.length)];
  const nextIndex = Math.min(MA_STAGES.indexOf(deal.stage) + 1, MA_STAGES.length - 1);
  deal.stage = MA_STAGES[nextIndex];
  deal.updatedAt = Date.now();
  io.to("access:ma").emit("ma:update", gameState.maDeals);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "ma",
    text: actor.fullName + " a fait avancer un projet M&A à l'étape « " + deal.stage + " »."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  if (deal.stage === "Clôturé" && !deal.revenueBooked) {
    deal.revenueBooked = true;
    const profit = applyDealRevenue(io, gameState, deal);
    recordBankPnl(gameState, PLAYER_BANK_NAME, profit, 1);
    io.to("game").emit("leagueTable:update", gameState.leagueTable);
    maybePostBigDealCongrats(io, gameState, deal, actor.fullName);
  }
  return true;
}

// Reusable: mints a bonus deal via the same id counter as ma:create, used by
// server/events.js to spawn an "Opportunité de marché" event.
function createBonusDeal(io, gameState, { name, valuation }) {
  const deal = {
    id: "deal" + (nextDealId++),
    name,
    stage: "Screening",
    valuation,
    synergies: 0,
    leadBankerPlayerId: null,
    leadBankerName: "Poste vacant",
    description: "Opportunité de marché à durée limitée.",
    ddChecklist: [],
    icVote: [],
    createdByPlayerId: null,
    updatedAt: Date.now(),
    revenueBooked: false,
    workflow: null
  };
  gameState.maDeals.push(deal);
  io.to("access:ma").emit("ma:update", gameState.maDeals);
  return deal;
}

function removeDeal(io, gameState, dealId) {
  gameState.maDeals = gameState.maDeals.filter(d => d.id !== dealId);
  io.to("access:ma").emit("ma:update", gameState.maDeals);
}

// Proactive competing AI: a deal nobody has touched for more than 2 minutes gets
// actively contested by a rival bank, not just abandoned — a real, systematic
// consequence of human inactivity, checked against every deal on each sweep
// (independent of the much rarer random "Enchère concurrente" crisis event).
const STALL_SWEEP_MIN_MS = 30 * 1000;
const STALL_SWEEP_MAX_MS = 45 * 1000;
const STALL_THRESHOLD_MS = 2 * 60 * 1000;
const STALL_COLLAPSE_PROBABILITY = 0.35;
const RIVAL_BANKS = ["Ashford & Vane", "Northfield Partners", "Meridian Capital Group", "Solenne & Rocher", "Ironhall Securities"];
const BIG_DEAL_THRESHOLD = 300;
const RIVAL_FEE_PCT = 0.02;
const RIVAL_MARGIN_PCT = 0.4;

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

// Team chat congrats when a sizeable deal actually closes — called from every path
// that can close a deal (manual stage change, ambient AI progression, the Patch 11
// risk/execution workflow), not just one of them.
function maybePostBigDealCongrats(io, gameState, deal, closerName) {
  if (deal.valuation < BIG_DEAL_THRESHOLD) return;
  const templates = [
    "🎉 Bravo à l'équipe pour la clôture de « " + deal.name + " » (" + deal.valuation + " M$) !",
    "🥂 Beau closing sur « " + deal.name + " » — " + deal.valuation + " M$ sécurisés, merci " + closerName + " !",
    "👏 « " + deal.name + " » clôturé avec succès, l'équipe assure."
  ];
  const text = templates[Math.floor(Math.random() * templates.length)];
  postTeamChat(gameState, { authorName: "IA — Salle des marchés", text, tone: "congrats" });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
}

function sweepStalledDeals(io, gameState) {
  const now = Date.now();
  const stale = gameState.maDeals.filter(d => d.stage !== "Clôturé" && now - d.updatedAt >= STALL_THRESHOLD_MS);
  stale.forEach(deal => {
    if (Math.random() >= STALL_COLLAPSE_PROBABILITY) return;
    const rival = RIVAL_BANKS[Math.floor(Math.random() * RIVAL_BANKS.length)];
    const rivalProfit = Math.round(deal.valuation * RIVAL_FEE_PCT * RIVAL_MARGIN_PCT * 10) / 10;
    removeDeal(io, gameState, deal.id);
    applyHealthDelta(io, gameState, -3);
    recordBankPnl(gameState, rival, rivalProfit, 1);
    io.to("game").emit("leagueTable:update", gameState.leagueTable);
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "💤 « " + deal.name + " » a été raflé par " + rival + ", plus réactif — faute d'avancement depuis plus de 2 minutes." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
  });
}

function scheduleDealRiskLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepStalledDeals(io, gameState);
    setTimeout(tick, randomDelay(STALL_SWEEP_MIN_MS, STALL_SWEEP_MAX_MS) * getDifficultyPreset(gameState.difficulty).eventFreq);
  }
  setTimeout(tick, randomDelay(STALL_SWEEP_MIN_MS, STALL_SWEEP_MAX_MS));
}

function registerMaHandlers(io, socket, gameState) {
  socket.on("ma:create", payload => {
    if (!requireAccess(socket, "ma")) return;
    const playerId = socket.data.playerId;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const name = (payload.name || "").trim();
    if (!name) {
      socket.emit("ma:create:rejected", { reason: "Le nom du projet est requis." });
      return;
    }

    const deal = {
      id: "deal" + (nextDealId++),
      name,
      stage: "Screening",
      valuation: Number(payload.valuation) || 0,
      synergies: Number(payload.synergies) || 0,
      leadBankerPlayerId: player.id,
      leadBankerName: player.fullName,
      description: (payload.description || "").trim(),
      ddChecklist: [
        { item: "Audit financier", done: false },
        { item: "Audit juridique", done: false }
      ],
      icVote: IC_VOTE_ITEMS.map(item => ({ item, done: false })),
      createdByPlayerId: player.id,
      updatedAt: Date.now(),
      revenueBooked: false,
      workflow: null
    };
    gameState.maDeals.push(deal);

    io.to("access:ma").emit("ma:update", gameState.maDeals);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "ma",
      text: player.fullName + " a créé un nouveau projet M&A."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "ma_create");
  });

  socket.on("ma:updateStage", payload => {
    if (!requireAccess(socket, "ma")) return;
    const playerId = socket.data.playerId;
    const player = gameState.players.find(p => p.id === playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !MA_STAGES.includes(payload.stage)) return;

    deal.stage = payload.stage;
    deal.updatedAt = Date.now();
    io.to("access:ma").emit("ma:update", gameState.maDeals);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "ma",
      text: player.fullName + " a fait avancer un projet M&A à l'étape « " + payload.stage + " »."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, payload.stage === "Clôturé" ? "ma_closeDeal" : "ma_advanceStage");
    checkEventResolution(io, gameState, deal.id, player);
    if (payload.stage === "Clôturé" && !deal.revenueBooked) {
      deal.revenueBooked = true;
      const profit = applyDealRevenue(io, gameState, deal);
      recordBankPnl(gameState, PLAYER_BANK_NAME, profit, 1);
      io.to("game").emit("leagueTable:update", gameState.leagueTable);
      maybePostBigDealCongrats(io, gameState, deal, player.fullName);
    }
  });

  socket.on("ma:toggleChecklist", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!deal || !deal.ddChecklist[payload.index]) return;

    const wasDone = deal.ddChecklist[payload.index].done;
    deal.ddChecklist[payload.index].done = !wasDone;
    deal.updatedAt = Date.now();
    io.to("access:ma").emit("ma:update", gameState.maDeals);
    if (!wasDone) awardPoints(io, gameState, player, "ma_checklistDone");
  });

  socket.on("ma:toggleIcVote", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!deal || !deal.icVote || !deal.icVote[payload.index]) return;

    const wasDone = deal.icVote[payload.index].done;
    deal.icVote[payload.index].done = !wasDone;
    deal.updatedAt = Date.now();
    io.to("access:ma").emit("ma:update", gameState.maDeals);
    if (!wasDone) awardPoints(io, gameState, player, "ma_icVoteDone");
  });
}

module.exports = { registerMaHandlers, MA_STAGES, IC_VOTE_ITEMS, advanceRandomDeal, createBonusDeal, removeDeal, scheduleDealRiskLoop, sweepStalledDeals, STALL_THRESHOLD_MS };
