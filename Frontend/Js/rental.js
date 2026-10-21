// rental.js - load on rental.html (after common.js)
const API = "../../Backend/";
const ROOT = "../../"; // project root, used to build image URLs

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function requireLogin() {
  const { data, error } = await window.stylicycleSupabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session.user;
}

async function loadListings(mine = false) {
  const res = await fetch(API + "items.php" + (mine ? "?mine=1" : ""));
  const data = await res.json();
  if (!data.ok) return showToast(data.error);

  renderList("rentalListings", data.items, item => `
    <div class="listing-card">
      ${item.image_path ? `<img src="${ROOT}${esc(item.image_path)}" alt="${esc(item.title)}">` : ""}
      <div class="listing-card-content">
        <strong>${esc(item.title)}</strong>
        <span>${esc(item.description || item.category || "")} — ₱${esc(item.price_per_day)}/day · Size ${esc(item.size || "-")}</span>
      </div>
    </div>
  `);
  if (!data.items.length) {
    document.getElementById("rentalListings").innerHTML = "<li>No listings yet.</li>";
  }
}

requireLogin().then(user => {
  if (user) loadListings();
});

document.getElementById("rentalForm")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  try {
    const res = await fetch(API + "items.php", { method: "POST", body: new FormData(this) });
    const data = await res.json();
    if (!data.ok) return showToast(data.error);
    showToast("Rental listing submitted.");
    this.reset();
    loadListings();
  } catch (err) {
    showToast("Could not reach the server.");
  }
});

document.getElementById("rentalMyListingsBtn")?.addEventListener("click", () => {
  showToast("Showing your listings.");
  loadListings(true);
  document.getElementById("rentalListings")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("rentalViewMessagesBtn")?.addEventListener("click", () => {
  window.location.href = "chatbox.html";
});

document.getElementById("rentalNotificationsBtn")?.addEventListener("click", () => {
  showToast("No rental notifications found.");
});
