const authClient = window.stylicycleSupabase;

function ensureModal() {
  if (document.getElementById("authMessageModal")) return;

  const style = document.createElement("style");
  style.id = "authMessageModalStyles";
  style.textContent = `
    .auth-message-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.62);
    }
    .auth-message-overlay[hidden] { display: none; }
    .auth-message-card {
      width: min(100%, 420px);
      padding: 28px;
      border-top: 5px solid var(--auth-modal-accent, #b42318);
      border-radius: 12px;
      background: #fff;
      color: #1f2937;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
      font-family: Arial, sans-serif;
    }
    .auth-message-card[data-type="success"] { --auth-modal-accent: #16803c; }
    .auth-message-card[data-type="error"] { --auth-modal-accent: #b42318; }
    .auth-message-card h2 {
      margin: 0 0 12px;
      color: var(--auth-modal-accent);
      font-size: 1.35rem;
    }
    .auth-message-card p {
      margin: 0;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .auth-message-card button {
      display: block;
      min-width: 90px;
      margin: 24px 0 0 auto;
      padding: 10px 20px;
      border: 0;
      border-radius: 6px;
      background: var(--auth-modal-accent);
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .auth-message-card button:focus-visible {
      outline: 3px solid #2563eb;
      outline-offset: 3px;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "authMessageModal";
  overlay.className = "auth-message-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="auth-message-card" role="dialog" aria-modal="true"
      aria-labelledby="authMessageTitle" aria-describedby="authMessageText">
      <h2 id="authMessageTitle"></h2>
      <p id="authMessageText"></p>
      <button type="button" id="authMessageOk">OK</button>
    </section>
  `;
  document.body.appendChild(overlay);
}

window.showModal = function showModal(title, message, type = "error") {
  ensureModal();
  const overlay = document.getElementById("authMessageModal");
  const card = overlay.querySelector(".auth-message-card");
  const titleElement = document.getElementById("authMessageTitle");
  const messageElement = document.getElementById("authMessageText");
  const okButton = document.getElementById("authMessageOk");
  const previousFocus = document.activeElement;

  card.dataset.type = type === "success" ? "success" : "error";
  titleElement.textContent = title;
  messageElement.textContent = message;
  overlay.hidden = false;
  okButton.focus();

  return new Promise((resolve) => {
    const close = () => {
      overlay.hidden = true;
      okButton.removeEventListener("click", close);
      document.removeEventListener("keydown", handleKeydown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve();
    };
    const handleKeydown = (event) => {
      if (event.key === "Escape") close();
    };
    okButton.addEventListener("click", close, { once: true });
    document.addEventListener("keydown", handleKeydown);
  });
};

function setSubmitting(form, submitting, submittingText = "Please wait...") {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = submitting;
  button.textContent = submitting ? submittingText : button.dataset.defaultText;
}

function authErrorMessage(error) {
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit") {
    return "Supabase has temporarily rate-limited signup emails. Wait before trying again. Deleting a row from public.users does not reset Supabase Auth or its email limit.";
  }
  return error?.message || String(error);
}

document.getElementById("registerForm")?.addEventListener("submit", async function (event) {
  event.preventDefault();
  const firstName = document.getElementById("firstName").value.trim();
  const middleName = document.getElementById("middleName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const age = document.getElementById("age").value;
  const role = document.getElementById("role").value;
  const agreeTermsSignup = document.getElementById("agreeTermsSignup")?.checked;

  if (firstName.length < 2) {
    await window.showModal("Check your details", "First name must be at least 2 characters long.", "error");
    return;
  }
  if (lastName.length < 2) {
    await window.showModal("Check your details", "Last name must be at least 2 characters long.", "error");
    return;
  }

  const parsedAge = Number(age);
  if (age.trim() === "" || !Number.isFinite(parsedAge) || !Number.isInteger(parsedAge) || parsedAge < 18) {
    await window.showModal("Check your details", "You must enter a valid age of 18 or older.", "error");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await window.showModal("Check your details", "Enter a valid email address.", "error");
    return;
  }

  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    await window.showModal(
      "Check your password",
      "Password must be at least 8 characters and contain an uppercase letter, a lowercase letter, and a number.",
      "error"
    );
    return;
  }

  if (password !== confirmPassword) {
    await window.showModal("Check your password", "Passwords do not match.", "error");
    return;
  }
  if (!agreeTermsSignup) {
    await window.showModal("Terms required", "You must agree to the Terms and Conditions to register.", "error");
    return;
  }
  if (role === "admin") {
    await window.showModal("Registration unavailable", "Admin accounts can only be created by an existing administrator.", "error");
    return;
  }
  if (role !== "user") {
    await window.showModal("Check your account type", "Please select a valid account type.", "error");
    return;
  }

  setSubmitting(this, true, "Creating account...");
  try {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
          age: Number(age),
          role: "user"
        },
        emailRedirectTo: new URL("login.html", window.location.href).href
      }
    });
    if (error) throw error;

    await window.showModal(
      "Account created",
      "Account created! Please check your email for verification.",
      "success"
    );
    window.location.replace("login.html");
  } catch (err) {
    await window.showModal("Could not create your account", authErrorMessage(err), "error");
  } finally {
    setSubmitting(this, false);
  }
});

document.getElementById("loginForm")?.addEventListener("submit", async function (event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  setSubmitting(this, true);
  try {
    const { error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.replace("home.html");
  } catch (err) {
    await window.showModal("Could not log in", err.message || String(err), "error");
  } finally {
    setSubmitting(this, false);
  }
});

async function initializeSession() {
  const isAuthPage = Boolean(document.getElementById("loginForm") || document.getElementById("registerForm"));
  const requiresAuth = document.body.dataset.authRequired === "true";
  if (!isAuthPage && !requiresAuth) return;

  const { data, error } = await authClient.auth.getSession();
  if (error) {
    await window.showModal("Could not verify your session", error.message, "error");
    return;
  }

  const session = data.session;
  if (isAuthPage && session) {
    window.location.replace("home.html");
    return;
  }

  if (!requiresAuth) return;
  if (!session) {
    window.location.replace("login.html");
    return;
  }

  window.currentAuthUser = session.user;
  const navActions = document.querySelector(".nav-actions");
  const nav = document.querySelector(".top-nav");
  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "nav-button";
  logoutButton.textContent = "Log out";
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    const { error: signOutError } = await authClient.auth.signOut();
    if (signOutError) {
      logoutButton.disabled = false;
      await window.showModal("Could not log out", signOutError.message, "error");
      return;
    }
    window.location.replace("login.html");
  });
  (navActions || nav)?.appendChild(logoutButton);
}

initializeSession().catch((error) => {
  window.showModal("Could not initialize authentication", error.message || String(error), "error");
});
