const adminLoginForm = document.getElementById("adminLoginForm");
const adminLoginStatus = document.getElementById("adminLoginStatus");

function showAdminLoginStatus(message) {
  if (adminLoginStatus) adminLoginStatus.textContent = message;
}

if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;
    const submitButton = adminLoginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showAdminLoginStatus("");

    try {
      const { data, error } = await window.stylicycleSupabase.auth.signInWithPassword({ email, password });
      if (error) {
        showAdminLoginStatus(`Could not log in: ${error.message}`);
        return;
      }

      const isAdmin = data.user?.app_metadata?.is_admin === true ||
        data.user?.app_metadata?.role === "admin";
      if (!isAdmin) {
        const { error: signOutError } = await window.stylicycleSupabase.auth.signOut();
        showAdminLoginStatus(
          signOutError
            ? `This account is not an administrator. Sign-out failed: ${signOutError.message}`
            : "This account does not have administrator access."
        );
        return;
      }

      window.location.replace("/HTML/admin.html");
    } catch (error) {
      showAdminLoginStatus(`Could not log in: ${error.message || String(error)}`);
    } finally {
      submitButton.disabled = false;
    }
  });
}

window.stylicycleSupabase.auth.getUser().then(async ({ data, error }) => {
  if (error) {
    showAdminLoginStatus(`Could not verify your session: ${error.message}`);
    return;
  }
  const user = data.user;
  const isAdmin = user?.app_metadata?.is_admin === true ||
    user?.app_metadata?.role === "admin";
  if (isAdmin) {
    window.location.replace("/HTML/admin.html");
  } else if (user) {
    const { error: signOutError } = await window.stylicycleSupabase.auth.signOut();
    if (signOutError) {
      showAdminLoginStatus(`This account is not an administrator. Sign-out failed: ${signOutError.message}`);
    }
  }
}).catch((error) => {
  showAdminLoginStatus(`Could not verify your session: ${error.message || String(error)}`);
});
