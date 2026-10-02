// ---------- Supabase connection ----------

const SUPABASE_URL = "https://ppoedvtnrlnsmingqbqd.supabase.co";
const SUPABASE_KEY = "sb_publishable_ItU-NTNi7kllbS2J9aHgVg_vlPU-8RD";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// ---------- Helpers ----------

const $ = id => document.getElementById(id);

let currentUser = null;
let recoveryMode = !!window.location && (new URLSearchParams(window.location.search).get("recovery") === "1" || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery");
let recoveryUserId = null;
let recoverySending = false;
let passwordResetting = false;
let tickets = [];
let ticketLoadSequence=0;
let currentTicket = null;
let staffDirectory = [];
let commentLoadSequence = 0;
let replySending = false;
let profileSaving = false;
const departments = {it: "IT", registrar: "Registrar", finance: "Finance / Cashier", review: "Admin review"};
const departmentLabel = id => departments[id] || "Not assigned";
const ticketDepartment = area => ({account:"it",portals:"it",lab:"it",records:"registrar",fees:"finance",other:"review"})[area] || "review";
function canReadTicket(t) { return currentUser && (currentUser.role === "admin" || (currentUser.role === "student" && t.student_id === currentUser.id) || (currentUser.role === "staff" && !!currentUser.department && t.department === currentUser.department)); }
function canManageTicket(t) { return canReadTicket(t) && ["Open","In Progress"].includes(t.status) && (currentUser.role === "admin" || (currentUser.role === "staff" && (!t.assigned_to || t.assigned_to === currentUser.id))); }

const isStaffRole = r =>
  r === "staff" || r === "admin";


function statusClass(status) {
  return {
    "Open": "open",
    "In Progress": "progress",
    "Resolved": "resolved",
    "Closed": "closed"
  }[status] || "open";
}


function badge(status) {
  return `
    <span class="badge ${statusClass(status)}">
      ${status}
    </span>
  `;
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

function requesterName(t) {
  return t.student_name || "Unknown";
}


// ---------- Tickets ----------

async function loadTickets(silent = false) {
  if (!currentUser) return;
  const actorId=currentUser.id, sequence=++ticketLoadSequence;

  if (currentUser.role === "staff" && !currentUser.department) { tickets = []; render(); return; }
  let query = sb
    .from("tickets")
    .select(`
      *,
      student:profiles!tickets_student_id_fkey(full_name),
      assignee:profiles!tickets_assigned_to_fkey(full_name)
    `);
  if (currentUser.role === "staff") query = query.eq("department", currentUser.department);
  if (currentUser.role === "student") query = query.eq("student_id", currentUser.id);
  const { data, error } = await query.order("created_at", { ascending: false });


  if (currentUser?.id!==actorId || sequence!==ticketLoadSequence) return;
  if (error) {

    console.error(
      "Could not load tickets:",
      error
    );

    if (!silent) alert(
      "Could not load tickets: " +
      error.message
    );
    else return;

    tickets = [];

  } else {

    tickets = data.filter(canReadTicket).map(t => ({
      ...t,

      student_name:
        t.student
          ? t.student.full_name
          : null,

      assignee_name:
        t.assignee
          ? t.assignee.full_name
          : null
    }));

  }


  render();
}


// ---------- Dashboard / Tickets ----------

function render() {

  $("totalCount").textContent =
    tickets.length;

  $("openCount").textContent =
    tickets.filter(
      t => t.status === "Open"
    ).length;

  $("progressCount").textContent =
    tickets.filter(
      t => t.status === "In Progress"
    ).length;

  $("resolvedCount").textContent =
    tickets.filter(
      t =>
        t.status === "Resolved" ||
        t.status === "Closed"
    ).length;


  // Recent Tickets
  // Only active tickets appear here.
  const recentTickets = tickets.filter(
    t =>
      t.status === "Open" ||
      t.status === "In Progress"
  );


  $("recentTable").innerHTML =
    recentTickets.slice(0, 5).map(t => `
      <tr>

        <td>#${t.id}</td>

        <td>
          ${escapeHtml(t.subject)}
        </td>



        <td>
          ${badge(t.status)}
        </td>

      </tr>
    `).join("");


  renderTickets();
  renderTicketHistory();
}


function renderTickets() {

  if (!currentUser) return;


  const searchInput =
    $("search").value.toLowerCase().trim();

  const s =
    $("statusFilter").value;

  const p = "";

  const a =
    $("assignFilter").value;
  const department = $("departmentFilter").value;


  const list = tickets.filter(t => {

    // Only active tickets belong here.
    const isActive =
      t.status === "Open" ||
      t.status === "In Progress";


    if (!isActive) {
      return false;
    }


    const subject =
      (t.subject || "").toLowerCase();

    const category =
      (t.category || "").toLowerCase();

    const requester =
      requesterName(t).toLowerCase();

    const ticketId =
      String(t.id).toLowerCase();


    // Search by:
    // Ticket ID
    // Subject
    // Requester name
    // Category
    const matchesSearch =
      !searchInput ||
      ticketId.includes(searchInput) ||
      subject.includes(searchInput) ||
      requester.includes(searchInput) ||
      category.includes(searchInput);


    const matchesStatus =
      !s || t.status === s;


    const matchesPriority =
      !p || t.priority === p;


    let matchesAssignment = true;


    if (a === "unassigned") {

      matchesAssignment =
        !t.assigned_to;

    }


    if (a === "mine") {

      matchesAssignment =
        t.assigned_to === currentUser.id;

    }


    return (
      canReadTicket(t) &&
      (!department || currentUser.role !== "admin" || t.department === department) &&
      matchesSearch &&
      matchesStatus &&
      matchesPriority &&
      matchesAssignment
    );

  });


  list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);

  $("ticketTable").innerHTML =
    list.length

      ? list.map(t => `
          <tr>

            <td>#${t.id}</td>

            <td>
              ${escapeHtml(t.subject)}
            </td>

            <td>
              ${escapeHtml(
        requesterName(t)
      )}
            </td>

            <td>
              ${escapeHtml(t.category)}
            </td>
            <td>${escapeHtml(departmentLabel(t.department))}</td>

            <td>
              ${badge(t.status)}
            </td>

            <td>
              ${escapeHtml(
        t.assignee_name || "—"
      )}
            </td>

            <td>
              <button
                class="btn"
                data-ticket="${t.id}">
                View
              </button>
            </td>

          </tr>
        `).join("")

      : `
        <tr>
          <td colspan="8" class="empty">
            No active tickets found.
          </td>
        </tr>
      `;
}


// ---------- TICKET HISTORY ----------

function renderTicketHistory() {

  if (!currentUser) return;


  const historySearch =
    $("historySearch");

  const historyNameSearch =
    $("historyNameSearch");

  const historyStatusFilter =
    $("historyStatusFilter");


  if (
    !historySearch ||
    !historyNameSearch ||
    !historyStatusFilter ||
    !$("historyTable")
  ) {
    return;
  }


  const q =
    historySearch.value.toLowerCase().trim();

  const name =
    historyNameSearch.value.toLowerCase().trim();

  const status =
    historyStatusFilter.value;


  const staff =
    isStaffRole(currentUser.role);


  const history = tickets.filter(t => {

    // Only resolved and closed tickets
    const isHistory =
      t.status === "Resolved" ||
      t.status === "Closed";


    // Students only see their own tickets.
    // Staff/admin can see all history.
    const isAllowed =
      canReadTicket(t);


    const subject =
      (t.subject || "").toLowerCase();

    const category =
      (t.category || "").toLowerCase();

    const requester =
      requesterName(t).toLowerCase();

    const ticketId =
      String(t.id).toLowerCase();


    // Search by ID, subject, requester, or category
    const matchesSearch =
      !q ||
      ticketId.includes(q) ||
      subject.includes(q) ||
      requester.includes(q) ||
      category.includes(q);


    // Requester name search for staff/admin
    const matchesName =
      !staff ||
      !name ||
      requester.includes(name);


    const matchesStatus =
      !status ||
      t.status === status;


    return (
      isHistory &&
      isAllowed &&
      matchesSearch &&
      matchesName &&
      matchesStatus
    );

  });


  $("historyTable").innerHTML =
    history.length

      ? history.map(t => `
          <tr>

            <td>#${t.id}</td>

            <td>
              ${escapeHtml(t.subject)}
            </td>

            <td>
              ${escapeHtml(
        requesterName(t)
      )}
            </td>

            <td>
              ${escapeHtml(t.category)}
            </td>
            <td>${escapeHtml(departmentLabel(t.department))}</td>

            <td>
              ${badge(t.status)}
            </td>

            <td>
              ${escapeHtml(
        t.assignee_name || "—"
      )}
            </td>

            <td>
              <button
                class="btn"
                data-history-ticket="${t.id}">
                View
              </button>
            </td>

          </tr>
        `).join("")

      : `
          <tr>
            <td colspan="8" class="empty">
              No ticket history found.
            </td>
          </tr>
        `;
}


// ---------- Views / Navigation ----------

function showView(name) {
  if (name === "create") { openTicketDialog(); return; }
  if (["users","reports"].includes(name) && currentUser.role !== "admin") return;
  if (currentUser.role === "student" && name === "knowledge") name = "dashboard";
  if (isStaffRole(currentUser.role) && name === "create") return;

  document
    .querySelectorAll(".view")
    .forEach(v =>
      v.classList.remove("active")
    );


  const target =
    $(name);

  if (target) {
    target.classList.add("active");
  }


  document
    .querySelectorAll(".nav button[data-view]")
    .forEach(b =>
      b.classList.toggle(
        "active",
        b.dataset.view === name || (currentUser.role === "student" && name === "create" && b.dataset.view === "dashboard")
      )
    );


  const titles = {

    dashboard: [
      currentUser.role === "student" ? "Help Center" : "Dashboard",
      currentUser.role === "student" ? "Answers and support for campus life" : "Overview of your support requests"
    ],

    tickets: [
      currentUser.role === "student"
        ? "My Tickets"
        : currentUser.role === "staff" ? departmentLabel(currentUser.department) + " Tickets" : "All Tickets",
      "Search and manage submitted tickets"
    ],

    ticketHistory: [
      "Ticket History",
      "View resolved and closed support tickets"
    ],

    create: [
      "Create Ticket",
      "Submit a new support request"
    ],

    users: [
      "Users",
      "Create staff accounts and manage roles"
    ],

    reports: [
      "Reports",
      "How the help desk is performing"
    ],

    knowledge: [
      currentUser.role === "admin" ? "Manage Articles" : "Knowledge Base",
      currentUser.role === "admin" ? "Create and maintain campus help articles" : "Published answers and support guidance"
    ],

    profile: [
      "Profile",
      "Manage your account information"
    ],

    ticketDetail: [
      "Ticket Details",
      currentTicket && ["Resolved","Closed"].includes(currentTicket.status) ? "Review the request, conversation, and resolution" : "View, reply to and manage a support request"
    ]

  };


  if (titles[name]) {

    $("pageTitle").textContent =
      titles[name][0];

    $("pageSub").textContent =
      titles[name][1];

  }


  if (["dashboard","knowledge"].includes(name)) loadHelpArticles();

  if (name === "users") {
    loadUsers();
  }


  if (name === "reports") {

    loadTickets().then(
      renderReports
    );

  }


  if (name === "ticketHistory") {

    loadTickets().then(
      renderTicketHistory
    );

  }

}


document
  .querySelectorAll(".nav button[data-view]")
  .forEach(b =>
    b.addEventListener(
      "click",
      () => showView(b.dataset.view)
    )
  );


document
  .querySelectorAll("[data-go]")
  .forEach(b =>
    b.addEventListener(
      "click",
      () => showView(b.dataset.go)
    )
  );


// ---------- Login / Register Navigation ----------

$("showRegister").addEventListener(
  "click",
  () => {

    $("loginView")
      .classList.add("hidden");

    $("registerView")
      .classList.remove("hidden");

  }
);


$("showLogin").addEventListener(
  "click",
  () => {

    $("registerView")
      .classList.add("hidden");

    $("loginView")
      .classList.remove("hidden");

  }
);


// ---------- AUTH ----------

async function startFromUser(user) {

  const {
    data: profile,
    error
  } = await sb
    .from("profiles")
    .select("full_name, role, department")
    .eq("id", user.id)
    .single();


  if (error || !profile) {

    console.error(
      "Profile load failed:",
      error
    );

    $("loginError").textContent =
      "Could not load your profile. Did you run the SQL files?";

    await sb.auth.signOut();

    return;
  }


  currentUser = {

    id: user.id,

    email: user.email,

    full_name:
      profile.full_name,

    role:
      profile.role,
    department: profile.department

  };


  enterApp();
}


// ---------- LOGIN ----------

$("loginForm").addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    $("loginError").textContent = "";
    $("loginMessage").textContent = "";


    const {
      data,
      error
    } = await sb.auth.signInWithPassword({

      email:
        $("loginEmail")
          .value
          .trim(),

      password:
        $("loginPass").value

    });


    if (error) {

      $("loginError").textContent =
        error.message;

      return;
    }


    await startFromUser(
      data.user
    );

  }
);


