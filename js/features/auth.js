import { sb } from "../core/client.js";
import { startFromUser } from "../core/session.js";
import { state } from "../core/state.js";
import { renderNotifications } from "./notifications.js";
import { showNotice } from "../ui/dialogs.js";
import { $ } from "../ui/helpers.js";
// Password recovery is handled by Supabase Auth.
export function showAuthView(view) {
  ["loginView", "registerView", "forgotPasswordView", "resetPasswordView"].forEach(id => $(id).classList.toggle("hidden", id !== view));
  $("app").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
}
export function clearRecoveryLocation() {
  if (!window.location || !window.history) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("recovery");
  url.hash = "";
  window.history.replaceState(null, "", url.pathname + url.search);
}
export async function restoreSession() {
  const {
    data
  } = await sb.auth.getSession();
  if (state.recoveryMode) {
    showAuthView("resetPasswordView");
    $("saveNewPasswordBtn").disabled = !state.recoveryUserId;
    if (!state.recoveryUserId) $("resetPasswordError").textContent = "This reset link is invalid or expired. Request a new link.";
    return;
  }
  if (data.session) {
    await startFromUser(data.session.user);
  }
}
// Password visibility and live registration confirmation.
export const passwordEye = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
export const passwordEyeOff = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.2 6.2C3.5 8.2 2 12 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
export function setPasswordVisible(id, visible) {
  $(id).type = visible ? "text" : "password";
  const button = $(id + "Toggle");
  button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  button.setAttribute("aria-pressed", String(visible));
  button.innerHTML = visible ? passwordEyeOff : passwordEye;
}
export function updatePasswordMatch() {
  const password = $("regPass").value,
    confirmation = $("regConfirmPass").value;
  const filled = !!confirmation;
  const matches = filled && !!password && password === confirmation;
  $("passwordMatch").textContent = filled ? matches ? "✓ Passwords match" : "Passwords do not match" : "";
  [$("passwordMatch"), $("regConfirmPass")].forEach(el => {
    el.classList.toggle("match", matches);
    el.classList.toggle("mismatch", filled && !matches);
  });
  $("registerError").textContent = "";
}
export function initAuth() {
  $("showRegister").addEventListener("click", () => {
    $("loginView").classList.add("hidden");
    $("registerView").classList.remove("hidden");
  });
  $("showLogin").addEventListener("click", () => {
    $("registerView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
  });
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("loginError").textContent = "";
    $("loginMessage").textContent = "";
    const {
      data,
      error
    } = await sb.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPass").value
    });
    if (error) {
      $("loginError").textContent = error.message;
      return;
    }
    await startFromUser(data.user);
  });
  $("registerForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("registerError").textContent = "";
    if ($("regPass").value !== $("regConfirmPass").value) {
      $("registerError").textContent = "Passwords do not match. Please enter the same password in both fields.";
      $("regConfirmPass").focus();
      return;
    }
    const email = $("regEmail").value.trim();
    const {
      data,
      error
    } = await sb.auth.signUp({
      email,
      password: $("regPass").value,
      options: {
        data: {
          full_name: $("regName").value.trim()
        }
      }
    });
    if (error) {
      $("registerError").textContent = error.message;
      return;
    }
    e.target.reset();
    $("loginEmail").value = email;
    $("registerView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    if (data.session) {
      await sb.auth.signOut();
      showNotice("Account created! You can log in now.");
    } else {
      showNotice('Account created! Check your email to confirm it, then log in. (To skip this, turn off "Confirm email" in Supabase Authentication settings.)');
    }
  });
  $("logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    state.currentUser = null;
    state.pendingScreenshotUpload = null;
    state.notifications = [];
    renderNotifications();
    state.campusFaqs = [];
    state.articlesLoaded = false;
    state.editingArticle = null;
    state.tickets = [];
    state.currentTicket = null;
    $("app").classList.add("hidden");
    $("loginPage").classList.remove("hidden");
    $("loginPass").value = "";
  });
  sb.auth.onAuthStateChange?.((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      state.recoveryMode = true;
      state.recoveryUserId = session?.user?.id || null;
      state.currentUser = null;
      showAuthView("resetPasswordView");
      $("saveNewPasswordBtn").disabled = !state.recoveryUserId;
      $("resetPasswordError").textContent = state.recoveryUserId ? "" : "This reset link is invalid or expired. Request a new link.";
    }
  });
  $("showForgotPassword").addEventListener("click", () => {
    $("recoveryEmail").value = $("loginEmail").value.trim();
    $("recoveryMessage").textContent = "";
    $("recoveryError").textContent = "";
    showAuthView("forgotPasswordView");
    $("recoveryEmail").focus();
  });
  $("backFromRecovery").addEventListener("click", () => {
    if (!state.recoverySending) showAuthView("loginView");
  });
  $("forgotPasswordForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (state.recoverySending || !$("forgotPasswordForm").reportValidity()) return;
    $("recoveryMessage").textContent = "";
    $("recoveryError").textContent = "";
    if (!window.location || !["https:", "http:"].includes(window.location.protocol)) {
      $("recoveryError").textContent = "Open the help desk through its website address to request a reset link.";
      return;
    }
    const redirect = new URL(window.location.href);
    redirect.hash = "";
    redirect.search = "";
    redirect.searchParams.set("recovery", "1");
    state.recoverySending = true;
    $("sendRecoveryBtn").disabled = true;
    $("sendRecoveryBtn").textContent = "Sending…";
    try {
      const {
        error
      } = await sb.auth.resetPasswordForEmail($("recoveryEmail").value.trim(), {
        redirectTo: redirect.href
      });
      if (error) throw error;
      $("recoveryMessage").textContent = "If an account exists for that email, you’ll receive a reset link. Check your inbox and spam folder.";
    } catch (error) {
      $("recoveryError").textContent = "Could not request a reset link. " + error.message;
    } finally {
      state.recoverySending = false;
      $("sendRecoveryBtn").disabled = false;
      $("sendRecoveryBtn").textContent = "Send reset link";
    }
  });
  $("resetPasswordForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (state.passwordResetting) return;
    $("resetPasswordError").textContent = "";
    if (!state.recoveryMode || !state.recoveryUserId) {
      $("resetPasswordError").textContent = "This reset link is invalid or expired. Request a new link.";
      return;
    }
    if (!$("resetPasswordForm").reportValidity()) return;
    const password = $("resetPass").value;
    if (password.length < 6) {
      $("resetPasswordError").textContent = "Use at least 6 characters.";
      return;
    }
    if (password !== $("resetConfirmPass").value) {
      $("resetPasswordError").textContent = "Passwords do not match.";
      return;
    }
    state.passwordResetting = true;
    ["resetPass", "resetConfirmPass", "saveNewPasswordBtn", "backFromReset"].forEach(id => $(id).disabled = true);
    try {
      const {
        data: sessionData,
        error: sessionError
      } = await sb.auth.getSession();
      if (sessionError || sessionData.session?.user?.id !== state.recoveryUserId) throw new Error("Your reset session expired. Request a new reset link.");
      const {
        error
      } = await sb.auth.updateUser({
        password
      });
      if (error) throw error;
      await sb.auth.signOut({
        scope: "local"
      });
      state.recoveryMode = false;
      state.recoveryUserId = null;
      state.currentUser = null;
      clearRecoveryLocation();
      $("resetPasswordForm").reset();
      $("loginPass").value = "";
      showAuthView("loginView");
      $("loginError").textContent = "";
      $("loginMessage").textContent = "Password updated. Sign in with your new password.";
    } catch (error) {
      $("resetPasswordError").textContent = "Could not update your password. " + error.message;
    } finally {
      state.passwordResetting = false;
      ["resetPass", "resetConfirmPass", "saveNewPasswordBtn", "backFromReset"].forEach(id => $(id).disabled = false);
    }
  });
  $("backFromReset").addEventListener("click", async () => {
    if (state.passwordResetting) return;
    await sb.auth.signOut({
      scope: "local"
    });
    state.recoveryMode = false;
    state.recoveryUserId = null;
    state.currentUser = null;
    clearRecoveryLocation();
    showAuthView("loginView");
  });
  ["loginPass", "regPass", "regConfirmPass", "resetPass", "resetConfirmPass"].forEach(id => {
    $(id + "Toggle").addEventListener("click", () => setPasswordVisible(id, $(id).type === "password"));
  });
  ["regPass", "regConfirmPass"].forEach(id => $(id).addEventListener("input", updatePasswordMatch));
  $("registerForm").addEventListener("reset", () => {
    $("passwordMatch").textContent = "";
    [$("passwordMatch"), $("regConfirmPass")].forEach(el => {
      el.classList.remove("match");
      el.classList.remove("mismatch");
    });
    ["regPass", "regConfirmPass"].forEach(id => setPasswordVisible(id, false));
  });
  $("showLogin").addEventListener("click", () => ["regPass", "regConfirmPass"].forEach(id => setPasswordVisible(id, false)));
  $("showRegister").addEventListener("click", () => setPasswordVisible("loginPass", false));
  ["resetPass", "resetConfirmPass"].forEach(id => $(id).addEventListener("input", () => {
    const filled = !!$("resetConfirmPass").value,
      match = filled && $("resetPass").value === $("resetConfirmPass").value;
    $("resetPasswordMatch").textContent = filled ? match ? "✓ Passwords match" : "Passwords do not match" : "";
    $("resetPasswordMatch").classList.toggle("match", match);
    $("resetPasswordMatch").classList.toggle("mismatch", filled && !match);
  }));
  $("resetPasswordForm").addEventListener("reset", () => {
    $("resetPasswordMatch").textContent = "";
    ["resetPass", "resetConfirmPass"].forEach(id => setPasswordVisible(id, false));
  });

  // Private screenshots and immutable activity timeline.
}
