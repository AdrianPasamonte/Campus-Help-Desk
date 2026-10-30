import { departmentLabel, isStaffRole } from "./permissions.js";
import { state } from "./state.js";
import { $ } from "../ui/helpers.js";
let services = {};
// ---------- Views / Navigation ----------
export function showView(name) {
  if (name === "create") {
    services.openTicketDialog();
    return;
  }
  if (["users", "reports"].includes(name) && state.currentUser.role !== "admin") return;
  if (state.currentUser.role === "student" && name === "knowledge") name = "dashboard";
  if (isStaffRole(state.currentUser.role) && name === "create") return;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = $(name);
  if (target) {
    target.classList.add("active");
  }
  document.querySelectorAll(".nav button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name || state.currentUser.role === "student" && name === "create" && b.dataset.view === "dashboard"));
  const titles = {
    dashboard: [state.currentUser.role === "student" ? "Help Center" : "Dashboard", state.currentUser.role === "student" ? "Answers and support for campus life" : "Your current queue and requests needing attention"],
    tickets: [state.currentUser.role === "student" ? "My Tickets" : state.currentUser.role === "staff" ? departmentLabel(state.currentUser.department) + " Tickets" : "All Tickets", state.currentUser.role === "student" ? "Track active requests and reply to support" : "Search and manage submitted tickets"],
    ticketHistory: ["Ticket History", "View resolved and closed support tickets"],
    create: ["Create Ticket", "Submit a new support request"],
    users: ["Users", "Create staff accounts and manage roles"],
    reports: ["Reports", "Review request trends and recurring concerns"],
    knowledge: [state.currentUser.role === "admin" ? "Manage Articles" : "Knowledge Base", state.currentUser.role === "admin" ? "Create and maintain campus help articles" : "Published answers and support guidance"],
    profile: ["Profile", "Manage your account information"],
    ticketDetail: ["Ticket Details", state.currentTicket && ["Resolved", "Closed"].includes(state.currentTicket.status) ? "Review your request and the support team's solution" : state.currentUser.role === "student" ? "Follow your request and reply to the support team" : "View, reply to and manage a support request"]
  };
  if (titles[name]) {
    $("pageTitle").textContent = titles[name][0];
    $("pageSub").textContent = titles[name][1];
  }
  if (["dashboard", "knowledge"].includes(name)) services.loadHelpArticles();
  if (name === "users") {
    services.loadUsers();
  }
  if (name === "reports") {
    services.loadTickets();
  }
  if (name === "ticketHistory") {
    services.loadTickets().then(services.renderTicketHistory);
  }
}
export function initNavigation(handlers) {
  services = handlers;
  document.querySelectorAll(".nav button[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showView(b.dataset.go)));
}