// ---------- REGISTER ----------

$("registerForm").addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    $("registerError").textContent = "";
    if ($("regPass").value !== $("regConfirmPass").value) {
      $("registerError").textContent = "Passwords do not match. Please enter the same password in both fields.";
      $("regConfirmPass").focus();
      return;
    }


    const email =
      $("regEmail")
        .value
        .trim();


    const {
      data,
      error
    } = await sb.auth.signUp({

      email,

      password:
        $("regPass").value,

      options: {
        data: {
          full_name:
            $("regName")
              .value
              .trim()
        }
      }

    });


    if (error) {

      $("registerError").textContent =
        error.message;

      return;
    }


    e.target.reset();

    $("loginEmail").value =
      email;

    $("registerView")
      .classList.add("hidden");

    $("loginView")
      .classList.remove("hidden");


    if (data.session) {

      await sb.auth.signOut();

      alert(
        "Account created! You can log in now."
      );

    } else {

      alert(
        'Account created! Check your email to confirm it, then log in. (To skip this, turn off "Confirm email" in Supabase Authentication settings.)'
      );

    }

  }
);


// ---------- ENTER APPLICATION ----------

function enterApp() {
  $("profileMessage").textContent = "";
  const studentHome = currentUser.role === "student";
  $("helpHome").classList.toggle("hidden", !studentHome);
  $("staffDashboard").classList.toggle("hidden", studentHome);
  $("navHome").textContent = studentHome ? "⌂ Help Center" : "▦ Dashboard";
  $("navKnowledge").classList.toggle("hidden", studentHome);
  $("navKnowledge").textContent = currentUser.role === "admin" ? "▤ Manage Articles" : "? Knowledge Base";
  renderFaqs();

  $("loginPage")
    .classList.add("hidden");

  $("app")
    .classList.remove("hidden");


  $("userName").textContent =
    currentUser.full_name;


  $("profileName").value =
    currentUser.full_name;


  $("profileEmail").value =
    currentUser.email || "";


  const staff =
    isStaffRole(
      currentUser.role
    );


  $("departmentFilter").classList.toggle("hidden", currentUser.role !== "admin");
  $("departmentFilter").value = "";
  $("detailDepartmentField").classList.toggle("hidden", currentUser.role !== "admin");
  $("departmentNotice").classList.toggle("hidden", currentUser.role !== "staff");
  $("departmentNotice").textContent = currentUser.department ? "Your department: " + departmentLabel(currentUser.department) + ". You can work on unassigned tickets or tickets assigned to you." : "Your account has no department. Ask an administrator to assign one before you can access a ticket queue.";

  // Students can create tickets
  $("navCreate")
    .classList.toggle(
      "hidden",
      true
    );


  $("quickCreateBtn")
    .classList.toggle(
      "hidden",
      staff
    );


  // Only admins see Users
  $("navUsers")
    .classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );


  // Only admins see Reports
  $("navReports")
    .classList.toggle(
      "hidden",
      currentUser.role !== "admin"
    );


  // Assignment filter only for staff/admin
  $("assignFilter")
    .classList.toggle(
      "hidden",
      !staff
    );


  // Requester name search in history
  // only for staff/admin
  $("historyNameSearch")
    .classList.toggle(
      "hidden",
      !staff
    );


  $("navTickets").textContent =
    staff
      ? (currentUser.role === "admin" ? "▤ All Tickets" : "▤ Department Tickets")
      : "▤ My Tickets";


  $("updateCard")
    .classList.toggle(
      "hidden",
      !staff
    );


  if (staff) {
    loadStaffList();
  }


  loadTickets();
  loadNotifications();

  showView("dashboard");

}


// ---------- LOGOUT ----------

$("logout").addEventListener(
  "click",
  async () => {

    await sb.auth.signOut();

    currentUser = null;
    pendingScreenshotUpload=null;
    notifications=[];renderNotifications();
    campusFaqs = [];
    articlesLoaded = false;
    editingArticle = null;
    tickets = [];
    currentTicket = null;


    $("app")
      .classList.add("hidden");

    $("loginPage")
      .classList.remove("hidden");


    $("loginPass").value = "";

  }
);


// ---------- CREATE TICKET ----------

