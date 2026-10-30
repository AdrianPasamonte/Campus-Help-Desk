import { sb } from "../../core/client.js";
import { showView } from "../../core/navigation.js";
import { canManageTicket, canReadTicket, departmentLabel } from "../../core/permissions.js";
import { state } from "../../core/state.js";
import { markTicketNotificationsRead } from "../notifications.js";
import { loadTickets } from "./api.js";
import { loadTicketExtras } from "./attachments.js";
import { loadComments, syncReplyControls } from "./conversation.js";
import { requestFieldDefinitions } from "./creation.js";
import { confirmAction, showNotice } from "../../ui/dialogs.js";
import { $, badge, escapeHtml, requesterName } from "../../ui/helpers.js";
// ---------- STAFF LIST ----------
export async function loadStaffList() {
  const {
    data,
    error
  } = await sb.from("profiles").select("id, full_name, role, department").in("role", ["staff", "admin"]).order("full_name");
  state.staffDirectory = error ? [] : data || [];
  if (error) console.error("Could not load staff", error);
  renderAssigneeOptions();
}
export function renderAssigneeOptions() {
  const department = state.currentUser.role === "admin" ? $("detailDepartment").value : state.currentUser.department;
  const selected = $("detailAssignee").value;
  const list = state.staffDirectory.filter(s => state.currentUser.role === "admin" ? s.role === "admin" || s.role === "staff" && s.department === department : s.id === state.currentUser.id && s.department === department);
  $("detailAssignee").innerHTML = '<option value="">Unassigned</option>' + list.map(s => '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.id === state.currentUser.id ? "Me" : s.full_name) + ' (' + (s.role === "admin" ? 'Admin' : escapeHtml(departmentLabel(s.department))) + ')</option>').join('');
  $("detailAssignee").value = list.some(s => s.id === selected) ? selected : "";
}
// ---------- OPEN TICKET DETAILS ----------
export function openTicketDetails(ticket) {
  if (!canReadTicket(ticket)) return;
  state.currentTicket = ticket;
  $("commentList").scrollTop = 0;
  $("conversationCard").classList.remove("hidden");
  $("reopenExplanation").open = false;
  state.ticketScreenshotLinks = [];
  $("ticketAttachments").innerHTML = "";
  $("screenshotSection").classList.add("hidden");
  $("screenshotSection").open = false;
  $("replyError").textContent = "";
  syncReplyControls();
  const historical = ["Resolved", "Closed"].includes(ticket.status);
  $("historyReadOnlyNotice").classList.toggle("hidden", !historical);
  $("commentForm").classList.toggle("hidden", historical);
  $("detailDepartment").value = ticket.department;
  renderAssigneeOptions();
  $("updateCard").classList.toggle("hidden", !canManageTicket(ticket));
  const t = state.currentTicket;
  renderTicketSummary(t);
  $("detailStatus").value = t.status;
  $("detailAssignee").value = t.assigned_to || "";
  $("detailResolution").value = t.resolution_note || "";
  const student = state.currentUser.role === "student";
  $("deleteCard").open = false;
  $("ticketBackBtn").textContent = historical ? "← Back to ticket history" : student ? "← Back to my tickets" : "← Back to tickets";
  $("deleteCard").classList.toggle("hidden", !(student && t.status === "Open"));
  $("resolveCard").classList.toggle("hidden", !(student && t.status === "Resolved"));
  $("reopenReason").value = "";
  $("commentText").value = "";
  loadComments(t.id);
  loadTicketExtras(t.id);
  markTicketNotificationsRead(t.id);
  showView("ticketDetail");
}
// ---------- STUDENT RESOLUTION ----------
export async function respondToResolution(fixed) {
  if (!state.currentTicket) return;
  const {
    error
  } = await sb.rpc("respond_to_resolution", {
    p_ticket_id: state.currentTicket.id,
    p_fixed: fixed,
    p_reason: $("reopenReason").value.trim() || null
  });
  if (error) {
    showNotice("Could not update ticket: " + error.message);
    return;
  }
  await loadTickets();
  showNotice(fixed ? "Ticket closed. Glad it's fixed!" : "Ticket reopened. Staff will take another look.");
  if (fixed) {
    showView("ticketHistory");
  } else {
    showView("tickets");
  }
}
export function renderStudentTicketSummary(t) {
  const {
    body,
    details
  } = ticketProblemParts(t);
  const metadata = [{
    label: "Concern",
    value: t.concern || t.category || "Other concern"
  }, {
    label: "Submitted",
    value: new Date(t.created_at).toLocaleDateString()
  }, ...(t.assignee_name ? [{
    label: "Handled by",
    value: t.assignee_name
  }] : []), ...details];
  return '<span class="eyebrow">REQUEST #' + t.id + '</span><h3>' + escapeHtml(t.subject) + '</h3>' + '<div class="ticket-status-line">' + badge(t.status) + '<span id="detailDepartmentLabel">' + escapeHtml(departmentLabel(t.department)) + '</span></div>' + '<div class="request-description"><h3>Your problem</h3><p>' + escapeHtml(body) + '</p></div>' + renderTicketSolution(t) + '<details class="ticket-metadata"><summary>Ticket details</summary><dl>' + metadata.map(d => '<div><dt>' + escapeHtml(d.label) + '</dt><dd>' + escapeHtml(d.value) + '</dd></div>').join('') + '</dl></details>';
}
export function ticketProblemParts(t) {
  const original = t.description || "";
  const normalized = original.replace(/\r\n/g, "\n");
  const divider = normalized.indexOf("\n\n");
  if (!t.support_area || !t.concern || divider < 0) return {
    body: original,
    details: []
  };
  const lines = normalized.slice(0, divider).split("\n");
  // Only unpack the header generated by the ticket form. Plain descriptions
  // and unfamiliar formats stay intact so no user text is lost.
  if (!lines[0].startsWith("Area: ") || lines[1] !== "Concern: " + t.concern) return {
    body: original,
    details: []
  };
  const fields = requestFieldDefinitions(t.support_area, t.concern);
  const names = {
    schoolEmail: "Affected school account",
    contactEmail: "Contact email",
    portal: "Website",
    page: "Page or feature",
    error: "Error message",
    room: "Room / lab",
    pc: "Computer / asset tag",
    application: "Application",
    document: "Document requested",
    purpose: "Purpose",
    record: "Record or enrollment step",
    term: "School year / term",
    paymentDate: "Payment date",
    reference: "Payment reference",
    charge: "Fee or balance"
  };
  const details = [];
  for (const line of lines.slice(2)) {
    const field = fields.find(f => line.startsWith(f.label + ": "));
    if (!field) return {
      body: original,
      details: []
    };
    details.push({
      label: names[field.id] || field.label,
      value: line.slice(field.label.length + 2)
    });
  }
  return {
    body: normalized.slice(divider + 2),
    details
  };
}
export function renderTicketProblem(t) {
  const {
    body,
    details
  } = ticketProblemParts(t);
  const context = details.length ? '<div class="request-context"><h3>Request details</h3><dl>' + details.map(d => '<div><dt>' + escapeHtml(d.label) + '</dt><dd>' + escapeHtml(d.value) + '</dd></div>').join('') + '</dl></div>' : '';
  return context + '<div class="request-description"><h3>Problem description</h3><p>' + escapeHtml(body) + '</p></div>';
}
export function renderTicketSolution(t) {
  if (!t.resolution_note) return "";
  if (["Open", "In Progress"].includes(t.status)) return '<details class="previous-solution"><summary>Previous solution</summary><p>' + escapeHtml(t.resolution_note) + '</p></details>';
  return '<div class="request-solution"><h3>Solution from support</h3><p>' + escapeHtml(t.resolution_note) + '</p></div>';
}
export function renderTicketSummary(t) {
  if (state.currentUser.role === "student") {
    $("detailContent").innerHTML = renderStudentTicketSummary(t);
    return;
  }
  $("detailContent").innerHTML = '<span class="eyebrow">REQUEST #' + t.id + '</span><h3>' + escapeHtml(t.subject) + '</h3>' + '<div class="info-row"><span>Requester</span><b>' + escapeHtml(requesterName(t)) + '</b></div>' + '<div class="info-row"><span>Concern</span><b>' + escapeHtml(t.concern || t.category || "Other concern") + '</b></div>' + '<div class="info-row"><span>Department</span><b id="detailDepartmentLabel">' + escapeHtml(departmentLabel(t.department)) + '</b></div>' + '<div class="info-row"><span>Status</span><b>' + badge(t.status) + '</b></div>' + '<div class="info-row"><span>Assigned to</span><b id="detailAssigneeLabel">' + escapeHtml(t.assignee_name || "Unassigned") + '</b></div>' + (t.reopen_count ? '<div class="info-row"><span>Reopened</span><b>' + t.reopen_count + ' time(s)</b></div>' : '') + renderTicketProblem(t) + renderTicketSolution(t);
}
export function initTicketDetails() {
  $("detailDepartment").addEventListener("change", () => {
    $("detailAssignee").value = "";
    renderAssigneeOptions();
  });
  $("saveStatus").addEventListener("click", async () => {
    if (!state.currentTicket || !canManageTicket(state.currentTicket)) return;
    const department = state.currentUser.role === "admin" ? $("detailDepartment").value : state.currentTicket.department;
    let status = $("detailStatus").value;
    if (!["Open", "In Progress", "Resolved"].includes(status)) {
      showNotice("The student must confirm the solution before this ticket can close.");
      return;
    }
    const assignee = $("detailAssignee").value || null;
    const note = $("detailResolution").value.trim();
    if (status === "Resolved" && !note) {
      showNotice("Please add a resolution note explaining how it was fixed.");
      return;
    }

    // Assigning an Open ticket
    // automatically makes it In Progress
    if (assignee && status === "Open") {
      status = "In Progress";
    }
    const {
      data,
      error
    } = await sb.from("tickets").update({
      status,
      department,
      assigned_to: assignee,
      resolution_note: note || null
    }).eq("id", state.currentTicket.id).select();
    if (error) {
      showNotice("Could not update ticket: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      showNotice("You can only update unassigned tickets or your assigned tickets in your department.");
      return;
    }
    await loadTickets();
    showNotice("Ticket updated.");

    // If it is now Resolved or Closed,
    // it will automatically appear in History.
    // Otherwise it stays in active tickets.
    if (status === "Resolved" || status === "Closed") {
      showView("ticketHistory");
    } else {
      showView("tickets");
    }
  });
  $("confirmFixed").addEventListener("click", () => respondToResolution(true));
  $("reopenTicket").addEventListener("click", () => respondToResolution(false));
  $("deleteTicket").addEventListener("click", async () => {
    if (!state.currentTicket) return;
    if (!confirmAction("Delete ticket #" + state.currentTicket.id + "? This cannot be undone.")) {
      return;
    }
    const {
      data,
      error
    } = await sb.from("tickets").delete().eq("id", state.currentTicket.id).select();
    if (error) {
      showNotice("Could not delete ticket: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      showNotice("Not allowed: you can only delete your own tickets while they are still Open.");
      return;
    }
    state.currentTicket = null;
    await loadTickets();
    showNotice("Ticket deleted.");
    showView("tickets");
  });
  $("ticketBackBtn").addEventListener("click", () => {
    showView(["Resolved", "Closed"].includes(state.currentTicket?.status) ? "ticketHistory" : "tickets");
  });
}
