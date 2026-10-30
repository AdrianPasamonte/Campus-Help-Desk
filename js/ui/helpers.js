// ---------- Helpers ----------
export const $ = id => document.getElementById(id);
export function statusClass(status) {
  return {
    "Open": "open",
    "In Progress": "progress",
    "Resolved": "resolved",
    "Closed": "closed"
  }[status] || "open";
}
export function badge(status) {
  return `
    <span class="badge ${statusClass(status)}">
      ${status}
    </span>
  `;
}
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}
export function requesterName(t) {
  return t.student_name || "Unknown";
}
