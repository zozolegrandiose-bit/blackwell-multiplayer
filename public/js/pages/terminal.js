// Terminal Chat -- Bloomberg/Slack-style component. Three feeds: News (reuses
// appState.teamChat, already fed by every system in this game), Deals (ambient AI
// commentary on in-progress deals, server/terminal.js), and private real-time DMs.
function terminalFeedHtml(entries, textFn) {
  if (!entries.length) return `<div class="terminal-empty">— aucune entrée —</div>`;
  return entries.slice(0, 20).map(e => `<div class="terminal-line">${textFn(e)}</div>`).join("");
}

function renderTerminal() {
  const myId = appState.player.id;
  const news = appState.teamChat || [];
  const dealsFeed = appState.terminalDealsFeed || [];
  const dms = [...(appState.terminalDMs || [])].sort((a, b) => b.ts - a.ts);
  const recipients = (appState.players || []).filter(p => p.id !== myId);

  return `
    <div class="page-title">Terminal Chat</div>
    <div class="page-sub">News en direct, suivi des deals en cours et messagerie privée instantanée entre joueurs.</div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel terminal-panel">
        <div class="panel-title">📡 News</div>
        <div class="terminal-screen">
          ${terminalFeedHtml(news, m => `<span class="terminal-ts">${fmtTime(m.ts)}</span> <span class="terminal-tag">${escapeHtml(m.authorName)}</span> ${escapeHtml(m.text)}`)}
        </div>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <input id="terminal-news-input" type="text" maxlength="240" placeholder="Écrire dans le News… (@trading, @ma, @risk)" style="flex:1; padding:6px 9px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
          <button id="terminal-news-send" class="btn-sm">Envoyer</button>
        </div>
      </div>
      <div class="panel terminal-panel">
        <div class="panel-title">📎 Deals en cours</div>
        <div class="terminal-screen">
          ${terminalFeedHtml(dealsFeed, e => `<span class="terminal-ts">${fmtTime(e.ts)}</span> ${escapeHtml(e.text)}`)}
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">💬 Messages privés</div>
      <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
        <select id="terminal-dm-to">
          ${recipients.map(p => `<option value="${p.id}">${escapeHtml(p.fullName)} — ${escapeHtml(p.grade)}, ${escapeHtml(p.dept)}</option>`).join("") || `<option value="">Aucun autre joueur connecté</option>`}
        </select>
        <input id="terminal-dm-body" type="text" placeholder="Votre message…" style="flex:1; min-width:200px; padding:7px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12.5px;"/>
        <button id="terminal-dm-send" class="btn-sm" ${recipients.length === 0 ? "disabled" : ""}>Envoyer</button>
      </div>
      <div id="terminal-dm-error" class="join-error"></div>
      <div class="terminal-screen">
        ${terminalFeedHtml(dms, m => {
          const outgoing = m.fromPlayerId === myId;
          return `<span class="terminal-ts">${fmtTime(m.ts)}</span> <span class="terminal-tag">${outgoing ? "→ " + escapeHtml(m.toName) : escapeHtml(m.fromName) + " →"}</span> ${escapeHtml(m.body)}`;
        })}
      </div>
    </div>
  `;
}

function bindTerminal() {
  const sendBtn = document.getElementById("terminal-dm-send");
  if (sendBtn) sendBtn.addEventListener("click", () => {
    const toPlayerId = document.getElementById("terminal-dm-to").value;
    const bodyEl = document.getElementById("terminal-dm-body");
    const body = bodyEl.value.trim();
    const errEl = document.getElementById("terminal-dm-error");
    if (errEl) errEl.textContent = "";
    if (!toPlayerId || !body) return;
    socket.emit("terminal:sendDM", { toPlayerId, body });
    bodyEl.value = "";
  });

  const newsInput = document.getElementById("terminal-news-input");
  const newsSendBtn = document.getElementById("terminal-news-send");
  if (newsInput && newsSendBtn) {
    const send = () => {
      const body = newsInput.value.trim();
      if (!body) return;
      socket.emit("teamChat:post", { body });
      newsInput.value = "";
    };
    newsSendBtn.addEventListener("click", send);
    newsInput.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  }
}

PAGE_RENDERERS.terminal = renderTerminal;
PAGE_BINDERS.terminal = bindTerminal;
