function renderMail() {
  const myId = appState.player.id;
  const mail = [...appState.mail].sort((a, b) => b.ts - a.ts);
  const inbox = mail.filter(m => m.toPlayerId === myId);
  const sent = mail.filter(m => m.fromPlayerId === myId);
  const recipients = appState.players.filter(p => p.id !== myId);
  return `
    <div class="page-title">Mail</div>
    <div class="page-sub">Messagerie interne entre joueurs connectés.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouveau message</div>
      <div class="form-row">
        <label>Destinataire</label>
        <select id="mail-to">
          ${recipients.map(p => `<option value="${p.id}">${escapeHtml(p.fullName)} — ${escapeHtml(p.grade)}, ${escapeHtml(p.dept)}</option>`).join("") || `<option value="">Aucun autre joueur connecté</option>`}
        </select>
      </div>
      <div class="form-row"><label>Objet</label><input id="mail-subject" type="text" placeholder="Objet"/></div>
      <div class="form-row"><label>Message</label><textarea id="mail-body" rows="3" placeholder="Votre message…" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border); font-size:13px;"></textarea></div>
      <div id="mail-error" class="join-error"></div>
      <button id="mail-send" class="btn-sm" ${recipients.length === 0 ? "disabled" : ""}>Envoyer</button>
    </div>
    <div class="panel-row">
      <div class="panel">
        <div class="panel-title">Boîte de réception (${inbox.length})</div>
        ${inbox.map(m => `
          <div class="activity-row" style="display:block;">
            <div style="font-weight:600; font-size:12.5px;">${escapeHtml(m.subject)}</div>
            <div style="font-size:11px; color:var(--text-muted); margin:2px 0;">De ${escapeHtml(m.fromName)} · ${fmtTime(m.ts)}</div>
            <div style="font-size:12.5px;">${escapeHtml(m.body)}</div>
          </div>
        `).join("") || `<div class="empty-cell">Boîte vide.</div>`}
      </div>
      <div class="panel">
        <div class="panel-title">Envoyés (${sent.length})</div>
        ${sent.map(m => `
          <div class="activity-row" style="display:block;">
            <div style="font-weight:600; font-size:12.5px;">${escapeHtml(m.subject)}</div>
            <div style="font-size:11px; color:var(--text-muted); margin:2px 0;">À ${escapeHtml(m.toName)} · ${fmtTime(m.ts)}</div>
            <div style="font-size:12.5px;">${escapeHtml(m.body)}</div>
          </div>
        `).join("") || `<div class="empty-cell">Aucun message envoyé.</div>`}
      </div>
    </div>
  `;
}

function bindMail() {
  const sendBtn = document.getElementById("mail-send");
  if (!sendBtn) return;
  sendBtn.addEventListener("click", () => {
    const toPlayerId = document.getElementById("mail-to").value;
    const subject = document.getElementById("mail-subject").value;
    const body = document.getElementById("mail-body").value;
    if (!toPlayerId) return;
    socket.emit("mail:send", { toPlayerId, subject, body });
  });
}

PAGE_RENDERERS.mail = renderMail;
PAGE_BINDERS.mail = bindMail;
