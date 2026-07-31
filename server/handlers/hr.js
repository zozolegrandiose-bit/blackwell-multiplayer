const { pushActivity, buildPublicRoster } = require("../gameState");
const { awardPoints, awardCustomPoints } = require("../scoring");
const { DEPARTMENT_CLUSTER, getAccessForPosition, hasFullAccess, getClusterForPosition } = require("../departmentAccess");
const { adjustSatisfaction } = require("../satisfaction");
const { GRADES, DEPARTMENTS } = require("../seedData");
const { isHeadOfCIB } = require("../cibBonus");
const { isDrhGlobal } = require("../globalBank");
const { isBonusDistributionRestricted } = require("../regulatoryStressTest");
const { updateUserAssignment } = require("../db");

const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const ONBOARDING_ITEMS = ["Contrat signé", "Poste de travail", "Compte IT", "Badge d'accès", "Formation d'intégration"];
const BONUS_POOL_RATE = 0.10;

// Base salary formula shared by the org chart (promotions) and payroll (HR-3):
// a simple grade-index-driven scale, consistent with RECRUIT_LEVELS' rough
// Analyst/Associate/VP figures below without needing a 46-entry lookup table.
const SALARY_BASE = 6;
const SALARY_PER_GRADE_STEP = 1.2;

function computeBaseSalary(grade) {
  const idx = GRADES.indexOf(grade);
  return round1(SALARY_BASE + Math.max(0, idx) * SALARY_PER_GRADE_STEP);
}

// HR-3 payroll -- baseSalary is an annual figure, so the monthly mass is /12.
// Only currently-connected players draw a salary (an unfilled desk costs
// nothing, consistent with how AI never books real payroll anywhere else).
function computeMonthlyPayroll(gameState) {
  const total = gameState.players.reduce((sum, p) => sum + (p.baseSalary || 0), 0);
  return round1(total / 12);
}

