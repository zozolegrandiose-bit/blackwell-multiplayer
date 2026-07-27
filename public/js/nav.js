const NAV = [
  { id: "overview", label: "Vue d'ensemble", icon: "◈" },
  { id: "strategy", label: "Comité de Direction", icon: "🏛" },
  { id: "mail", label: "Mail", icon: "✉" },
  { id: "agenda", label: "Agenda", icon: "📅" },
  { id: "documents", label: "Documents", icon: "▣" },
  { id: "expenses", label: "Notes de frais", icon: "🧾" },
  { id: "ma", label: "M&A", icon: "🤝" },
  { id: "clients", label: "Clients", icon: "◐" },
  { id: "compliance", label: "Conformité", icon: "🛡" },
  { id: "hr", label: "RH", icon: "❖" },
  { id: "finance", label: "Finance", icon: "📊" },
  { id: "markets", label: "Marchés", icon: "📈" },
  { id: "reglement", label: "Règlement", icon: "📖" }
];

function visibleNav(player) {
  return NAV.filter(item => player.access.includes(item.id));
}
