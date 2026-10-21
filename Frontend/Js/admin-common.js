const adminClient = window.stylicycleSupabase;

function hasAdminAccess(user) {
  return user?.app_metadata?.is_admin === true || user?.app_metadata?.role === "admin";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function requireAdmin() {
  const { data, error } = await adminClient.auth.getUser();
  if (error) {
    throw new Error(`Could not verify administrator access: ${error.message}`);
  }
  if (!data.user || !hasAdminAccess(data.user)) {
    if (data.user) {
      const { error: signOutError } = await adminClient.auth.signOut();
      if (signOutError) {
        throw new Error(`This account is not an administrator and could not be signed out: ${signOutError.message}`);
      }
    }
    window.location.replace("/HTML/admin_login.html");
    return null;
  }

  const logoutButton = document.getElementById("adminLogoutButton");
  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    const { error: signOutError } = await adminClient.auth.signOut();
    if (signOutError) {
      logoutButton.disabled = false;
      window.alert(`Could not log out: ${signOutError.message}`);
      return;
    }
    window.location.replace("/HTML/admin_login.html");
  });

  return data.user;
}

window.adminClient = adminClient;
window.hasAdminAccess = hasAdminAccess;
window.escapeHTML = escapeHTML;
window.requireAdmin = requireAdmin;