$("ticketForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (ticketSubmitting || !currentUser || currentUser.role !== "student") return;
  const issue = selectedTicketIssue();
  if (!issue || !$("ticketForm").reportValidity() || !$("subject").value.trim() || !$("description").value.trim()) return;
  const extra = activeRequestFields.map(f => {
    const value = $("request_" + f.id).value.trim();
    return value ? f.label + ": " + value : "";
  }).filter(Boolean).join("\n");
  let screenshotFiles;
  try { screenshotFiles=await validateScreenshotFiles($("ticketFiles").files); } catch(error) { $("ticketSubmitError").textContent=error.message; return; }
  if(ticketSubmitting || !currentUser) return;
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
    const {data:created,error}=await (screenshotFiles.length?insertQuery.select("id"):insertQuery);
    if (error) throw error;
    if(screenshotFiles.length) await attachScreenshotFiles(created[0].id,null,screenshotFiles);
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

// ---------- SEARCH / FILTER ----------

[
  "search",
  "statusFilter",
  "priorityFilter",
  "assignFilter",
  "departmentFilter"
].forEach(id => {

  const element = $(id);

  if (element) {

    element.addEventListener(
      "input",
      renderTickets
    );

    element.addEventListener(
      "change",
      renderTickets
    );

  }

});


[
  "historySearch",
  "historyNameSearch",
  "historyStatusFilter"
].forEach(id => {

  const element = $(id);

  if (element) {

    element.addEventListener(
      "input",
      renderTicketHistory
    );

    element.addEventListener(
      "change",
      renderTicketHistory
    );

  }

});


// ---------- STAFF LIST ----------

async function loadStaffList() {
  const {data, error} = await sb.from("profiles").select("id, full_name, role, department").in("role", ["staff", "admin"]).order("full_name");
  staffDirectory = error ? [] : (data || []);
  if (error) console.error("Could not load staff", error);
  renderAssigneeOptions();
}
function renderAssigneeOptions() {
  const department = currentUser.role === "admin" ? $("detailDepartment").value : currentUser.department;
  const selected = $("detailAssignee").value;
  const list = staffDirectory.filter(s => currentUser.role === "admin" ? (s.role === "admin" || (s.role === "staff" && s.department === department)) : s.id === currentUser.id && s.department === department);
  $("detailAssignee").innerHTML = '<option value="">Unassigned</option>' + list.map(s => '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.id === currentUser.id ? "Me" : s.full_name) + ' (' + (s.role === "admin" ? 'Admin' : escapeHtml(departmentLabel(s.department))) + ')</option>').join('');
  $("detailAssignee").value = list.some(s => s.id === selected) ? selected : "";
}
$("detailDepartment").addEventListener("change", () => { $("detailAssignee").value = ""; renderAssigneeOptions(); });

// ---------- OPEN TICKET DETAILS ----------

function openTicketDetails(ticket) {
  if (!canReadTicket(ticket)) return;

  currentTicket = ticket;
  ticketScreenshotLinks=[];
  $("ticketAttachments").innerHTML='<p class="empty">Loading screenshots…</p>';
  $("ticketActivity").innerHTML='<p class="empty">Loading activity…</p>';
  $("replyError").textContent = "";
  syncReplyControls();
  const historical = ["Resolved", "Closed"].includes(ticket.status);
  $("historyReadOnlyNotice").classList.toggle("hidden", !historical);
  $("commentForm").classList.toggle("hidden", historical);
  $("detailDepartment").value = ticket.department;
  renderAssigneeOptions();
  $("updateCard").classList.toggle("hidden", !canManageTicket(ticket));

  const t = currentTicket;


  renderTicketSummary(t);

  $("detailStatus").value =
    t.status;


  $("detailAssignee").value =
    t.assigned_to || "";


  $("detailResolution").value =
    t.resolution_note || "";


  const student =
    currentUser.role === "student";


  $("deleteCard")
    .classList.toggle(
      "hidden",
      !(student && t.status === "Open")
    );


  $("resolveCard")
    .classList.toggle(
      "hidden",
      !(student && t.status === "Resolved")
    );


  $("reopenReason").value = "";

  $("commentText").value = "";


  loadComments(t.id);
  loadTicketExtras(t.id);
  markTicketNotificationsRead(t.id);

  showView("ticketDetail");

}


// ---------- ACTIVE TICKET DETAILS ----------

$("ticketTable").addEventListener(
  "click",
  e => {

    const id =
      e.target.dataset.ticket;


    if (!id) return;


    const ticket =
      tickets.find(
        t =>
          t.id === Number(id)
      );


    if (!ticket) return;


    openTicketDetails(ticket);

  }
);


// ---------- HISTORY DETAILS ----------

$("historyTable").addEventListener(
  "click",
  e => {

    const id =
      e.target.dataset.historyTicket;


    if (!id) return;


    const ticket =
      tickets.find(
        t =>
          t.id === Number(id)
      );


    if (!ticket) return;


    openTicketDetails(ticket);

  }
);


// ---------- STAFF / ADMIN UPDATE ----------

$("saveStatus").addEventListener(
  "click",
  async () => {

    if (!currentTicket || !canManageTicket(currentTicket)) return;
    const department = currentUser.role === "admin" ? $("detailDepartment").value : currentTicket.department;

    let status =
      $("detailStatus").value;
    if (!["Open", "In Progress", "Resolved"].includes(status)) {
      alert("The student must confirm the solution before this ticket can close.");
      return;
    }


    const assignee =
      $("detailAssignee").value ||
      null;


    const note =
      $("detailResolution")
        .value
        .trim();


    if (
      status === "Resolved" &&
      !note
    ) {

      alert(
        "Please add a resolution note explaining how it was fixed."
      );

      return;
    }


    // Assigning an Open ticket
    // automatically makes it In Progress
    if (
      assignee &&
      status === "Open"
    ) {

      status = "In Progress";

    }


    const {
      data,
      error
    } = await sb
      .from("tickets")
      .update({

        status,
        department,

        assigned_to:
          assignee,

        resolution_note:
          note || null

      })
      .eq(
        "id",
        currentTicket.id
      )
      .select();


    if (error) {

      alert(
        "Could not update ticket: " +
        error.message
      );

      return;
    }


    if (
      !data ||
      data.length === 0
    ) {

      alert(
        "You can only update unassigned tickets or your assigned tickets in your department."
      );

      return;
    }


    await loadTickets();


    alert(
      "Ticket updated."
    );


    // If it is now Resolved or Closed,
    // it will automatically appear in History.
    // Otherwise it stays in active tickets.
    if (
      status === "Resolved" ||
      status === "Closed"
    ) {

      showView("ticketHistory");

    } else {

      showView("tickets");

    }

  }
);


// ---------- STUDENT RESOLUTION ----------

async function respondToResolution(
  fixed
) {

  if (!currentTicket) return;


  const {
    error
  } = await sb.rpc(
    "respond_to_resolution",
    {
      p_ticket_id:
        currentTicket.id,

      p_fixed:
        fixed,

      p_reason:
        $("reopenReason")
          .value
          .trim() || null
    }
  );


  if (error) {

    alert(
      "Could not update ticket: " +
      error.message
    );

    return;
  }


  await loadTickets();


  alert(
    fixed
      ? "Ticket closed. Glad it's fixed!"
      : "Ticket reopened. Staff will take another look."
  );


  if (fixed) {

    showView("ticketHistory");

  } else {

    showView("tickets");

  }

}


$("confirmFixed").addEventListener(
  "click",
  () =>
    respondToResolution(true)
);


$("reopenTicket").addEventListener(
  "click",
  () =>
    respondToResolution(false)
);


// ---------- CONVERSATION ----------

async function loadComments(
  ticketId
) {
  if (!currentUser || currentTicket?.id !== ticketId) return;
  const actorId = currentUser.id;
  const sequence = ++commentLoadSequence;

  $("commentList").innerHTML =
    '<p class="empty">Loading...</p>';


  let result;
  try { result = await sb
    .from("ticket_comments")
    .select(`
      *,
      author:profiles!ticket_comments_author_id_fkey(
        full_name,
        role
      )
    `)
    .eq(
      "ticket_id",
      ticketId
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    );


  } catch(error) { result = {data:null,error}; }
  const {data,error} = result;

  if (sequence !== commentLoadSequence || currentUser?.id !== actorId || currentTicket?.id !== ticketId) return;

  if (error) {

    $("commentList").innerHTML =
      `
        <p class="empty">
          Could not load replies:
          ${escapeHtml(error.message)}
        </p>
      `;

    return;
  }


  $("commentList").innerHTML =
    data.length

      ? data.map(c => {

        const role =
          c.author
            ? c.author.role
            : "student";

        const name =
          c.author
            ? c.author.full_name
            : "Unknown";


        return `

            <div
              data-comment-id="${c.id}" class="comment ${role !== "student"
            ? "staff"
            : ""
          }">

              <b>
                ${escapeHtml(name)}
              </b>

              ${role !== "student"
            ? '<span class="tag">Staff</span>'
            : ""
          }

              <small>
                ${new Date(
            c.created_at
          ).toLocaleString()}
              </small>

              <p>
                ${escapeHtml(
            c.message
          )}
              </p><div id="replyAttachments_${c.id}" class="screenshot-links"></div>

            </div>

          `;

      }).join("")

      : '<p class="empty">No replies yet.</p>';
  renderReplyScreenshots();

}


// ---------- SEND REPLY ----------

function syncReplyControls() {
  $("commentText").disabled = replySending;
  $("replyFiles").disabled = replySending;
  $("sendReplyBtn").disabled = replySending;
  $("sendReplyBtn").textContent = replySending ? "Sending…" : "Send Reply";
}
$("commentForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (replySending || !currentUser || !currentTicket || ["Resolved","Closed"].includes(currentTicket.status)) return;
  const message = $("commentText").value.trim();
  if (!message) return;
  const ticketId = currentTicket.id, actorId = currentUser.id;
  let screenshotFiles;
  try { screenshotFiles=await validateScreenshotFiles($("replyFiles").files); }catch(error){$("replyError").textContent=error.message;return;}
  if(replySending || currentUser?.id!==actorId || currentTicket?.id!==ticketId)return;
  replySending = true;
  $("replyError").textContent = "";
  syncReplyControls();
  try {
    const query=sb.from("ticket_comments").insert({ticket_id:ticketId, message});
    const {data:reply,error}=await (screenshotFiles.length?query.select("id"):query);
    if (error) throw error;
    if(screenshotFiles.length) await attachScreenshotFiles(ticketId,reply[0].id,screenshotFiles);
    if (currentUser?.id === actorId && currentTicket?.id === ticketId) {
      $("replyFiles").value="";
      $("replyFilesInfo").textContent="Up to 3 screenshots, 5 MB each. PNG, JPG, or WebP.";
      if ($("commentText").value.trim() === message) $("commentText").value = "";
      await loadComments(ticketId);
      await loadTicketExtras(ticketId);
    }
  } catch (error) {
    if (currentUser?.id === actorId && currentTicket?.id === ticketId) $("replyError").textContent = "Could not send reply. " + error.message;
  } finally { replySending = false; syncReplyControls(); }
});

// ---------- DELETE TICKET ----------

$("deleteTicket").addEventListener(
  "click",
  async () => {

    if (!currentTicket) return;


    if (
      !confirm(
        "Delete ticket #" +
        currentTicket.id +
        "? This cannot be undone."
      )
    ) {
      return;
    }


    const {
      data,
      error
    } = await sb
      .from("tickets")
      .delete()
      .eq(
        "id",
        currentTicket.id
      )
      .select();


    if (error) {

      alert(
        "Could not delete ticket: " +
        error.message
      );

      return;
    }


    if (
      !data ||
      data.length === 0
    ) {

      alert(
        "Not allowed: you can only delete your own tickets while they are still Open."
      );

      return;
    }


    currentTicket = null;


    await loadTickets();


    alert(
      "Ticket deleted."
    );


    showView("tickets");

  }
);


// ---------- ADMIN REPORTS ----------

function fmtDuration(ms) {

  if (
    ms == null ||
    isNaN(ms)
  ) {
    return "—";
  }


  const m =
    Math.round(
      ms / 60000
    );


  if (m < 1) {
    return "< 1m";
  }


  const d =
    Math.floor(
      m / 1440
    );


  const h =
    Math.floor(
      (m % 1440) / 60
    );


  const mm =
    m % 60;


  if (d) {
    return `${d}d ${h}h`;
  }


  if (h) {
    return `${h}h ${mm}m`;
  }


  return `${mm}m`;

}


function avgResolution(list) {

  const times =
    list
      .filter(
        t => t.resolved_at
      )
      .map(
        t =>
          new Date(t.resolved_at) -
          new Date(t.created_at)
      );


  return times.length
    ? times.reduce(
      (a, b) => a + b,
      0
    ) / times.length
    : null;

}


function renderReports() {
 renderScopeReports();
 const done=t=>["Resolved","Closed"].includes(t.status),active=t=>["Open","In Progress"].includes(t.status);
 $("repResolved").textContent=tickets.filter(done).length;
 $("repAvg").textContent=fmtDuration(avgResolution(tickets.filter(done)));
 $("repReopened").textContent=tickets.filter(t=>t.reopen_count>0).length;
 $("repUnassigned").textContent=tickets.filter(t=>active(t)&&!t.assigned_to).length;
 const groups=key=>{const result=new Map();for(const t of tickets){const k=key(t);result.set(k,[...(result.get(k)||[]),t]);}return [...result].sort((a,b)=>b[1].length-a[1].length);};
 $("repCategory").innerHTML=groups(t=>departmentLabel(t.department)).map(([label,list])=>{
  const waiting=list.filter(active).map(t=>Math.max(0,Date.now()-new Date(t.created_at))).filter(Number.isFinite);
  return '<tr><td>'+escapeHtml(label)+'</td><td>'+list.length+'</td><td>'+list.filter(active).length+'</td><td>'+fmtDuration(waiting.length?waiting.reduce((a,b)=>a+b,0)/waiting.length:null)+'</td><td>'+fmtDuration(avgResolution(list.filter(done)))+'</td></tr>';
 }).join('') || '<tr><td colspan="5" class="empty">No tickets yet.</td></tr>';
 $("repStaff").innerHTML=groups(t=>t.assignee_name || "Unassigned").map(([label,list])=>'<tr><td>'+escapeHtml(label)+'</td><td>'+list.length+'</td><td>'+list.filter(done).length+'</td><td>'+fmtDuration(avgResolution(list.filter(done)))+'</td></tr>').join('') || '<tr><td colspan="4" class="empty">No tickets yet.</td></tr>';
}

// ---------- ADMIN USERS ----------

let userDirectory = [];
async function loadUsers() {
  if (currentUser.role !== "admin") return;
  const {data, error} = await sb.from("profiles").select("id, full_name, email, role, department").order("created_at", {ascending:true});
  if (error) { alert("Could not load users: " + error.message); return; }
  userDirectory = data || [];
  renderUsers();
}
function renderUsers() {
  const role = $("userRoleFilter").value;
  const search = $("userSearch").value.trim().toLowerCase();
  const list = userDirectory.filter(u => (!role || u.role === role) && (!search || [u.full_name,u.email].join(" ").toLowerCase().includes(search)));
  $("userResultCount").textContent = list.length + (list.length === 1 ? " user" : " users");
  $("userTable").innerHTML = list.length ? list.map(u => '<tr data-profile="' + escapeHtml(u.id) + '"><td>' + escapeHtml(u.full_name) + '</td><td>' + escapeHtml(u.email || "—") + '</td><td>' + (u.role === "staff" ? '<select data-profile-role aria-label="Role for ' + escapeHtml(u.full_name) + '"><option value="staff">Staff</option><option value="admin">Admin</option></select>' : escapeHtml({student:"Student",admin:"Admin"}[u.role])) + '</td><td>' + (u.role === "staff" ? '<select aria-label="Department for ' + escapeHtml(u.full_name) + '" data-profile-department><option value="">Not assigned — no queue access</option>' + Object.entries(departments).filter(([id])=>id!=="review").map(([id,label])=>'<option value="' + id + '" ' + (u.department===id?'selected':'') + '>' + label + '</option>').join('') + '</select>' : (u.role === "admin" ? "All departments" : "—")) + '<small class="user-save-status field-hint" role="status" aria-live="polite"></small></td></tr>').join('') : '<tr><td colspan="4" class="empty">No users match your search or filter.</td></tr>';
}
$("userRoleFilter").addEventListener("change", renderUsers);
$("userSearch").addEventListener("input", renderUsers);
$("userTable").addEventListener("change", async e => {
  const select = e.target;
  if (!select.matches("[data-profile-role], [data-profile-department]") || currentUser.role !== "admin") return;
  const row = select.closest("tr");
  const user = userDirectory.find(u => u.id === row.dataset.profile && u.role === "staff");
  if (!user || row.dataset.saving === "true") return;
  const roleInput = row.querySelector("[data-profile-role]");
  const departmentInput = row.querySelector("[data-profile-department]");
  const status = row.querySelector(".user-save-status");
  const promote = select === roleInput && roleInput.value === "admin";
  if (select === roleInput && !promote) return;
  if (promote && !confirm("Promote " + user.full_name + " to admin? They will be able to manage staff and access all departments.")) { roleInput.value = "staff"; return; }
  const department = departmentInput.value || null;
  row.dataset.saving = "true";
  roleInput.disabled = true;
  departmentInput.disabled = true;
  status.textContent = "Saving…";
  try {
    if (promote) {
      const {error} = await sb.rpc("promote_staff_to_admin", {p_staff_id:user.id});
      if (error) throw error;
      await loadUsers();
    } else {
      const {data,error} = await sb.from("profiles").update({department}).eq("id", user.id).eq("role","staff").select();
      if (error || !data?.length) throw error || new Error("Update not allowed.");
      user.department = department;
      status.textContent = "Department saved";
    }
    await loadStaffList();
    await loadTickets();
  } catch (error) {
    roleInput.value = "staff";
    departmentInput.value = user.department || "";
    status.textContent = "Could not save. " + error.message;
  } finally {
    row.dataset.saving = "false";
    roleInput.disabled = false;
    departmentInput.disabled = false;
  }
});
function syncStaffDepartment() {
  const staff = $("staffRole").value === "staff";
  $("staffDepartmentField").classList.toggle("hidden", !staff);
  $("staffDepartment").disabled = !staff;
  $("staffDepartment").required = staff;
  if (!staff) $("staffDepartment").value = "";
}
$("staffRole").addEventListener("change", syncStaffDepartment);

// ---------- CREATE STAFF / ADMIN ----------

let staffCreating = false;
$("staffForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (staffCreating || currentUser.role !== "admin" || !$("staffForm").reportValidity()) return;
  staffCreating = true;
  const button = $("staffForm").querySelector('button[type="submit"]');
  button.disabled = true;
  $("staffError").textContent = "";
  try {
    const {data,error} = await sb.functions.invoke("create-staff-account", {body:{email:$("staffEmail").value.trim(),password:$("staffPass").value,full_name:$("staffName").value.trim(),role:$("staffRole").value,department:$("staffRole").value === "staff" ? $("staffDepartment").value : null}});
    if (error) {
      let message = error.message;
      if (error.context?.json) { try { message = (await error.context.json()).error || message; } catch {} }
      throw new Error(message);
    }
    if (!data?.id) throw new Error("Account setup did not complete.");
    e.target.reset();
    syncStaffDepartment();
    await loadUsers();
    await loadStaffList();
    alert("Account created. They can log in now.");
  } catch (error) { $("staffError").textContent = error.message; }
  finally { staffCreating = false; button.disabled = false; }
});

