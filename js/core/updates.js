import { showView } from "./navigation.js";
import { canManageTicket, departmentLabel } from "./permissions.js";
import { state } from "./state.js";
import { loadNotifications } from "../features/notifications.js";
import { loadTickets } from "../features/tickets/api.js";
import { loadTicketExtras } from "../features/tickets/attachments.js";
import { loadComments } from "../features/tickets/conversation.js";
import { renderAssigneeOptions, renderTicketSummary } from "../features/tickets/details.js";
import { $ } from "../ui/helpers.js";
export async function refreshSupportUpdates() {
  if (!state.currentUser || document.hidden || state.automaticRefreshBusy) return;
  state.automaticRefreshBusy = true;
  try {
    await Promise.all([loadTickets(true), loadNotifications()]);
    if (state.currentTicket && $("ticketDetail").classList.contains("active")) {
      const ticketId = state.currentTicket.id,
        fresh = state.tickets.find(t => t.id === ticketId);
      if (!fresh) {
        state.currentTicket = null;
        state.ticketScreenshotLinks = [];
        showView("tickets");
        return;
      }
      state.currentTicket = fresh;
      renderTicketSummary(fresh);
      if ($("detailDepartmentLabel")) $("detailDepartmentLabel").textContent = departmentLabel(fresh.department);
      if ($("detailAssigneeLabel")) $("detailAssigneeLabel").textContent = fresh.assignee_name || "Unassigned";
      const managementFocused = $("updateCard").contains?.(document.activeElement);
      if (!managementFocused && canManageTicket(fresh)) {
        $("detailStatus").value = fresh.status;
        $("detailDepartment").value = fresh.department;
        renderAssigneeOptions();
        $("detailAssignee").value = fresh.assigned_to || "";
        $("detailResolution").value = fresh.resolution_note || "";
      }
      const historical = ["Resolved", "Closed"].includes(fresh.status);
      $("commentForm").classList.toggle("hidden", historical);
      $("historyReadOnlyNotice").classList.toggle("hidden", !historical);
      $("updateCard").classList.toggle("hidden", !canManageTicket(fresh));
      $("resolveCard").classList.toggle("hidden", !(state.currentUser.role === "student" && fresh.status === "Resolved"));
      $("deleteCard").classList.toggle("hidden", !(state.currentUser.role === "student" && fresh.status === "Open"));
      await Promise.all([loadComments(ticketId), loadTicketExtras(ticketId)]);
    }
  } catch (error) {
    console.error("Automatic support refresh failed", error);
  } finally {
    state.automaticRefreshBusy = false;
  }
}
export function initUpdates() {
  if (typeof setInterval === "function") setInterval(refreshSupportUpdates, 20000);
  document.addEventListener?.("visibilitychange", () => {
    if (!document.hidden) refreshSupportUpdates();
  });
}
