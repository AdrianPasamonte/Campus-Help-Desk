// ---------- Supabase connection ----------
// The project URL is https://<project-ref>.supabase.co
// The publishable key is safe to keep in frontend code (Row Level Security protects the data).
const SUPABASE_URL = "https://ppoedvtnrlnsmingqbqd.supabase.co";
const SUPABASE_KEY = "sb_publishable_ItU-NTNi7kllbS2J9aHgVg_vlPU-8RD";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
let currentUser = null;   // { id, email, full_name, role }
let tickets = [];
let currentTicket = null;

function statusClass(status) {
  return {"Open": "open", "In Progress": "progress", "Resolved": "resolved", "Closed": "closed"}[status] || "open";
}
function badge(status) { return `<span class="badge ${statusClass(status)}">${status}</span>`; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}[c]));
}
function requesterName(t) { return t.student_name || currentUser.full_name; }

// ---------- Tickets ----------
async function loadTickets() {
  // Row Level Security decides what comes back:
  // students get only their own tickets, teachers/admins get all of them.
  const { data, error } = await sb
    .from("tickets")
    .select("*, student:profiles!tickets_student_id_fkey(full_name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load tickets:", error);
    alert("Could not load tickets: " + error.message);
    tickets = [];
  } else {
    tickets = data.map(t => ({ ...t, student_name: t.student ? t.student.full_name : null }));
  }
  render();
}

function render() {
  $("totalCount").textContent = tickets.length;
  $("openCount").textContent = tickets.filter(t => t.status === "Open").length;
  $("progressCount").textContent = tickets.filter(t => t.status === "In Progress").length;
  $("resolvedCount").textContent = tickets.filter(t => t.status === "Resolved").length;
  $("recentTable").innerHTML = tickets.slice(0, 5).map(t =>
    `<tr><td>#${t.id}</td><td>${escapeHtml(t.subject)}</td><td class="priority-${t.priority.toLowerCase()}">${t.priority}</td><td>${badge(t.status)}</td></tr>`
  ).join("");
  renderTickets();
}

function renderTickets() {
  const q = $("search").value.toLowerCase(), s = $("statusFilter").value, p = $("priorityFilter").value;
  const list = tickets.filter(t =>
    (!q || t.subject.toLowerCase().includes(q) || String(t.id).includes(q)) &&
    (!s || t.status === s) && (!p || t.priority === p)
  );
  $("ticketTable").innerHTML = list.length
    ? list.map(t => `<tr><td>#${t.id}</td><td>${escapeHtml(t.subject)}</td><td>${escapeHtml(requesterName(t))}</td><td>${t.category}</td><td class="priority-${t.priority.toLowerCase()}">${t.priority}</td><td>${badge(t.status)}</td><td><button class="btn" data-ticket="${t.id}">View</button></td></tr>`).join("")
    : `<tr><td colspan="7" class="empty">No tickets found.</td></tr>`;
}

// ---------- Views / navigation ----------
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(name).classList.add("active");
  document.querySelectorAll(".nav button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  const titles = {
    dashboard: ["Dashboard", "Overview of your support requests"],
    tickets: [currentUser.role === "student" ? "My Tickets" : "All Tickets", "Search and manage submitted tickets"],
    create: ["Create Ticket", "Submit a new support request"],
    knowledge: ["Knowledge Base", "Quick troubleshooting guides"],
    profile: ["Profile", "Manage your account information"],
    ticketDetail: ["Ticket Details", "View and update a support request"]
  };
  $("pageTitle").textContent = titles[name][0];
  $("pageSub").textContent = titles[name][1];
}
document.querySelectorAll(".nav button[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showView(b.dataset.go)));

$("showRegister").addEventListener("click", () => { $("loginView").classList.add("hidden"); $("registerView").classList.remove("hidden"); });
$("showLogin").addEventListener("click", () => { $("registerView").classList.add("hidden"); $("loginView").classList.remove("hidden"); });

// ---------- Auth ----------
// After Supabase confirms who you are, load your profile (name + role) and open the app.
async function startFromUser(user) {
  const { data: profile, error } = await sb
    .from("profiles").select("full_name, role").eq("id", user.id).single();

  if (error || !profile) {
    console.error("Profile load failed:", error);
    $("loginError").textContent = "Could not load your profile. Did you run supabase_setup.sql?";
    await sb.auth.signOut();
    return;
  }
  currentUser = { id: user.id, email: user.email, full_name: profile.full_name, role: profile.role };
  enterApp();
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPass").value
  });
  if (error) { $("loginError").textContent = error.message; return; }
  await startFromUser(data.user);
});

