// Terminal Chat -- a Bloomberg/Slack-style component distinct from Mail (formal,
// subject/body inbox). Three feeds: "News" (reuses gameState.teamChat directly --
// every system in this game already posts its congrats/alert moments there, so no
// need to duplicate it), "Deals" (new ambient AI commentary about deals still in
// progress -- teamChat only covers the closing moment), and private real-time DMs
// between players.
const MAX_DEALS_FEED = 30;
const MAX_DMS = 200;
const DEALS_FEED_MIN_MS = 40 * 1000;
const DEALS_FEED_MAX_MS = 70 * 1000;

const DEAL_COMMENT_TEMPLATES = [
  (d) => "📎 « " + d.name + " » avance en " + d.stage + " (valorisation " + d.valuation + " M$).",
  (d) => "📎 Point d'étape sur « " + d.name + " » — toujours en " + d.stage + ".",
  (d) => "📎 « " + d.name + " » (" + d.valuation + " M$) reste actif, synergies estimées à " + (d.synergies || 0) + " M$.",
  (d) => "📎 L'équipe garde un œil sur « " + d.name + " » — statut : " + d.stage + "."
];

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerTerminalHandlers(io, socket, gameState) {
  socket.on("terminal:sendDM", payload => {
    if (!requireAccess(socket, "terminal")) return;
    const sender = gameState.players.find(p => p.id === socket.data.playerId);
    if (!sender) return;
    const recipient = gameState.players.find(p => p.id === payload.toPlayerId);
    if (!recipient) {
      socket.emit("terminal:sendDM:rejected", { reason: "Destinataire introuvable ou déconnecté." });
      return;
    }
    const body = (payload.body || "").trim();
    if (!body) {
      socket.emit("terminal:sendDM:rejected", { reason: "Le message ne peut pas être vide." });
      return;
    }

    const message = {
      id: "tdm" + (gameState.terminalDMs.length + 1) + "-" + Date.now(),
      fromPlayerId: sender.id,
      fromName: sender.fullName,
      toPlayerId: recipient.id,
      toName: recipient.fullName,
      body,
      ts: Date.now()
    };
    gameState.terminalDMs.push(message);
    if (gameState.terminalDMs.length > MAX_DMS) gameState.terminalDMs.shift();

    io.to(socket.id).emit("terminal:dm", message);
    if (recipient.socketId !== socket.id) {
      io.to(recipient.socketId).emit("terminal:dm", message);
    }
  });
}

// Ambient AI commentary on deals still in progress -- distinct from every other
// AI behavior in this game (which reacts to milestones/crises), this one just
// narrates ongoing state, same self-rescheduling convention as every other loop.
function postDealsFeedComment(io, gameState) {
  const openDeals = gameState.maDeals.filter(d => d.stage !== "Clôturé");
  if (!openDeals.length) return;
  const deal = openDeals[Math.floor(Math.random() * openDeals.length)];
  const template = DEAL_COMMENT_TEMPLATES[Math.floor(Math.random() * DEAL_COMMENT_TEMPLATES.length)];
  const entry = { id: "tdf" + Date.now(), text: template(deal), ts: Date.now() };
  gameState.terminalDealsFeed.unshift(entry);
  if (gameState.terminalDealsFeed.length > MAX_DEALS_FEED) gameState.terminalDealsFeed.length = MAX_DEALS_FEED;
  io.to("game").emit("terminal:dealsFeedUpdate", entry);
}

function scheduleDealsFeedLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) postDealsFeedComment(io, gameState);
    setTimeout(tick, randomDelay(DEALS_FEED_MIN_MS, DEALS_FEED_MAX_MS));
  }
  setTimeout(tick, randomDelay(DEALS_FEED_MIN_MS, DEALS_FEED_MAX_MS));
}

function startTerminalLoop(io, gameState) {
  scheduleDealsFeedLoop(io, gameState);
  console.log("Terminal Chat activé (commentaires deals toutes les 40-70s).");
}

module.exports = { registerTerminalHandlers, startTerminalLoop, postDealsFeedComment, MAX_DEALS_FEED, MAX_DMS };