// ---------- PROFILE ----------

["profileName", "profileEmail"].forEach(id => $(id).addEventListener("input", () => {
  $("profileMessage").textContent = "";
}));

$("saveProfile").addEventListener("click", async () => {
  if (!currentUser || profileSaving) return;
  const name = $("profileName").value.trim(), email = $("profileEmail").value.trim();
  $("profileMessage").textContent = "";
  if (!name || name.length > 150 || !email || !$("profileEmail").reportValidity()) {
    $("profileMessage").textContent = "Enter a name (up to 150 characters) and a valid email address."; return;
  }
  const actorId = currentUser.id;
  profileSaving = true;
  ["saveProfile","profileName","profileEmail"].forEach(id=>$(id).disabled=true);
  $("saveProfile").textContent = "Saving…";
  let nameSaved = false;
  try {
    const {data,error} = await sb.from("profiles").update({full_name:name}).eq("id",actorId).select("full_name");
    if (error || !data?.length) throw error || new Error("Your profile could not be saved. Please sign in again.");
    nameSaved = true;
    if (currentUser?.id !== actorId) return;
    currentUser.full_name = name;
    $("userName").textContent = name;
    if (email.toLowerCase() !== (currentUser.email || "").toLowerCase()) {
      const {data:authData,error:authError} = await sb.auth.updateUser({email});
      if (authError) throw authError;
      if (currentUser?.id !== actorId) return;
      currentUser.email = authData.user.email;
      $("profileEmail").value = currentUser.email;
      $("profileMessage").textContent = currentUser.email.toLowerCase() === email.toLowerCase() ? "Profile saved." : "Name saved. Check your current and new email inboxes for the required confirmation links. Your login email changes after confirmation.";
    } else $("profileMessage").textContent = "Profile saved.";
  } catch (error) {
    if (currentUser?.id === actorId) $("profileMessage").textContent = (nameSaved ? "Name saved, but the email change failed. " : "Could not save profile. ") + error.message;
  } finally {
    profileSaving = false;
    ["saveProfile","profileName","profileEmail"].forEach(id=>$(id).disabled=false);
    $("saveProfile").textContent = "Save Profile";
  }
});

