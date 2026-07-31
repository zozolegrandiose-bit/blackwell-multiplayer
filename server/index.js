const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { gameState } = require("./gameState");
const { primeGameStateFromHistory } = require("./persistence");
const { sessionMiddleware } = require("./sessionMiddleware");
const { registerAuthRoutes, requireApproved, requireSuperAdmin } = require("./auth");
const { registerAdminRoutes } = require("./admin");
const { registerCareersRoutes } = require("./jobs");
const { loadDb, ensureSuperAdmin, findUserById } = require("./db");
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
const { startMarketDayLoop } = require("./marketDay");
const { registerWarRoomHandlers, startWarRoomLoop } = require("./warRoom");
const { registerMercatoHandlers, startMercatoLoop } = require("./mercato");
const { registerCibBonusHandlers } = require("./cibBonus");
const { registerIpoHandlers, startIpoLoop } = require("./ipo");
const { registerTerminalHandlers, startTerminalLoop } = require("./terminal");
const { registerTalentManagementHandlers, startTalentManagementLoop } = require("./talentManagement");
const { registerSocialClimatHandlers, startSocialClimatLoop } = require("./socialClimat");
const { registerComplianceHRHandlers, startComplianceHRLoop } = require("./complianceHR");
const { registerPitchbookHandlers, startPitchbookLoop } = require("./pitchbook");
const { registerStructuredProductsHandlers, startStructuredProductsLoop } = require("./structuredProducts");
const { registerInterbankHandlers, startInterbankLoop } = require("./interbank");
const { registerRiskControlHandlers, startRiskControlLoop } = require("./riskControl");
const { registerRfqHandlers, startRfqLoop } = require("./rfq");
const { registerDataRoomHandlers } = require("./dataRoom");
const { registerNegotiationHandlers, startNegotiationLoop } = require("./negotiation");
const { registerGlobalBankHandlers, startGlobalBankLoop } = require("./globalBank");
const { registerAiAgentsHandlers, startAiAgentsHeartbeat } = require("./aiAgents");
const { registerRivalAggressionHandlers, startRivalAggressionLoops } = require("./rivalAggression");
const { startCentralBankLoop } = require("./centralBank");
const { startRegulatoryStressTestLoop } = require("./regulatoryStressTest");
const { registerPrivateBankingHandlers, startPrivateBankingLoop } = require("./privateBanking");
const { registerAlgoTradingHandlers, startAlgoTradingLoop } = require("./algoTrading");
const { registerHostileTakeoverHandlers, startHostileTakeoverLoop } = require("./hostileTakeover");

primeGameStateFromHistory(gameState);
loadDb();
ensureSuperAdmin();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(sessionMiddleware);
registerAuthRoutes(app);
registerAdminRoutes(app);
registerCareersRoutes(app);

// Public institutional site (Patch 27): / , /about, /solutions, /csr, /press,
// /careers, /login, /register are plain pages, no auth required.
app.use("/site", express.static(path.join(__dirname, "..", "public", "site")));
const PUBLIC_PAGES = {
  "/": "index.html",
  "/about": "about.html",
  "/solutions": "solutions.html",
  "/csr": "csr.html",
  "/press": "press.html",
  "/careers": "careers.html",
  "/login": "login.html",
  "/register": "register.html"
};
Object.entries(PUBLIC_PAGES).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, "..", "public", "site", file)));
});
app.get("/admin", requireSuperAdmin, (req, res) => res.sendFile(path.join(__dirname, "..", "public", "site", "admin.html")));

// The game itself, strictly gated: only a logged-in, APPROVED account may
// load /app or any of its static assets.
app.use("/app", requireApproved, express.static(path.join(__dirname, "..", "public", "app")));

// Share the same session with Socket.io's handshake (socket.io >= 4.6) so a
// socket connection can be tied back to the same logged-in account as the
// page that opened it.
io.engine.use(sessionMiddleware);

io.on("connection", socket => {
  const sessionUserId = socket.request.session && socket.request.session.userId;
  const accountUser = sessionUserId ? findUserById(sessionUserId) : null;
  if (!accountUser || accountUser.status !== "APPROVED") {
    socket.disconnect(true);
    return;
  }
  socket.data.accountUser = accountUser;

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
  registerWarRoomHandlers(io, socket, gameState);
  registerMercatoHandlers(io, socket, gameState);
  registerCibBonusHandlers(io, socket, gameState);
  registerIpoHandlers(io, socket, gameState);
  registerTerminalHandlers(io, socket, gameState);
  registerTalentManagementHandlers(io, socket, gameState);
  registerSocialClimatHandlers(io, socket, gameState);
  registerComplianceHRHandlers(io, socket, gameState);
  registerPitchbookHandlers(io, socket, gameState);
  registerStructuredProductsHandlers(io, socket, gameState);
  registerInterbankHandlers(io, socket, gameState);
  registerRiskControlHandlers(io, socket, gameState);
  registerRfqHandlers(io, socket, gameState);
  registerDataRoomHandlers(io, socket, gameState);
  registerNegotiationHandlers(io, socket, gameState);
  registerGlobalBankHandlers(io, socket, gameState);
  registerAiAgentsHandlers(io, socket, gameState);
  registerRivalAggressionHandlers(io, socket, gameState);
  registerPrivateBankingHandlers(io, socket, gameState);
  registerAlgoTradingHandlers(io, socket, gameState);
  registerHostileTakeoverHandlers(io, socket, gameState);
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
startMarketDayLoop(io, gameState);
startWarRoomLoop(io, gameState);
startMercatoLoop(io, gameState);
startIpoLoop(io, gameState);
startTerminalLoop(io, gameState);
startTalentManagementLoop(io, gameState);
startSocialClimatLoop(io, gameState);
startComplianceHRLoop(io, gameState);
startPitchbookLoop(io, gameState);
startStructuredProductsLoop(io, gameState);
startInterbankLoop(io, gameState);
startRiskControlLoop(io, gameState);
startRfqLoop(io, gameState);
startNegotiationLoop(io, gameState);
startGlobalBankLoop(io, gameState);
startAiAgentsHeartbeat(io, gameState);
startRivalAggressionLoops(io, gameState);
startCentralBankLoop(io, gameState);
startRegulatoryStressTestLoop(io, gameState);
startPrivateBankingLoop(io, gameState);
startAlgoTradingLoop(io, gameState);
startHostileTakeoverLoop(io, gameState);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Blackwell & Co Multiplayer listening on port ${PORT}`);
});
