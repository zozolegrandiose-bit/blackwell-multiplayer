const CLIENT_STATUSES = ["Prospect", "Actif", "En revue", "Inactif"];
const CLIENT_FEE_RATE = 0.015;

function renderClients() {
  const clients = appState.clients || [];
  return `
    <div class="page-title">Clients</div>
    <div class="page-sub">Portefeuille clients partagé — dealmaking, marchés, gestion de fortune.</div>
    ${taskPanelHtml("clients")}
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouveau client</div>
      <div class="form-row"><label>Nom</label><input id="cl-name" type="text" placeholder="ex. Kestrel Infrastructure Partners"/></div>
      <div class="form-row"><label>Secteur</label><input id="cl-industry" type="text" placeholder="ex. Fonds d'infrastructure"/></div>
      <div class="form-row"><label>AUM (M$)</label><input id="cl-aum" type="number" placeholder="ex. 3800"/></div>
      <div class="form-row"><label>Risque</label>
        <select id="cl-risk"><option value="Low">Faible</option><option value="Medium" selected>Moyen</option><option value="High">Élevé</option></select>
      </div>
      <div id="cl-error" class="join-error"></div>
      <button id="cl-create" class="btn-sm">Ajouter le client</button>
    </div>
    <div class="panel">
      <div class="panel-title">Portefeuille (${clients.length})</div>
      ${clients.map(c => {
        const kyc = c.kycChecklist || [];
        const kycDone = kyc.filter(k => k.done).length;
        const feeEstimate = c.aum * CLIENT_FEE_RATE;
        return `
        <div class="activity-row" style="display:block; padding:10px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700; font-size:13px;">${escapeHtml(c.name)}</div>
            <select data-cl-status="${c.id}" class="btn-sm">
              ${CLIENT_STATUSES.map(s => `<option value="${s}" ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin:4px 0;">${escapeHtml(c.industry)} · AUM ${fmtMoney(c.aum)} · Risque ${escapeHtml(c.risk)} · Chargé de relation : ${escapeHtml(c.rmName)}</div>
          <div style="font-size:11.5px; margin-bottom:6px;">Revenus de frais estimés (1,5 % AUM) : <b>${fmtMoney(feeEstimate)}</b>/an</div>
          <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:8px;">
            <div>
              <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:4px;">KYC / Onboarding (${kycDone}/${kyc.length})</div>
              ${kyc.map((k, i) => `
                <label style="display:block; font-size:12px; margin-bottom:2px;">
                  <input type="checkbox" data-cl-kyc="${c.id}|${i}" ${k.done ? "checked" : ""}/> ${escapeHtml(k.item)}
                </label>
              `).join("")}
            </div>
          </div>
          <div style="margin-top:6px;">
            ${c.notes.map(n => `<div style="font-size:11.5px; margin-bottom:2px;"><b>${escapeHtml(n.authorName)}</b> (${fmtTime(n.ts)}) : ${escapeHtml(n.text)}</div>`).join("")}
          </div>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <input data-cl-note-input="${c.id}" type="text" placeholder="Ajouter une note…" style="flex:1; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
            <button data-cl-note-btn="${c.id}" class="btn-sm">Ajouter</button>
          </div>
        </div>
      `;
      }).join("") || `<div class="empty-cell">Aucun client pour l'instant.</div>`}
    </div>
  `;
}

function bindClients() {
  const createBtn = document.getElementById("cl-create");
  if (createBtn) createBtn.addEventListener("click", () => {
    socket.emit("clients:create", {
      name: document.getElementById("cl-name").value,
      industry: document.getElementById("cl-industry").value,
      aum: document.getElementById("cl-aum").value,
      risk: document.getElementById("cl-risk").value
    });
  });
  document.querySelectorAll("[data-cl-status]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("clients:updateStatus", { clientId: el.getAttribute("data-cl-status"), status: el.value });
    });
  });
  document.querySelectorAll("[data-cl-note-btn]").forEach(el => {
    el.addEventListener("click", () => {
      const clientId = el.getAttribute("data-cl-note-btn");
      const input = document.querySelector(`[data-cl-note-input="${clientId}"]`);
      const text = input.value.trim();
      if (!text) return;
      socket.emit("clients:addNote", { clientId, text });
    });
  });
  document.querySelectorAll("[data-cl-kyc]").forEach(el => {
    el.addEventListener("change", () => {
      const [clientId, index] = el.getAttribute("data-cl-kyc").split("|");
      socket.emit("clients:toggleKyc", { clientId, index: Number(index) });
    });
  });
  bindTaskPanel();
}

PAGE_RENDERERS.clients = renderClients;
PAGE_BINDERS.clients = bindClients;
