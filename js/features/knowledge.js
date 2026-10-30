import { sb } from "../core/client.js";
import { state } from "../core/state.js";
import { openTicketDialog, renderRequestFields, resetIssueChoices, supportIssues, updateTicketSubmit } from "./tickets/creation.js";
import { confirmAction } from "../ui/dialogs.js";
import { $, escapeHtml } from "../ui/helpers.js";
// Help articles use the same topics and concerns as ticket creation.
export const faqTopics = {
  account: "Account access",
  portals: "eLMS & SIMS",
  lab: "Computer lab",
  records: "Student records & enrollment",
  fees: "Fees & payments"
};
let articleLoadError = "";
let articleLoadSequence = 0;
let selectedFaqTopic = "";
export function renderFaqs() {
  const query = $("faqSearch").value.trim().toLowerCase();
  $("faqTopics").innerHTML = [["", "All topics"], ...Object.entries(faqTopics)].map(([id, label]) => '<button type="button" class="btn faq-topic' + (selectedFaqTopic === id ? ' selected' : '') + '" data-faq-topic="' + id + '" aria-pressed="' + (selectedFaqTopic === id) + '">' + escapeHtml(label) + '</button>').join('');
  const matches = state.campusFaqs.filter(f => f.status === "published" && (!selectedFaqTopic || f.topic === selectedFaqTopic) && [f.title, faqTopics[f.topic], f.concern, ...f.steps, f.when].join(' ').toLowerCase().includes(query));
  $("faqResultCount").textContent = matches.length + (matches.length === 1 ? " article" : " articles");
  $("homeFaqs").innerHTML = !state.articlesLoaded ? '<p class="empty">Loading help articles…</p>' : articleLoadError ? '<p class="empty">' + escapeHtml(articleLoadError) + '</p>' : matches.length ? matches.map(f => articleCard(f, true)).join('') : '<div class="card faq-no-results"><h3>No matching articles</h3><p>Try a different search or topic. You can also create a ticket below.</p><button type="button" class="btn" data-faq-reset>Clear search and filters</button></div>';
}
// Supabase stores article content and enforces admin-only editing.
export function articleCard(f, studentLink = false) {
  const updated = new Date(f.updated_at).toLocaleDateString();
  return '<details class="card faq"><summary><span class="eyebrow">' + escapeHtml(faqTopics[f.topic] || "Other") + '</span><h3>' + escapeHtml(f.title) + '</h3></summary><div class="faq-body"><h4>What you can do</h4><ol>' + f.steps.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ol><h4>When to contact support</h4><p>' + escapeHtml(f.when) + '</p>' + (f.source_url && /^https:\/\//.test(f.source_url) ? '<a class="faq-source" href="' + escapeHtml(f.source_url) + '" target="_blank" rel="noopener noreferrer">Official guidance ↗</a>' : '') + (studentLink ? '' : '<p class="field-hint">Updated ' + escapeHtml(updated) + (f.editor?.full_name ? ' by ' + escapeHtml(f.editor.full_name) : '') + '</p>') + (studentLink ? '<button type="button" class="btn blue faq-ticket" data-faq-ticket="' + escapeHtml(f.id) + '">Still need help? Create a ticket</button>' : '') + '</div></details>';
}
export async function loadHelpArticles() {
  if (!state.currentUser) return;
  const actorId = state.currentUser.id;
  const sequence = ++articleLoadSequence;
  let query = sb.from("help_articles").select("*, editor:profiles!help_articles_updated_by_fkey(full_name)");
  if (state.currentUser.role !== "admin") query = query.eq("status", "published");
  let result;
  try {
    result = await query.order("updated_at", {
      ascending: false
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
  if (!state.currentUser || state.currentUser.id !== actorId || sequence !== articleLoadSequence) return;
  state.campusFaqs = error ? [] : (data || []).map(f => ({
    ...f,
    steps: f.steps || [],
    when: f.contact_guidance
  }));
  state.articlesLoaded = true;
  articleLoadError = error ? "Could not load help articles. Please try opening this page again." : "";
  renderFaqs();
  renderKnowledge();
}
export function renderKnowledge() {
  const admin = state.currentUser?.role === "admin";
  $("knowledgeStatus").classList.toggle("hidden", !admin);
  $("newArticleBtn").classList.toggle("hidden", !admin);
  const query = $("knowledgeSearch").value.trim().toLowerCase();
  const topic = $("knowledgeTopic").value;
  const status = admin ? $("knowledgeStatus").value : "published";
  const list = state.campusFaqs.filter(f => (admin || f.status === "published") && (!status || f.status === status) && (!topic || f.topic === topic) && (!query || [f.title, faqTopics[f.topic], ...f.steps, f.when].join(' ').toLowerCase().includes(query)));
  $("knowledgeMessage").textContent = articleLoadError || list.length + (list.length === 1 ? " article" : " articles");
  if (!state.articlesLoaded || articleLoadError) {
    $("knowledgeContent").innerHTML = '<p class="empty">' + escapeHtml(articleLoadError || "Loading help articles…") + '</p>';
    return;
  }
  if (!admin) {
    $("knowledgeContent").innerHTML = list.length ? '<div class="knowledge">' + list.map(f => articleCard(f)).join('') + '</div>' : '<p class="empty">No published articles match your search.</p>';
    return;
  }
  $("knowledgeContent").innerHTML = '<div class="card table-wrap"><table><thead><tr><th>Title</th><th>Topic</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>' + (list.length ? list.map(f => '<tr><td>' + escapeHtml(f.title) + '</td><td>' + escapeHtml(faqTopics[f.topic] || "Other") + '</td><td><span class="article-status ' + f.status + '">' + escapeHtml(f.status) + '</span></td><td>' + escapeHtml(new Date(f.updated_at).toLocaleString()) + '<br><small>' + escapeHtml(f.editor?.full_name || "Initial content") + '</small></td><td><div class="actions"><button class="btn" data-article-edit="' + escapeHtml(f.id) + '">Edit</button>' + (f.status === 'published' ? '<button class="btn" data-article-state="draft" data-article-id="' + escapeHtml(f.id) + '">Unpublish</button>' : f.status === 'draft' ? '<button class="btn blue" data-article-state="published" data-article-id="' + escapeHtml(f.id) + '">Publish</button>' : '<button class="btn" data-article-state="draft" data-article-id="' + escapeHtml(f.id) + '">Restore draft</button>') + (f.status !== 'archived' ? '<button class="btn" data-article-state="archived" data-article-id="' + escapeHtml(f.id) + '">Archive</button>' : '') + '</div></td></tr>').join('') : '<tr><td colspan="5" class="empty">No articles match your search.</td></tr>') + '</tbody></table></div>';
}
let articleSaving = false;
let articleInitialState = "";
let articleDialogTrigger = null;
export function articleFormState() {
  return JSON.stringify(["articleTitle", "articleTopic", "articleConcern", "articleSteps", "articleContact", "articleSource", "articlePortal"].map(id => $(id).value));
}
export function syncArticleConcern() {
  const topic = $("articleTopic").value;
  $("articleConcern").innerHTML = '<option value="">No specific concern</option>' + (supportIssues[topic] || []).map(i => '<option>' + escapeHtml(i[0]) + '</option>').join('');
  $("articlePortalField").classList.toggle("hidden", topic !== "portals");
  if (topic !== "portals") $("articlePortal").value = "";
}
export function openArticleEditor(id = null) {
  if (state.currentUser?.role !== "admin") return;
  state.editingArticle = id ? state.campusFaqs.find(f => f.id === id) : null;
  if (id && !state.editingArticle) return;
  const f = state.editingArticle;
  $("articleForm").reset();
  $("articleTitle").value = f?.title || "";
  $("articleTopic").value = f?.topic || "";
  syncArticleConcern();
  $("articleConcern").value = f?.concern || "";
  $("articleSteps").value = f?.steps.join("\n") || "";
  $("articleContact").value = f?.when || "";
  $("articleSource").value = f?.source_url || "";
  $("articlePortal").value = f?.portal_hint || "";
  $("articleDialogTitle").textContent = f ? "Edit article" : "New article";
  $("articleEditorMeta").textContent = f ? "Status: " + f.status + " · Last updated " + new Date(f.updated_at).toLocaleString() + (f.editor?.full_name ? " by " + f.editor.full_name : "") : "Save a private draft or publish it for students and staff.";
  $("articleError").textContent = "";
  articleInitialState = articleFormState();
  articleDialogTrigger = document.activeElement;
  $("articleDialog").showModal();
  $("articleTitle").focus();
}
export function closeArticleEditor() {
  if (articleSaving) return;
  if (articleInitialState !== articleFormState() && !confirmAction("Discard unsaved article changes?")) return;
  $("articleDialog").close();
}
export function validateArticlePayload(payload) {
  if (!payload.title || !payload.topic) return "Enter a title and choose a topic.";
  if (payload.source_url && !/^https:\/\//.test(payload.source_url)) return "Use an https:// link for official guidance.";
  if (payload.status === "published" && (!payload.steps.length || !payload.contact_guidance)) return "Add at least one instruction and explain when to contact support before publishing.";
  return "";
}
export const articleTopics = {
  ...faqTopics,
  other: "Other / Not sure"
};
export function initKnowledge() {
  $("faqSearch").addEventListener("input", renderFaqs);
  $("faqTopics").addEventListener("click", e => {
    const button = e.target.closest("[data-faq-topic]");
    if (!button) return;
    selectedFaqTopic = button.dataset.faqTopic;
    renderFaqs();
    // Filtering rebuilds buttons; keep keyboard focus on the selected topic.
    const active = $("faqTopics").querySelector('[data-faq-topic="' + selectedFaqTopic + '"]');
    if (active) active.focus();
  });
  $("homeFaqs").addEventListener("click", e => {
    if (e.target.closest("[data-faq-reset]")) {
      $("faqSearch").value = "";
      selectedFaqTopic = "";
      renderFaqs();
      $("faqSearch").focus();
      return;
    }
    const button = e.target.closest("[data-faq-ticket]");
    if (!button || !state.currentUser || state.currentUser.role !== "student") return;
    const article = state.campusFaqs.find(f => f.id === button.dataset.faqTicket && f.status === "published");
    if (!article) return;
    const dirty = $("supportArea").value || $("subject").value.trim() || $("description").value.trim();
    if (dirty && !confirmAction("Replace the current ticket draft with a request about this article?")) return;
    $("ticketForm").reset();
    $("supportArea").value = article.topic;
    resetIssueChoices();
    $("issueType").value = article.concern || "";
    renderRequestFields();
    if (article.portal_hint && $("request_portal")) $("request_portal").value = article.portal_hint;
    updateTicketSubmit();
    openTicketDialog();
  });
  $("articleForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (articleSaving || state.currentUser?.role !== "admin" || !$("articleForm").reportValidity()) return;
    const payload = {
      title: $("articleTitle").value.trim(),
      topic: $("articleTopic").value,
      concern: $("articleConcern").value || null,
      steps: $("articleSteps").value.split("\n").map(s => s.trim()).filter(Boolean),
      contact_guidance: $("articleContact").value.trim(),
      source_url: $("articleSource").value.trim() || null,
      portal_hint: $("articleTopic").value === "portals" ? $("articlePortal").value || null : null,
      status: e.submitter?.dataset.articleSave || "draft"
    };
    const validation = validateArticlePayload(payload);
    if (validation) {
      $("articleError").textContent = validation;
      return;
    }
    articleSaving = true;
    $("articleError").textContent = "";
    $("articleForm").querySelectorAll("button, input, select, textarea").forEach(b => b.disabled = true);
    $("closeArticleDialog").disabled = true;
    try {
      let query = state.editingArticle ? sb.from("help_articles").update(payload).eq("id", state.editingArticle.id).eq("revision", state.editingArticle.revision) : sb.from("help_articles").insert(payload);
      const {
        data,
        error
      } = await query.select("id");
      if (error) throw error;
      if (!data?.length) {
        await loadHelpArticles();
        throw new Error("This article changed since you opened it. Close and reopen it to load the latest version.");
      }
      $("articleDialog").close();
      await loadHelpArticles();
    } catch (error) {
      $("articleError").textContent = "Could not save article. " + error.message;
    } finally {
      articleSaving = false;
      $("articleForm").querySelectorAll("button, input, select, textarea").forEach(b => b.disabled = false);
      $("closeArticleDialog").disabled = false;
    }
  });
  $("knowledgeContent").addEventListener("click", async e => {
    if (state.currentUser?.role !== "admin") return;
    const edit = e.target.closest("[data-article-edit]");
    if (edit) {
      openArticleEditor(edit.dataset.articleEdit);
      return;
    }
    const button = e.target.closest("[data-article-state]");
    if (!button) return;
    const f = state.campusFaqs.find(f => f.id === button.dataset.articleId);
    if (!f) return;
    const status = button.dataset.articleState;
    const validation = validateArticlePayload({
      ...f,
      contact_guidance: f.when,
      status
    });
    if (validation) {
      $("knowledgeMessage").textContent = validation;
      return;
    }
    if (["archived", "draft"].includes(status) && f.status !== "archived" && !confirmAction((status === "archived" ? "Archive" : "Unpublish") + ' "' + f.title + '"? It will no longer appear for students or staff.')) return;
    button.disabled = true;
    try {
      const {
        data,
        error
      } = await sb.from("help_articles").update({
        status
      }).eq("id", f.id).eq("revision", f.revision).select("id");
      if (error || !data?.length) throw error || new Error("This article changed. Reload the page before trying again.");
      await loadHelpArticles();
    } catch (error) {
      $("knowledgeMessage").textContent = "Could not update article. " + error.message;
      button.disabled = false;
    }
  });
  $("articleTopic").innerHTML = '<option value="" disabled selected>Select a topic</option>' + Object.entries(articleTopics).map(([id, label]) => '<option value="' + id + '">' + escapeHtml(label) + '</option>').join('');
  $("knowledgeTopic").innerHTML = '<option value="">All topics</option>' + Object.entries(articleTopics).map(([id, label]) => '<option value="' + id + '">' + escapeHtml(label) + '</option>').join('');
  $("knowledgeSearch").addEventListener("input", renderKnowledge);
  $("knowledgeTopic").addEventListener("change", renderKnowledge);
  $("knowledgeStatus").addEventListener("change", renderKnowledge);
  $("newArticleBtn").addEventListener("click", () => openArticleEditor());
  $("articleTopic").addEventListener("change", syncArticleConcern);
  $("closeArticleDialog").addEventListener("click", closeArticleEditor);
  $("cancelArticleDialog").addEventListener("click", closeArticleEditor);
  $("articleDialog").addEventListener("cancel", e => {
    e.preventDefault();
    closeArticleEditor();
  });
  $("articleDialog").addEventListener("close", () => {
    if (articleDialogTrigger?.isConnected) articleDialogTrigger.focus();
  });

  // Password visibility and live registration confirmation.
}
