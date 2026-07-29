// Pitchbook Competition -- an AI corporate client periodically puts an M&A mandate
// out to competitive bid. Every bank (Blackwell via a real player, rivals via an
// auto-generated bid) proposes a commission rate; after a 3-minute window the
// client picks the best offer weighing commission against credibility -- credibility
// is pulled straight from each bank's Rating Agency credit rating (server/
// ratingAgency.js), so a bank that let its rating slip is a genuinely harder sell
// even at a lower price. Winning as Blackwell creates a real M&A deal.
const { pushActivity, postTeamChat, recordBankPnl } = require("./gameState");
const { awardPoints } = require("./scoring");
const { createBonusDeal } = require("./handlers/ma");
const { RATING_SCALE } = require("./ratingAgency");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const SPAWN_MIN_MS = 4 * 60 * 1000;
const SPAWN_MAX_MS = 7 * 60 * 1000;
const BID_WINDOW_MS = 3 * 60 * 1000;
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;
const MIN_COMMISSION_PCT = 0.5;
const MAX_COMMISSION_PCT = 5;
const RIVAL_BID_COUNT_MIN = 1;
const RIVAL_BID_COUNT_MAX = 3;

const CLIENT_NAMES = [
  "Halden Materials Group", "Verity Consumer Holdings", "Solent Logistics International",
  "Brightfield Renewable Partners", "Castellan Industrial Corp", "Meridian Health Systems"
];

let nextCompetitionId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

function creditRatingToCredibility(gameState, bankName) {
  const entry = gameState.creditRatings[bankName];
  if (!entry) return 50;
  const idx = RATING_SCALE.indexOf(entry.rating);
  if (idx === -1) return 50;
  return round1(100 - (idx / (RATING_SCALE.length - 1)) * 100);
}

function scoreBid(bid) {
  return round1(bid.credibilityScore - bid.commissionRate * 15);
}

// "Guerre des Mandats" (Patch 21) -- rival banks already bid the instant a
// mandate opens (seeded below, faster than any 30-60s window could enforce);
// broadened here to also cover bond-issuance mandates, not just M&A, purely as
// flavor text/framing -- the underlying deal-creation mechanic is unchanged.
const DEAL_TYPES = ["M&A", "Émission Obligataire"];

function spawnPitchbookCompetition(io, gameState) {
  if (gameState.pitchbookCompetitions.some(c => !c.resolved)) return; // one at a time
  const clientName = CLIENT_NAMES[Math.floor(Math.random() * CLIENT_NAMES.length)];
  const targetValuation = Math.round((150 + Math.random() * 450) / 10) * 10;
  const dealType = DEAL_TYPES[Math.floor(Math.random() * DEAL_TYPES.length)];

  const rivalBanks = Object.keys(gameState.leagueTable).filter(name => name !== PLAYER_BANK_NAME);
  const rivalBidCount = RIVAL_BID_COUNT_MIN + Math.floor(Math.random() * (RIVAL_BID_COUNT_MAX - RIVAL_BID_COUNT_MIN + 1));
  const biddingRivals = rivalBanks.slice().sort(() => Math.random() - 0.5).slice(0, rivalBidCount);
  const rivalBids = biddingRivals.map(bankName => ({
    bankName,
    commissionRate: round2(MIN_COMMISSION_PCT + Math.random() * (MAX_COMMISSION_PCT - MIN_COMMISSION_PCT)),
    credibilityScore: creditRatingToCredibility(gameState, bankName),
    byPlayerId: null,
    byName: null
  }));

  const competition = {
    id: "pb" + (nextCompetitionId++),
    clientName,
    targetValuation,
    dealType,
    deadline: Date.now() + BID_WINDOW_MS,
    bids: rivalBids,
    resolved: false
  };
  gameState.pitchbookCompetitions.unshift(competition);
  if (gameState.pitchbookCompetitions.length > 10) gameState.pitchbookCompetitions.length = 10;

  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "📋 " + clientName + " lance un appel d'offres pour un mandat " + dealType + " (valorisation indicative " + targetValuation + " M$) — 3 minutes pour soumettre une offre." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:ma").emit("pitchbook:update", gameState.pitchbookCompetitions);
}

