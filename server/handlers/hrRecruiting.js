// DRH "Recrutement International" tab (Patch 28) -- surfaces the careers-page
// candidates (server/jobs.js's public /apply, Patch 27) inside the in-game HR
// page, and lets an HR player convert one into a real, APPROVED employee
// account in one action (rather than requiring the Super-Admin to do it from
// the Admin Panel every time -- HR is who this workflow actually belongs to
// day-to-day).
const crypto = require("crypto");
const { pushActivity } = require("../gameState");
const { listCandidates, findCandidateById, markCandidateConverted, createUser, approveUser } = require("../db");

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function candidateStats() {
  const candidates = listCandidates();
  const byDept = {};
  const byCity = {};
  let converted = 0;
  candidates.forEach(c => {
    if (c.convertedToUserId) converted++;
    const dept = c.department || "Candidature spontanée";
    const city = c.city || "Non spécifiée";
    byDept[dept] = (byDept[dept] || 0) + 1;
    byCity[city] = (byCity[city] || 0) + 1;
  });
  return { total: candidates.length, converted, byDept, byCity };
}

function generateTempPassword() {
  return crypto.randomBytes(5).toString("hex");
}

function registerHrRecruitingHandlers(io, socket, gameState) {
  socket.on("hr:convertCandidate", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!actor) return;

    const candidate = findCandidateById(payload.candidateId);
    if (!candidate) {
      socket.emit("hr:convertCandidate:rejected", { reason: "Candidature introuvable." });
      return;
    }
    if (candidate.convertedToUserId) {
      socket.emit("hr:convertCandidate:rejected", { reason: "Cette candidature a déjà été convertie en employé." });
      return;
    }
    const { assignedDept, assignedGrade, assignedEntity, assignedSalary } = payload;
    if (!assignedDept || !assignedGrade || !assignedEntity) {
      socket.emit("hr:convertCandidate:rejected", { reason: "Département, grade et entité sont requis." });
      return;
    }

    const tempPassword = generateTempPassword();
    const created = createUser({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      password: tempPassword,
      deptRequested: assignedDept,
      gradeRequested: assignedGrade
    });
    if (!created.ok) {
      socket.emit("hr:convertCandidate:rejected", { reason: created.reason });
      return;
    }
    approveUser(created.user.id, { assignedDept, assignedGrade, assignedEntity, assignedSalary });
    markCandidateConverted(candidate.id, created.user.id);

    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "hr",
      text: actor.fullName + " a converti la candidature de " + candidate.firstName + " " + candidate.lastName + " en compte employé (" + assignedDept + ", " + assignedGrade + ")."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:hr").emit("hr:candidatesUpdate", { candidates: listCandidates(), stats: candidateStats() });
    socket.emit("hr:candidateConverted", {
      candidateId: candidate.id,
      email: candidate.email,
      tempPassword
    });
  });
}

module.exports = { registerHrRecruitingHandlers, candidateStats };
