// Refus de Prêt Interbancaire & Illiquidité -- when Blackwell & Co's bank health
// falls too low, rival banks cut their Repo credit lines: the trading desk can no
// longer open new positions (server/handlers/markets.js gates markets:buy on this)
// until either health recovers naturally (a real but slower path) or the Board
// invokes the Central Bank's emergency facility -- an immediate reopen, but at a
// real cost (further health hit + a punitive fee), a genuine "yes, but" tradeoff
// rather than a free fix.
const { pushActivity, postTeamChat } = require("./gameState");
const { applyHealthDelta } = require("./scoring");

const REPO_BLOCK_HEALTH_THRESHOLD = 35;
const REPO_RECOVERY_HEALTH_THRESHOLD = 55;
const CENTRAL_BANK_FEE = 15;
const CENTRAL_BANK_HEALTH_PENALTY = 5;
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function sweepRepoStatus(io, gameState) {
  const repo = gameState.repoStatus;
  if (!repo.blocked && gameState.bankHealth < REPO_BLOCK_HEALTH_THRESHOLD) {
    repo.blocked = true;
    repo.blockedSince = Date.now();
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "🚫 La santé de la banque est trop basse — les banques rivales coupent leurs lignes de crédit Repo. Le Desk Marchés ne peut plus ouvrir de nouvelles positions." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Trésorerie de Groupe", text: "🚫 Marché interbancaire fermé : plus aucune banque ne nous prête via Repo. Il faudra soit redresser la santé de la banque, soit solliciter le guichet d'urgence de la Banque Centrale.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    io.to("game").emit("repoStatus:update", repo);
    return;
  }
  if (repo.blocked && gameState.bankHealth >= REPO_RECOVERY_HEALTH_THRESHOLD) {
    repo.blocked = false;
    repo.blockedSince = null;
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "✅ La confiance revient — les banques rivales rouvrent leurs lignes de crédit Repo." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Trésorerie de Groupe", text: "✅ Accès au marché interbancaire rétabli, sans avoir eu besoin de la Banque Centrale.", tone: "congrats" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    io.to("game").emit("repoStatus:update", repo);
  }
}

function requireAccess(socket) {
  return socket.rooms.has("access:finance") || socket.rooms.has("access:strategy");
}

function registerInterbankHandlers(io, socket, gameState) {
  socket.on("game:useCentralBankFacility", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess || !requireAccess(socket)) return;
    const repo = gameState.repoStatus;
    if (!repo.blocked) return;

    repo.blocked = false;
    repo.blockedSince = null;
    repo.emergencyFacilityUsed = (repo.emergencyFacilityUsed || 0) + 1;

    const kpis = gameState.financeKPIs;
    const oldNetIncome = kpis.netIncome;
    kpis.netIncome = round1(kpis.netIncome - CENTRAL_BANK_FEE);
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Guichet d'urgence Banque Centrale" });
    if (kpis.history.length > 100) kpis.history.length = 100;
    applyHealthDelta(io, gameState, -CENTRAL_BANK_HEALTH_PENALTY);

    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
    io.to("game").emit("repoStatus:update", repo);
    pushActivity(gameState, { actorPlayerId: player.id, page: "finance", text: "🏦 " + player.fullName + " sollicite le guichet d'urgence de la Banque Centrale — accès au marché rétabli, mais -" + CENTRAL_BANK_FEE + " M$ et réputation entamée." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Trésorerie de Groupe", text: "🏦 Recours au guichet d'urgence de la Banque Centrale — coûteux, mais le Desk Marchés peut de nouveau trader.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startInterbankLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepRepoStatus(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Marché interbancaire activé (blocage Repo sous " + REPO_BLOCK_HEALTH_THRESHOLD + "% de santé).");
}

module.exports = { registerInterbankHandlers, startInterbankLoop, sweepRepoStatus, REPO_BLOCK_HEALTH_THRESHOLD, REPO_RECOVERY_HEALTH_THRESHOLD, CENTRAL_BANK_FEE, CENTRAL_BANK_HEALTH_PENALTY };
