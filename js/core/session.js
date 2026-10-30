import { sb } from "./client.js";
import { showView } from "./navigation.js";
import { departmentLabel, isStaffRole } from "./permissions.js";
import { state } from "./state.js";
import { $ } from "../ui/helpers.js";
let services = {};
// ---------- AUTH ----------
export async function startFromUser(user) {
  const {
    data: profile,
    error
  } = await sb.from("profiles").select("full_name, role, department").eq("id", user.id).single();
  if (error || !profile) {
    console.error("Profile load failed:", error);
    $("loginError").textContent = "Could not load your profile. Did you run the SQL files?";
    await sb.auth.signOut();
    return;
  }
  state.currentUser = {
    id: user.id,
    email: user.email,
    full_name: profile.full_name,
    role: profile.role,
    department: profile.department
  };
  enterApp();
}
// ---------- ENTER APPLICATION ----------
export function enterApp() {
  $("profileMessage").textContent = "";
  const studentHome = state.currentUser.role === "student";
  $("app").classList.toggle("student-view", studentHome);
  $("helpHome").classList.toggle("hidden", !studentHome);
  $("staffDashboard").classList.toggle("hidden", studentHome);
  $("navHome").textContent = studentHome ? "⌂ Help Center" : "▦ Dashboard";
  $("navKnowledge").classList.toggle("hidden", studentHome);
  $("navKnowledge").textContent = state.currentUser.role === "admin" ? "▤ Manage Articles" : "? Knowledge Base";
  services.renderFaqs();
  $("loginPage").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userName").textContent = state.currentUser.full_name;
  $("profileName").value = state.currentUser.full_name;
  $("profileEmail").value = state.currentUser.email || "";
  const staff = isStaffRole(state.currentUser.role);
  $("departmentFilter").classList.toggle("hidden", state.currentUser.role !== "admin");
  $("departmentFilter").value = "";
  $("detailDepartmentField").classList.toggle("hidden", state.currentUser.role !== "admin");
  $("departmentNotice").classList.toggle("hidden", state.currentUser.role !== "staff");
  $("departmentNotice").textContent = state.currentUser.department ? "Your department: " + departmentLabel(state.currentUser.department) + ". You can work on unassigned tickets or tickets assigned to you." : "Your account has no department. Ask an administrator to assign one before you can access a ticket queue.";

  // Students can create tickets
  $("navCreate").classList.toggle("hidden", true);
  $("quickCreateBtn").classList.toggle("hidden", staff);

  // Only admins see Users
  $("navUsers").classList.toggle("hidden", state.currentUser.role !== "admin");

  // Only admins see Reports
  $("navReports").classList.toggle("hidden", state.currentUser.role !== "admin");

  // Assignment filter only for staff/admin
  $("assignFilter").classList.toggle("hidden", !staff);

  // Requester name search in history
  // only for staff/admin
  $("historyNameSearch").classList.toggle("hidden", !staff);
  $("navTickets").textContent = staff ? state.currentUser.role === "admin" ? "▤ All Tickets" : "▤ Department Tickets" : "▤ My Tickets";
  $("updateCard").classList.toggle("hidden", !staff);
  if (staff) {
    services.loadStaffList();
  }
  services.loadTickets();
  services.loadNotifications();
  showView("dashboard");
}
export function initSession(handlers) {
  services = handlers;
}
