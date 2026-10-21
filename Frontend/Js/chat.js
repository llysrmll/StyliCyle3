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
const viewProfileButton = document.getElementById("viewProfileButton");
const chatParams = new URLSearchParams(window.location.search);
const requestedReceiver = chatParams.get("receiver_id") || chatParams.get("partner") || "";
const requestedOwnerId = chatParams.get("partner_id") || "";
const requestedName = chatParams.get("name") || "";
const itemTitle = chatParams.get("item") || "";
const itemId = chatParams.get("item_id") || "";
const itemPrice = chatParams.get("item_price") || "";
const itemCategory = chatParams.get("item_category") || "";
const isAdminChatPage = document.body.classList.contains("admin-message-page");
const shareItemButton = document.getElementById("shareItemButton");

let currentUserId = null;
let currentReceiver = isAdminChatPage ? "admin" : requestedReceiver;
let currentContactName = requestedName;
let listingReceiver = requestedReceiver;
let currentItemTitle = itemTitle;
let currentItemId = itemId;
let currentItemPrice = itemPrice;
let currentItemCategory = itemCategory;
let realtimeChannel = null;
let loadSequence = 0;
const currentMessages = new Map();
const contactDetails = new Map();
const adminUserIds = new Set();

function resolveListingImageUrl(imagePath) {
  const value = String(imagePath || "").trim();
  if (!value) return "";
  if (/^https?:/i.test(value)) {
    try {
      const candidate = new URL(value);
      const storageImageUrl = new URL(
        chatClient.storage.from("item-images").getPublicUrl("image-check").data.publicUrl
      );
      if (candidate.origin === window.location.origin) return candidate.href;
      if (
        candidate.origin === storageImageUrl.origin &&
        candidate.pathname.includes("/storage/v1/object/public/item-images/")
      ) {
        return candidate.href;
      }
      return "";
    } catch {
      return "";
    }
  }
  if (/^(?:\/)?Frontend\/Images\//i.test(value)) {
    return `/Images/${value.replace(/^(?:\/)?Frontend\/Images\//i, "").split("/").map(encodeURIComponent).join("/")}`;
  }
  if (/^Images\//i.test(value)) {
    return `/${value.split("/").map(encodeURIComponent).join("/")}`;
  }
  if (value.startsWith("/")) return value;
  return chatClient.storage.from("item-images").getPublicUrl(value).data.publicUrl;
}

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
    let content = message.content;
    let listing = null;
    try {
      const parsed = JSON.parse(content);
      if (parsed?.type === "listing_interest") {
        listing = parsed;
        content = `I'm interested in this listing:\n${parsed.title || "Rental item"}\nListing ID: ${parsed.item_id}`;
        if (parsed.category) content += `\nCategory: ${parsed.category}`;
        if (parsed.price_per_day != null) content += `\nPrice per day: ₱${parsed.price_per_day}`;
      }
    } catch {
      // Regular messages are plain text.
    }
    text.textContent = content;
    element.appendChild(text);
    if (listing?.image_path) {
      const imageUrl = resolveListingImageUrl(listing.image_path);
      if (imageUrl) {
        const image = document.createElement("img");
        image.className = "message-listing-image";
        image.src = imageUrl;
        image.alt = listing.title ? `Listing photo: ${listing.title}` : "Listing photo";
        image.loading = "lazy";
        element.appendChild(image);
      }
    }
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
  if (chatPartnerContext) chatPartnerContext.textContent = currentItemTitle ? `Regarding ${currentItemTitle}` : context;
  if (viewProfileButton) {
    viewProfileButton.hidden = !isUuid(currentReceiver);
    viewProfileButton.onclick = () => {
      window.location.href = `/HTML/profile.html?user_id=${encodeURIComponent(currentReceiver)}`;
    };
  }
}

