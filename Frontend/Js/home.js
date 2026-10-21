// home.js - load on home.html (after common.js)

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
