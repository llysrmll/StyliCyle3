const rentalsBody = document.getElementById("adminRentalsBody");
const rentalsStatus = document.getElementById("adminRentalsStatus");

async function loadAdminRentals() {
  rentalsStatus.textContent = "Loading rentals...";
  const { data, error } = await window.adminClient
    .from("items")
    .select("id, title, category, price_per_day, size, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    rentalsStatus.textContent = `Could not load rentals: ${error.message}`;
    return;
  }

  rentalsBody.replaceChildren();
  for (const rental of data || []) {
    const row = document.createElement("tr");
    const values = [
      rental.id,
      rental.title,
      rental.category || "—",
      rental.price_per_day == null ? "—" : `₱${rental.price_per_day}`,
      rental.size || "—",
      rental.status || "—",
      rental.created_at ? new Date(rental.created_at).toLocaleString() : "—"
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }
    rentalsBody.appendChild(row);
  }
  rentalsStatus.textContent = data?.length ? `${data.length} rental(s)` : "No rentals found.";
}

window.requireAdmin()
  .then((user) => user && loadAdminRentals())
  .catch((error) => { rentalsStatus.textContent = error.message || String(error); });