function updateShareItemButton(visible) {
  if (!shareItemButton) return;
  shareItemButton.hidden = !visible;
  chatForm?.classList.toggle("has-item-share", visible);
  if (visible && shareItemButton.dataset.sent !== "true") {
    shareItemButton.disabled = false;
    shareItemButton.textContent = "Send this item";
  }
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
  currentItemTitle = contact.id === listingReceiver ? itemTitle : "";
  currentItemId = contact.id === listingReceiver ? itemId : "";
  currentItemPrice = contact.id === listingReceiver ? itemPrice : "";
  currentItemCategory = contact.id === listingReceiver ? itemCategory : "";
  updateShareItemButton(Boolean(
    currentItemId &&
    /^\d+$/.test(currentItemId) &&
    isUuid(contact.id) &&
    contact.id !== currentUserId
  ));
  updateHeader(contact.name, contact.id === "admin" ? "StyliCycle Support" : "Vendor");
  renderContacts();
  const params = new URLSearchParams(window.location.search);
  params.delete("partner_id");
  params.set("receiver_id", contact.id);
  params.set("name", contact.name);
  if (currentItemTitle) params.set("item", currentItemTitle);
  else params.delete("item");
  if (currentItemId) params.set("item_id", currentItemId);
  else params.delete("item_id");
  if (currentItemPrice) params.set("item_price", currentItemPrice);
  else params.delete("item_price");
  if (currentItemCategory) params.set("item_category", currentItemCategory);
  else params.delete("item_category");
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

  if (requestedOwnerId) {
    if (!/^\d+$/.test(requestedOwnerId)) {
      throw new Error("The requested vendor ID is invalid.");
    }
    const { data: vendors, error: vendorError } = await chatClient.rpc("vendor_chat_details", {
      p_owner_id: Number(requestedOwnerId)
    });
    if (vendorError) throw new Error(`Could not load the vendor: ${vendorError.message}`);
    const vendor = vendors?.[0];
    if (!vendor?.auth_user_id) {
      throw new Error("This listing owner is not linked to a messaging account yet.");
    }
    currentReceiver = vendor.auth_user_id;
    listingReceiver = currentReceiver;
    currentContactName = chatParams.get("name") || vendor.vendor_name;
  } else if (requestedReceiver === "admin" || (!requestedReceiver && isAdminChatPage)) {
    currentReceiver = "admin";
    currentContactName = "Admin Support";
  } else if (requestedReceiver && !isUuid(requestedReceiver)) {
    throw new Error("The requested chat partner ID is invalid.");
  } else if (isUuid(requestedReceiver)) {
    listingReceiver = requestedReceiver;
  }

  updateShareItemButton(Boolean(
    currentItemId &&
    /^\d+$/.test(currentItemId) &&
    isUuid(currentReceiver) &&
    currentReceiver !== currentUserId
  ));

  if (currentReceiver === "admin") {
    updateHeader("Admin Support", "StyliCycle Support");
  } else if (currentReceiver) {
    updateHeader(currentContactName || requestedName || "Vendor", "Vendor");
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

  shareItemButton?.addEventListener("click", async () => {
    if (!currentItemId || !/^\d+$/.test(currentItemId) ||
        !isUuid(currentReceiver) || currentReceiver === currentUserId) {
      setChatStatus("Select the vendor for the item you want to share.");
      return;
    }
    shareItemButton.disabled = true;
    try {
      const { data, error: insertError } = await chatClient.rpc("send_listing_interest", {
        p_item_id: Number(currentItemId)
      });
      if (insertError) throw insertError;
      const insertedMessage = Array.isArray(data) ? data[0] : data;
      if (!insertedMessage) {
        shareItemButton.dataset.sent = "true";
        shareItemButton.textContent = "Item already sent";
        setChatStatus("You have already sent this listing to its vendor.");
        return;
      }
      shareItemButton.dataset.sent = "true";
      shareItemButton.textContent = "Item sent";
      addMessage(insertedMessage);
      setChatStatus("Listing sent to the vendor.");
      await loadContacts();
    } catch (error) {
      setChatStatus(`Could not send the listing: ${error.message || String(error)}`);
    } finally {
      shareItemButton.disabled = shareItemButton.dataset.sent === "true";
    }
  });

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
