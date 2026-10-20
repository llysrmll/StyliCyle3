// home.js - load on home.html (after common.js)

if (document.getElementById("homeNotifications")) {
  renderList("homeNotifications", notifications, item => `${item.title}<span>${item.time}</span>`);
}

document.getElementById("homePostRentalBtn")?.addEventListener("click", () => {
  window.location.href = "rental.html";
});

document.getElementById("homeOpenMessagesBtn")?.addEventListener("click", () => {
  window.location.href = "chatbox.html";
});

document.getElementById("homeOpenAdminChatBtn")?.addEventListener("click", () => {
  window.location.href = "message.html";
});

document.getElementById("homeViewNotificationsBtn")?.addEventListener("click", () => {
  showToast("Showing your latest notifications.");
  document.getElementById("homeNotifications")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

// Search
const homeSearchBtn = document.getElementById("homeSearchBtn");
const homeSearchInput = document.getElementById("homeSearchInput");
homeSearchBtn?.addEventListener("click", () => {
  const query = homeSearchInput?.value.trim();
  if (query) {
    showToast(`Searching for "${query}"...`);
  } else {
    showToast("Enter a search term.");
  }
});
homeSearchInput?.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    homeSearchBtn?.click();
  }
});