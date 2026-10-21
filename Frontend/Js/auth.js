const authClient = window.stylicycleSupabase;

function setSubmitting(form, submitting) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = submitting;
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

  if (!agreeTermsSignup) return alert("You must agree to the Terms and Conditions to register.");
  if (password !== confirmPassword) return alert("Passwords do not match!");
  if (isNaN(age) || age <= 0) return alert("Please enter a valid age.");
  if (!firstName || !lastName || !email) return alert("Please fill in all required fields.");
  if (role === "admin") return alert("Admin accounts can only be created by an existing administrator.");
  if (role !== "user") return alert("Please select a valid account type.");

  setSubmitting(this, true);
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

    if (data.session) {
      window.location.replace("home.html");
      return;
    }
    alert("Registration successful. Check your email to confirm your account, then log in.");
    window.location.replace("login.html");
  } catch (err) {
    alert(`Could not create your account: ${err.message || String(err)}`);
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
    alert(`Could not log in: ${err.message || String(err)}`);
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
    alert(`Could not verify your session: ${error.message}`);
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
      alert(`Could not log out: ${signOutError.message}`);
      return;
    }
    window.location.replace("login.html");
  });
  (navActions || nav)?.appendChild(logoutButton);
}

initializeSession().catch((error) => {
  alert(`Could not initialize authentication: ${error.message || String(error)}`);
});
