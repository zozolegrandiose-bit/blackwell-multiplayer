// Terminal Chat -- Teams-style layout (Patch 24): a channel rail (News, Deals,
// one-on-one DM threads) on the left, a single conversation pane on the right
// with its own composer, instead of three stacked panels. Same underlying
// events (teamChat:post, terminal:sendDM) and gameState shape as before --
// only the client-side rendering changed.
let terminalChannel = "news"; // "news" | "deals" | "dm:<playerId>"

function terminalMessageHtml(authorLabel, text, ts, outgoing) {
  return `
    <div class="activity-row" style="${outgoing ? "border-left:3px solid var(--accent); padding-left:8px;" : ""}">
      <span class="activity-time">${fmtTime(ts)}</span>
      <span class="activity-text"><b>${escapeHtml(authorLabel)}</b> — ${escapeHtml(text)}</span>
    </div>
  `;
}

function terminalConversationHtml(myId) {
  if (terminalChannel === "news") {
    const news = appState.teamChat || [];
    return news.slice(0, 40).map(m => terminalMessageHtml(m.authorName, m.text, m.ts, false)).join("") || `<div class="terminal-empty">— aucune entrée —</div>`;
  }
  if (terminalChannel === "deals") {
    const dealsFeed = appState.terminalDealsFeed || [];
    return dealsFeed.slice(0, 40).map(e => terminalMessageHtml("Deals", e.text, e.ts, false)).join("") || `<div class="terminal-empty">— aucune entrée —</div>`;
  }
  const peerId = terminalChannel.slice(3);
  const dms = (appState.terminalDMs || []).filter(m => m.fromPlayerId === peerId || m.toPlayerId === peerId).sort((a, b) => a.ts - b.ts);
  return dms.map(m => {
    const outgoing = m.fromPlayerId === myId;
    return terminalMessageHtml(outgoing ? "Vous" : m.fromName, m.body, m.ts, outgoing);
  }).join("") || `<div class="terminal-empty">— aucun message —</div>`;
}

function terminalChannelLabel(peers) {
  if (terminalChannel === "news") return "📡 News";
  if (terminalChannel === "deals") return "📎 Deals en cours";
  const peer = peers.find(p => "dm:" + p.id === terminalChannel);
  return peer ? "💬 " + peer.fullName : "💬 Messages privés";
}

function renderTerminal() {
  const myId = appState.player.id;
  const peers = (appState.players || []).filter(p => p.id !== myId);
  const showComposer = terminalChannel !== "deals";

  return `
    <div class="page-title">Terminal Chat</div>
    <div class="page-sub">News en direct, suivi des deals en cours et messagerie privée instantanée entre joueurs.</div>
    <div class="teams-shell">
      <div class="teams-rail">
        <div class="teams-rail-section">Canaux</div>
        <div class="teams-rail-item ${terminalChannel === "news" ? "active" : ""}" data-terminal-channel="news">📡 News</div>
        <div class="teams-rail-item ${terminalChannel === "deals" ? "active" : ""}" data-terminal-channel="deals">📎 Deals en cours</div>
        <div class="teams-rail-section">Messages privés</div>
        ${peers.map(p => `<div class="teams-rail-item ${terminalChannel === "dm:" + p.id ? "active" : ""}" data-terminal-channel="dm:${p.id}">${avatarHtml(p.fullName, 18)} ${escapeHtml(p.fullName)}</div>`).join("") || `<div style="font-size:11px; color:var(--text-muted); padding:6px 8px;">Aucun autre joueur connecté.</div>`}
      </div>
      <div class="teams-main">
        <div class="teams-header">${terminalChannelLabel(peers)}</div>
        <div class="teams-conversation">${terminalConversationHtml(myId)}</div>
        ${showComposer ? `
          <div id="terminal-dm-error" class="join-error" style="padding:0 18px;"></div>
          <div class="teams-composer">
            <input id="terminal-composer-input" type="text" maxlength="240" placeholder="${terminalChannel === "news" ? "Écrire dans le News… (@trading, @ma, @risk)" : "Votre message…"}" style="flex:1; padding:8px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12.5px;"/>
            <button id="terminal-composer-send" class="btn-sm" ${terminalChannel.startsWith("dm:") && peers.length === 0 ? "disabled" : ""}>Envoyer</button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function bindTerminal() {
  document.querySelectorAll("[data-terminal-channel]").forEach(el => {
    el.addEventListener("click", () => {
      terminalChannel = el.getAttribute("data-terminal-channel");
      renderApp();
    });
  });

  const input = document.getElementById("terminal-composer-input");
  const sendBtn = document.getElementById("terminal-composer-send");
  if (!input || !sendBtn) return;

  const send = () => {
    const body = input.value.trim();
    if (!body) return;
    if (terminalChannel === "news") {
      socket.emit("teamChat:post", { body });
    } else if (terminalChannel.startsWith("dm:")) {
      const toPlayerId = terminalChannel.slice(3);
      const errEl = document.getElementById("terminal-dm-error");
      if (errEl) errEl.textContent = "";
      socket.emit("terminal:sendDM", { toPlayerId, body });
    }
    input.value = "";
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
}

PAGE_RENDERERS.terminal = renderTerminal;
PAGE_BINDERS.terminal = bindTerminal;
