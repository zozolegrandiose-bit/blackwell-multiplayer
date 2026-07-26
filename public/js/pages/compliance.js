const COMPLIANCE_TYPES = ["Surveillance marché", "Éthique & Déontologie", "KYC/AML", "Réglementaire"];
const COMPLIANCE_STATUSES = ["Ouvert", "En cours d'analyse", "Résolu", "Escaladé"];

function slaBadge(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  const cls = days >= 7 ? "chip-critical" : days >= 3 ? "chip-warning" : "chip-good";
  return `<span class="chip ${cls}">${days} j</span>`;
}

function renderCompliance() {
  const items = [...(appState.complianceItems || [])].sort((a, b) => b.ts - a.ts);
  const assignableplayers = appState.players || [];
  return `
    <div class="page-title">Conformité</div>
    <div class="page-sub">Alertes et suivi réglementaire.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouvelle alerte</div>
      <div class="form-row"><label>Type</label>
        <select id="cp-type">${COMPLIANCE_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Desk / département concerné</label><input id="cp-desk" type="text" placeholder="ex. Bureau Actions"/></div>
      <div class="form-row"><label>Description</label><textarea id="cp-flag" rows="2" placeholder="Description de l'alerte…" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--line-200); font-size:13px;"></textarea></div>
      <div id="cp-error" class="join-error"></div>
      <button id="cp-create" class="btn-sm">Signaler</button>
    </div>
    <div class="panel">
      <div class="panel-title">Alertes (${items.length})</div>
      <table class="data-table">
        <thead><tr><th>Type</th><th>Desk</th><th>Description</th><th>Ancienneté</th><th>Assigné à</th><th>Statut</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td>${escapeHtml(i.type)}</td>
              <td>${escapeHtml(i.desk)}</td>
              <td>${escapeHtml(i.flag)}</td>
              <td>${slaBadge(i.ts)}</td>
              <td>
                <select data-cp-assign="${i.id}" class="btn-sm">
                  <option value="">— Non assigné —</option>
                  ${assignableplayers.map(p => `<option value="${p.id}" ${i.assignedToPlayerId === p.id ? "selected" : ""}>${escapeHtml(p.fullName)}</option>`).join("")}
                </select>
              </td>
              <td><select data-cp-status="${i.id}" class="btn-sm">${COMPLIANCE_STATUSES.map(s => `<option value="${s}" ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
            </tr>
          `).join("") || `<tr><td colspan="6" class="empty-cell">Aucune alerte pour l'instant.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindCompliance() {
  const createBtn = document.getElementById("cp-create");
  if (createBtn) createBtn.addEventListener("click", () => {
    socket.emit("compliance:create", {
      type: document.getElementById("cp-type").value,
      desk: document.getElementById("cp-desk").value,
      flag: document.getElementById("cp-flag").value
    });
  });
  document.querySelectorAll("[data-cp-status]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("compliance:updateStatus", { itemId: el.getAttribute("data-cp-status"), status: el.value });
    });
  });
  document.querySelectorAll("[data-cp-assign]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("compliance:assign", { itemId: el.getAttribute("data-cp-assign"), playerId: el.value || null });
    });
  });
}

PAGE_RENDERERS.compliance = renderCompliance;
PAGE_BINDERS.compliance = bindCompliance;
