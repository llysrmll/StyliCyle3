// common.js - load on EVERY page, before the page-specific file.

// ---------- Shared data ----------
const notifications = [
  { title: "Website partnership update posted", time: "Just now" },
  { title: "New rental request", time: "2 min ago" },
  { title: "Message from admin", time: "25 min ago" },
  { title: "Profile verified", time: "1 day ago" }
];

const notificationDetails = [
  {
    title: "Partnership Update",
    message: "Our website just announced a new partnership profile with Event Couture for suit and gown rentals.",
  },
  {
    title: "Your Profile Updated",
    message: "Your partnership profile information was refreshed with the latest contact details and items.",
  }
];

// ---------- Helpers ----------
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast-banner";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 260);
  }, 2800);
}

function renderList(elementId, items, formatItem) {
  const list = document.getElementById(elementId);
  if (!list) return;
  list.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = formatItem(item);
    list.appendChild(li);
  });
}

function showNotifications() {
  const info = document.getElementById("homeNotificationInfo");
  const homeList = document.getElementById("homeNotifications");

  if (info) {
    info.classList.remove("hidden");
    info.innerHTML = `
      <h4>Here’s what updated</h4>
      <p><strong>${notificationDetails[0].title}:</strong> ${notificationDetails[0].message}</p>
      <p><strong>${notificationDetails[1].title}:</strong> ${notificationDetails[1].message}</p>
    `;
  }

  if (homeList) {
    homeList.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  showToast("Updated info shown in the notifications section.");
}

// ---------- Navbar ----------
const navChatButton = document.getElementById("navChatButton");
const navChatInput = document.getElementById("navChatInput");
navChatButton?.addEventListener("click", () => {
  const value = navChatInput?.value.trim();
  if (value) {
    showToast(`Opening chat for: ${value}`);
    window.location.href = "chatbox.html";
  } else {
    showToast("Type a quick chat request first.");
  }
});
navChatInput?.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    navChatButton?.click();
  }
});

const navNotificationBtn = document.getElementById("navNotificationBtn");
navNotificationBtn?.addEventListener("click", () => {
  showNotifications();
});

// ---------- Floating support chat (available on every page) ----------
function setupFloatingChat() {
  if (document.querySelector('.chat-launcher')) return;

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'chat-launcher';
  launcher.setAttribute('aria-label', 'Open support chat');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.textContent = '💬';

  const panel = document.createElement('section');
  panel.className = 'floating-chat-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Support chat');
  panel.innerHTML = `
    <div class="floating-chat-header">
      <strong>StyliCycle Support</strong>
      <button type="button" class="floating-chat-close" aria-label="Close support chat">×</button>
    </div>
    <div class="floating-chat-messages">
      <div class="message bot"><span>Hi! How can we help with your rental today?</span></div>
    </div>
    <form class="floating-chat-form">
      <input type="text" placeholder="Type a message..." aria-label="Support message" required>
      <button type="submit" aria-label="Send support message">➤</button>
    </form>
  `;

  document.body.append(launcher, panel);

  const closeButton = panel.querySelector('.floating-chat-close');
  const messages = panel.querySelector('.floating-chat-messages');
  const form = panel.querySelector('.floating-chat-form');
  const input = form.querySelector('input');

  function togglePanel(isOpen) {
    panel.hidden = !isOpen;
    launcher.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) input.focus();
  }

  launcher.addEventListener('click', () => togglePanel(panel.hidden));
  closeButton.addEventListener('click', () => togglePanel(false));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.textContent = text;
    messages.appendChild(userMessage);
    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    window.setTimeout(() => {
      const reply = document.createElement('div');
      reply.className = 'message bot';
      reply.textContent = 'Thanks! An admin will reply shortly.';
      messages.appendChild(reply);
      messages.scrollTop = messages.scrollHeight;
    }, 500);
  });
}

setupFloatingChat();