// Password recovery is handled by Supabase Auth.
function showAuthView(view) {
  ["loginView","registerView","forgotPasswordView","resetPasswordView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));
  $("app").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
}
function clearRecoveryLocation() {
  if (!window.location || !window.history) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("recovery");
  url.hash = "";
  window.history.replaceState(null,"",url.pathname + url.search);
}
sb.auth.onAuthStateChange?.((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    recoveryUserId = session?.user?.id || null;
    currentUser = null;
    showAuthView("resetPasswordView");
    $("saveNewPasswordBtn").disabled = !recoveryUserId;
    $("resetPasswordError").textContent = recoveryUserId ? "" : "This reset link is invalid or expired. Request a new link.";
  }
});
$("showForgotPassword").addEventListener("click",()=>{
  $("recoveryEmail").value=$("loginEmail").value.trim();
  $("recoveryMessage").textContent=""; $("recoveryError").textContent="";
  showAuthView("forgotPasswordView"); $("recoveryEmail").focus();
});
$("backFromRecovery").addEventListener("click",()=>{if(!recoverySending)showAuthView("loginView");});
$("forgotPasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(recoverySending || !$("forgotPasswordForm").reportValidity())return;
  $("recoveryMessage").textContent=""; $("recoveryError").textContent="";
  if(!window.location || !["https:","http:"].includes(window.location.protocol)) {
    $("recoveryError").textContent="Open the help desk through its website address to request a reset link."; return;
  }
  const redirect = new URL(window.location.href); redirect.hash="";redirect.search="";redirect.searchParams.set("recovery","1");
  recoverySending=true;$("sendRecoveryBtn").disabled=true;$("sendRecoveryBtn").textContent="Sending…";
  try {
    const {error}=await sb.auth.resetPasswordForEmail($("recoveryEmail").value.trim(),{redirectTo:redirect.href});
    if(error)throw error;
    $("recoveryMessage").textContent="If an account exists for that email, you’ll receive a reset link. Check your inbox and spam folder.";
  }catch(error){$("recoveryError").textContent="Could not request a reset link. "+error.message;}
  finally{recoverySending=false;$("sendRecoveryBtn").disabled=false;$("sendRecoveryBtn").textContent="Send reset link";}
});
$("resetPasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();if(passwordResetting)return;
  $("resetPasswordError").textContent="";
  if(!recoveryMode || !recoveryUserId){$("resetPasswordError").textContent="This reset link is invalid or expired. Request a new link.";return;}
  if(!$("resetPasswordForm").reportValidity())return;
  const password=$("resetPass").value;
  if(password.length<6){$("resetPasswordError").textContent="Use at least 6 characters.";return;}
  if(password!==$("resetConfirmPass").value){$("resetPasswordError").textContent="Passwords do not match.";return;}
  passwordResetting=true;["resetPass","resetConfirmPass","saveNewPasswordBtn","backFromReset"].forEach(id=>$(id).disabled=true);
  try {
    const {data:sessionData,error:sessionError}=await sb.auth.getSession();
    if(sessionError || sessionData.session?.user?.id!==recoveryUserId)throw new Error("Your reset session expired. Request a new reset link.");
    const {error}=await sb.auth.updateUser({password});if(error)throw error;
    await sb.auth.signOut({scope:"local"});
    recoveryMode=false;recoveryUserId=null;currentUser=null;clearRecoveryLocation();
    $("resetPasswordForm").reset();$("loginPass").value="";
    showAuthView("loginView");$("loginError").textContent="";$("loginMessage").textContent="Password updated. Sign in with your new password.";
  }catch(error){$("resetPasswordError").textContent="Could not update your password. "+error.message;}
  finally{passwordResetting=false;["resetPass","resetConfirmPass","saveNewPasswordBtn","backFromReset"].forEach(id=>$(id).disabled=false);}
});
$("backFromReset").addEventListener("click",async()=>{
  if(passwordResetting)return;await sb.auth.signOut({scope:"local"});recoveryMode=false;recoveryUserId=null;currentUser=null;clearRecoveryLocation();showAuthView("loginView");
});

// ---------- RESTORE LOGIN ----------

(async function init() {

  const {
    data
  } = await sb.auth.getSession();


  if (recoveryMode) {
    showAuthView("resetPasswordView");
    $("saveNewPasswordBtn").disabled = !recoveryUserId;
    if (!recoveryUserId) $("resetPasswordError").textContent = "This reset link is invalid or expired. Request a new link.";
    return;
  }
  if (
    data.session
  ) {

    await startFromUser(
      data.session.user
    );

  }

})();

// Guided ticket creation: broad area, concern, then contextual details.
const supportIssues = {
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
function selectedTicketIssue() {
  return (supportIssues[$("supportArea").value] || []).find(i => i[0] === $("issueType").value);
}
function resetIssueChoices() {
  const issues = supportIssues[$("supportArea").value] || [];
  const isOther = $("supportArea").value === "other";
  $("issueStep").classList.toggle("hidden", !issues.length || isOther);
  $("issueType").disabled = !issues.length;
  $("issueType").innerHTML = '<option value="" disabled selected hidden>Select a concern</option>' + issues.map(i => '<option>' + escapeHtml(i[0]) + '</option>').join('');
  if (isOther) $("issueType").value = issues[0][0];
  $("category").value = "";
  renderRequestFields();
}
function requestFieldDefinitions(area, concern) {
  const field = (id, label, required = false, options = null, type = "text") => ({id, label, required, options, type});
  switch (area) {
    case "account": return [field("schoolEmail", "School Microsoft account email", true, null, "email"), field("contactEmail", "Email where we can reach you", true, null, "email")];
    case "portals": return [field("portal", "Which website?", true, ["eLMS", "SIMS", "Other"]), field("page", "Which page or feature needs help?", true), field("error", "Error message (if shown)")];
    case "lab": {
      const fields = [field("room", "Computer lab or room number", true), field("pc", "Computer number or asset tag (if known)")];
      if (concern === "Application is not working or is missing") fields.push(field("application", "Application or software name", true));
      fields.push(field("error", "Error message (if shown)"));
      return fields;
    }
    case "records": return concern === "Request a school document" ? [field("document", "Which document do you need?", true), field("purpose", "What do you need it for?", true)] : [field("record", "Which record or enrollment step needs help?", true), field("term", "School year / term (if relevant)")];
    case "fees": return concern === "Payment is not showing in my account" ? [field("paymentDate", "Payment date", true, null, "date"), field("reference", "Payment reference number (if available)")] : [field("charge", "Which fee or balance are you asking about?", true), field("term", "School year / term (if relevant)")];
    default: return [];
  }
}
function renderRequestFields() {
  const issue = selectedTicketIssue();
  $("ticketDetailsStep").classList.toggle("hidden", !issue);
  $("ticketDetailsStep").disabled = !issue;
  activeRequestFields = issue ? requestFieldDefinitions($("supportArea").value, issue[0]) : [];
  $("selectedConcernTitle").textContent = issue ? ($("supportArea").value === "other" ? "Tell us about your concern" : issue[0]) : "Tell us more";
  $("category").value = issue ? issue[1] : "";
  $("requestFields").innerHTML = activeRequestFields.map(f => {
    const id = "request_" + f.id;
    const attrs = 'id="' + id + '" ' + (f.required ? 'required' : '');
    const input = f.options ? '<select ' + attrs + '><option value="" disabled selected hidden>Select an option</option>' + f.options.map(o => '<option>' + escapeHtml(o) + '</option>').join('') + '</select>' : '<input ' + attrs + ' type="' + f.type + '" maxlength="200">';
    return '<div class="field"><label for="' + id + '">' + escapeHtml(f.label) + (f.required ? ' <span aria-hidden="true">*</span>' : '') + '</label>' + input + '</div>';
  }).join('');
  if ($("request_contactEmail")) $("request_contactEmail").value = currentUser.email || "";
  $("ticketSubmitError").textContent = "";
  updateTicketSubmit();
}
function updateTicketSubmit() {
  $("supportArea").disabled = ticketSubmitting;
  $("issueType").disabled = ticketSubmitting || !$("supportArea").value || $("supportArea").value === "other";
  $("ticketDetailsStep").disabled = ticketSubmitting || !selectedTicketIssue();
  $("closeTicketDialog").disabled = ticketSubmitting;
  $("cancelTicketDialog").disabled = ticketSubmitting;
  const complete = selectedTicketIssue() && $("subject").value.trim() && $("description").value.trim() && $("ticketForm").checkValidity();
  $("submitTicketBtn").disabled = ticketSubmitting || !complete;
}
function openTicketDialog() {
  if (!currentUser || currentUser.role !== "student") return;
  ticketDialogTrigger = document.activeElement;
  $("ticketDialog").showModal();
  $("supportArea").focus();
}
function closeTicketDialog() {
  if (ticketSubmitting) return;
  const dirty = $("supportArea").value || $("subject").value.trim() || $("description").value.trim();
  if (dirty && !confirm("Discard this ticket draft?")) return;
  $("ticketForm").reset();
  resetIssueChoices();
  $("ticketDialog").close();
}
$("supportArea").addEventListener("change", resetIssueChoices);
$("issueType").addEventListener("change", renderRequestFields);
$("ticketForm").addEventListener("input", updateTicketSubmit);
$("ticketForm").addEventListener("change", updateTicketSubmit);
$("closeTicketDialog").addEventListener("click", closeTicketDialog);
$("cancelTicketDialog").addEventListener("click", closeTicketDialog);
$("ticketDialog").addEventListener("cancel", e => { e.preventDefault(); closeTicketDialog(); });
$("ticketDialog").addEventListener("close", () => { if (ticketDialogTrigger && ticketDialogTrigger.isConnected) ticketDialogTrigger.focus(); });
// Help articles use the same topics and concerns as ticket creation.
const faqTopics = {account: "Account access", portals: "eLMS & SIMS", lab: "Computer lab", records: "Student records & enrollment", fees: "Fees & payments"};
let campusFaqs = [];
let articlesLoaded = false;
let articleLoadError = "";
let articleLoadSequence = 0;
let selectedFaqTopic = "";
function renderFaqs() {
  const query = $("faqSearch").value.trim().toLowerCase();
  $("faqTopics").innerHTML = [["", "All topics"], ...Object.entries(faqTopics)].map(([id,label]) => '<button type="button" class="btn faq-topic' + (selectedFaqTopic === id ? ' selected' : '') + '" data-faq-topic="' + id + '" aria-pressed="' + (selectedFaqTopic === id) + '">' + escapeHtml(label) + '</button>').join('');
  const matches = campusFaqs.filter(f => f.status === "published" && (!selectedFaqTopic || f.topic === selectedFaqTopic) && [f.title, faqTopics[f.topic], f.concern, ...f.steps, f.when].join(' ').toLowerCase().includes(query));
  $("faqResultCount").textContent = matches.length + (matches.length === 1 ? " article" : " articles");
  $("homeFaqs").innerHTML = !articlesLoaded ? '<p class="empty">Loading help articles…</p>' : articleLoadError ? '<p class="empty">' + escapeHtml(articleLoadError) + '</p>' : matches.length ? matches.map(f => articleCard(f, true)).join('') : '<div class="card faq-no-results"><h3>No matching articles</h3><p>Try a different search or topic. You can also create a ticket below.</p><button type="button" class="btn" data-faq-reset>Clear search and filters</button></div>';
}
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
  if (!button || !currentUser || currentUser.role !== "student") return;
  const article = campusFaqs.find(f => f.id === button.dataset.faqTicket && f.status === "published");
  if (!article) return;
  const dirty = $("supportArea").value || $("subject").value.trim() || $("description").value.trim();
  if (dirty && !confirm("Replace the current ticket draft with a request about this article?")) return;
  $("ticketForm").reset();
  $("supportArea").value = article.topic;
  resetIssueChoices();
  $("issueType").value = article.concern || "";
  renderRequestFields();
  if (article.portal_hint && $("request_portal")) $("request_portal").value = article.portal_hint;
  updateTicketSubmit();
  openTicketDialog();
});

