// chat.js - load on chatbox.html and message.html (after common.js)

function addChatMessage(text, isUser) {
  const windowEl = document.querySelector(".chat-window");
  if (!windowEl) return;

  const messageEl = document.createElement("div");
  messageEl.className = `message ${isUser ? "user" : "bot"}`;
  messageEl.innerHTML = `<div class="message-text"></div>`;
  messageEl.querySelector(".message-text").textContent = text;
  windowEl.appendChild(messageEl);
  windowEl.scrollTop = windowEl.scrollHeight;
}

const chatForm = document.getElementById("chatForm");
chatForm?.addEventListener("submit", function (e) {
  e.preventDefault();
  const input = chatForm.querySelector("input");
  if (!input || !input.value.trim()) return;
  const message = input.value.trim();
  addChatMessage(message, true);
  input.value = "";
  setTimeout(() => addChatMessage("Thanks for your message! An agent will reply shortly.", false), 700);
});

if (document.getElementById("chatNotifications")) {
  renderList("chatNotifications", notifications, item => `${item.title}<span>${item.time}</span>`);
}

document.getElementById("chatViewAllBtn")?.addEventListener("click", () => {
  showToast("Viewing all notifications.");
});

document.getElementById("chatNewReqBtn")?.addEventListener("click", () => {
  showToast("You have 1 new request.");
  const chatNotifications = document.getElementById("chatNotifications");
  if (chatNotifications) {
    const li = document.createElement("li");
    li.innerHTML = "Rental request received<span>Just now</span>";
    chatNotifications.prepend(li);
  }
});

document.getElementById("chatPostItemBtn")?.addEventListener("click", () => {
  window.location.href = "rental.html";
});