$("registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("registerError").textContent = "";
  const email = $("regEmail").value.trim();
  const { data, error } = await sb.auth.signUp({
    email,
    password: $("regPass").value,
    options: { data: { full_name: $("regName").value.trim(), role: $("regRole").value } }
  });
  if (error) { $("registerError").textContent = error.message; return; }

  e.target.reset();
  $("loginEmail").value = email;
  $("registerView").classList.add("hidden");
  $("loginView").classList.remove("hidden");

  if (data.session) {
    // Email confirmation is off, so signup also logged us in. Log out so the user signs in normally.
    await sb.auth.signOut();
    alert("Account created! You can log in now.");
  } else {
    alert("Account created! Check your email to confirm it, then log in. (To skip this, turn off \"Confirm email\" in Supabase Authentication settings.)");
  }
});

function enterApp() {
  $("loginPage").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userName").textContent = currentUser.full_name;
  $("profileName").value = currentUser.full_name;
  $("profileEmail").value = currentUser.email || "";
  const isStaff = currentUser.role !== "student";
  $("navCreate").classList.toggle("hidden", isStaff);
  $("quickCreateBtn").classList.toggle("hidden", isStaff);
  $("navTickets").textContent = isStaff ? "▤ All Tickets" : "▤ My Tickets";
  $("updateCard").classList.toggle("hidden", !isStaff);
  loadTickets();
  showView("dashboard");
}

$("logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  currentUser = null; tickets = []; currentTicket = null;
  $("app").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
  $("loginPass").value = "";
});

// ---------- Create ticket ----------
$("ticketForm").addEventListener("submit", async e => {
  e.preventDefault();
  // student_id is filled in automatically by the database (default auth.uid())
  const { error } = await sb.from("tickets").insert({
    subject: $("subject").value.trim(),
    category: $("category").value,
    priority: $("priority").value,
    description: $("description").value.trim()
  });
  if (error) { alert("Could not submit ticket: " + error.message); return; }
  e.target.reset();
  await loadTickets();
  showView("tickets");
});

// ---------- Search / filter ----------
["search", "statusFilter", "priorityFilter"].forEach(id => $(id).addEventListener("input", renderTickets));

// ---------- Ticket details ----------
$("ticketTable").addEventListener("click", e => {
  const id = e.target.dataset.ticket; if (!id) return;
  currentTicket = tickets.find(t => t.id === Number(id)); if (!currentTicket) return;
  $("detailContent").innerHTML = `<h3>#${currentTicket.id} — ${escapeHtml(currentTicket.subject)}</h3>
  <div class="info-row"><span>Requester</span><b>${escapeHtml(requesterName(currentTicket))}</b></div>
  <div class="info-row"><span>Category</span><b>${currentTicket.category}</b></div>
  <div class="info-row"><span>Priority</span><b class="priority-${currentTicket.priority.toLowerCase()}">${currentTicket.priority}</b></div>
  <div class="info-row"><span>Status</span><b>${badge(currentTicket.status)}</b></div>
  <div style="padding-top:18px;line-height:1.6;font-size:14px"><b>Description</b><p style="margin-top:7px;color:var(--muted)">${escapeHtml(currentTicket.description)}</p></div>`;
  $("detailStatus").value = currentTicket.status;
  showView("ticketDetail");
});

$("saveStatus").addEventListener("click", async () => {
  if (!currentTicket) return;
  // .select() returns the updated rows, so we can tell if the security rules blocked the change
  const { data, error } = await sb.from("tickets")
    .update({ status: $("detailStatus").value })
    .eq("id", currentTicket.id)
    .select();
  if (error) { alert("Could not update status: " + error.message); return; }
  if (!data || data.length === 0) { alert("Not allowed: only teachers and admins can update tickets."); return; }
  await loadTickets();
  alert("Ticket status updated.");
  showView("tickets");
});

// ---------- Profile (display name only, this session) ----------
$("saveProfile").addEventListener("click", () => {
  const n = $("profileName").value.trim();
  if (n) { $("userName").textContent = n; alert("Display name updated for this session."); }
});

// ---------- On page load: restore an existing login ----------
(async function init() {
  const { data } = await sb.auth.getSession();
  if (data.session) await startFromUser(data.session.user);
})();
