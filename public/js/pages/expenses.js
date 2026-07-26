const EXPENSE_CATEGORIES = ["Transport", "Hôtel", "Repas d'affaires", "Divers"];
const EXPENSE_STATUS_CLASS = { "En attente": "chip-warning", "Approuvé": "chip-good", "Refusé": "chip-critical" };

function canApproveExpenses() {
  const p = appState.player;
  return !!p && (p.hasFullAccess || p.access.includes("finance") || p.access.includes("hr"));
}

function renderExpenses() {
  const reports = [...(appState.expenseReports || [])].sort((a, b) => b.ts - a.ts);
  const canApprove = canApproveExpenses();
  return `
    <div class="page-title">Notes de frais</div>
    <div class="page-sub">Soumission et approbation des notes de frais.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouvelle note de frais</div>
      <div class="form-row"><label>Catégorie</label>
        <select id="exp-category">${EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Montant (€)</label><input id="exp-amount" type="number" step="1" placeholder="ex. 120"/></div>
      <div class="form-row"><label>Description</label><input id="exp-desc" type="text" placeholder="ex. Taxi aéroport"/></div>
      <div id="exp-error" class="join-error"></div>
      <button id="exp-submit" class="btn-sm">Soumettre</button>
    </div>
    <div class="panel">
      <div class="panel-title">Notes de frais (${reports.length})</div>
      <table class="data-table">
        <thead><tr><th>Collaborateur</th><th>Catégorie</th><th>Montant</th><th>Description</th><th>Statut</th>${canApprove ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${reports.map(r => `
            <tr>
              <td>${escapeHtml(r.playerName)}</td>
              <td>${escapeHtml(r.category)}</td>
              <td class="tnum">${r.amount} €</td>
              <td>${escapeHtml(r.description) || "—"}</td>
              <td><span class="chip ${EXPENSE_STATUS_CLASS[r.status]}">${r.status}</span></td>
              ${canApprove ? `<td>
                ${r.status === "En attente" ? `
                  <button data-exp-approve="${r.id}" class="btn-sm">Approuver</button>
                  <button data-exp-deny="${r.id}" class="btn-sm">Refuser</button>
                ` : ""}
              </td>` : ""}
            </tr>
          `).join("") || `<tr><td colspan="${canApprove ? 6 : 5}" class="empty-cell">Aucune note de frais.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindExpenses() {
  const submitBtn = document.getElementById("exp-submit");
  if (submitBtn) submitBtn.addEventListener("click", () => {
    socket.emit("expenses:submit", {
      category: document.getElementById("exp-category").value,
      amount: document.getElementById("exp-amount").value,
      description: document.getElementById("exp-desc").value
    });
  });
  document.querySelectorAll("[data-exp-approve]").forEach(el => {
    el.addEventListener("click", () => socket.emit("expenses:setStatus", { expenseId: el.getAttribute("data-exp-approve"), status: "Approuvé" }));
  });
  document.querySelectorAll("[data-exp-deny]").forEach(el => {
    el.addEventListener("click", () => socket.emit("expenses:setStatus", { expenseId: el.getAttribute("data-exp-deny"), status: "Refusé" }));
  });
}

PAGE_RENDERERS.expenses = renderExpenses;
PAGE_BINDERS.expenses = bindExpenses;
