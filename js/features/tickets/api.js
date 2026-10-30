import { sb } from "../../core/client.js";
import { canReadTicket } from "../../core/permissions.js";
import { state } from "../../core/state.js";
import { showNotice } from "../../ui/dialogs.js";
let services = {};
// ---------- Tickets ----------
export async function loadTickets(silent = false) {
  if (!state.currentUser) return;
  const actorId = state.currentUser.id,
    sequence = ++state.ticketLoadSequence;
  if (state.currentUser.role === "staff" && !state.currentUser.department) {
    state.tickets = [];
    services.render();
    return;
  }
  let query = sb.from("tickets").select(`
      *,
      student:profiles!tickets_student_id_fkey(full_name),
      assignee:profiles!tickets_assigned_to_fkey(full_name)
    `);
  if (state.currentUser.role === "staff") query = query.eq("department", state.currentUser.department);
  if (state.currentUser.role === "student") query = query.eq("student_id", state.currentUser.id);
  const {
    data,
    error
  } = await query.order("created_at", {
    ascending: false
  });
  if (state.currentUser?.id !== actorId || sequence !== state.ticketLoadSequence) return;
  if (error) {
    console.error("Could not load tickets:", error);
    if (!silent) showNotice("Could not load tickets: " + error.message);else return;
    state.tickets = [];
  } else {
    state.tickets = data.filter(canReadTicket).map(t => ({
      ...t,
      student_name: t.student ? t.student.full_name : null,
      assignee_name: t.assignee ? t.assignee.full_name : null
    }));
  }
  services.render();
}
export function initTicketApi(handlers) {
  services = handlers;
}
