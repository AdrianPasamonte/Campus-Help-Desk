import { state } from "./state.js";
export const departments = {
  it: "IT",
  registrar: "Registrar",
  finance: "Finance / Cashier",
  review: "Admin review"
};
export const departmentLabel = id => departments[id] || "Not assigned";
export const ticketDepartment = area => ({
  account: "it",
  portals: "it",
  lab: "it",
  records: "registrar",
  fees: "finance",
  other: "review"
})[area] || "review";
export function canReadTicket(t) {
  return state.currentUser && (state.currentUser.role === "admin" || state.currentUser.role === "student" && t.student_id === state.currentUser.id || state.currentUser.role === "staff" && !!state.currentUser.department && t.department === state.currentUser.department);
}
export function canManageTicket(t) {
  return canReadTicket(t) && ["Open", "In Progress"].includes(t.status) && (state.currentUser.role === "admin" || state.currentUser.role === "staff" && (!t.assigned_to || t.assigned_to === state.currentUser.id));
}
export const isStaffRole = r => r === "staff" || r === "admin";
