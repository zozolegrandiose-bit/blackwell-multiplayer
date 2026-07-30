// Private Banking & Wealth Management (Patch 23) -- ultra-rich Family Office
// prospects periodically approach the new "Private Banking & Wealth Management"
// department (cluster C, alongside the existing Gestion de Fortune). Signing a
// mandate books an immediate management fee AND -- the request's explicit ask --
// directly increases the liquidity (allocatedCapital) of a regional entity that
// actually has a Private Banking desk (server/globalBank.js's activeDesks
// already included "PRIVATE_BANKING" on Frankfurt and Hong Kong since Patch 19,
// a real hook rather than a new one invented just for this).
const { pushActivity, postTeamChat, recordBankPnl } = require("./gameState");
const { awardPoints } = require("./scoring");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const SPAWN_MIN_MS = 3 * 60 * 1000;
const SPAWN_MAX_MS = 5 * 60 * 1000;
const PROSPECT_EXPIRY_MS = 4 * 60 * 1000;
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;
const MANDATE_FEE_PCT = 0.01;
const MANDATE_TYPES = ["Discrétionnaire", "Conseil"];

const FAMILY_OFFICE_NAMES = [
  "Aurelia Family Office", "Château Bellevue Capital", "Solberg Family Holdings",
  "Meridian Heritage Trust", "Northgate Private Wealth", "Castellan Dynasty Office"
];

let nextFamilyOfficeId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

function privateBankingDesks(gameState) {
  return gameState.globalBank.entities.filter(e => e.activeDesks.includes("PRIVATE_BANKING"));
}

function broadcastPrivateBanking(io, gameState) {
  io.to("access:privateBanking").emit("privateBanking:update", gameState.privateBanking);
}

function spawnFamilyOffice(io, gameState) {
  if (gameState.privateBanking.familyOffices.some(f => f.status === "Prospect")) return; // one live prospect at a time
  const netWorth = Math.round((200 + Math.random() * 600) / 10) * 10;
  const proposedDeposit = round1(netWorth * (0.2 + Math.random() * 0.2));
  const office = {
    id: "fo" + (nextFamilyOfficeId++),
    name: FAMILY_OFFICE_NAMES[Math.floor(Math.random() * FAMILY_OFFICE_NAMES.length)],
    netWorth,
    mandateType: MANDATE_TYPES[Math.floor(Math.random() * MANDATE_TYPES.length)],
    proposedDeposit,
    status: "Prospect",
    createdAt: Date.now(),
    deadline: Date.now() + PROSPECT_EXPIRY_MS
  };
  gameState.privateBanking.familyOffices.unshift(office);
  if (gameState.privateBanking.familyOffices.length > 15) gameState.privateBanking.familyOffices.length = 15;

  pushActivity(gameState, { actorPlayerId: null, page: "privateBanking", text: "💎 " + office.name + " (fortune nette " + office.netWorth + " M$) sollicite un mandat " + office.mandateType + " — dépôt proposé : " + office.proposedDeposit + " M$." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  broadcastPrivateBanking(io, gameState);
}

function registerPrivateBankingHandlers(io, socket, gameState) {
  socket.on("privateBanking:signMandate", payload => {
    if (!requireAccess(socket, "privateBanking")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const office = gameState.privateBanking.familyOffices.find(f => f.id === payload.officeId && f.status === "Prospect");
    if (!office || Date.now() >= office.deadline) return;

    const desks = privateBankingDesks(gameState);
    if (!desks.length) return;
    const entity = desks[Math.floor(Math.random() * desks.length)];
    entity.allocatedCapital = round1(entity.allocatedCapital + office.proposedDeposit);

    const fee = round1(office.proposedDeposit * MANDATE_FEE_PCT);
    const kpis = gameState.financeKPIs;
    const oldNetIncome = kpis.netIncome;
    kpis.revenue = round1(kpis.revenue + fee);
    kpis.netIncome = round1(kpis.netIncome + fee);
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: player.id, byName: "Mandat Private Banking — " + office.name });
    if (kpis.history.length > 100) kpis.history.length = 100;
    recordBankPnl(gameState, PLAYER_BANK_NAME, fee, 0);

    office.status = "Mandat actif";
    office.signedByPlayerId = player.id;
    office.signedByName = player.fullName;
    office.creditedEntityId = entity.id;

    awardPoints(io, gameState, player, "ma_create");
    pushActivity(gameState, { actorPlayerId: player.id, page: "privateBanking", text: player.fullName + " signe le mandat " + office.mandateType + " de " + office.name + " — " + office.proposedDeposit + " M$ de dépôts crédités à " + entity.name + " (+" + fee + " M$ de commission)." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
    io.to("game").emit("leagueTable:update", gameState.leagueTable);
    io.to("access:global").emit("globalBank:update", gameState.globalBank);
    if (office.proposedDeposit >= 150) {
      postTeamChat(gameState, { authorName: "IA — Private Banking", text: "💎 Mandat signé avec " + office.name + " — " + office.proposedDeposit + " M$ de liquidités fraîches pour " + entity.name + " !", tone: "congrats" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    }
    broadcastPrivateBanking(io, gameState);
  });
}

function sweepFamilyOfficeExpiry(io, gameState) {
  const now = Date.now();
  let changed = false;
  gameState.privateBanking.familyOffices.forEach(office => {
    if (office.status !== "Prospect" || now < office.deadline) return;
    office.status = "Expiré";
    changed = true;
    pushActivity(gameState, { actorPlayerId: null, page: "privateBanking", text: "⌛ " + office.name + " retire sa sollicitation, faute de mandat signé à temps." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
  if (changed) broadcastPrivateBanking(io, gameState);
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startPrivateBankingLoop(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnFamilyOffice(io, gameState);
    setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
  }
  setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) sweepFamilyOfficeExpiry(io, gameState);
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Private Banking & Wealth Management activé (Family Offices toutes les 3-5 min).");
}

module.exports = {
  registerPrivateBankingHandlers, startPrivateBankingLoop, spawnFamilyOffice, sweepFamilyOfficeExpiry,
  privateBankingDesks, MANDATE_FEE_PCT, PROSPECT_EXPIRY_MS
};
