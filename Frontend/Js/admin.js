const dashboardStatus = document.getElementById("adminDashboardStatus");

async function loadDashboardCounts() {
  const { data, error } = await window.adminClient.rpc("admin_dashboard_counts");
  if (error) {
    dashboardStatus.textContent = `Could not load dashboard counts: ${error.message}`;
    return;
  }

  const counts = data?.[0];
  if (!counts) {
    dashboardStatus.textContent = "No dashboard counts were returned.";
    return;
  }

  document.getElementById("totalUsersCount").textContent = counts.total_users;
  document.getElementById("activeRentalsCount").textContent = counts.active_rentals;
  document.getElementById("pendingDeliveriesCount").textContent = counts.pending_deliveries;
}

window.requireAdmin()
  .then((user) => {
    if (!user) return;
    return loadDashboardCounts();
  })
  .catch((error) => {
    dashboardStatus.textContent = error.message || String(error);
  });
