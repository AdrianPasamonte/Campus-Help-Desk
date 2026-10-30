import { sb } from "../core/client.js";
import { state } from "../core/state.js";
import { loadTickets } from "./tickets/api.js";
import { $, escapeHtml } from "../ui/helpers.js";
let services = {};
let notificationLoadSequence = 0;
export const notificationLabels = {
  new_ticket: "New request",
  reply: "New reply",
  transferred: "Request transferred",
  assigned: "Assignment changed",
  status_changed: "Status changed",
  reopened: "Request reopened"
};
export function renderNotifications() {
  const unread = state.notifications.filter(n => !n.is_read).length;
  $("notificationCount").textContent = String(unread);
  $("notificationCount").classList.toggle("hidden", !unread);
  $("notificationBtn").setAttribute?.("aria-label", "Notifications, " + unread + " unread");
  $("notificationList").innerHTML = state.notifications.length ? state.notifications.slice(0, 50).map(n => '<button class="notification-item ' + (!n.is_read ? 'unread' : '') + '" type="button" data-notification-ticket="' + n.ticket_id + '">' + escapeHtml(notificationLabels[n.event_type] || "Ticket updated") + ' · #' + n.ticket_id + '<small>' + escapeHtml(new Date(n.created_at).toLocaleString()) + '</small></button>').join('') : '<p class="empty">No notifications yet.</p>';
}
export async function loadNotifications() {
  if (!state.currentUser) return;
  const actorId = state.currentUser.id,
    seq = ++notificationLoadSequence;
  try {
    const {
      data,
      error
    } = await sb.from("ticket_notifications").select("*").eq("recipient_id", actorId).order("created_at", {
      ascending: false
    });
    if (state.currentUser?.id !== actorId || seq !== notificationLoadSequence) return;
    $("notificationError").textContent = error ? "Could not refresh notifications. We’ll try again automatically." : "";
    if (!error) {
      state.notifications = data || [];
      renderNotifications();
    }
  } catch (error) {
    if (state.currentUser?.id === actorId) $("notificationError").textContent = "Could not refresh notifications. We’ll try again automatically.";
  }
}
export async function markTicketNotificationsRead(ticketId) {
  if (!state.currentUser) return;
  try {
    const {
      error
    } = await sb.from("ticket_notifications").update({
      is_read: true
    }).eq("recipient_id", state.currentUser.id).eq("ticket_id", ticketId);
    if (!error) await loadNotifications();
  } catch (error) {
    $("notificationError").textContent = "Could not mark this request's notifications as read.";
  }
}
export function initNotifications(handlers) {
  services = handlers;
  $("notificationBtn").addEventListener("click", () => {
    const open = $("notificationPanel").classList.contains("hidden");
    $("notificationPanel").classList.toggle("hidden", !open);
    $("notificationBtn").setAttribute("aria-expanded", String(open));
    if (open) loadNotifications();
  });
  $("notificationList").addEventListener("click", async e => {
    const button = e.target.closest("[data-notification-ticket]");
    if (!button || !state.currentUser) return;
    await loadTickets();
    const ticket = state.tickets.find(t => String(t.id) === button.dataset.notificationTicket);
    if (ticket) {
      services.openTicketDetails(ticket);
      $("notificationPanel").classList.add("hidden");
      $("notificationBtn").setAttribute("aria-expanded", "false");
    } else $("notificationError").textContent = "This request is no longer available to your account.";
  });
  $("markNotificationsRead").addEventListener("click", async () => {
    if (!state.currentUser) return;
    $("markNotificationsRead").disabled = true;
    try {
      const {
        error
      } = await sb.from("ticket_notifications").update({
        is_read: true
      }).eq("recipient_id", state.currentUser.id);
      if (error) throw error;
      await loadNotifications();
    } catch (error) {
      $("notificationError").textContent = "Could not mark notifications as read. Try again.";
    } finally {
      $("markNotificationsRead").disabled = false;
    }
  });
}
