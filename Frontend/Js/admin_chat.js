const contactsList = document.getElementById("adminChatContacts");
const contactsStatus = document.getElementById("adminContactsStatus");
const conversationWindow = document.getElementById("adminChatWindow");
const replyForm = document.getElementById("adminReplyForm");
const replyInput = document.getElementById("adminReplyInput");
const chatStatus = document.getElementById("adminChatStatus");
const userSearchForm = document.getElementById("adminUserSearchForm");
const userSearchInput = document.getElementById("adminUserSearchInput");
let adminUserId = null;
let selectedUserId = null;
let contactDetails = new Map();
let conversationUserIds = new Set();
let conversationMessages = new Map();
let adminChatChannel = null;
let conversationLoad = 0;

function setAdminChatStatus(message) {
  chatStatus.textContent = message;
}

function renderAdminContacts() {
  contactsList.replaceChildren();
  for (const [userId, profile] of contactDetails) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `admin-contact${selectedUserId === userId ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(selectedUserId === userId));
    const name = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "User";
    const userLabel = document.createElement("span");
    userLabel.textContent = name;
    button.appendChild(userLabel);
    if (profile.email) {
      const email = document.createElement("small");
      email.textContent = profile.email;
      button.appendChild(email);
    }
    if (conversationUserIds.has(userId)) {
      const conversationLabel = document.createElement("small");
      conversationLabel.className = "admin-contact-meta";
      conversationLabel.textContent = "Conversation";
      button.appendChild(conversationLabel);
    }
    button.title = profile.email || userId;
    button.addEventListener("click", () => {
      openConversation(userId).catch((error) => {
        setAdminChatStatus(error.message || String(error));
      });
    });
    contactsList.appendChild(button);
  }
}

function renderConversation() {
  conversationWindow.replaceChildren();
  const messages = [...conversationMessages.values()].sort(
    (first, second) => new Date(first.created_at) - new Date(second.created_at)
  );
  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = `message ${message.sender_id === adminUserId ? "user" : "bot"}`;
    const senderProfile = contactDetails.get(message.sender_id);
    const senderName = message.sender_id === adminUserId
      ? "You"
      : senderProfile?.full_name ||
        [senderProfile?.first_name, senderProfile?.last_name].filter(Boolean).join(" ") ||
        senderProfile?.email ||
        "User";
    const sender = document.createElement("small");
    sender.className = "message-sender";
    sender.textContent = senderProfile?.email && message.sender_id !== adminUserId
      ? `${senderName} · ${senderProfile.email}`
      : senderName;
    bubble.appendChild(sender);
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.content;
    bubble.appendChild(text);
    conversationWindow.appendChild(bubble);
  }
  conversationWindow.scrollTop = conversationWindow.scrollHeight;
}

async function loadAdminContacts() {
  contactsStatus.textContent = "Loading conversations...";
  const { data: messages, error } = await window.adminClient
    .from("messages")
    .select("sender_id, created_at")
    .eq("receiver_id", "admin")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load message contacts: ${error.message}`);

  const userIds = [...new Set((messages || []).map((message) => message.sender_id).filter((id) => id !== adminUserId))];
  conversationUserIds = new Set(userIds);
  if (!userIds.length) {
    contactDetails = new Map([...contactDetails].filter(([id]) => !conversationUserIds.has(id)));
    renderAdminContacts();
    contactsStatus.textContent = "No users have messaged admin yet. Search to start a conversation.";
    return;
  }

  const { data: profiles, error: profileError } = await window.adminClient.rpc("admin_public_user_details", {
    p_auth_user_ids: userIds,
    p_public_user_ids: []
  });
  if (profileError) throw new Error(`Could not load user details: ${profileError.message}`);

  const profilesById = new Map((profiles || []).map((profile) => [profile.auth_user_id, profile]));
  for (const id of userIds) {
    contactDetails.set(id, profilesById.get(id) || { id });
  }
  contactsStatus.textContent = "";
  renderAdminContacts();
  if (!selectedUserId || !contactDetails.has(selectedUserId)) {
    await openConversation(userIds[0]);
  }
}

