const { pushActivity } = require("../gameState");

const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const ONBOARDING_ITEMS = ["Contrat signé", "Poste de travail", "Compte IT", "Badge d'accès", "Formation d'intégration"];
let nextLeaveId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function hrRosterView(gameState) {
  return gameState.players.map(p => ({ id: p.id, fullName: p.fullName, grade: p.grade, dept: p.dept, onboarding: p.onboarding }));
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "hr" page.
function approveRandomLeaveRequest(io, gameState, actor) {
  const eligible = gameState.hr.leaveRequests.filter(r => r.status === "En attente");
  if (!eligible.length) return false;
  const request = eligible[Math.floor(Math.random() * eligible.length)];
  request.status = "Approuvé";
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
    const request = gameState.hr.leaveRequests.find(r => r.id === payload.requestId);
    if (!request || !["Approuvé", "Refusé"].includes(payload.status)) return;
    request.status = payload.status;
    io.to("access:hr").emit("hr:update", gameState.hr);
  });

  socket.on("hr:toggleOnboarding", payload => {
    if (!requireAccess(socket, "hr")) return;
    const player = gameState.players.find(p => p.id === payload.playerId);
    if (!player || !player.onboarding || !player.onboarding[payload.index]) return;
    player.onboarding[payload.index].done = !player.onboarding[payload.index].done;
    io.to("access:hr").emit("hr:rosterUpdate", hrRosterView(gameState));
  });
}

module.exports = { registerHrHandlers, LEAVE_TYPES, ONBOARDING_ITEMS, hrRosterView, approveRandomLeaveRequest };
