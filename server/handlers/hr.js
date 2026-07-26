const { pushActivity } = require("../gameState");
const { awardPoints, awardCustomPoints } = require("../scoring");
const { DEPARTMENT_CLUSTER } = require("../departmentAccess");

const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const ONBOARDING_ITEMS = ["Contrat signé", "Poste de travail", "Compte IT", "Badge d'accès", "Formation d'intégration"];
const BONUS_POOL_RATE = 0.10;

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
  const depts = Object.keys(DEPARTMENT_CLUSTER).filter(d => d !== "Direction Générale");
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

    adjustMorale(gameState, 5);
    io.to("access:hr").emit("hr:update", gameState.hr);
    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a réparti " + round1(total) + " M$ de primes entre " + entries.length + " collaborateur(s)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
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
  adjustMorale
};