// Called from settleMarketDay() (server/marketDay.js) -- each "journée de marché"
// stands in for a payroll period at this game's compressed time scale, same
// convention already used for the Rating Agency and CIB bonus pool accrual.
function runPayrollDeduction(io, gameState) {
  const payroll = computeMonthlyPayroll(gameState);
  if (payroll <= 0) return payroll;
  const kpis = gameState.financeKPIs;
  const oldNetIncome = kpis.netIncome;
  kpis.netIncome = round1(kpis.netIncome - payroll);
  kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Masse salariale mensuelle" });
  if (kpis.history.length > 100) kpis.history.length = 100;
  gameState.hr.lastPayrollAmount = payroll;
  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  pushActivity(gameState, { actorPlayerId: null, page: "finance", text: "💸 Masse salariale du mois prélevée : -" + payroll + " M$ (résultat net)." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return payroll;
}

// A promotion or desk reassignment can change a player's access array (cluster,
// hasFullAccess, hasStrategyAccess-derived "strategy" page) -- their live socket's
// Socket.io room memberships must be kept in sync, or they'd keep seeing pages
// they no longer have access to (or miss new ones) until their next reconnect.
function resyncPlayerAccessRooms(io, player, oldAccess) {
  const targetSocket = io.sockets.sockets.get(player.socketId);
  if (!targetSocket) return;
  oldAccess.forEach(page => { if (!player.access.includes(page)) targetSocket.leave("access:" + page); });
  player.access.forEach(page => { if (!oldAccess.includes(page)) targetSocket.join("access:" + page); });
}

const RECRUIT_LEVELS = [
  { level: "Analyst", salary: 9 },
  { level: "Associate", salary: 13 },
  { level: "Senior Associate", salary: 17 },
  { level: "Vice President", salary: 24 }
];
const CANDIDATE_FIRST_NAMES = ["Julien", "Camille", "Léa", "Nicolas", "Sofia", "Mathieu", "Chloé", "Antoine", "Manon", "Hugo"];
const CANDIDATE_LAST_NAMES = ["Fabre", "Roussel", "Girard", "Lambert", "Faure", "Perrin", "Blanchard", "Renard", "Gauthier", "Marchand"];

let nextLeaveId = 1;
let nextPositionId = 1;
let nextCandidateId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function hrRosterView(gameState) {
  return gameState.players.map(p => ({ id: p.id, fullName: p.fullName, grade: p.grade, dept: p.dept, onboarding: p.onboarding }));
}

function adjustMorale(gameState, delta) {
  gameState.hr.morale = Math.max(0, Math.min(100, Math.round(gameState.hr.morale + delta)));
}

function randomCandidateName() {
  const first = CANDIDATE_FIRST_NAMES[Math.floor(Math.random() * CANDIDATE_FIRST_NAMES.length)];
  const last = CANDIDATE_LAST_NAMES[Math.floor(Math.random() * CANDIDATE_LAST_NAMES.length)];
  return first + " " + last;
}

// Called from server/strategy.js when cluster F ("RH & Communication") locks in
// "Recruter" for the quarter — opens a real req in a random department across the
// bank, with two candidates ready to interview. This is what makes the strategic
// "Recruter" choice tangible on the RH page rather than a pure numbers effect.
function openPosition(gameState) {
  const depts = Object.keys(DEPARTMENT_CLUSTER).filter(d => d !== "Board Of Directors");
  const dept = depts[Math.floor(Math.random() * depts.length)];
  const tier = RECRUIT_LEVELS[Math.floor(Math.random() * RECRUIT_LEVELS.length)];
  const posId = "pos" + (nextPositionId++);
  gameState.hr.openPositions.push({ id: posId, dept, level: tier.level, monthlySalary: tier.salary, status: "Ouvert" });
  gameState.hr.candidates[posId] = [0, 1].map(() => ({
    id: "cand" + (nextCandidateId++),
    name: randomCandidateName(),
    level: tier.level,
    monthlySalary: round1(tier.salary * (0.85 + Math.random() * 0.3)),
    fitScore: 55 + Math.floor(Math.random() * 40),
    interviewed: false
  }));
  return posId;
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "hr" page.
function approveRandomLeaveRequest(io, gameState, actor) {
  const eligible = gameState.hr.leaveRequests.filter(r => r.status === "En attente");
  if (!eligible.length) return false;
  const request = eligible[Math.floor(Math.random() * eligible.length)];
  request.status = "Approuvé";
  adjustMorale(gameState, 2);
  io.to("access:hr").emit("hr:update", gameState.hr);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "hr",
    text: actor.fullName + " a approuvé une demande de congé en attente."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return true;
}

function registerHrHandlers(io, socket, gameState) {
  socket.on("hr:requestLeave", payload => {
    if (!requireAccess(socket, "hr")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    if (!payload.start || !payload.end) {
      socket.emit("hr:requestLeave:rejected", { reason: "Dates de début et de fin requises." });
      return;
    }

    const request = {
      id: "lv" + (nextLeaveId++),
      playerId: player.id,
      playerName: player.fullName,
      type: LEAVE_TYPES.includes(payload.type) ? payload.type : LEAVE_TYPES[0],
      start: payload.start,
      end: payload.end,
      status: "En attente"
    };
    gameState.hr.leaveRequests.push(request);

    io.to("access:hr").emit("hr:update", gameState.hr);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "hr",
      text: player.fullName + " a soumis une demande de congé."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("hr:setLeaveStatus", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const request = gameState.hr.leaveRequests.find(r => r.id === payload.requestId);
    if (!request || !["Approuvé", "Refusé"].includes(payload.status)) return;
    request.status = payload.status;
    adjustMorale(gameState, payload.status === "Approuvé" ? 2 : -4);
    io.to("access:hr").emit("hr:update", gameState.hr);
    if (payload.status === "Approuvé") awardPoints(io, gameState, actor, "hr_approveLeave");
    if (request.playerId) {
      const requester = gameState.players.find(p => p.id === request.playerId);
      if (requester) adjustSatisfaction(io, gameState, requester, payload.status === "Approuvé" ? 5 : -10);
    }
  });

  socket.on("hr:toggleOnboarding", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!target || !target.onboarding || !target.onboarding[payload.index]) return;

    const wasDone = target.onboarding[payload.index].done;
    target.onboarding[payload.index].done = !wasDone;
    io.to("access:hr").emit("hr:rosterUpdate", hrRosterView(gameState));
    if (!wasDone) {
      adjustMorale(gameState, 1);
      io.to("access:hr").emit("hr:update", gameState.hr);
      awardPoints(io, gameState, actor, "hr_onboardingDone");
    }
  });

  socket.on("hr:interviewCandidate", payload => {
    if (!requireAccess(socket, "hr")) return;
    const candidates = gameState.hr.candidates[payload.positionId];
    const candidate = candidates && candidates.find(c => c.id === payload.candidateId);
    if (!candidate) return;
    candidate.interviewed = true;
    io.to("access:hr").emit("hr:update", gameState.hr);
  });

  socket.on("hr:hireCandidate", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!actor) return;
    const position = gameState.hr.openPositions.find(p => p.id === payload.positionId && p.status === "Ouvert");
    const candidates = gameState.hr.candidates[payload.positionId];
    const candidate = candidates && candidates.find(c => c.id === payload.candidateId);
    if (!position || !candidate) return;
    if (!candidate.interviewed) {
      socket.emit("hr:hire:rejected", { reason: "Il faut avoir interviewé ce candidat avant de l'embaucher." });
      return;
    }

    position.status = "Pourvu";
    gameState.hr.headcountNPC += 1;
    delete gameState.hr.candidates[payload.positionId];

    const kpis = gameState.financeKPIs;
    kpis.netIncome = round1(kpis.netIncome - candidate.monthlySalary);
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);

    adjustMorale(gameState, 3);
    io.to("access:hr").emit("hr:update", gameState.hr);
    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a embauché " + candidate.name + " (" + candidate.level + ", " + position.dept + ")."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, actor, "hr_hireCandidate");
  });

  socket.on("hr:distributeBonus", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!actor) return;
    if (isBonusDistributionRestricted(gameState)) {
      socket.emit("hr:distributeBonus:rejected", { reason: "Distribution de bonus restreinte — un Stress Test réglementaire récent a échoué (ratio Tier 1 sous le seuil Basel)." });
      return;
    }
    const allocations = payload.allocations || {};
    const pool = round1(gameState.financeKPIs.netIncome * BONUS_POOL_RATE);

    let total = 0;
    const entries = [];
    for (const playerId of Object.keys(allocations)) {
      const amount = Number(allocations[playerId]);
      if (Number.isNaN(amount) || amount < 0) continue;
      const target = gameState.players.find(p => p.id === playerId);
      if (!target || amount === 0) continue;
      entries.push({ target, amount: round1(amount) });
      total += amount;
    }

    if (round1(total) > pool) {
      socket.emit("hr:distributeBonus:rejected", { reason: "Le total dépasse le pool disponible (" + pool + " M$)." });
      return;
    }
    if (!entries.length) {
      socket.emit("hr:distributeBonus:rejected", { reason: "Aucune allocation valide." });
      return;
    }

    entries.forEach(({ target, amount }) => {
      awardCustomPoints(io, gameState, target, Math.round(amount * 10), amount);
    });
    awardPoints(io, gameState, actor, "hr_distributeBonus");

    adjustMorale(gameState, 5);
    io.to("access:hr").emit("hr:update", gameState.hr);
    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a réparti " + round1(total) + " M$ de primes entre " + entries.length + " collaborateur(s)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  // HR-3 Compensation & Bonus Pool -- same live pool as the manual distribution
  // above, but split automatically: proportional to each connected player's
  // current score (a simple, defensible "who's actually contributing" proxy,
  // same idea as the day-bonus payout in server/marketDay.js), no per-player
  // input required from the DRH.
  socket.on("hr:autoDistributeBonus", () => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!actor) return;
    if (isBonusDistributionRestricted(gameState)) {
      socket.emit("hr:distributeBonus:rejected", { reason: "Distribution de bonus restreinte — un Stress Test réglementaire récent a échoué (ratio Tier 1 sous le seuil Basel)." });
      return;
    }
    const pool = round1(gameState.financeKPIs.netIncome * BONUS_POOL_RATE);
    if (pool <= 0) {
      socket.emit("hr:distributeBonus:rejected", { reason: "Aucune enveloppe disponible (résultat net non positif)." });
      return;
    }

    const totalScore = gameState.players.reduce((sum, p) => {
      const key = (p.firstName + "|" + p.lastName).trim().toLowerCase();
      const entry = gameState.playerScores[key];
      return sum + Math.max(0, entry ? entry.score : 0);
    }, 0);
    if (totalScore <= 0) {
      socket.emit("hr:distributeBonus:rejected", { reason: "Aucun score positif à répartir pour l'instant." });
      return;
    }

    let distributed = 0;
    gameState.players.forEach(p => {
      const key = (p.firstName + "|" + p.lastName).trim().toLowerCase();
      const entry = gameState.playerScores[key];
      const score = Math.max(0, entry ? entry.score : 0);
      if (score <= 0) return;
      const share = round1(pool * (score / totalScore));
      if (share <= 0) return;
      awardCustomPoints(io, gameState, p, Math.round(share * 10), share);
      distributed += share;
    });

    awardPoints(io, gameState, actor, "hr_distributeBonus");
    adjustMorale(gameState, 5);
    io.to("access:hr").emit("hr:update", gameState.hr);
    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a lancé une répartition automatique du bonus pool (" + round1(distributed) + " M$, au prorata du score)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  // HR-1 Organigramme & RH Core -- promotion: bumps grade one step up GRADES,
  // which raises baseSalary by the formula above (the real "hausse de salaire de
  // base" cost) and boosts satisfaction. Access/cluster/isHeadOfCIB are all
  // recomputed since crossing the Managing Director threshold (hasFullAccess) or
  // becoming a CIB Director changes what pages/rooms the player should have.
  socket.on("hr:promotePlayer", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!actor || !target) return;
    const currentIdx = GRADES.indexOf(target.grade);
    if (currentIdx === -1 || currentIdx >= GRADES.length - 1) return;

    const oldAccess = target.access.slice();
    const oldGrade = target.grade;
    const oldSalary = target.baseSalary;
    target.grade = GRADES[currentIdx + 1];
    target.baseSalary = computeBaseSalary(target.grade);
    target.access = getAccessForPosition(target.dept, target.grade);
    target.hasFullAccess = hasFullAccess(target.dept, target.grade);
    target.cluster = getClusterForPosition(target.dept, target.grade);
    target.isHeadOfCIB = isHeadOfCIB(target);
    target.isDrhGlobal = isDrhGlobal(target);
    resyncPlayerAccessRooms(io, target, oldAccess);
    adjustSatisfaction(io, gameState, target, 15);
    // Write through to the account record (server/db.js) -- it's the source of
    // truth a reconnect re-derives grade/dept/salary from (Patch 28), so an
    // in-game promotion must persist there too, not just on the live object.
    if (target.userId) updateUserAssignment(target.userId, { assignedGrade: target.grade, assignedSalary: target.baseSalary });

    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a promu " + target.fullName + " : " + oldGrade + " → " + target.grade + " (salaire " + oldSalary + " → " + target.baseSalary + " M$/an)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) targetSocket.emit("hr:youWerePromoted", { player: target });
  });

  // Desk reassignment -- moves a connected player to a different department
  // (and therefore cluster/desk: M&A, Trading, Risk, etc.), same access resync
  // as promotion.
  socket.on("hr:reassignDesk", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!actor || !target || !DEPARTMENTS.includes(payload.newDept)) return;
    if (target.dept === payload.newDept) return;

    const oldAccess = target.access.slice();
    const oldDept = target.dept;
    target.dept = payload.newDept;
    target.access = getAccessForPosition(target.dept, target.grade);
    target.hasFullAccess = hasFullAccess(target.dept, target.grade);
    target.cluster = getClusterForPosition(target.dept, target.grade);
    target.isHeadOfCIB = isHeadOfCIB(target);
    target.isDrhGlobal = isDrhGlobal(target);
    resyncPlayerAccessRooms(io, target, oldAccess);
    if (target.userId) updateUserAssignment(target.userId, { assignedDept: target.dept });

    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a réaffecté " + target.fullName + " : " + oldDept + " → " + target.dept + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) targetSocket.emit("hr:youWereReassigned", { player: target });
  });
}

module.exports = {
  registerHrHandlers,
  LEAVE_TYPES,
  ONBOARDING_ITEMS,
  BONUS_POOL_RATE,
  hrRosterView,
  approveRandomLeaveRequest,
  openPosition,
  adjustMorale,
  computeBaseSalary,
  computeMonthlyPayroll,
  runPayrollDeduction,
  SALARY_BASE,
  SALARY_PER_GRADE_STEP
};
