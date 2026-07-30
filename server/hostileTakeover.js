// Hostile Takeover & M&A Defense (Patch 24) -- reuses the existing M&A pipeline
// (gameState.maDeals) as the pool of "clients" that can come under threat,
// rather than inventing a parallel target-company concept: the deal's target
// IS the client the bank has to save. A predator bank periodically threatens an
// active (non-Clôturé, non-frozen) deal; the M&A desk has a real countdown to
// deploy a defense or the client is lost outright.
const { pushActivity, postTeamChat, recordBankPnl } = require("./gameState");
const { awardPoints, applyHealthDelta } = require("./scoring");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const SPAWN_MIN_MS = 4 * 60 * 1000;
const SPAWN_MAX_MS = 7 * 60 * 1000;
const DEFENSE_WINDOW_MS = 90 * 1000;
const WHITE_KNIGHT_MIN_TIME_LEFT_MS = 30 * 1000; // too late to arrange a friendly bidder past this point
const POISON_PILL_DILUTION_PCT = 0.05;
const SWEEP_MIN_MS = 3 * 1000;
const SWEEP_MAX_MS = 5 * 1000;

const PREDATOR_NAMES = ["Vulcan Capital Raiders", "Grayhawk Acquisition Corp", "Blackthorn Holdings", "Ironclad Predator Fund"];

let nextTakeoverId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

function eligibleDeals(gameState) {
  const threatenedDealIds = new Set(gameState.hostileTakeovers.filter(t => t.status === "Active").map(t => t.dealId));
  return gameState.maDeals.filter(d => d.stage !== "Clôturé" && !d.frozen && !threatenedDealIds.has(d.id));
}

function broadcastTakeovers(io, gameState) {
  io.to("access:ma").emit("hostileTakeover:update", gameState.hostileTakeovers);
}

function spawnHostileTakeover(io, gameState) {
  const candidates = eligibleDeals(gameState);
  if (!candidates.length) return;
  const deal = candidates[Math.floor(Math.random() * candidates.length)];
  const predatorName = PREDATOR_NAMES[Math.floor(Math.random() * PREDATOR_NAMES.length)];

  const takeover = {
    id: "ht" + (nextTakeoverId++),
    dealId: deal.id,
    dealName: deal.name,
    valuation: deal.valuation,
    predatorName,
    status: "Active",
    defenseUsed: null,
    deadline: Date.now() + DEFENSE_WINDOW_MS
  };
  gameState.hostileTakeovers.unshift(takeover);
  if (gameState.hostileTakeovers.length > 20) gameState.hostileTakeovers.length = 20;

  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "⚔️ OPA hostile : " + predatorName + " lance une offre sur « " + deal.name + " » — 90 secondes pour déployer une défense (Poison Pill ou Chevalier Blanc)." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "⚔️ " + predatorName + " tente une OPA hostile sur « " + deal.name + " » — le client compte sur nous !", tone: "alert" });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  broadcastTakeovers(io, gameState);
}

function registerHostileTakeoverHandlers(io, socket, gameState) {
  socket.on("ma:deployDefense", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const takeover = gameState.hostileTakeovers.find(t => t.id === payload.takeoverId && t.status === "Active");
    if (!takeover || Date.now() >= takeover.deadline) return;
    if (!["poisonPill", "whiteKnight"].includes(payload.strategy)) return;

    const timeLeft = takeover.deadline - Date.now();
    if (payload.strategy === "whiteKnight" && timeLeft < WHITE_KNIGHT_MIN_TIME_LEFT_MS) {
      socket.emit("ma:deployDefense:rejected", { reason: "Trop tard pour trouver un Chevalier Blanc — il reste moins de 30 secondes. Seul le Poison Pill peut encore agir." });
      return;
    }

    const deal = gameState.maDeals.find(d => d.id === takeover.dealId);
    takeover.status = "Saved";
    takeover.defenseUsed = payload.strategy;

    if (payload.strategy === "poisonPill" && deal) {
      const oldValuation = deal.valuation;
      deal.valuation = round1(deal.valuation * (1 - POISON_PILL_DILUTION_PCT));
      takeover.dilutionApplied = round1(oldValuation - deal.valuation);
    }

    awardPoints(io, gameState, player, "ma_closeDeal");
    const strategyLabel = payload.strategy === "poisonPill" ? "Poison Pill" : "Chevalier Blanc";
    pushActivity(gameState, {
      actorPlayerId: player.id, page: "ma",
      text: player.fullName + " déploie une défense " + strategyLabel + " et sauve « " + takeover.dealName + " » face à " + takeover.predatorName + (takeover.dilutionApplied ? " (dilution : -" + takeover.dilutionApplied + " M$ de valorisation)." : ".")
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "🛡 Défense " + strategyLabel + " réussie sur « " + takeover.dealName + " » — " + takeover.predatorName + " repoussé, client sauvé !", tone: "congrats" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    if (deal) io.to("access:ma").to("access:compliance").to("access:markets").emit("ma:update", gameState.maDeals);
    broadcastTakeovers(io, gameState);
  });
}

function sweepExpiredTakeovers(io, gameState) {
  const now = Date.now();
  let changed = false;
  gameState.hostileTakeovers.forEach(takeover => {
    if (takeover.status !== "Active" || now < takeover.deadline) return;
    takeover.status = "Lost";
    changed = true;

    const dealIdx = gameState.maDeals.findIndex(d => d.id === takeover.dealId);
    if (dealIdx !== -1) {
      const deal = gameState.maDeals[dealIdx];
      gameState.maDeals.splice(dealIdx, 1);
      // The named predator (flavor text) isn't itself a league-table bank -- a
      // random existing rival is credited with the win, same convention as
      // server/handlers/ma.js's sweepStalledDeals.
      const rivalBanks = Object.keys(gameState.leagueTable).filter(n => n !== PLAYER_BANK_NAME);
      if (rivalBanks.length) {
        const winner = rivalBanks[Math.floor(Math.random() * rivalBanks.length)];
        recordBankPnl(gameState, winner, round1(deal.valuation * 0.02), 0);
        io.to("game").emit("leagueTable:update", gameState.leagueTable);
      }
      io.to("access:ma").to("access:compliance").to("access:markets").emit("ma:update", gameState.maDeals);
    }
    applyHealthDelta(io, gameState, -6);

    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "💥 « " + takeover.dealName + " » perdu — " + takeover.predatorName + " a réussi son OPA hostile, faute de défense déployée à temps." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "💥 Client perdu : " + takeover.predatorName + " a pris le contrôle de « " + takeover.dealName + " ». Aucune défense n'a été déployée à temps.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  });
  if (changed) broadcastTakeovers(io, gameState);
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startHostileTakeoverLoop(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnHostileTakeover(io, gameState);
    setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
  }
  setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) sweepExpiredTakeovers(io, gameState);
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Hostile Takeover & M&A Defense activé (OPA toutes les 4-7 min, 90s pour défendre).");
}

module.exports = {
  registerHostileTakeoverHandlers, startHostileTakeoverLoop, spawnHostileTakeover, sweepExpiredTakeovers, eligibleDeals,
  DEFENSE_WINDOW_MS, WHITE_KNIGHT_MIN_TIME_LEFT_MS, POISON_PILL_DILUTION_PCT
};
