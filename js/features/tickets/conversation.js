import { sb } from "../../core/client.js";
import { state } from "../../core/state.js";
import { attachScreenshotFiles, loadTicketExtras, renderReplyScreenshots, validateScreenshotFiles } from "./attachments.js";
import { $, escapeHtml } from "../../ui/helpers.js";
// ---------- CONVERSATION ----------
export async function loadComments(ticketId) {
  if (!state.currentUser || state.currentTicket?.id !== ticketId) return;
  const actorId = state.currentUser.id;
  const sequence = ++state.commentLoadSequence;
  $("commentList").innerHTML = '<p class="empty">Loading...</p>';
  let result;
  try {
    result = await sb.from("ticket_comments").select(`
      *,
      author:profiles!ticket_comments_author_id_fkey(
        full_name,
        role
      )
    `).eq("ticket_id", ticketId).order("created_at", {
      ascending: true
    });
  } catch (error) {
    result = {
      data: null,
      error
    };
  }
  const {
    data,
    error
  } = result;
  if (sequence !== state.commentLoadSequence || state.currentUser?.id !== actorId || state.currentTicket?.id !== ticketId) return;
  $("conversationCard").classList.toggle("hidden", !error && state.currentUser.role === "student" && ["Resolved", "Closed"].includes(state.currentTicket.status) && !data?.length);
  if (error) {
    $("commentList").innerHTML = `
        <p class="empty">
          Could not load replies:
          ${escapeHtml(error.message)}
        </p>
      `;
    return;
  }
  $("commentList").innerHTML = data.length ? data.map(c => {
    const role = c.author ? c.author.role : "student";
    const name = c.author ? c.author.full_name : "Unknown";
    return `

            <div
              data-comment-id="${c.id}" class="comment ${role !== "student" ? "staff" : ""}">

              <b>
                ${escapeHtml(name)}
              </b>

              ${role !== "student" ? '<span class="tag">Staff</span>' : ""}

              <small>
                ${new Date(c.created_at).toLocaleString()}
              </small>

              <p>${escapeHtml(c.message)}</p><div id="replyAttachments_${c.id}" class="screenshot-links"></div>

            </div>

          `;
  }).join("") : '<p class="empty">No replies yet.</p>';
  renderReplyScreenshots();
}
// ---------- SEND REPLY ----------
export function syncReplyControls() {
  $("commentText").disabled = state.replySending;
  $("replyFiles").disabled = state.replySending;
  $("sendReplyBtn").disabled = state.replySending;
  $("sendReplyBtn").textContent = state.replySending ? "Sending…" : "Send Reply";
}
export function initConversation() {
  $("commentForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (state.replySending || !state.currentUser || !state.currentTicket || ["Resolved", "Closed"].includes(state.currentTicket.status)) return;
    const message = $("commentText").value.trim();
    if (!message) return;
    const ticketId = state.currentTicket.id,
      actorId = state.currentUser.id;
    let screenshotFiles;
    try {
      screenshotFiles = await validateScreenshotFiles($("replyFiles").files);
    } catch (error) {
      $("replyError").textContent = error.message;
      return;
    }
    if (state.replySending || state.currentUser?.id !== actorId || state.currentTicket?.id !== ticketId) return;
    state.replySending = true;
    $("replyError").textContent = "";
    syncReplyControls();
    try {
      const query = sb.from("ticket_comments").insert({
        ticket_id: ticketId,
        message
      });
      const {
        data: reply,
        error
      } = await (screenshotFiles.length ? query.select("id") : query);
      if (error) throw error;
      if (screenshotFiles.length) await attachScreenshotFiles(ticketId, reply[0].id, screenshotFiles);
      if (state.currentUser?.id === actorId && state.currentTicket?.id === ticketId) {
        $("replyFiles").value = "";
        $("replyFilesInfo").textContent = "Up to 3 screenshots, 5 MB each. PNG, JPG, or WebP.";
        if ($("commentText").value.trim() === message) $("commentText").value = "";
        await loadComments(ticketId);
        await loadTicketExtras(ticketId);
      }
    } catch (error) {
      if (state.currentUser?.id === actorId && state.currentTicket?.id === ticketId) $("replyError").textContent = "Could not send reply. " + error.message;
    } finally {
      state.replySending = false;
      syncReplyControls();
    }
  });
}
