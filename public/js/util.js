function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + " Md$";
  return n.toFixed(0) + " M$";
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name) {
  return String(name || "").split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_PALETTE = ["#2ee6a6", "#6c8dff", "#e8b64a", "#ff8fa3", "#5ee0e0", "#b58cff", "#7ee08a"];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

function avatarColor(name) {
  return AVATAR_PALETTE[hashString(String(name || "")) % AVATAR_PALETTE.length];
}

function avatarHtml(name, size) {
  size = size || 30;
  const color = avatarColor(name);
  const fontSize = Math.round(size * 0.4);
  return `<span class="avatar" style="width:${size}px; height:${size}px; line-height:${size}px; font-size:${fontSize}px; background:${color};">${escapeHtml(initials(name))}</span>`;
}

const CLUSTER_BADGE_COLOR = { A: "#e8b64a", B: "#6c8dff", C: "#b58cff", D: "#ff8fa3", E: "#2ee6a6", F: "#5ee0e0", G: "#f5f7fb" };

const CLIENT_DEPARTMENT_CLUSTER = {
  "Direction Générale": "G",
  "Banque d'Investissement": "A", "Fusions-Acquisitions (M&A)": "A", "Marché des Capitaux Actions (ECM)": "A",
  "Marché des Capitaux Dette (DCM)": "A", "Financement à Effet de Levier": "A", "Titrisation & Financements Structurés": "A",
  "Financement de Projets & Infrastructures": "A", "Marchés Émergents": "A", "Couverture Sectorielle": "A",
  "Marchés Financiers": "B", "Trading FICC": "B", "Dérivés de Taux": "B", "Change & Matières Premières": "B",
  "Bureau Actions": "B", "Dérivés Actions": "B", "Ventes Institutionnelles": "B", "Prime Services": "B",
  "Recherche Actions": "B", "Recherche Crédit": "B", "Stratégie Quantitative & Data": "B",
  "Gestion de Fortune": "C", "Gestion d'Actifs": "C", "Relations Investisseurs": "C", "Marketing & Développement Commercial": "C",
  "Stratégie & Développement": "C", "Transformation Digitale & Innovation": "C", "Expérience Client": "C",
  "Conformité": "D", "Gestion des Risques": "D", "Juridique & Réglementaire": "D", "Audit Interne": "D",
  "Sécurité Informatique": "D", "Secrétariat Général": "D",
  "Trésorerie de Groupe": "E", "Contrôle Financier": "E", "Opérations": "E", "Immobilier & Moyens Généraux": "E",
  "Ressources Humaines": "F", "Communication & Affaires Publiques": "F"
};

function deptBadgeHtml(dept) {
  const cluster = CLIENT_DEPARTMENT_CLUSTER[dept] || null;
  const color = cluster ? CLUSTER_BADGE_COLOR[cluster] : "#6c7488";
  return `<span class="dept-badge" style="background:${color}22; color:${color}; border:1px solid ${color}55;">${escapeHtml(dept)}</span>`;
}

const PROGRESSION_TIERS = [
  { min: 500, label: "Légende", icon: "💎" },
  { min: 200, label: "Senior", icon: "🥇" },
  { min: 50, label: "Confirmé", icon: "🥈" },
  { min: 0, label: "Stagiaire", icon: "🥉" }
];

function getProgressionTier(score) {
  return PROGRESSION_TIERS.find(t => score >= t.min) || PROGRESSION_TIERS[PROGRESSION_TIERS.length - 1];
}

// Server keys playerScores by firstName|lastName, which isn't exposed in the
// public roster — look up by fullName instead (guaranteed unique among
// connected players since Patch 3's name-uniqueness check in rooms.js).
function scoreForPlayer(playerScores, fullName) {
  const entry = Object.values(playerScores || {}).find(e => e.fullName === fullName);
  return entry ? entry.score : 0;
}

function tierBadgeHtml(score) {
  const tier = getProgressionTier(score || 0);
  return `<span title="${tier.label} — ${score || 0} pts">${tier.icon}</span>`;
}

// Shared "always something to do" quick-task panel, reused identically across the
// 5 operational pages (M&A, Clients, Compliance, HR, Finance) — filters appState's
// shared taskQueue down to this page's items each render.
function taskPanelHtml(page) {
  const tasks = (appState.taskQueue || []).filter(t => t.page === page);
  if (!tasks.length) return "";
  return `
    <div class="panel task-panel">
      <div class="panel-title">⚡ Tâches rapides (${tasks.length})</div>
      ${tasks.map(t => `
        <div class="task-row">
          <span class="task-row-text">${escapeHtml(t.label)}</span>
          <span class="task-row-timer">⏱ ${Math.max(0, Math.round((t.expiresAt - Date.now()) / 1000))}s</span>
          <button class="btn-sm" data-task-complete="${t.id}">Traiter</button>
        </div>
      `).join("")}
    </div>
  `;
}

function bindTaskPanel() {
  document.querySelectorAll("[data-task-complete]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("tasks:complete", { taskId: el.getAttribute("data-task-complete") });
    });
  });
}

function sparklineSvg(values, width, height) {
  width = width || 120;
  height = height || 32;
  if (!values || values.length < 2) return `<svg width="${width}" height="${height}"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (height - ((v - min) / range) * height).toFixed(1);
    return x + "," + y;
  }).join(" ");
  const lastUp = values[values.length - 1] >= values[0];
  const strokeColor = lastUp ? "#2ee6a6" : "#ff5c7a";
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