async function searchAdminUsers(query) {
  contactsStatus.textContent = "Searching users...";
  const { data, error } = await window.adminClient.rpc("admin_search_users", {
    p_query: query
  });
  if (error) throw new Error(`Could not search users: ${error.message}`);

  contactDetails = new Map((data || []).map((user) => [user.id, user]));
  if (!contactDetails.size) {
    renderAdminContacts();
    contactsStatus.textContent = "No users found. Try another name or email.";
    return;
  }

  renderAdminContacts();
  contactsStatus.textContent = `${contactDetails.size} user(s) found. Select one to open or start a conversation.`;
}

async function openConversation(userId) {
  selectedUserId = userId;
  conversationMessages = new Map();
  renderAdminContacts();
  conversationWindow.replaceChildren();
  setAdminChatStatus("Loading conversation...");
  const requestId = ++conversationLoad;

  const [incoming, outgoing] = await Promise.all([
    window.adminClient
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .eq("sender_id", userId)
      .eq("receiver_id", "admin"),
    window.adminClient
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .eq("sender_id", adminUserId)
      .eq("receiver_id", userId)
  ]);

  if (requestId !== conversationLoad) return;
  const error = incoming.error || outgoing.error;
  if (error) {
    setAdminChatStatus(`Could not load conversation: ${error.message}`);
    return;
  }

  for (const message of [...(incoming.data || []), ...(outgoing.data || [])]) {
    conversationMessages.set(message.id, message);
  }
  renderConversation();
  setAdminChatStatus(conversationMessages.size ? "" : "No messages in this conversation yet.");
}

function addRealtimeMessage(message) {
  if (!message?.id) return;
  if (message.receiver_id === "admin" && message.sender_id !== adminUserId) {
    if (!contactDetails.has(message.sender_id)) {
      contactDetails.set(message.sender_id, { id: message.sender_id });
      contactsStatus.textContent = "";
      renderAdminContacts();
      window.adminClient.rpc("admin_public_user_details", {
        p_auth_user_ids: [message.sender_id],
        p_public_user_ids: []
      }).then(({ data, error }) => {
        if (error) {
          contactsStatus.textContent = `Could not load sender details: ${error.message}`;
          return;
        }
        if (data?.[0]) {
          contactDetails.set(message.sender_id, data[0]);
          renderAdminContacts();
          if (selectedUserId === message.sender_id) renderConversation();
        }
      }).catch((error) => {
        contactsStatus.textContent = `Could not load sender details: ${error.message || String(error)}`;
      });
    }
    if (!selectedUserId) {
      openConversation(message.sender_id).catch((error) => {
        setAdminChatStatus(error.message || String(error));
      });
    }
  }
  if (
    selectedUserId &&
    ((message.sender_id === selectedUserId && message.receiver_id === "admin") ||
      (message.sender_id === adminUserId && message.receiver_id === selectedUserId))
  ) {
    conversationMessages.set(message.id, message);
    renderConversation();
    setAdminChatStatus("");
  }
}

async function initializeAdminChat() {
  const user = await window.requireAdmin();
  if (!user) return;
  adminUserId = user.id;

  userSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = userSearchForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await searchAdminUsers(userSearchInput.value.trim());
    } catch (error) {
      contactsStatus.textContent = error.message || String(error);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("adminShowConversationsButton").addEventListener("click", () => {
    loadAdminContacts().catch((error) => {
      contactsStatus.textContent = error.message || String(error);
    });
  });

  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = replyInput.value.trim();
    if (!content || !selectedUserId) return;

    const button = replyForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { data, error } = await window.adminClient
        .from("messages")
        .insert({ sender_id: adminUserId, receiver_id: selectedUserId, content })
        .select("id, sender_id, receiver_id, content, created_at")
        .single();
      if (error) throw error;

      replyInput.value = "";
      addRealtimeMessage(data);
      setAdminChatStatus("");
    } catch (error) {
      setAdminChatStatus(`Could not send reply: ${error.message || String(error)}`);
    } finally {
      button.disabled = false;
    }
  });

  adminChatChannel = window.adminClient
    .channel(`admin-messages-${adminUserId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages"
    }, (payload) => addRealtimeMessage(payload.new))
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setAdminChatStatus("Realtime connection failed. Check the messages publication and RLS.");
      }
    });

  await loadAdminContacts();
}

initializeAdminChat().catch((error) => {
  contactsStatus.textContent = error.message || String(error);
  setAdminChatStatus(error.message || String(error));
});
