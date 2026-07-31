// Private Equity, LBO & Merchant Banking (Patch 31) -- structure a leveraged
// buyout against the fund's own principal-investing capital; the deal auto-
// resolves at a rolled exit multiple after its "3-5 ans" hold horizon
// (compressed to a few real minutes, server/privateEquity.js).
function peStageClass(stage) {
  if (stage === "Clôturé") return "chip-neutral";
  return "chip-warning";
}

function pePanelHtml() {
  const pe = appState.privateEquity || { fundCapital: 0, deals: [], realizedPnL: 0 };
  const held = (pe.deals || []).filter(d => d.stage !== "Clôturé");
  const closed = (pe.deals || []).filter(d => d.stage === "Clôturé");

  return `
    <div class="kpi-grid" style="margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-label">Capital du fonds (Principal Investments)</div><div class="kpi-value">${fmtMoney(pe.fundCapital)}</div></div>
      <div class="kpi-card"><div class="kpi-label">LBO en portefeuille</div><div class="kpi-value">${held.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">P&amp;L réalisé cumulé</div><div class="kpi-value">${fmtMoney(pe.realizedPnL)}</div></div>
    </div>

    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🏦 Structurer un nouveau LBO</div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">Structure standard : 40% équity / 40% dette senior / 20% dette mezzanine, financée par le fonds Principal Investments. Horizon de détention : 3 à 5 ans (compressé en jeu).</div>
      <div class="form-row"><label>Cible</label><input id="pe-target" type="text" placeholder="ex. Meridian Logistics Group"/></div>
      <div class="form-row"><label>Secteur</label><input id="pe-sector" type="text" placeholder="ex. Logistique"/></div>
      <div class="form-row"><label>Valeur d'entreprise EV (M$)</label><input id="pe-ev" type="number" min="1" placeholder="ex. 2000"/></div>
      <div class="form-row"><label>Multiple d'entrée (x EBITDA)</label><input id="pe-multiple" type="number" min="5" max="14" step="0.5" placeholder="ex. 9"/></div>
      <div id="pe-error" class="join-error"></div>
      <button id="pe-submit" class="btn-sm">Structurer le LBO</button>
    </div>

    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Portefeuille détenu (${held.length})</div>
      <table class="data-table">
        <thead><tr><th>Cible</th><th>Secteur</th><th>EV</th><th>EBITDA</th><th>Multiple</th><th>Équity</th><th>Dette (Senior/Mezz)</th><th>Taux moyen</th><th>Structuré par</th><th>Exit dans</th></tr></thead>
        <tbody>
          ${held.map(d => `
            <tr>
              <td>${escapeHtml(d.targetName)}</td>
              <td>${escapeHtml(d.sector)}</td>
              <td class="tnum">${fmtMoney(d.enterpriseValue)}</td>
              <td class="tnum">${fmtMoney(d.ebitda)}</td>
              <td class="tnum">${d.entryMultiple}x</td>
              <td class="tnum">${fmtMoney(d.equityContribution)}</td>
              <td class="tnum">${fmtMoney(d.seniorDebt)} / ${fmtMoney(d.mezzanineDebt)}</td>
              <td class="tnum">${d.blendedRatePct}%</td>
              <td>${escapeHtml(d.openedByName)}</td>
              <td><span class="chip ${peStageClass(d.stage)}">${Math.max(0, Math.round((d.exitAt - Date.now()) / 1000))}s</span></td>
            </tr>
          `).join("") || `<tr><td colspan="10" class="empty-cell">Aucun LBO en portefeuille pour l'instant.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <div class="panel-title">Exits clôturés (${closed.length})</div>
      <table class="data-table">
        <thead><tr><th>Cible</th><th>Multiple entrée → sortie</th><th>Valeur équity à la sortie</th><th>Plus/moins-value</th></tr></thead>
        <tbody>
          ${closed.map(d => `
            <tr>
              <td>${escapeHtml(d.targetName)}</td>
              <td class="tnum">${d.entryMultiple}x → ${d.exitMultiple}x</td>
              <td class="tnum">${fmtMoney(d.equityValueAtExit)}</td>
              <td><span class="chip ${d.realizedGain >= 0 ? "chip-good" : "chip-critical"}">${d.realizedGain >= 0 ? "+" : ""}${fmtMoney(d.realizedGain)}</span></td>
            </tr>
          `).join("") || `<tr><td colspan="4" class="empty-cell">Aucun exit pour l'instant.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrivateEquity() {
  return `
    <div class="page-title">🏦 Private Equity &amp; LBO</div>
    <div class="page-sub">Desk d'Investissement Principal — la banque investit ses propres fonds dans des rachats à effet de levier, avec un vrai risque de perte à la sortie.</div>
    ${pePanelHtml()}
  `;
}

function bindPrivateEquity() {
  const submitBtn = document.getElementById("pe-submit");
  if (submitBtn) submitBtn.addEventListener("click", () => {
    socket.emit("pe:structureDeal", {
      targetName: document.getElementById("pe-target").value,
      sector: document.getElementById("pe-sector").value,
      enterpriseValue: document.getElementById("pe-ev").value,
      entryMultiple: document.getElementById("pe-multiple").value
    });
  });
}

socket.on("privateEquity:update", data => {
  if (!window.currentPlayer) return;
  appState.privateEquity = data;
  if (appState.currentPage === "privateEquity") renderApp();
});

socket.on("pe:structureDeal:rejected", data => {
  const errEl = document.getElementById("pe-error");
  if (errEl) errEl.textContent = data.reason;
});

PAGE_RENDERERS.privateEquity = renderPrivateEquity;
PAGE_BINDERS.privateEquity = bindPrivateEquity;
