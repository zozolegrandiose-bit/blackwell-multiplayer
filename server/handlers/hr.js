const { pushActivity } = require("../gameState");

const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
let nextLeaveId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
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
}

module.exports = { registerHrHandlers, LEAVE_TYPES };
