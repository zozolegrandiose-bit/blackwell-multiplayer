const { pushActivity } = require("../gameState");

let nextMeetingId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerAgendaHandlers(io, socket, gameState) {
  socket.on("agenda:create", payload => {
    if (!requireAccess(socket, "agenda")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const title = (payload.title || "").trim();
    if (!title || !payload.date) {
      socket.emit("agenda:create:rejected", { reason: "Titre et date requis." });
      return;
    }

    const participantIds = Array.isArray(payload.participants) ? payload.participants : [];
    const participants = gameState.players
      .filter(p => participantIds.includes(p.id))
      .map(p => ({ id: p.id, fullName: p.fullName }));

    const meeting = {
      id: "ag" + (nextMeetingId++),
      title,
      date: payload.date,
      time: payload.time || "09:00",
      participants,
      createdByPlayerId: player.id,
      createdByName: player.fullName
    };
    gameState.agenda.push(meeting);

    io.to("access:agenda").emit("agenda:update", gameState.agenda);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "agenda",
      text: player.fullName + " a créé une réunion : « " + title + " »."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

module.exports = { registerAgendaHandlers };
