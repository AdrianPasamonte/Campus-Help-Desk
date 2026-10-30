import { canReadTicket, departmentLabel, isStaffRole } from "../../core/permissions.js";
import { state } from "../../core/state.js";
import { renderReports } from "../reports.js";
import { openTicketDetails } from "./details.js";
import { $, badge, escapeHtml, requesterName } from "../../ui/helpers.js";
// ---------- Dashboard / Tickets ----------
export function render() {
  const active = state.tickets.filter(t => ["Open", "In Progress"].includes(t.status));
  $("totalCount").textContent = active.length;
  $("openCount").textContent = active.filter(t => t.status === "Open").length;
  $("progressCount").textContent = active.filter(t => t.status === "In Progress").length;
  $("unassignedCount").textContent = active.filter(t => !t.assigned_to).length;
  const queue = [...active].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
  $("recentTable").innerHTML = queue.slice(0, 5).map(t => '<tr><td>#' + t.id + '</td><td>' + escapeHtml(t.subject) + '</td><td>' + badge(t.status) + '</td><td><button class="btn" data-ticket="' + t.id + '">Open request</button></td></tr>').join("") || '<tr><td colspan="4" class="empty">No active requests. Your queue is clear.</td></tr>';
  renderTickets();
  renderTicketHistory();
  if (state.currentUser?.role === "admin" && $("reports").classList.contains("active")) renderReports();
}
export function renderTickets() {
  if (!state.currentUser) return;
  const searchInput = $("search").value.toLowerCase().trim();
  const s = $("statusFilter").value;
  const p = "";
  const a = $("assignFilter").value;
  const department = $("departmentFilter").value;
  const list = state.tickets.filter(t => {
    // Only active tickets belong here.
    const isActive = t.status === "Open" || t.status === "In Progress";
    if (!isActive) {
      return false;
    }
    const subject = (t.subject || "").toLowerCase();
    const category = (t.category || "").toLowerCase();
    const requester = requesterName(t).toLowerCase();
    const ticketId = String(t.id).toLowerCase();

    // Search by:
    // Ticket ID
    // Subject
    // Requester name
    // Category
    const matchesSearch = !searchInput || ticketId.includes(searchInput) || subject.includes(searchInput) || requester.includes(searchInput) || category.includes(searchInput);
    const matchesStatus = !s || t.status === s;
    const matchesPriority = !p || t.priority === p;
    let matchesAssignment = true;
    if (a === "unassigned") {
      matchesAssignment = !t.assigned_to;
    }
    if (a === "mine") {
      matchesAssignment = t.assigned_to === state.currentUser.id;
    }
    return canReadTicket(t) && (!department || state.currentUser.role !== "admin" || t.department === department) && matchesSearch && matchesStatus && matchesPriority && matchesAssignment;
  });
  list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
  $("ticketTable").innerHTML = list.length ? list.map(t => `
          <tr>

            <td>#${t.id}</td>

            <td>
              ${escapeHtml(t.subject)}
            </td>

            <td>
              ${escapeHtml(requesterName(t))}
            </td>

            <td>
              ${escapeHtml(t.category)}
            </td>
            <td>${escapeHtml(departmentLabel(t.department))}</td>

            <td>
              ${badge(t.status)}
            </td>

            <td>
              ${escapeHtml(t.assignee_name || "—")}
            </td>

            <td>
              <button
                class="btn"
                data-ticket="${t.id}">
                View
              </button>
            </td>

          </tr>
        `).join("") : `
        <tr>
          <td colspan="8" class="empty">
            No active tickets found.
          </td>
        </tr>
      `;
}
// ---------- TICKET HISTORY ----------
export function renderTicketHistory() {
  if (!state.currentUser) return;
  const historySearch = $("historySearch");
  const historyNameSearch = $("historyNameSearch");
  const historyStatusFilter = $("historyStatusFilter");
  if (!historySearch || !historyNameSearch || !historyStatusFilter || !$("historyTable")) {
    return;
  }
  const q = historySearch.value.toLowerCase().trim();
  const name = historyNameSearch.value.toLowerCase().trim();
  const status = historyStatusFilter.value;
  const staff = isStaffRole(state.currentUser.role);
  const history = state.tickets.filter(t => {
    // Only resolved and closed tickets
    const isHistory = t.status === "Resolved" || t.status === "Closed";

    // Students only see their own tickets.
    // Staff/admin can see all history.
    const isAllowed = canReadTicket(t);
    const subject = (t.subject || "").toLowerCase();
    const category = (t.category || "").toLowerCase();
    const requester = requesterName(t).toLowerCase();
    const ticketId = String(t.id).toLowerCase();

    // Search by ID, subject, requester, or category
    const matchesSearch = !q || ticketId.includes(q) || subject.includes(q) || requester.includes(q) || category.includes(q);

    // Requester name search for staff/admin
    const matchesName = !staff || !name || requester.includes(name);
    const matchesStatus = !status || t.status === status;
    return isHistory && isAllowed && matchesSearch && matchesName && matchesStatus;
  });
  $("historyTable").innerHTML = history.length ? history.map(t => `
          <tr>

            <td>#${t.id}</td>

            <td>
              ${escapeHtml(t.subject)}
            </td>

            <td>
              ${escapeHtml(requesterName(t))}
            </td>

            <td>
              ${escapeHtml(t.category)}
            </td>
            <td>${escapeHtml(departmentLabel(t.department))}</td>

            <td>
              ${badge(t.status)}
            </td>

            <td>
              ${escapeHtml(t.assignee_name || "—")}
            </td>

            <td>
              <button
                class="btn"
                data-history-ticket="${t.id}">
                View
              </button>
            </td>

          </tr>
        `).join("") : `
          <tr>
            <td colspan="8" class="empty">
              No ticket history found.
            </td>
          </tr>
        `;
}
export function initTicketLists() {
  $("recentTable").addEventListener("click", e => {
    const ticket = state.tickets.find(t => String(t.id) === e.target.dataset.ticket);
    if (ticket) openTicketDetails(ticket);
  });
  ["search", "statusFilter", "priorityFilter", "assignFilter", "departmentFilter"].forEach(id => {
    const element = $(id);
    if (element) {
      element.addEventListener("input", renderTickets);
      element.addEventListener("change", renderTickets);
    }
  });
  ["historySearch", "historyNameSearch", "historyStatusFilter"].forEach(id => {
    const element = $(id);
    if (element) {
      element.addEventListener("input", renderTicketHistory);
      element.addEventListener("change", renderTicketHistory);
    }
  });
  $("ticketTable").addEventListener("click", e => {
    const id = e.target.dataset.ticket;
    if (!id) return;
    const ticket = state.tickets.find(t => t.id === Number(id));
    if (!ticket) return;
    openTicketDetails(ticket);
  });
  $("historyTable").addEventListener("click", e => {
    const id = e.target.dataset.historyTicket;
    if (!id) return;
    const ticket = state.tickets.find(t => t.id === Number(id));
    if (!ticket) return;
    openTicketDetails(ticket);
  });
}
