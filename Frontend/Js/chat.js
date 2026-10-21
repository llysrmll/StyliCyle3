const chatClient = window.stylicycleSupabase;
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatMessageInput");
const chatStatus = document.getElementById("chatStatus");
const chatPartners = document.getElementById("chatPartners");
const chatPartnersStatus = document.getElementById("chatPartnersStatus");
const chatPartnerName = document.getElementById("chatPartnerName");
const chatPartnerContext = document.getElementById("chatPartnerContext");
const chatAvatar = document.getElementById("chatAvatar");
const chatParams = new URLSearchParams(window.location.search);
const requestedReceiver = chatParams.get("receiver_id") || chatParams.get("partner") || "";
const requestedName = chatParams.get("name") || "";
const itemTitle = chatParams.get("item") || "";
const isAdminChatPage = document.body.classList.contains("admin-message-page");

let currentUserId = null;
let currentReceiver = isAdminChatPage ? "admin" : requestedReceiver;
let currentContactName = requestedName;
let realtimeChannel = null;
let loadSequence = 0;
const currentMessages = new Map();
const contactDetails = new Map();
const adminUserIds = new Set();

function setChatStatus(message) {
  if (chatStatus) chatStatus.textContent = message;
}

function setPartnersStatus(message) {
  if (chatPartnersStatus) chatPartnersStatus.textContent = message;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getInitials(name) {
  return String(name || "SC")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "SC";
}

function isCurrentConversation(message) {
  if (currentReceiver === "admin") {
    return (message.sender_id === currentUserId && message.receiver_id === "admin") ||
      (message.receiver_id === currentUserId && adminUserIds.has(message.sender_id));
  }
  return (message.sender_id === currentUserId && message.receiver_id === currentReceiver) ||
    (message.sender_id === currentReceiver && message.receiver_id === currentUserId);
}

function renderMessages() {
  if (!chatWindow) return;
  const messages = [...currentMessages.values()].sort(
    (first, second) => new Date(first.created_at) - new Date(second.created_at)
  );
  chatWindow.replaceChildren();

  for (const message of messages) {
    const element = document.createElement("div");
    element.className = `message ${message.sender_id === currentUserId ? "user" : "bot"}`;
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.content;
    element.appendChild(text);
    chatWindow.appendChild(element);
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addMessage(message) {
  if (!message?.id || !isCurrentConversation(message)) return;
  currentMessages.set(message.id, message);
  renderMessages();
}

function renderContacts() {
  if (!chatPartners) return;
  chatPartners.replaceChildren();
  const contacts = [...contactDetails.values()].sort((first, second) => {
    if (first.id === "admin") return -1;
    if (second.id === "admin") return 1;
    return (second.lastMessageAt || 0) - (first.lastMessageAt || 0);
  });

  for (const contact of contacts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-partner-button${contact.id === currentReceiver ? " active" : ""}`;
    button.dataset.receiver = contact.id;
    button.dataset.name = contact.name;
    button.dataset.avatar = getInitials(contact.name);
    button.setAttribute("aria-pressed", String(contact.id === currentReceiver));
    button.textContent = contact.name;
    button.addEventListener("click", () => selectContact(contact));
    chatPartners.appendChild(button);
  }
  if (chatPartnersStatus && contacts.length) {
    chatPartnersStatus.textContent = "";
    chatPartnersStatus.hidden = true;
  }
}

function updateHeader(name, context = "Conversation") {
  currentContactName = name || (currentReceiver === "admin" ? "Admin Support" : "StyliCycle user");
  if (chatPartnerName) chatPartnerName.textContent = currentContactName;
  if (chatAvatar) chatAvatar.textContent = getInitials(currentContactName);
  if (chatPartnerContext) chatPartnerContext.textContent = itemTitle ? `Regarding ${itemTitle}` : context;
}

async function loadMessages(receiverId) {
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
  ]);

  if (sequence !== loadSequence || receiverId !== currentReceiver) return;
  const error = sentResult.error || receivedResult.error;
  if (error) {
    setChatStatus(`Could not load messages: ${error.message}`);
    return;
  }

  const messages = [...(sentResult.data || []), ...(receivedResult.data || [])];
  for (const message of messages) {
    if (message.receiver_id === "admin" && message.sender_id === currentUserId) continue;
    if (isCurrentConversation(message)) currentMessages.set(message.id, message);
  }

  renderMessages();
  setChatStatus(currentMessages.size ? "" : "No messages yet. Start the conversation.");
}

async function loadContacts() {
  setPartnersStatus("Loading conversations...");
  const [sentResult, receivedResult] = await Promise.all([
    chatClient
      .from("messages")
      .select("sender_id, receiver_id, created_at")
      .eq("sender_id", currentUserId)
      .order("created_at", { ascending: false }),
    chatClient
      .from("messages")
      .select("sender_id, receiver_id, created_at")
      .eq("receiver_id", currentUserId)
      .order("created_at", { ascending: false })
  ]);

  const error = sentResult.error || receivedResult.error;
  if (error) throw new Error(`Could not load your conversations: ${error.message}`);

  const partnerIds = new Set();
  const lastMessageAt = new Map();
  for (const message of [...(sentResult.data || []), ...(receivedResult.data || [])]) {
    const partnerId = message.sender_id === currentUserId
      ? message.receiver_id
      : message.sender_id;
    if (partnerId === "admin") {
      contactDetails.set("admin", { id: "admin", name: "Admin Support", lastMessageAt: new Date(message.created_at).getTime() });
    } else if (isUuid(partnerId) && partnerId !== currentUserId) {
      partnerIds.add(partnerId);
      const timestamp = new Date(message.created_at).getTime();
      lastMessageAt.set(partnerId, Math.max(lastMessageAt.get(partnerId) || 0, timestamp));
    }
  }

  if (currentReceiver === "admin") {
    contactDetails.set("admin", { id: "admin", name: "Admin Support", lastMessageAt: lastMessageAt.get("admin") || 0 });
  } else if (isUuid(currentReceiver) && !contactDetails.has(currentReceiver)) {
    contactDetails.set(currentReceiver, {
      id: currentReceiver,
      name: requestedName || "Vendor",
      lastMessageAt: 0
    });
  }

  if (partnerIds.size) {
    const { data, error: detailsError } = await chatClient.rpc("chat_partner_details", {
      p_auth_user_ids: [...partnerIds]
    });
    if (detailsError) throw new Error(`Could not load conversation partner names: ${detailsError.message}`);
    for (const contact of data || []) {
      const name = contact.display_name || contact.id;
      const previous = contactDetails.get(contact.id);
      contactDetails.set(contact.id, {
        id: contact.id,
        name,
        lastMessageAt: lastMessageAt.get(contact.id) || 0
      });
      if (contact.is_admin) adminUserIds.add(contact.id);
      if (previous && currentReceiver === contact.id && !requestedName) currentContactName = name;
    }
  }

  if (!contactDetails.has("admin")) {
    contactDetails.set("admin", { id: "admin", name: "Admin Support", lastMessageAt: 0 });
  }

  if (isUuid(currentReceiver) && requestedName) {
    contactDetails.set(currentReceiver, {
      id: currentReceiver,
      name: requestedName,
      lastMessageAt: lastMessageAt.get(currentReceiver) || 0
    });
    currentContactName = requestedName;
  }

  renderContacts();
  setPartnersStatus("");
}

async function selectContact(contact) {
  currentContactName = contact.name;
  currentReceiver = contact.id;
  updateHeader(contact.name, contact.id === "admin" ? "StyliCycle Support" : "Vendor");
  renderContacts();
  const params = new URLSearchParams(window.location.search);
  params.set("receiver_id", contact.id);
  params.set("name", contact.name);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  await loadMessages(contact.id);
}

async function initializeChat() {
  if (!chatWindow || !chatForm || !chatInput) return;
  const { data, error } = await chatClient.auth.getUser();
  if (error) throw new Error(`Could not verify your login: ${error.message}`);
  if (!data.user) {
    window.location.replace("/HTML/login.html");
    return;
  }
  currentUserId = data.user.id;

  if (requestedReceiver === "admin" || (!requestedReceiver && isAdminChatPage)) {
    currentReceiver = "admin";
    currentContactName = "Admin Support";
  } else if (requestedReceiver && !isUuid(requestedReceiver)) {
    throw new Error("The requested chat partner ID is invalid.");
  }

  if (currentReceiver === "admin") {
    updateHeader("Admin Support", "StyliCycle Support");
  } else if (currentReceiver) {
    updateHeader(requestedName || "Vendor", "Vendor");
  }

  await loadContacts();
  if (!currentReceiver) {
    currentReceiver = "admin";
    currentContactName = "Admin Support";
    updateHeader(currentContactName, "StyliCycle Support");
    renderContacts();
  } else {
    updateHeader(currentContactName || requestedName || "Vendor", currentReceiver === "admin" ? "StyliCycle Support" : "Vendor");
  }

  realtimeChannel = chatClient
    .channel(`messages-${currentUserId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages"
    }, async (payload) => {
      const message = payload.new;
      try {
        await loadContacts();
        addMessage(message);
      } catch (loadError) {
        setPartnersStatus(loadError.message || String(loadError));
        addMessage(message);
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setChatStatus("Real-time connection failed. Check that messages is enabled in Supabase Realtime.");
      }
    });

  await loadMessages(currentReceiver);

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = chatInput.value.trim();
    if (!content || !currentUserId || !currentReceiver) return;
    const sendButton = chatForm.querySelector('button[type="submit"]');
    sendButton.disabled = true;

    try {
      const { data: insertedMessage, error: insertError } = await chatClient
        .from("messages")
        .insert({ sender_id: currentUserId, receiver_id: currentReceiver, content })
        .select("id, sender_id, receiver_id, content, created_at")
        .single();
      if (insertError) throw insertError;
      chatInput.value = "";
      addMessage(insertedMessage);
      setChatStatus("");
      await loadContacts();
      chatInput.focus();
    } catch (sendError) {
      setChatStatus(`Could not send message: ${sendError.message || String(sendError)}`);
    } finally {
      sendButton.disabled = false;
    }
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
  window.location.href = "/HTML/rental.html";
});
