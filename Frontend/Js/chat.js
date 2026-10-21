// chat.js - load on chatbox.html and message.html (after supabase-client.js)
const chatClient = window.stylicycleSupabase;
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatMessageInput");
const chatStatus = document.getElementById("chatStatus");
const partnerButtons = [...document.querySelectorAll(".chat-partner-button")];
const chatPartnerName = document.getElementById("chatPartnerName");
const chatAvatar = document.querySelector(".chat-header .chat-avatar");

let currentUserId = null;
let currentReceiver = document.body.classList.contains("admin-message-page") ? "admin" : "";
let realtimeChannel = null;
let loadSequence = 0;
const currentMessages = new Map();

function setChatStatus(message) {
  if (chatStatus) chatStatus.textContent = message;
}

function isCurrentConversation(message) {
  return (
    (message.sender_id === currentUserId && message.receiver_id === currentReceiver) ||
    (currentReceiver === "admin" &&
      message.receiver_id === currentUserId &&
      message.sender_id !== currentUserId) ||
    (message.receiver_id === currentReceiver && message.sender_id !== currentUserId)
  );
}

function renderMessages() {
  if (!chatWindow) return;

  const messages = [...currentMessages.values()].sort(
    (first, second) => new Date(first.created_at) - new Date(second.created_at)
  );
  chatWindow.replaceChildren();

  for (const message of messages) {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${message.sender_id === currentUserId ? "user" : "bot"}`;

    const textElement = document.createElement("div");
    textElement.className = "message-text";
    textElement.textContent = message.content;
    messageElement.appendChild(textElement);
    chatWindow.appendChild(messageElement);
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addMessage(message) {
  if (!message?.id || !isCurrentConversation(message)) return;
  currentMessages.set(message.id, message);
  renderMessages();
}

async function loadMessages(receiverId) {
  if (!currentUserId || !chatWindow) return;
  const sequence = ++loadSequence;
  currentReceiver = receiverId;
  currentMessages.clear();
  chatWindow.replaceChildren();
  setChatStatus("Loading messages...");

  const [sentResult, receivedResult] = await Promise.all([
    chatClient
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .eq("sender_id", currentUserId)
      .eq("receiver_id", receiverId),
    chatClient
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .eq("receiver_id", currentUserId)
      .neq("sender_id", currentUserId)
  ]);

  if (sequence !== loadSequence || receiverId !== currentReceiver) return;
  const error = sentResult.error || receivedResult.error;
  if (error) {
    setChatStatus(`Could not load messages: ${error.message}`);
    return;
  }

  for (const message of [...(sentResult.data || []), ...(receivedResult.data || [])]) {
    if (isCurrentConversation(message)) currentMessages.set(message.id, message);
  }

  renderMessages();
  setChatStatus(currentMessages.size ? "" : "No messages yet. Start the conversation.");
}

function selectChatPartner(button) {
  currentReceiver = button.dataset.receiver;
  for (const partnerButton of partnerButtons) {
    const isActive = partnerButton === button;
    partnerButton.classList.toggle("active", isActive);
    partnerButton.setAttribute("aria-pressed", String(isActive));
  }

  if (chatPartnerName) chatPartnerName.textContent = button.dataset.name;
  if (chatAvatar) chatAvatar.textContent = button.dataset.avatar;
  loadMessages(currentReceiver);
}

async function initializeChat() {
  if (!chatWindow || !chatForm || !chatInput) return;

  const { data, error } = await chatClient.auth.getUser();
  if (error) {
    setChatStatus(`Could not verify your login: ${error.message}`);
    return;
  }
  if (!data.user) {
    window.location.replace("login.html");
    return;
  }
  currentUserId = data.user.id;

  realtimeChannel = chatClient
    .channel(`messages-${currentUserId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => addMessage(payload.new)
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setChatStatus("Real-time connection failed. Check that messages is enabled in Supabase Realtime.");
      }
    });

  partnerButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    button.addEventListener("click", () => selectChatPartner(button));
  });

  if (!currentReceiver) {
    const selectedButton = partnerButtons.find((button) => button.classList.contains("active")) || partnerButtons[0];
    if (!selectedButton) {
      setChatStatus("No chat partner is configured.");
      return;
    }
    currentReceiver = selectedButton.dataset.receiver;
    if (chatPartnerName) chatPartnerName.textContent = selectedButton.dataset.name;
    if (chatAvatar) chatAvatar.textContent = selectedButton.dataset.avatar;
  }

  await loadMessages(currentReceiver);

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = chatInput.value.trim();
    if (!content || !currentUserId || !currentReceiver) return;

    const sendButton = chatForm.querySelector('button[type="submit"]');
    if (sendButton) sendButton.disabled = true;
    setChatStatus("");

    const { data: insertedMessage, error: insertError } = await chatClient
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: currentReceiver,
        content
      })
      .select("id, sender_id, receiver_id, content, created_at")
      .single();

    if (sendButton) sendButton.disabled = false;
    if (insertError) {
      setChatStatus(`Could not send message: ${insertError.message}`);
      return;
    }

    chatInput.value = "";
    addMessage(insertedMessage);
    setChatStatus("");
    chatInput.focus();
  });
}

initializeChat().catch((error) => {
  setChatStatus(`Chat could not start: ${error.message || String(error)}`);
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