function registerPitchbookHandlers(io, socket, gameState) {
  socket.on("pitchbook:submitBid", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const competition = gameState.pitchbookCompetitions.find(c => c.id === payload.competitionId && !c.resolved);
    if (!competition || Date.now() >= competition.deadline) return;

    const commissionRate = Number(payload.commissionRate);
    if (!Number.isFinite(commissionRate) || commissionRate < MIN_COMMISSION_PCT || commissionRate > MAX_COMMISSION_PCT) {
      socket.emit("pitchbook:bidRejected", { reason: "Le taux de commission doit être entre " + MIN_COMMISSION_PCT + "% et " + MAX_COMMISSION_PCT + "%." });
      return;
    }

    const existingIdx = competition.bids.findIndex(b => b.bankName === PLAYER_BANK_NAME);
    const bid = {
      bankName: PLAYER_BANK_NAME,
      commissionRate: round2(commissionRate),
      credibilityScore: creditRatingToCredibility(gameState, PLAYER_BANK_NAME),
      byPlayerId: player.id,
      byName: player.fullName
    };
    if (existingIdx !== -1) competition.bids[existingIdx] = bid;
    else competition.bids.push(bid);

    pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: player.fullName + " soumet une offre à " + competition.clientName + " (commission " + bid.commissionRate + "%)." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:ma").emit("pitchbook:update", gameState.pitchbookCompetitions);
  });
}

function resolvePitchbookCompetition(io, gameState, competition) {
  competition.resolved = true;
  if (!competition.bids.length) {
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: competition.clientName + " n'a reçu aucune offre et annule son mandat." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:ma").emit("pitchbook:update", gameState.pitchbookCompetitions);
    return;
  }

  const winner = competition.bids.slice().sort((a, b) => scoreBid(b) - scoreBid(a))[0];
  competition.winnerBankName = winner.bankName;

  if (winner.bankName === PLAYER_BANK_NAME) {
    const deal = createBonusDeal(io, gameState, { name: "Mandat " + competition.clientName, valuation: competition.targetValuation });
    deal.description = "Mandat " + competition.dealType + " remporté en pitchbook face à la concurrence (commission " + winner.commissionRate + "%).";
    io.to("access:ma").emit("ma:update", gameState.maDeals);
    const winningPlayer = gameState.players.find(p => p.id === winner.byPlayerId);
    if (winningPlayer) awardPoints(io, gameState, winningPlayer, "ma_create");
    pushActivity(gameState, { actorPlayerId: winner.byPlayerId, page: "ma", text: "🏆 Blackwell & Co remporte le mandat " + competition.dealType + " de " + competition.clientName + " (commission " + winner.commissionRate + "%) — nouveau deal créé." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "🏆 Pitchbook gagné : " + competition.clientName + " nous confie son mandat " + competition.dealType + " !", tone: "congrats" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  } else {
    recordBankPnl(gameState, winner.bankName, round1(competition.targetValuation * 0.01), 0);
    io.to("game").emit("leagueTable:update", gameState.leagueTable);
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "📋 " + competition.clientName + " confie son mandat à " + winner.bankName + " (commission " + winner.commissionRate + "%) — occasion manquée pour Blackwell & Co." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  }

  io.to("access:ma").emit("pitchbook:update", gameState.pitchbookCompetitions);
}

function sweepPitchbookCompetitions(io, gameState) {
  const now = Date.now();
  gameState.pitchbookCompetitions.forEach(c => {
    if (c.resolved || now < c.deadline) return;
    resolvePitchbookCompetition(io, gameState, c);
  });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startPitchbookLoop(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnPitchbookCompetition(io, gameState);
    setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
  }
  setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) sweepPitchbookCompetitions(io, gameState);
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Pitchbook Competition activée (nouvel appel d'offres toutes les 4-7 min).");
}

module.exports = { registerPitchbookHandlers, startPitchbookLoop, spawnPitchbookCompetition, resolvePitchbookCompetition, sweepPitchbookCompetitions, scoreBid, creditRatingToCredibility, MIN_COMMISSION_PCT, MAX_COMMISSION_PCT, BID_WINDOW_MS };
