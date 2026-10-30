import { sb } from "../core/client.js";
import { state } from "../core/state.js";
import { $ } from "../ui/helpers.js";
export function initProfile() {
  ["profileName", "profileEmail"].forEach(id => $(id).addEventListener("input", () => {
    $("profileMessage").textContent = "";
  }));
  $("saveProfile").addEventListener("click", async () => {
    if (!state.currentUser || state.profileSaving) return;
    const name = $("profileName").value.trim(),
      email = $("profileEmail").value.trim();
    $("profileMessage").textContent = "";
    if (!name || name.length > 150 || !email || !$("profileEmail").reportValidity()) {
      $("profileMessage").textContent = "Enter a name (up to 150 characters) and a valid email address.";
      return;
    }
    const actorId = state.currentUser.id;
    state.profileSaving = true;
    ["saveProfile", "profileName", "profileEmail"].forEach(id => $(id).disabled = true);
    $("saveProfile").textContent = "Saving…";
    let nameSaved = false;
    try {
      const {
        data,
        error
      } = await sb.from("profiles").update({
        full_name: name
      }).eq("id", actorId).select("full_name");
      if (error || !data?.length) throw error || new Error("Your profile could not be saved. Please sign in again.");
      nameSaved = true;
      if (state.currentUser?.id !== actorId) return;
      state.currentUser.full_name = name;
      $("userName").textContent = name;
      if (email.toLowerCase() !== (state.currentUser.email || "").toLowerCase()) {
        const {
          data: authData,
          error: authError
        } = await sb.auth.updateUser({
          email
        });
        if (authError) throw authError;
        if (state.currentUser?.id !== actorId) return;
        state.currentUser.email = authData.user.email;
        $("profileEmail").value = state.currentUser.email;
        $("profileMessage").textContent = state.currentUser.email.toLowerCase() === email.toLowerCase() ? "Profile saved." : "Name saved. Check your current and new email inboxes for the required confirmation links. Your login email changes after confirmation.";
      } else $("profileMessage").textContent = "Profile saved.";
    } catch (error) {
      if (state.currentUser?.id === actorId) $("profileMessage").textContent = (nameSaved ? "Name saved, but the email change failed. " : "Could not save profile. ") + error.message;
    } finally {
      state.profileSaving = false;
      ["saveProfile", "profileName", "profileEmail"].forEach(id => $(id).disabled = false);
      $("saveProfile").textContent = "Save Profile";
    }
  });

  // Password recovery is handled by Supabase Auth.
}
