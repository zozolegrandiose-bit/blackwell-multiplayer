let nextMailId = 1;

function registerMailHandlers(io, socket, gameState) {
  socket.on("mail:send", payload => {
    const playerId = socket.data.playerId;
    if (!playerId) return;
    if (!socket.rooms.has("access:mail")) return;

    const sender = gameState.players.find(p => p.id === playerId);
    if (!sender) return;
    const recipient = gameState.players.find(p => p.id === payload.toPlayerId);
    if (!recipient) {
      socket.emit("mail:send:rejected", { reason: "Destinataire introuvable ou déconnecté." });
      return;
    }

    const subject = (payload.subject || "").trim() || "(sans objet)";
    const body = (payload.body || "").trim();
    if (!body) {
      socket.emit("mail:send:rejected", { reason: "Le message ne peut pas être vide." });
      return;
    }

    const message = {
      id: "m" + (nextMailId++),
      fromPlayerId: sender.id,
      fromName: sender.fullName,
      toPlayerId: recipient.id,
      toName: recipient.fullName,
      subject,
      body,
      ts: Date.now(),
      read: false
    };
    gameState.mail.push(message);

    socket.emit("mail:new", message);
    if (recipient.socketId !== socket.id) {
      io.to(recipient.socketId).emit("mail:new", message);
    }
  });
}

module.exports = { registerMailHandlers };
