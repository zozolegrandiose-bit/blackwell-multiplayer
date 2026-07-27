const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { gameState } = require("./gameState");
const { registerJoinHandlers } = require("./handlers/join");
const { registerMailHandlers } = require("./handlers/mail");
const { registerMaHandlers, scheduleDealRiskLoop } = require("./handlers/ma");
const { registerClientsHandlers, scheduleChurnRiskLoop } = require("./handlers/clients");
const { registerComplianceHandlers } = require("./handlers/compliance");
const { registerHrHandlers } = require("./handlers/hr");
const { registerFinanceHandlers } = require("./handlers/finance");
const { startAiLoop } = require("./ai");
const { startEventLoops } = require("./events");
const { registerAgendaHandlers } = require("./handlers/agenda");
const { registerDocumentsHandlers } = require("./handlers/documents");
const { registerExpensesHandlers } = require("./handlers/expenses");
const { registerGameHandlers } = require("./handlers/game");
const { registerStrategyHandlers, startStrategyLoop } = require("./strategy");
const { registerTaskHandlers, startTaskLoop } = require("./tasks");
const { registerMarketsHandlers, startMarketsLoop } = require("./handlers/markets");
const { registerLiveEventsHandlers, startLiveEventsLoop } = require("./liveEvents");
const { registerDealWorkflowHandlers, startDealWorkflowLoop } = require("./handlers/dealWorkflow");

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
  registerAgendaHandlers(io, socket, gameState);
  registerDocumentsHandlers(io, socket, gameState);
  registerExpensesHandlers(io, socket, gameState);
  registerGameHandlers(io, socket, gameState);
  registerStrategyHandlers(io, socket, gameState);
  registerTaskHandlers(io, socket, gameState);
  registerMarketsHandlers(io, socket, gameState);
  registerLiveEventsHandlers(io, socket, gameState);
  registerDealWorkflowHandlers(io, socket, gameState);
});

startAiLoop(io, gameState);
startEventLoops(io, gameState);
startStrategyLoop(io, gameState);
startTaskLoop(io, gameState);
scheduleDealRiskLoop(io, gameState);
scheduleChurnRiskLoop(io, gameState);
startMarketsLoop(io, gameState);
startLiveEventsLoop(io, gameState);
startDealWorkflowLoop(io, gameState);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Blackwell & Co Multiplayer listening on port ${PORT}`);
});
