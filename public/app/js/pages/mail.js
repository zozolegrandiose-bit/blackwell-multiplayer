// Mail -- Outlook-style 3-pane layout (Patch 24): folder rail, message list,
// reading pane. Purely presentational -- same mail:send handler and gameState
// shape as before, only the client-side rendering changed. Folder/selection/
// compose state is transient UI state, not game state, so it lives in plain
// module-level variables here rather than appState.
let mailFolder = "inbox";
let mailSelectedId = null;
let mailComposing = false;

function mailListItemHtml(m, isSelected, folder) {
  const counterpart = folder === "inbox" ? m.fromName : m.toName;
  const prefix = folder === "inbox" ? "" : "À : ";
  return `
    <div class="outlook-list-item ${isSelected ? "active" : ""}" data-mail-select="${m.id}">
      <div class="outlook-list-item-top">
        <span class="outlook-list-item-name">${prefix}${escapeHtml(counterpart)}</span>
        <span class="outlook-list-item-time">${fmtTime(m.ts)}</span>
      </div>
      <div class="outlook-list-item-subject">${escapeHtml(m.subject || "(sans objet)")}</div>
      <div class="outlook-list-item-preview">${escapeHtml((m.body || "").slice(0, 60))}</div>
    </div>
  `;
}

function mailComposeHtml(recipients) {
  return `
    <div class="outlook-reading-pane">
      <div class="panel-title" style="margin-bottom:14px;">Nouveau message</div>
      <div class="form-row">
        <label>Destinataire</label>
        <select id="mail-to">
          ${recipients.map(p => `<option value="${p.id}">${escapeHtml(p.fullName)} — ${escapeHtml(p.grade)}, ${escapeHtml(p.dept)}</option>`).join("") || `<option value="">Aucun autre joueur connecté</option>`}
        </select>
      </div>
      <div class="form-row"><label>Objet</label><input id="mail-subject" type="text" placeholder="Objet"/></div>
      <div class="form-row"><label>Message</label><textarea id="mail-body" rows="8" placeholder="Votre message…" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border); font-size:13px;"></textarea></div>
      <div id="mail-error" class="join-error"></div>
      <button id="mail-send" class="btn-sm" ${recipients.length === 0 ? "disabled" : ""}>Envoyer</button>
    </div>
  `;
}

function mailReadingPaneHtml(message, folder) {
  if (!message) {
    return `<div class="outlook-reading-pane outlook-reading-empty">Sélectionnez un message pour l'afficher.</div>`;
  }
  const counterpartLabel = folder === "inbox" ? "De" : "À";
  const counterpartName = folder === "inbox" ? message.fromName : message.toName;
  return `
    <div class="outlook-reading-pane">
      <div class="outlook-reading-subject">${escapeHtml(message.subject || "(sans objet)")}</div>
      <div class="outlook-reading-meta">${counterpartLabel} ${escapeHtml(counterpartName)} · ${fmtTime(message.ts)}</div>
      <div class="outlook-reading-body">${escapeHtml(message.body)}</div>
    </div>
  `;
}

function renderMail() {
  const myId = appState.player.id;
  const mail = [...appState.mail].sort((a, b) => b.ts - a.ts);
  const inbox = mail.filter(m => m.toPlayerId === myId);
  const sent = mail.filter(m => m.fromPlayerId === myId);
  const recipients = appState.players.filter(p => p.id !== myId);
  const currentList = mailFolder === "inbox" ? inbox : sent;
  const selectedMessage = currentList.find(m => m.id === mailSelectedId) || null;

  return `
    <div class="page-title">Mail</div>
    <div class="page-sub">Messagerie interne entre joueurs connectés.</div>
    <div class="outlook-shell">
      <div class="outlook-rail">
        <button id="mail-new-btn" class="btn-brass" style="margin-bottom:12px;">✚ Nouveau message</button>
        <div class="outlook-rail-item ${mailFolder === "inbox" ? "active" : ""}" data-mail-folder="inbox">📥 Boîte de réception <span class="outlook-rail-count">${inbox.length}</span></div>
        <div class="outlook-rail-item ${mailFolder === "sent" ? "active" : ""}" data-mail-folder="sent">📤 Envoyés <span class="outlook-rail-count">${sent.length}</span></div>
      </div>
      <div class="outlook-list">
        ${currentList.map(m => mailListItemHtml(m, m.id === mailSelectedId && !mailComposing, mailFolder)).join("") || `<div class="empty-cell">${mailFolder === "inbox" ? "Boîte vide." : "Aucun message envoyé."}</div>`}
      </div>
      ${mailComposing ? mailComposeHtml(recipients) : mailReadingPaneHtml(selectedMessage, mailFolder)}
    </div>
  `;
}

function bindMail() {
  document.querySelectorAll("[data-mail-folder]").forEach(el => {
    el.addEventListener("click", () => {
      mailFolder = el.getAttribute("data-mail-folder");
      mailSelectedId = null;
      mailComposing = false;
      renderApp();
    });
  });
  document.querySelectorAll("[data-mail-select]").forEach(el => {
    el.addEventListener("click", () => {
      mailSelectedId = el.getAttribute("data-mail-select");
      mailComposing = false;
      renderApp();
    });
  });
  const newBtn = document.getElementById("mail-new-btn");
  if (newBtn) newBtn.addEventListener("click", () => {
    mailComposing = true;
    mailSelectedId = null;
    renderApp();
  });
  const sendBtn = document.getElementById("mail-send");
  if (sendBtn) sendBtn.addEventListener("click", () => {
    const toPlayerId = document.getElementById("mail-to").value;
    const subject = document.getElementById("mail-subject").value;
    const body = document.getElementById("mail-body").value;
    if (!toPlayerId) return;
    socket.emit("mail:send", { toPlayerId, subject, body });
    mailComposing = false;
    renderApp();
  });
}

PAGE_RENDERERS.mail = renderMail;
PAGE_BINDERS.mail = bindMail;
