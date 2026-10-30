import { sb } from "../core/client.js";
import { departments } from "../core/permissions.js";
import { state } from "../core/state.js";
import { loadTickets } from "./tickets/api.js";
import { loadStaffList } from "./tickets/details.js";
import { confirmAction, showNotice } from "../ui/dialogs.js";
import { $, escapeHtml } from "../ui/helpers.js";
let userDirectory = [];
export async function loadUsers() {
  if (state.currentUser.role !== "admin") return;
  const {
    data,
    error
  } = await sb.from("profiles").select("id, full_name, email, role, department").order("created_at", {
    ascending: true
  });
  if (error) {
    showNotice("Could not load users: " + error.message);
    return;
  }
  userDirectory = data || [];
  renderUsers();
}
export function renderUsers() {
  const role = $("userRoleFilter").value;
  const search = $("userSearch").value.trim().toLowerCase();
  const list = userDirectory.filter(u => (!role || u.role === role) && (!search || [u.full_name, u.email].join(" ").toLowerCase().includes(search)));
  $("userResultCount").textContent = list.length + (list.length === 1 ? " user" : " users");
  $("userTable").innerHTML = list.length ? list.map(u => '<tr data-profile="' + escapeHtml(u.id) + '"><td>' + escapeHtml(u.full_name) + '</td><td>' + escapeHtml(u.email || "—") + '</td><td>' + (u.role === "staff" ? '<select data-profile-role aria-label="Role for ' + escapeHtml(u.full_name) + '"><option value="staff">Staff</option><option value="admin">Admin</option></select>' : escapeHtml({
    student: "Student",
    admin: "Admin"
  }[u.role])) + '</td><td>' + (u.role === "staff" ? '<select aria-label="Department for ' + escapeHtml(u.full_name) + '" data-profile-department><option value="">Not assigned — no queue access</option>' + Object.entries(departments).filter(([id]) => id !== "review").map(([id, label]) => '<option value="' + id + '" ' + (u.department === id ? 'selected' : '') + '>' + label + '</option>').join('') + '</select>' : u.role === "admin" ? "All departments" : "—") + '<small class="user-save-status field-hint" role="status" aria-live="polite"></small></td></tr>').join('') : '<tr><td colspan="4" class="empty">No users match your search or filter.</td></tr>';
}
export function syncStaffDepartment() {
  const staff = $("staffRole").value === "staff";
  $("staffDepartmentField").classList.toggle("hidden", !staff);
  $("staffDepartment").disabled = !staff;
  $("staffDepartment").required = staff;
  if (!staff) $("staffDepartment").value = "";
}
let staffCreating = false;
export function initUsers() {
  $("userRoleFilter").addEventListener("change", renderUsers);
  $("userSearch").addEventListener("input", renderUsers);
  $("userTable").addEventListener("change", async e => {
    const select = e.target;
    if (!select.matches("[data-profile-role], [data-profile-department]") || state.currentUser.role !== "admin") return;
    const row = select.closest("tr");
    const user = userDirectory.find(u => u.id === row.dataset.profile && u.role === "staff");
    if (!user || row.dataset.saving === "true") return;
    const roleInput = row.querySelector("[data-profile-role]");
    const departmentInput = row.querySelector("[data-profile-department]");
    const status = row.querySelector(".user-save-status");
    const promote = select === roleInput && roleInput.value === "admin";
    if (select === roleInput && !promote) return;
    if (promote && !confirmAction("Promote " + user.full_name + " to admin? They will be able to manage staff and access all departments.")) {
      roleInput.value = "staff";
      return;
    }
    const department = departmentInput.value || null;
    row.dataset.saving = "true";
    roleInput.disabled = true;
    departmentInput.disabled = true;
    status.textContent = "Saving…";
    try {
      if (promote) {
        const {
          error
        } = await sb.rpc("promote_staff_to_admin", {
          p_staff_id: user.id
        });
        if (error) throw error;
        await loadUsers();
      } else {
        const {
          data,
          error
        } = await sb.from("profiles").update({
          department
        }).eq("id", user.id).eq("role", "staff").select();
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
  $("staffRole").addEventListener("change", syncStaffDepartment);
  $("staffForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (staffCreating || state.currentUser.role !== "admin" || !$("staffForm").reportValidity()) return;
    staffCreating = true;
    const button = $("staffForm").querySelector('button[type="submit"]');
    button.disabled = true;
    $("staffError").textContent = "";
    try {
      const {
        data,
        error
      } = await sb.functions.invoke("create-staff-account", {
        body: {
          email: $("staffEmail").value.trim(),
          password: $("staffPass").value,
          full_name: $("staffName").value.trim(),
          role: $("staffRole").value,
          department: $("staffRole").value === "staff" ? $("staffDepartment").value : null
        }
      });
      if (error) {
        let message = error.message;
        if (error.context?.json) {
          try {
            message = (await error.context.json()).error || message;
          } catch {}
        }
        throw new Error(message);
      }
      if (!data?.id) throw new Error("Account setup did not complete.");
      e.target.reset();
      syncStaffDepartment();
      await loadUsers();
      await loadStaffList();
      showNotice("Account created. They can log in now.");
    } catch (error) {
      $("staffError").textContent = error.message;
    } finally {
      staffCreating = false;
      button.disabled = false;
    }
  });
}
