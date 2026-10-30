import { sb } from "../../core/client.js";
import { state } from "../../core/state.js";
import { showNotice } from "../../ui/dialogs.js";
import { $, escapeHtml } from "../../ui/helpers.js";
let services = {};
let extrasLoadSequence = 0;
export async function validateScreenshotFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length && state.pendingScreenshotUpload) throw new Error("Retry or dismiss your pending screenshots before attaching more files.");
  if (files.length > 3) throw new Error("Choose up to 3 screenshots.");
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024 || !file.size) throw new Error("Each screenshot must be between 1 byte and 5 MB.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use PNG, JPG, or WebP screenshots.");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    const jpg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!(file.type === "image/png" ? png : file.type === "image/jpeg" ? jpg : webp)) throw new Error("A selected file is not a valid PNG, JPG, or WebP screenshot.");
  }
  return files;
}
export async function attachScreenshotFiles(ticketId, commentId, files) {
  const actorId = state.currentUser?.id;
  if (!actorId) return;
  const failed = [];
  for (const file of files) {
    const extension = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp"
    }[file.type];
    const storagePath = ticketId + "/" + actorId + "/" + crypto.randomUUID() + "." + extension;
    let uploaded = false;
    try {
      if (state.currentUser?.id !== actorId) throw new Error("Your session changed.");
      const {
        error
      } = await sb.storage.from("ticket-screenshots").upload(storagePath, file, {
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;
      uploaded = true;
      const {
        error: linkError
      } = await sb.from("ticket_attachments").insert({
        ticket_id: ticketId,
        comment_id: commentId,
        storage_path: storagePath,
        file_name: file.name.slice(0, 200)
      });
      if (linkError) throw linkError;
    } catch (error) {
      failed.push(file);
      if (uploaded) await sb.storage.from("ticket-screenshots").remove([storagePath]).catch(() => {});
    }
  }
  if (failed.length && state.currentUser?.id === actorId) {
    state.pendingScreenshotUpload = {
      ticketId,
      commentId,
      actorId,
      files: failed
    };
    showNotice("Your " + (commentId ? "reply" : "ticket") + " was saved, but " + failed.length + " screenshot(s) could not upload. Open the ticket and use Retry screenshots. Your request will not be submitted again.");
  } else if (state.pendingScreenshotUpload?.ticketId === ticketId && state.pendingScreenshotUpload?.commentId === commentId) state.pendingScreenshotUpload = null;
  renderScreenshotRetry();
}
export function renderScreenshotRetry() {
  const pending = state.pendingScreenshotUpload?.actorId === state.currentUser?.id && state.pendingScreenshotUpload?.ticketId === state.currentTicket?.id;
  $("attachmentRetryActions").classList.toggle("hidden", !pending);
  $("attachmentUploadNotice").textContent = pending ? "Your request is saved. " + state.pendingScreenshotUpload.files.length + " screenshot(s) still need to upload." : "";
}
export function renderReplyScreenshots() {
  const groups = new Map();
  for (const attachment of state.ticketScreenshotLinks) {
    if (!attachment.comment_id) continue;
    groups.set(attachment.comment_id, (groups.get(attachment.comment_id) || "") + attachment.html);
  }
  for (const [commentId, html] of groups) {
    const el = $("replyAttachments_" + commentId);
    if (el) el.innerHTML = html;
  }
}
export async function loadTicketExtras(ticketId) {
  if (!state.currentUser || state.currentTicket?.id !== ticketId) return;
  const actorId = state.currentUser.id,
    seq = ++extrasLoadSequence;
  renderScreenshotRetry();
  try {
    const attachments = await sb.from("ticket_attachments").select("*").eq("ticket_id", ticketId).order("created_at");
    const links = await Promise.all((attachments.data || []).map(async a => {
      const {
        data,
        error
      } = await sb.storage.from("ticket-screenshots").createSignedUrl(a.storage_path, 120);
      return {
        ...a,
        html: error || !data?.signedUrl || !data.signedUrl.startsWith("https://") ? '<p class="field-hint">' + escapeHtml(a.file_name) + ' — could not load. Reopen this ticket to retry.</p>' : '<a class="screenshot-link" href="' + escapeHtml(data.signedUrl) + '" target="_blank" rel="noopener noreferrer">▧ ' + escapeHtml(a.file_name) + '</a>'
      };
    }));
    if (state.currentUser?.id !== actorId || state.currentTicket?.id !== ticketId || seq !== extrasLoadSequence) return;
    state.ticketScreenshotLinks = links;
    $("ticketAttachments").innerHTML = attachments.error ? '<p class="empty">Could not load screenshots.</p>' : links.filter(a => !a.comment_id).map(a => a.html).join('') || '';
    $("screenshotSection").classList.toggle("hidden", !attachments.error && !links.some(a => !a.comment_id));
    renderReplyScreenshots();
  } catch (error) {
    if (state.currentUser?.id === actorId && state.currentTicket?.id === ticketId && seq === extrasLoadSequence) {
      $("ticketAttachments").innerHTML = '<p class="field-hint">Could not load screenshots. Reopen this ticket to retry.</p>';
      $("screenshotSection").classList.remove("hidden");
    }
  }
}
// In-app notifications refresh while the page is visible.
export function initAttachments(handlers) {
  services = handlers;
  $("retryAttachments").addEventListener("click", async () => {
    const pending = state.pendingScreenshotUpload;
    if (!pending || pending.actorId !== state.currentUser?.id || pending.ticketId !== state.currentTicket?.id) return;
    $("retryAttachments").disabled = true;
    try {
      await attachScreenshotFiles(pending.ticketId, pending.commentId, pending.files);
      await loadTicketExtras(pending.ticketId);
    } finally {
      $("retryAttachments").disabled = false;
    }
  });
  $("dismissAttachmentRetry").addEventListener("click", () => {
    state.pendingScreenshotUpload = null;
    renderScreenshotRetry();
  });
  ["ticketFiles", "replyFiles"].forEach(id => $(id).addEventListener("change", () => {
    const files = Array.from($(id).files || []);
    $(id + "Info").textContent = files.length ? files.map(f => f.name).join(", ") : "Up to 3 screenshots, 5 MB each. PNG, JPG, or WebP.";
  }));
}
