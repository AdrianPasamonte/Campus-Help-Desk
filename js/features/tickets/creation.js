import { sb } from "../../core/client.js";
import { showView } from "../../core/navigation.js";
import { state } from "../../core/state.js";
import { loadTickets } from "./api.js";
import { attachScreenshotFiles, validateScreenshotFiles } from "./attachments.js";
import { confirmAction } from "../../ui/dialogs.js";
import { $, escapeHtml } from "../../ui/helpers.js";
// Guided ticket creation: broad area, concern, then contextual details.
export const supportIssues = {
  account: [["Forgot my school account password", "Account"], ["Cannot use Microsoft Authenticator", "Account"], ["No access to my registered phone or number", "Account"], ["Not receiving a verification code", "Account"], ["Another sign-in issue", "Account"]],
  portals: [["Website not loading or showing an error", "Software"], ["Cannot open or download a handout", "Software"], ["Cannot upload an assignment", "Software"], ["Page content or information is missing", "Software"], ["Another eLMS or SIMS issue", "Software"]],
  lab: [["Computer will not turn on", "Hardware"], ["Computer freezes or restarts unexpectedly", "Hardware"], ["Monitor, keyboard, or mouse not working", "Hardware"], ["Application is not working or is missing", "Software"], ["Computer cannot connect to the internet", "Network"]],
  records: [["Request a school document", "Registrar"], ["Need help with enrollment", "Registrar"], ["Student record is missing or incorrect", "Registrar"]],
  fees: [["Payment is not showing in my account", "Other"], ["Question about my fees or balance", "Other"]],
  other: [["Concern not listed", "Other"]]
};
let activeRequestFields = [];
let ticketSubmitting = false;
let ticketDialogTrigger = null;
export function selectedTicketIssue() {
  return (supportIssues[$("supportArea").value] || []).find(i => i[0] === $("issueType").value);
}
export function resetIssueChoices() {
  const issues = supportIssues[$("supportArea").value] || [];
  const isOther = $("supportArea").value === "other";
  $("issueStep").classList.toggle("hidden", !issues.length || isOther);
  $("issueType").disabled = !issues.length;
  $("issueType").innerHTML = '<option value="" disabled selected hidden>Select a concern</option>' + issues.map(i => '<option>' + escapeHtml(i[0]) + '</option>').join('');
  if (isOther) $("issueType").value = issues[0][0];
  $("category").value = "";
  renderRequestFields();
}
export function requestFieldDefinitions(area, concern) {
  const field = (id, label, required = false, options = null, type = "text") => ({
    id,
    label,
    required,
    options,
    type
  });
  switch (area) {
    case "account":
      return [field("schoolEmail", "School Microsoft account email", true, null, "email"), field("contactEmail", "Email where we can reach you", true, null, "email")];
    case "portals":
      return [field("portal", "Which website?", true, ["eLMS", "SIMS", "Other"]), field("page", "Which page or feature needs help?", true), field("error", "Error message (if shown)")];
    case "lab":
      {
        const fields = [field("room", "Computer lab or room number", true), field("pc", "Computer number or asset tag (if known)")];
        if (concern === "Application is not working or is missing") fields.push(field("application", "Application or software name", true));
        fields.push(field("error", "Error message (if shown)"));
        return fields;
      }
    case "records":
      return concern === "Request a school document" ? [field("document", "Which document do you need?", true), field("purpose", "What do you need it for?", true)] : [field("record", "Which record or enrollment step needs help?", true), field("term", "School year / term (if relevant)")];
    case "fees":
      return concern === "Payment is not showing in my account" ? [field("paymentDate", "Payment date", true, null, "date"), field("reference", "Payment reference number (if available)")] : [field("charge", "Which fee or balance are you asking about?", true), field("term", "School year / term (if relevant)")];
    default:
      return [];
  }
}
export function renderRequestFields() {
  const issue = selectedTicketIssue();
  $("ticketDetailsStep").classList.toggle("hidden", !issue);
  $("ticketDetailsStep").disabled = !issue;
  activeRequestFields = issue ? requestFieldDefinitions($("supportArea").value, issue[0]) : [];
  $("selectedConcernTitle").textContent = issue ? $("supportArea").value === "other" ? "Tell us about your concern" : issue[0] : "Tell us more";
  $("category").value = issue ? issue[1] : "";
  $("requestFields").innerHTML = activeRequestFields.map(f => {
    const id = "request_" + f.id;
    const attrs = 'id="' + id + '" ' + (f.required ? 'required' : '');
    const input = f.options ? '<select ' + attrs + '><option value="" disabled selected hidden>Select an option</option>' + f.options.map(o => '<option>' + escapeHtml(o) + '</option>').join('') + '</select>' : '<input ' + attrs + ' type="' + f.type + '" maxlength="200">';
    return '<div class="field"><label for="' + id + '">' + escapeHtml(f.label) + (f.required ? ' <span aria-hidden="true">*</span>' : '') + '</label>' + input + '</div>';
  }).join('');
  if ($("request_contactEmail")) $("request_contactEmail").value = state.currentUser.email || "";
  $("ticketSubmitError").textContent = "";
  updateTicketSubmit();
}
export function updateTicketSubmit() {
  $("supportArea").disabled = ticketSubmitting;
  $("issueType").disabled = ticketSubmitting || !$("supportArea").value || $("supportArea").value === "other";
  $("ticketDetailsStep").disabled = ticketSubmitting || !selectedTicketIssue();
  $("closeTicketDialog").disabled = ticketSubmitting;
  $("cancelTicketDialog").disabled = ticketSubmitting;
  const complete = selectedTicketIssue() && $("subject").value.trim() && $("description").value.trim() && $("ticketForm").checkValidity();
  $("submitTicketBtn").disabled = ticketSubmitting || !complete;
}
export function openTicketDialog() {
  if (!state.currentUser || state.currentUser.role !== "student") return;
  ticketDialogTrigger = document.activeElement;
  $("ticketDialog").showModal();
  $("supportArea").focus();
}
export function closeTicketDialog() {
  if (ticketSubmitting) return;
  const dirty = $("supportArea").value || $("subject").value.trim() || $("description").value.trim();
  if (dirty && !confirmAction("Discard this ticket draft?")) return;
  $("ticketForm").reset();
  resetIssueChoices();
  $("ticketDialog").close();
}
export function initTicketCreation() {
  $("ticketForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (ticketSubmitting || !state.currentUser || state.currentUser.role !== "student") return;
    const issue = selectedTicketIssue();
    if (!issue || !$("ticketForm").reportValidity() || !$("subject").value.trim() || !$("description").value.trim()) return;
    const extra = activeRequestFields.map(f => {
      const value = $("request_" + f.id).value.trim();
      return value ? f.label + ": " + value : "";
    }).filter(Boolean).join("\n");
    let screenshotFiles;
    try {
      screenshotFiles = await validateScreenshotFiles($("ticketFiles").files);
    } catch (error) {
      $("ticketSubmitError").textContent = error.message;
      return;
    }
    if (ticketSubmitting || !state.currentUser) return;
    ticketSubmitting = true;
    $("ticketSubmitError").textContent = "";
    $("submitTicketBtn").textContent = "Submitting…";
    updateTicketSubmit();
    try {
      // The database derives the department from support_area. Keep contextual
      // answers in the description for staff, alongside the structured concern.
      let insertQuery = sb.from("tickets").insert({
        subject: $("subject").value.trim(),
        category: issue[1],
        support_area: $("supportArea").value,
        concern: issue[0],
        priority: "Medium",
        description: "Area: " + $("supportArea").selectedOptions[0].textContent + "\nConcern: " + issue[0] + (extra ? "\n" + extra : "") + "\n\n" + $("description").value.trim()
      });
      const {
        data: created,
        error
      } = await (screenshotFiles.length ? insertQuery.select("id") : insertQuery);
      if (error) throw error;
      if (screenshotFiles.length) await attachScreenshotFiles(created[0].id, null, screenshotFiles);
      $("ticketForm").reset();
      resetIssueChoices();
      $("ticketDialog").close();
      await loadTickets();
      showView("tickets");
    } catch (error) {
      $("ticketSubmitError").textContent = "Could not submit your ticket. " + (error.message || "Please try again.");
    } finally {
      ticketSubmitting = false;
      $("submitTicketBtn").textContent = "Submit ticket";
      updateTicketSubmit();
    }
  });
  $("supportArea").addEventListener("change", resetIssueChoices);
  $("issueType").addEventListener("change", renderRequestFields);
  $("ticketForm").addEventListener("input", updateTicketSubmit);
  $("ticketForm").addEventListener("change", updateTicketSubmit);
  $("closeTicketDialog").addEventListener("click", closeTicketDialog);
  $("cancelTicketDialog").addEventListener("click", closeTicketDialog);
  $("ticketDialog").addEventListener("cancel", e => {
    e.preventDefault();
    closeTicketDialog();
  });
  $("ticketDialog").addEventListener("close", () => {
    if (ticketDialogTrigger && ticketDialogTrigger.isConnected) ticketDialogTrigger.focus();
  });
  // Help articles use the same topics and concerns as ticket creation.
}
