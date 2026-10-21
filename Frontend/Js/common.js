// common.js - load on EVERY page, before the page-specific file.

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
let notificationUserId = null;
let notificationChannel = null;
let notificationDropdown = null;
let notificationBadge = null;

function renderRecentNotifications(rows) {
  for (const listId of ["homeNotifications", "chatNotifications"]) {
    const list = document.getElementById(listId);
    if (!list) continue;
    list.replaceChildren();

    for (const notification of rows.slice(0, 5)) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = notification.title;
      const message = document.createElement("span");
      message.textContent = notification.message;
      const time = document.createElement("time");
      time.dateTime = notification.created_at;
      time.textContent = new Date(notification.created_at).toLocaleString();
      item.append(title, message, time);
      list.appendChild(item);
    }

    if (!rows.length) {
      const item = document.createElement("li");
      item.textContent = "No updates yet.";
      list.appendChild(item);
    }
  }
}

function setNotificationBadge(count) {
  if (!notificationBadge) return;
  notificationBadge.textContent = count > 99 ? "99+" : String(count);
  notificationBadge.hidden = count < 1;
  navNotificationBtn.setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");
}

async function loadNotificationRows(markRead = false) {
  if (!notificationUserId || !window.stylicycleSupabase) return;
  const client = window.stylicycleSupabase;
  const { data, error } = await client
    .from("notifications")
    .select("id, title, message, is_read, created_at")
    .eq("user_id", notificationUserId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  const rows = data || [];
  renderRecentNotifications(rows);
  const unreadRows = rows.filter((row) => !row.is_read);

  if (markRead && unreadRows.length) {
    const { error: updateError } = await client
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", notificationUserId)
      .in("id", unreadRows.map((row) => row.id))
      .eq("is_read", false);
    if (updateError) throw updateError;
    rows.forEach((row) => { row.is_read = true; });
  }
  const { count, error: countError } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", notificationUserId)
    .eq("is_read", false);
  if (countError) throw countError;
  setNotificationBadge(count || 0);

  notificationDropdown.replaceChildren();
  const heading = document.createElement("strong");
  heading.className = "notification-dropdown-heading";
  heading.textContent = "Notifications";
  notificationDropdown.appendChild(heading);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "notification-dropdown-empty";
    empty.textContent = "You’re all caught up.";
    notificationDropdown.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const item = document.createElement("article");
    item.className = `notification-dropdown-item${row.is_read ? "" : " unread"}`;
    const title = document.createElement("strong");
    title.textContent = row.title;
    const message = document.createElement("span");
    message.textContent = row.message;
    const time = document.createElement("time");
    time.dateTime = row.created_at;
    time.textContent = new Date(row.created_at).toLocaleString();
    item.append(title, message, time);
    notificationDropdown.appendChild(item);
  }
}

function setupNotificationBell() {
  if (!navNotificationBtn || !window.stylicycleSupabase) return;

  navNotificationBtn.setAttribute("aria-expanded", "false");
  navNotificationBtn.setAttribute("aria-haspopup", "true");
  notificationBadge = document.createElement("span");
  notificationBadge.className = "notification-badge";
  notificationBadge.hidden = true;
  navNotificationBtn.appendChild(notificationBadge);

  notificationDropdown = document.createElement("section");
  notificationDropdown.className = "notification-dropdown";
  notificationDropdown.hidden = true;
  notificationDropdown.setAttribute("aria-label", "Notifications");
  navNotificationBtn.parentElement.appendChild(notificationDropdown);

  navNotificationBtn.addEventListener("click", async () => {
    const isOpening = notificationDropdown.hidden;
    notificationDropdown.hidden = !isOpening;
    navNotificationBtn.setAttribute("aria-expanded", String(isOpening));
    if (!isOpening) return;

    try {
      await loadNotificationRows(true);
    } catch (error) {
      notificationDropdown.replaceChildren();
      const message = document.createElement("p");
      message.className = "notification-dropdown-error";
      message.textContent = `Could not load notifications: ${error.message || String(error)}`;
      notificationDropdown.appendChild(message);
    }
  });

  document.addEventListener("click", (event) => {
    if (!notificationDropdown.contains(event.target) && !navNotificationBtn.contains(event.target)) {
      notificationDropdown.hidden = true;
      navNotificationBtn.setAttribute("aria-expanded", "false");
    }
  });

  window.stylicycleSupabase.auth.getUser().then(async ({ data, error }) => {
    if (error) throw error;
    if (!data.user) return;
    const { data: publicUserId, error: mappingError } = await window.stylicycleSupabase
      .rpc("current_public_user_id");
    if (mappingError) throw mappingError;
    if (!publicUserId) throw new Error("Your account has no linked profile.");
    notificationUserId = publicUserId;
    await loadNotificationRows();

    notificationChannel = window.stylicycleSupabase
      .channel(`notifications-${publicUserId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${publicUserId}`
      }, async () => {
        try {
          await loadNotificationRows(!notificationDropdown.hidden);
        } catch (loadError) {
          showToast(`Could not refresh notifications: ${loadError.message || String(loadError)}`);
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          showToast("Realtime notifications are unavailable. Check Supabase Realtime setup.");
        }
      });
  }).catch((error) => {
    showToast(`Could not initialize notifications: ${error.message || String(error)}`);
  });
}

setupNotificationBell();

function goToRentalSearch() {
  const input = document.getElementById("homeSearchInput");
  const query = input?.value.trim();
  if (!query) {
    showToast("Enter a search term.");
    input?.focus();
    return;
  }
  window.location.href = `/HTML/rental.html?search=${encodeURIComponent(query)}`;
}

const homeRentalSearchForm = document.getElementById("homeRentalSearchForm");
homeRentalSearchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  goToRentalSearch();
});

if (!homeRentalSearchForm) {
  document.getElementById("homeSearchBtn")?.addEventListener("click", goToRentalSearch);
}
document.getElementById("homeSearchInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (!homeRentalSearchForm) goToRentalSearch();
  }
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