// Supabase stores article content and enforces admin-only editing.
function articleCard(f, studentLink = false) {
  const updated = new Date(f.updated_at).toLocaleDateString();
  return '<details class="card faq"><summary><span class="eyebrow">' + escapeHtml(faqTopics[f.topic] || "Other") + '</span><h3>' + escapeHtml(f.title) + '</h3></summary><div class="faq-body"><h4>What you can do</h4><ol>' + f.steps.map(s=>'<li>' + escapeHtml(s) + '</li>').join('') + '</ol><h4>When to contact support</h4><p>' + escapeHtml(f.when) + '</p>' + (f.source_url && /^https:\/\//.test(f.source_url) ? '<a class="faq-source" href="' + escapeHtml(f.source_url) + '" target="_blank" rel="noopener noreferrer">Official guidance ↗</a>' : '') + '<p class="field-hint">Updated ' + escapeHtml(updated) + (f.editor?.full_name ? ' by ' + escapeHtml(f.editor.full_name) : '') + '</p>' + (studentLink ? '<button type="button" class="btn blue faq-ticket" data-faq-ticket="' + escapeHtml(f.id) + '">Still need help? Create a ticket</button>' : '') + '</div></details>';
}
async function loadHelpArticles() {
  if (!currentUser) return;
  const actorId = currentUser.id;
  const sequence = ++articleLoadSequence;
  let query = sb.from("help_articles").select("*, editor:profiles!help_articles_updated_by_fkey(full_name)");
  if (currentUser.role !== "admin") query = query.eq("status", "published");
  let result;
  try { result = await query.order("updated_at", {ascending:false}); }
  catch(error) { result = {data:null,error}; }
  const {data,error} = result;
  if (!currentUser || currentUser.id !== actorId || sequence !== articleLoadSequence) return;
  campusFaqs = error ? [] : (data || []).map(f=>({...f,steps:f.steps || [],when:f.contact_guidance}));
  articlesLoaded = true;
  articleLoadError = error ? "Could not load help articles. Please try opening this page again." : "";
  renderFaqs();
  renderKnowledge();
}
function renderKnowledge() {
  const admin = currentUser?.role === "admin";
  $("knowledgeStatus").classList.toggle("hidden", !admin);
  $("newArticleBtn").classList.toggle("hidden", !admin);
  const query = $("knowledgeSearch").value.trim().toLowerCase();
  const topic = $("knowledgeTopic").value;
  const status = admin ? $("knowledgeStatus").value : "published";
  const list = campusFaqs.filter(f=>(admin || f.status==="published") && (!status || f.status===status) && (!topic || f.topic===topic) && (!query || [f.title,faqTopics[f.topic],...f.steps,f.when].join(' ').toLowerCase().includes(query)));
  $("knowledgeMessage").textContent = articleLoadError || list.length + (list.length===1 ? " article" : " articles");
  if (!articlesLoaded || articleLoadError) { $("knowledgeContent").innerHTML='<p class="empty">' + escapeHtml(articleLoadError || "Loading help articles…") + '</p>'; return; }
  if (!admin) { $("knowledgeContent").innerHTML=list.length ? '<div class="knowledge">'+list.map(f=>articleCard(f)).join('')+'</div>' : '<p class="empty">No published articles match your search.</p>'; return; }
  $("knowledgeContent").innerHTML='<div class="card table-wrap"><table><thead><tr><th>Title</th><th>Topic</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>'+ (list.length ? list.map(f=>'<tr><td>'+escapeHtml(f.title)+'</td><td>'+escapeHtml(faqTopics[f.topic] || "Other")+'</td><td><span class="article-status '+f.status+'">'+escapeHtml(f.status)+'</span></td><td>'+escapeHtml(new Date(f.updated_at).toLocaleString())+'<br><small>'+escapeHtml(f.editor?.full_name || "Initial content")+'</small></td><td><div class="actions"><button class="btn" data-article-edit="'+escapeHtml(f.id)+'">Edit</button>'+(f.status==='published'?'<button class="btn" data-article-state="draft" data-article-id="'+escapeHtml(f.id)+'">Unpublish</button>':f.status==='draft'?'<button class="btn blue" data-article-state="published" data-article-id="'+escapeHtml(f.id)+'">Publish</button>':'<button class="btn" data-article-state="draft" data-article-id="'+escapeHtml(f.id)+'">Restore draft</button>')+(f.status!=='archived'?'<button class="btn" data-article-state="archived" data-article-id="'+escapeHtml(f.id)+'">Archive</button>':'')+'</div></td></tr>').join('') : '<tr><td colspan="5" class="empty">No articles match your search.</td></tr>')+'</tbody></table></div>';
}
let editingArticle = null;
let articleSaving = false;
let articleInitialState = "";
let articleDialogTrigger = null;
function articleFormState() {
  return JSON.stringify(["articleTitle","articleTopic","articleConcern","articleSteps","articleContact","articleSource","articlePortal"].map(id=>$(id).value));
}
function syncArticleConcern() {
  const topic = $("articleTopic").value;
  $("articleConcern").innerHTML='<option value="">No specific concern</option>'+(supportIssues[topic] || []).map(i=>'<option>'+escapeHtml(i[0])+'</option>').join('');
  $("articlePortalField").classList.toggle("hidden",topic!=="portals");
  if (topic!=="portals") $("articlePortal").value="";
}
function openArticleEditor(id = null) {
  if (currentUser?.role!=="admin") return;
  editingArticle = id ? campusFaqs.find(f=>f.id===id) : null;
  if (id && !editingArticle) return;
  const f=editingArticle;
  $("articleForm").reset();
  $("articleTitle").value=f?.title || "";
  $("articleTopic").value=f?.topic || "";
  syncArticleConcern();
  $("articleConcern").value=f?.concern || "";
  $("articleSteps").value=f?.steps.join("\n") || "";
  $("articleContact").value=f?.when || "";
  $("articleSource").value=f?.source_url || "";
  $("articlePortal").value=f?.portal_hint || "";
  $("articleDialogTitle").textContent=f ? "Edit article" : "New article";
  $("articleEditorMeta").textContent=f ? "Status: "+f.status+" · Last updated "+new Date(f.updated_at).toLocaleString()+(f.editor?.full_name?" by "+f.editor.full_name:"") : "Save a private draft or publish it for students and staff.";
  $("articleError").textContent="";
  articleInitialState=articleFormState();
  articleDialogTrigger=document.activeElement;
  $("articleDialog").showModal();
  $("articleTitle").focus();
}
function closeArticleEditor() {
  if(articleSaving) return;
  if(articleInitialState!==articleFormState() && !confirm("Discard unsaved article changes?")) return;
  $("articleDialog").close();
}
function validateArticlePayload(payload) {
  if(!payload.title || !payload.topic) return "Enter a title and choose a topic.";
  if(payload.source_url && !/^https:\/\//.test(payload.source_url)) return "Use an https:// link for official guidance.";
  if(payload.status==="published" && (!payload.steps.length || !payload.contact_guidance)) return "Add at least one instruction and explain when to contact support before publishing.";
  return "";
}
$("articleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(articleSaving || currentUser?.role!=="admin" || !$("articleForm").reportValidity()) return;
  const payload={title:$("articleTitle").value.trim(),topic:$("articleTopic").value,concern:$("articleConcern").value || null,steps:$("articleSteps").value.split("\n").map(s=>s.trim()).filter(Boolean),contact_guidance:$("articleContact").value.trim(),source_url:$("articleSource").value.trim() || null,portal_hint:$("articleTopic").value==="portals"?$("articlePortal").value || null:null,status:e.submitter?.dataset.articleSave || "draft"};
  const validation=validateArticlePayload(payload);
  if(validation){$("articleError").textContent=validation;return;}
  articleSaving=true;
  $("articleError").textContent="";
  $("articleForm").querySelectorAll("button, input, select, textarea").forEach(b=>b.disabled=true);
  $("closeArticleDialog").disabled=true;
  try{
    let query=editingArticle?sb.from("help_articles").update(payload).eq("id",editingArticle.id).eq("revision",editingArticle.revision):sb.from("help_articles").insert(payload);
    const {data,error}=await query.select("id");
    if(error) throw error;
    if(!data?.length) { await loadHelpArticles(); throw new Error("This article changed since you opened it. Close and reopen it to load the latest version."); }
    $("articleDialog").close();
    await loadHelpArticles();
  }catch(error){$("articleError").textContent="Could not save article. "+error.message;}
  finally{articleSaving=false;$("articleForm").querySelectorAll("button, input, select, textarea").forEach(b=>b.disabled=false);$("closeArticleDialog").disabled=false;}
});
$("knowledgeContent").addEventListener("click",async e=>{
  if(currentUser?.role!=="admin") return;
  const edit=e.target.closest("[data-article-edit]");
  if(edit){openArticleEditor(edit.dataset.articleEdit);return;}
  const button=e.target.closest("[data-article-state]");
  if(!button) return;
  const f=campusFaqs.find(f=>f.id===button.dataset.articleId);
  if(!f) return;
  const status=button.dataset.articleState;
  const validation=validateArticlePayload({...f,contact_guidance:f.when,status});
  if(validation){$("knowledgeMessage").textContent=validation;return;}
  if(["archived","draft"].includes(status) && f.status!=="archived" && !confirm((status==="archived"?"Archive":"Unpublish")+' "'+f.title+'"? It will no longer appear for students or staff.')) return;
  button.disabled=true;
  try{
    const {data,error}=await sb.from("help_articles").update({status}).eq("id",f.id).eq("revision",f.revision).select("id");
    if(error || !data?.length) throw error || new Error("This article changed. Reload the page before trying again.");
    await loadHelpArticles();
  }catch(error){$("knowledgeMessage").textContent="Could not update article. "+error.message;button.disabled=false;}
});
const articleTopics={...faqTopics,other:"Other / Not sure"};
$("articleTopic").innerHTML='<option value="" disabled selected>Select a topic</option>'+Object.entries(articleTopics).map(([id,label])=>'<option value="'+id+'">'+escapeHtml(label)+'</option>').join('');
$("knowledgeTopic").innerHTML='<option value="">All topics</option>'+Object.entries(articleTopics).map(([id,label])=>'<option value="'+id+'">'+escapeHtml(label)+'</option>').join('');
$("knowledgeSearch").addEventListener("input",renderKnowledge);
$("knowledgeTopic").addEventListener("change",renderKnowledge);
$("knowledgeStatus").addEventListener("change",renderKnowledge);
$("newArticleBtn").addEventListener("click",()=>openArticleEditor());
$("articleTopic").addEventListener("change",syncArticleConcern);
$("closeArticleDialog").addEventListener("click",closeArticleEditor);
$("cancelArticleDialog").addEventListener("click",closeArticleEditor);
$("articleDialog").addEventListener("cancel",e=>{e.preventDefault();closeArticleEditor();});
$("articleDialog").addEventListener("close",()=>{if(articleDialogTrigger?.isConnected)articleDialogTrigger.focus();});

// Password visibility and live registration confirmation.
const passwordEye = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const passwordEyeOff = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.2 6.2C3.5 8.2 2 12 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function setPasswordVisible(id, visible) {
  $(id).type = visible ? "text" : "password";
  const button = $(id + "Toggle");
  button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  button.setAttribute("aria-pressed", String(visible));
  button.innerHTML = visible ? passwordEyeOff : passwordEye;
}
["loginPass", "regPass", "regConfirmPass", "resetPass", "resetConfirmPass"].forEach(id => {
  $(id + "Toggle").addEventListener("click", () => setPasswordVisible(id, $(id).type === "password"));
});
function updatePasswordMatch() {
  const password = $("regPass").value, confirmation = $("regConfirmPass").value;
  const filled = !!confirmation;
  const matches = filled && !!password && password === confirmation;
  $("passwordMatch").textContent = filled ? (matches ? "✓ Passwords match" : "Passwords do not match") : "";
  [$("passwordMatch"), $("regConfirmPass")].forEach(el => {
    el.classList.toggle("match", matches);
    el.classList.toggle("mismatch", filled && !matches);
  });
  $("registerError").textContent = "";
}
["regPass", "regConfirmPass"].forEach(id => $(id).addEventListener("input", updatePasswordMatch));
$("registerForm").addEventListener("reset", () => {
  $("passwordMatch").textContent = "";
  [$("passwordMatch"), $("regConfirmPass")].forEach(el => { el.classList.remove("match"); el.classList.remove("mismatch"); });
  ["regPass", "regConfirmPass"].forEach(id => setPasswordVisible(id, false));
});
$("showLogin").addEventListener("click", () => ["regPass", "regConfirmPass"].forEach(id => setPasswordVisible(id, false)));
$("showRegister").addEventListener("click", () => setPasswordVisible("loginPass", false));

["resetPass","resetConfirmPass"].forEach(id=>$(id).addEventListener("input",()=>{
 const filled=!!$("resetConfirmPass").value,match=filled && $("resetPass").value===$("resetConfirmPass").value;
 $("resetPasswordMatch").textContent=filled?(match?"✓ Passwords match":"Passwords do not match"):"";
 $("resetPasswordMatch").classList.toggle("match",match);$("resetPasswordMatch").classList.toggle("mismatch",filled&&!match);
}));
$("resetPasswordForm").addEventListener("reset",()=>{
 $("resetPasswordMatch").textContent="";["resetPass","resetConfirmPass"].forEach(id=>setPasswordVisible(id,false));
});

// Private screenshots and immutable activity timeline.
let pendingScreenshotUpload=null;
let ticketScreenshotLinks=[];
let extrasLoadSequence=0;
async function validateScreenshotFiles(fileList) {
 const files=Array.from(fileList || []);
 if(files.length && pendingScreenshotUpload)throw new Error("Retry or dismiss your pending screenshots before attaching more files.");
 if(files.length>3)throw new Error("Choose up to 3 screenshots.");
 for(const file of files){
  if(file.size>5*1024*1024 || !file.size)throw new Error("Each screenshot must be between 1 byte and 5 MB.");
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Use PNG, JPG, or WebP screenshots.");
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const png=bytes.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const jpg=bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp=bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!(file.type==="image/png"?png:file.type==="image/jpeg"?jpg:webp))throw new Error("A selected file is not a valid PNG, JPG, or WebP screenshot.");
 }
 return files;
}
async function attachScreenshotFiles(ticketId,commentId,files) {
 const actorId=currentUser?.id;
 if(!actorId)return;
 const failed=[];
 for(const file of files){
  const extension={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"}[file.type];
  const storagePath=ticketId+"/"+actorId+"/"+crypto.randomUUID()+"."+extension;
  let uploaded=false;
  try{
   if(currentUser?.id!==actorId)throw new Error("Your session changed.");
   const {error}=await sb.storage.from("ticket-screenshots").upload(storagePath,file,{contentType:file.type,upsert:false});
   if(error)throw error;uploaded=true;
   const {error:linkError}=await sb.from("ticket_attachments").insert({ticket_id:ticketId,comment_id:commentId,storage_path:storagePath,file_name:file.name.slice(0,200)});
   if(linkError)throw linkError;
  }catch(error){
   failed.push(file);
   if(uploaded)await sb.storage.from("ticket-screenshots").remove([storagePath]).catch(()=>{});
  }
 }
 if(failed.length && currentUser?.id===actorId){
  pendingScreenshotUpload={ticketId,commentId,actorId,files:failed};
  alert("Your "+(commentId?"reply":"ticket")+" was saved, but "+failed.length+" screenshot(s) could not upload. Open the ticket and use Retry screenshots. Your request will not be submitted again.");
 }else if(pendingScreenshotUpload?.ticketId===ticketId && pendingScreenshotUpload?.commentId===commentId)pendingScreenshotUpload=null;
 renderScreenshotRetry();
}
function renderScreenshotRetry(){
 const pending=pendingScreenshotUpload?.actorId===currentUser?.id && pendingScreenshotUpload?.ticketId===currentTicket?.id;
 $("attachmentRetryActions").classList.toggle("hidden",!pending);
 $("attachmentUploadNotice").textContent=pending?"Your request is saved. "+pendingScreenshotUpload.files.length+" screenshot(s) still need to upload.":"";
}
$("retryAttachments").addEventListener("click",async()=>{
 const pending=pendingScreenshotUpload;if(!pending || pending.actorId!==currentUser?.id || pending.ticketId!==currentTicket?.id)return;
 $("retryAttachments").disabled=true;
 try{await attachScreenshotFiles(pending.ticketId,pending.commentId,pending.files);await loadTicketExtras(pending.ticketId);}
 finally{$("retryAttachments").disabled=false;}
});
$("dismissAttachmentRetry").addEventListener("click",()=>{pendingScreenshotUpload=null;renderScreenshotRetry();});
["ticketFiles","replyFiles"].forEach(id=>$(id).addEventListener("change",()=>{
 const files=Array.from($(id).files || []);
 $(id+"Info").textContent=files.length?files.map(f=>f.name).join(", "):"Up to 3 screenshots, 5 MB each. PNG, JPG, or WebP.";
}));
function renderReplyScreenshots(){
 const groups=new Map();
 for(const attachment of ticketScreenshotLinks){if(!attachment.comment_id)continue;groups.set(attachment.comment_id,(groups.get(attachment.comment_id)||"")+attachment.html);}
 for(const [commentId,html] of groups){const el=$("replyAttachments_"+commentId);if(el)el.innerHTML=html;}
}
function activityText(event){
 const d=event.details || {};
 return {created:"Request created"+(d.before_tracking?" (before activity tracking)":""),assigned:"Assignment: "+d.from+" → "+d.to,transferred:"Transferred: "+departmentLabel(d.from)+" → "+departmentLabel(d.to),resolved:"Marked resolved",confirmed:"Student confirmed the solution and closed the request",reopened:"Student reopened the request",status_changed:"Status: "+d.from+" → "+d.to}[event.event_type] || "Ticket updated";
}
async function loadTicketExtras(ticketId){
 if(!currentUser || currentTicket?.id!==ticketId)return;
 const actorId=currentUser.id,seq=++extrasLoadSequence;
 renderScreenshotRetry();
 try{
  const [attachments,activity]=await Promise.all([
   sb.from("ticket_attachments").select("*").eq("ticket_id",ticketId).order("created_at"),
   sb.from("ticket_activity").select("*").eq("ticket_id",ticketId).order("created_at").order("id")
  ]);
  const links=await Promise.all((attachments.data || []).map(async a=>{
   const {data,error}=await sb.storage.from("ticket-screenshots").createSignedUrl(a.storage_path,120);
   return {...a,html:error || !data?.signedUrl || !data.signedUrl.startsWith("https://")?'<p class="field-hint">'+escapeHtml(a.file_name)+' — could not load. Reopen this ticket to retry.</p>':'<a class="screenshot-link" href="'+escapeHtml(data.signedUrl)+'" target="_blank" rel="noopener noreferrer">▧ '+escapeHtml(a.file_name)+'</a>'};
  }));
  if(currentUser?.id!==actorId || currentTicket?.id!==ticketId || seq!==extrasLoadSequence)return;
  ticketScreenshotLinks=links;
  $("ticketAttachments").innerHTML=attachments.error?'<p class="empty">Could not load screenshots.</p>':links.filter(a=>!a.comment_id).map(a=>a.html).join('') || '<p class="empty">No screenshots attached to the original request.</p>';
  renderReplyScreenshots();
  $("ticketActivity").innerHTML=activity.error?'<p class="empty">Could not load activity.</p>':(activity.data || []).map(e=>'<div class="activity-item"><strong>'+escapeHtml(activityText(e))+'</strong><small>'+escapeHtml(e.actor_name)+' · '+escapeHtml(new Date(e.created_at).toLocaleString())+'</small></div>').join('') || '<p class="empty">No activity recorded.</p>';
 }catch(error){if(currentUser?.id===actorId && currentTicket?.id===ticketId && seq===extrasLoadSequence){$("ticketActivity").innerHTML='<p class="empty">Could not load ticket activity. Try reopening this ticket.</p>';$("ticketAttachments").innerHTML='<p class="empty">Could not load screenshots.</p>';}}
}
function renderScopeReports(){
 const active=tickets.filter(t=>["Open","In Progress"].includes(t.status));
 const waits=active.map(t=>Math.max(0,Date.now()-new Date(t.created_at))).filter(Number.isFinite);
 $("repWaiting").textContent=fmtDuration(waits.length?waits.reduce((a,b)=>a+b,0)/waits.length:null);
 $("repOldest").textContent=fmtDuration(waits.length?Math.max(...waits):null);
 const grouped=key=>{const groups=new Map();for(const t of tickets){const k=key(t);groups.set(k,[...(groups.get(k)||[]),t]);}return [...groups].sort((a,b)=>b[1].length-a[1].length);};
 const rows=(groups,withResolution)=>groups.map(([label,list])=>'<tr><td>'+escapeHtml(label)+'</td><td>'+list.length+'</td><td>'+list.filter(t=>["Open","In Progress"].includes(t.status)).length+'</td>'+(withResolution?'<td>'+fmtDuration(avgResolution(list))+'</td>':'')+'</tr>').join('') || '<tr><td colspan="'+(withResolution?4:3)+'" class="empty">No tickets yet.</td></tr>';
 $("repArea").innerHTML=rows(grouped(t=>faqTopics[t.support_area] || (t.support_area==="other"?"Other / Not sure":"Older request — area not recorded")),true);
 $("repConcern").innerHTML=rows(grouped(t=>t.concern || "Older request — concern not recorded"),false);
}
// In-app notifications refresh while the page is visible.
let notifications=[];
let notificationLoadSequence=0;
let automaticRefreshBusy=false;
const notificationLabels={new_ticket:"New request",reply:"New reply",transferred:"Request transferred",assigned:"Assignment changed",status_changed:"Status changed",reopened:"Request reopened"};
function renderNotifications(){
 const unread=notifications.filter(n=>!n.is_read).length;
 $("notificationCount").textContent=String(unread);$("notificationCount").classList.toggle("hidden",!unread);
 $("notificationBtn").setAttribute?.("aria-label","Notifications, "+unread+" unread");
 $("notificationList").innerHTML=notifications.length?notifications.slice(0,50).map(n=>'<button class="notification-item '+(!n.is_read?'unread':'')+'" type="button" data-notification-ticket="'+n.ticket_id+'">'+escapeHtml(notificationLabels[n.event_type] || "Ticket updated")+' · #'+n.ticket_id+'<small>'+escapeHtml(new Date(n.created_at).toLocaleString())+'</small></button>').join(''):'<p class="empty">No notifications yet.</p>';
}
async function loadNotifications(){
 if(!currentUser)return;
 const actorId=currentUser.id,seq=++notificationLoadSequence;
 try{
  const {data,error}=await sb.from("ticket_notifications").select("*").eq("recipient_id",actorId).order("created_at",{ascending:false});
  if(currentUser?.id!==actorId || seq!==notificationLoadSequence)return;
  $("notificationError").textContent=error?"Could not refresh notifications. We’ll try again automatically.":"";
  if(!error){notifications=data || [];renderNotifications();}
 }catch(error){if(currentUser?.id===actorId)$("notificationError").textContent="Could not refresh notifications. We’ll try again automatically.";}
}
async function markTicketNotificationsRead(ticketId){
 if(!currentUser)return;
 try{const {error}=await sb.from("ticket_notifications").update({is_read:true}).eq("recipient_id",currentUser.id).eq("ticket_id",ticketId);if(!error)await loadNotifications();}
 catch(error){$("notificationError").textContent="Could not mark this request's notifications as read.";}
}
$("notificationBtn").addEventListener("click",()=>{
 const open=$("notificationPanel").classList.contains("hidden");$("notificationPanel").classList.toggle("hidden",!open);$("notificationBtn").setAttribute("aria-expanded",String(open));if(open)loadNotifications();
});
$("notificationList").addEventListener("click",async e=>{
 const button=e.target.closest("[data-notification-ticket]");if(!button || !currentUser)return;
 await loadTickets();const ticket=tickets.find(t=>String(t.id)===button.dataset.notificationTicket);
 if(ticket){openTicketDetails(ticket);$("notificationPanel").classList.add("hidden");$("notificationBtn").setAttribute("aria-expanded","false");}
 else $("notificationError").textContent="This request is no longer available to your account.";
});
$("markNotificationsRead").addEventListener("click",async()=>{
 if(!currentUser)return;$("markNotificationsRead").disabled=true;
 try{const {error}=await sb.from("ticket_notifications").update({is_read:true}).eq("recipient_id",currentUser.id);if(error)throw error;await loadNotifications();}
 catch(error){$("notificationError").textContent="Could not mark notifications as read. Try again.";}
 finally{$("markNotificationsRead").disabled=false;}
});
async function refreshSupportUpdates(){
 if(!currentUser || document.hidden || automaticRefreshBusy)return;
 automaticRefreshBusy=true;
 try{
  await Promise.all([loadTickets(true),loadNotifications()]);
  if(currentTicket && $("ticketDetail").classList.contains("active")){
   const ticketId=currentTicket.id,fresh=tickets.find(t=>t.id===ticketId);
   if(!fresh){currentTicket=null;ticketScreenshotLinks=[];showView("tickets");return;}
   currentTicket=fresh;
   renderTicketSummary(fresh);
   if($("detailDepartmentLabel"))$("detailDepartmentLabel").textContent=departmentLabel(fresh.department);
   if($("detailAssigneeLabel"))$("detailAssigneeLabel").textContent=fresh.assignee_name || "Unassigned";
   const managementFocused=$("updateCard").contains?.(document.activeElement);
   if(!managementFocused && canManageTicket(fresh)){ $("detailStatus").value=fresh.status; $("detailDepartment").value=fresh.department; renderAssigneeOptions(); $("detailAssignee").value=fresh.assigned_to || ""; $("detailResolution").value=fresh.resolution_note || ""; }
   const historical=["Resolved","Closed"].includes(fresh.status);
   $("commentForm").classList.toggle("hidden",historical);$("historyReadOnlyNotice").classList.toggle("hidden",!historical);$("updateCard").classList.toggle("hidden",!canManageTicket(fresh));
   $("resolveCard").classList.toggle("hidden",!(currentUser.role==="student" && fresh.status==="Resolved"));
   await Promise.all([loadComments(ticketId),loadTicketExtras(ticketId)]);
  }
 }catch(error){console.error("Automatic support refresh failed",error);}
 finally{automaticRefreshBusy=false;}
}
if(typeof setInterval==="function")setInterval(refreshSupportUpdates,20000);
document.addEventListener?.("visibilitychange",()=>{if(!document.hidden)refreshSupportUpdates();});

function renderTicketSummary(t) {
  $("detailContent").innerHTML = `

    <h3>
      #${t.id} —
      ${escapeHtml(t.subject)}
    </h3>


    <div class="info-row">
      <span>Requester</span>
      <b>
        ${escapeHtml(
    requesterName(t)
  )}
      </b>
    </div>


    <div class="info-row">
      <span>Concern</span>
      <b>
        ${escapeHtml(t.concern || t.category)}
      </b>
    </div>


    <div class="info-row"><span>Department</span><b id="detailDepartmentLabel">${escapeHtml(departmentLabel(t.department))}</b></div>
    <div class="info-row">
      <span>Status</span>
      <b>
        ${badge(t.status)}
      </b>
    </div>


    <div class="info-row">
      <span>Assigned To</span>
      <b id="detailAssigneeLabel">
        ${escapeHtml(
    t.assignee_name ||
    "Unassigned"
  )}
      </b>
    </div>


    ${t.reopen_count
      ? `
          <div class="info-row">
            <span>Reopened</span>
            <b>
              ${t.reopen_count} time(s)
            </b>
          </div>
        `
      : ""
    }


    <div
      style="
        padding-top:18px;
        white-space:pre-wrap;
        line-height:1.6;
        font-size:14px
      ">

      <b>Problem description</b>

      <p
        style="
          margin-top:7px;
          color:var(--muted)
        ">

        ${escapeHtml(
      t.description
    )}

      </p>

    </div>


    ${t.resolution_note
      ? `
          <div
            style="
              padding-top:14px;
              line-height:1.6;
              font-size:14px
            ">

            <b>Resolution</b>

            <p
              style="
                margin-top:7px;
                color:var(--muted)
              ">

              ${escapeHtml(
        t.resolution_note
      )}

            </p>

          </div>
        `
      : ""
    }

  `;

}
