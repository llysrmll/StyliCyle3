// chat.js - load on chatbox.html and message.html (after supabase-client.js)
const chatClient = window.stylicycleSupabase;
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatMessageInput");
const chatStatus = document.getElementById("chatStatus");
const partnerButtons = [...document.querySelectorAll(".chat-partner-button")];
const chatPartnerName = document.getElementById("chatPartnerName");
const chatPartnerContext = document.getElementById("chatPartnerContext");
const chatAvatar = document.querySelector(".chat-header .chat-avatar");
const chatParams = new URLSearchParams(window.location.search);
const vendorPublicId = chatParams.get("partner_id");
const chatItemTitle = chatParams.get("item") || "";

let currentUserId = null;
let currentVendorPublicId = null;
let currentReceiver = document.body.classList.contains("admin-message-page")
  ? "admin"
  : chatParams.get("partner") || "";
let realtimeChannel = null;
let loadSequence = 0;
const currentMessages = new Map();

function setChatStatus(message) {
  if (chatStatus) chatStatus.textContent = message;
}

function isCurrentConversation(message) {
  return (
    (message.sender_id === currentUserId && message.receiver_id === currentReceiver) ||
    (message.sender_id === currentReceiver && message.receiver_id === currentUserId) ||
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

  const receivedMessagesQuery = currentVendorPublicId
    ? chatClient
        .from("messages")
        .select("id, sender_id, receiver_id, content, created_at")
        .eq("sender_id", receiverId)
        .eq("receiver_id", currentUserId)
    : chatClient
        .from("messages")
        .select("id, sender_id, receiver_id, content, created_at")
        .eq("receiver_id", currentUserId)
        .neq("sender_id", currentUserId);
  const [sentResult, receivedResult] = await Promise.all([
    chatClient
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .eq("sender_id", currentUserId)
      .eq("receiver_id", receiverId),
    receivedMessagesQuery
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
  currentVendorPublicId = null;
  currentReceiver = button.dataset.receiver;
  for (const partnerButton of partnerButtons) {
    const isActive = partnerButton === button;
    partnerButton.classList.toggle("active", isActive);
    partnerButton.setAttribute("aria-pressed", String(isActive));
  }

  if (chatPartnerName) chatPartnerName.textContent = button.dataset.name;
  if (chatAvatar) chatAvatar.textContent = button.dataset.avatar;
  if (chatPartnerContext) chatPartnerContext.textContent = "Rental partner";
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

  if (vendorPublicId) {
    const { data: vendor, error: vendorError } = await chatClient
      .from("users")
      .select("full_name, business_name, auth_uuid")
      .eq("id", vendorPublicId)
      .single();

    if (vendorError) {
      setChatStatus(`Could not load the vendor: ${vendorError.message}`);
      return;
    }
    if (!vendor.auth_uuid) {
      setChatStatus("This vendor account is not linked to a messaging account.");
      return;
    }

    currentReceiver = vendor.auth_uuid;
    currentVendorPublicId = vendorPublicId;
    const vendorName = vendor.business_name || vendor.full_name || "Vendor";
    if (chatPartnerName) chatPartnerName.textContent = `Chatting with ${vendorName}`;
    if (chatPartnerContext) {
      chatPartnerContext.textContent = chatItemTitle
        ? `Regarding ${chatItemTitle}`
        : "Rental partner";
    }
    if (chatAvatar) {
      chatAvatar.textContent = vendorName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
    }
    for (const button of partnerButtons) {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    }
  }

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

  if (!currentVendorPublicId && currentReceiver && partnerButtons.length &&
      !partnerButtons.some((button) => button.dataset.receiver === currentReceiver)) {
    currentReceiver = "";
  }

  if (!currentVendorPublicId && !currentReceiver) {
    const selectedButton = partnerButtons.find((button) => button.classList.contains("active")) || partnerButtons[0];
    if (!selectedButton) {
      setChatStatus("No chat partner is configured.");
      return;
    }
    currentReceiver = selectedButton.dataset.receiver;
  }

  const activeButton = currentVendorPublicId
    ? null
    : partnerButtons.find((button) => button.dataset.receiver === currentReceiver);
  if (activeButton) {
    partnerButtons.forEach((button) => {
      const active = button === activeButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (chatPartnerName) chatPartnerName.textContent = activeButton.dataset.name;
    if (chatAvatar) chatAvatar.textContent = activeButton.dataset.avatar;
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

document.getElementById("chatViewAllBtn")?.addEventListener("click", () => {
  document.getElementById("chatNotifications")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("chatNewReqBtn")?.addEventListener("click", () => {
  document.getElementById("navNotificationBtn")?.click();
});

document.getElementById("chatPostItemBtn")?.addEventListener("click", () => {
  window.location.href = "rental.html";
});
