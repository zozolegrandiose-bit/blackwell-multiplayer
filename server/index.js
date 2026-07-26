const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { gameState } = require("./gameState");
const { registerJoinHandlers } = require("./handlers/join");
const { registerMailHandlers } = require("./handlers/mail");
const { registerMaHandlers } = require("./handlers/ma");
const { registerClientsHandlers } = require("./handlers/clients");
const { registerComplianceHandlers } = require("./handlers/compliance");
const { registerHrHandlers } = require("./handlers/hr");
const { registerFinanceHandlers } = require("./handlers/finance");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, "..", "public")));

io.on("connection", socket => {
  socket.on("ping", () => socket.emit("pong"));
  registerJoinHandlers(io, socket, gameState);
  registerMailHandlers(io, socket, gameState);
  registerMaHandlers(io, socket, gameState);
  registerClientsHandlers(io, socket, gameState);
  registerComplianceHandlers(io, socket, gameState);
  registerHrHandlers(io, socket, gameState);
  registerFinanceHandlers(io, socket, gameState);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Blackwell & Co Multiplayer listening on port ${PORT}`);
});
