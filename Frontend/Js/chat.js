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
const proposeDeliveryButton = document.getElementById("proposeDeliveryButton");
const deliveryProposalDialog = document.getElementById("deliveryProposalDialog");
const deliveryProposalForm = document.getElementById("deliveryProposalForm");
const deliveryProposalStatus = document.getElementById("deliveryProposalStatus");
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

function parseListingMessage(message) {
  if (!message) return null;
  try {
    const parsed = JSON.parse(message.content);
    return parsed?.type === "listing_interest" ? parsed : null;
  } catch {
    const match = String(message.content).match(/I'm interested in this listing:\s*([^\r\n]+)[\s\S]*?Listing ID:\s*(\d+)/i);
    return match ? { title: match[1], item_id: match[2] } : null;
  }
}

function parseMessagePayload(message) {
  try {
    return JSON.parse(message.content);
  } catch {
    return null;
  }
}

function hasSharedCurrentListing() {
  if (!currentItemId) return false;
  return [...currentMessages.values()].some((message) => {
    const listing = parseListingMessage(message);
    return message.sender_id === currentUserId && String(listing?.item_id) === currentItemId;
  });
}

function updateBookingProposalButton() {
  if (!proposeDeliveryButton) return;
  const shouldShow = isUuid(currentReceiver) &&
    currentReceiver !== currentUserId &&
    currentItemId &&
    /^\d+$/.test(currentItemId) &&
    hasSharedCurrentListing();
  proposeDeliveryButton.hidden = !shouldShow;
  if (!shouldShow) return;

  const proposals = [...currentMessages.values()]
    .filter((message) => message.sender_id === currentUserId)
    .map((message) => ({ message, payload: parseMessagePayload(message) }))
    .filter(({ payload }) => payload?.type === "rental_booking_proposal" &&
      String(payload.item_id) === currentItemId)
    .sort((first, second) =>
      new Date(second.message.created_at) - new Date(first.message.created_at)
    );
  const latestProposal = proposals[0]?.payload;
  if (latestProposal?.status === "pending_vendor") {
    proposeDeliveryButton.disabled = true;
    proposeDeliveryButton.textContent = "Awaiting vendor";
  } else if (latestProposal?.status === "confirmed") {
    proposeDeliveryButton.disabled = true;
    proposeDeliveryButton.textContent = "Delivery confirmed";
  } else {
    proposeDeliveryButton.disabled = false;
    proposeDeliveryButton.textContent = "Propose delivery";
  }
}

function getListingDetails(message) {
  const details = parseListingMessage(message);
  return message?.sender_id === currentUserId && String(details?.item_id) === currentItemId
    ? details
    : null;
}

function syncListingShareState() {
  if (!shareItemButton || !currentItemId) return;
  if (![...currentMessages.values()].some((message) => getListingDetails(message))) return;
  shareItemButton.dataset.sent = "true";
  shareItemButton.disabled = true;
  shareItemButton.textContent = "Item already sent";
  setChatStatus("You have already sent this listing to its vendor.");
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
    const payload = parseMessagePayload(message);
    if (payload?.type === "listing_interest") {
      listing = payload;
      content = `I'm interested in this listing:\n${payload.title || "Rental item"}\nListing ID: ${payload.item_id}`;
      if (payload.category) content += `\nCategory: ${payload.category}`;
      if (payload.price_per_day != null) content += `\nPrice per day: ₱${payload.price_per_day}`;
    } else if (payload?.type === "rental_booking_proposal") {
      content = `Rental and delivery proposal for ${payload.item_title}.`;
    } else if (payload?.type === "rental_booking_confirmed") {
      content = `Delivery booking confirmed for ${payload.item_title}.`;
    } else if (payload?.type === "rental_booking_declined") {
      content = `The delivery proposal for ${payload.item_title} was declined.`;
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
    if (payload?.type === "rental_booking_proposal") {
      const details = document.createElement("div");
      details.className = "booking-message-details";
      const rentalDays = Math.max(
        1,
        Math.floor((Date.parse(`${payload.rental_end}T00:00:00`) - Date.parse(`${payload.rental_start}T00:00:00`)) / 86400000) + 1
      );
      const detailLines = [
        `${payload.rental_start} to ${payload.rental_end} (${rentalDays} day(s))`,
        `Rental total: ₱${Number(payload.price_per_day || 0) * rentalDays}`,
        `Pickup: ${payload.pickup_address}`,
        `Delivery: ${payload.delivery_address}`,
        `Delivery pickup: ${payload.pickup_time}`,
        payload.notes ? `Notes: ${payload.notes}` : ""
      ].filter(Boolean);
      for (const line of detailLines) {
        const detail = document.createElement("p");
        detail.textContent = line;
        details.appendChild(detail);
      }
      if (payload.status === "pending_vendor" && message.receiver_id === currentUserId) {
        const actions = document.createElement("div");
        actions.className = "booking-message-actions";
        for (const [decision, label] of [["true", "Accept proposal"], ["false", "Decline"]]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.className = decision === "true" ? "booking-accept-button" : "booking-decline-button";
          button.addEventListener("click", () => respondToBooking(payload.booking_id, decision === "true", button));
          actions.appendChild(button);
        }
        details.appendChild(actions);
      } else {
        const status = document.createElement("strong");
        status.className = "booking-message-status";
        status.textContent = payload.status === "confirmed"
          ? `Confirmed${payload.delivery_id ? ` · Delivery #${payload.delivery_id}` : ""}`
          : payload.status === "declined" ? "Declined" : "Awaiting vendor confirmation";
        details.appendChild(status);
      }
      element.appendChild(details);
    }
    chatWindow.appendChild(element);
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addMessage(message) {
  if (!message?.id || !isCurrentConversation(message)) return;
  currentMessages.set(message.id, message);
  const listing = parseListingMessage(message);
  if (listing && !currentItemTitle) {
    currentItemTitle = listing.title || "this item";
    currentItemId = String(listing.item_id);
    currentItemPrice = listing.price_per_day == null ? "" : String(listing.price_per_day);
    currentItemCategory = listing.category || "";
    const canResend = message.sender_id === currentUserId;
    if (canResend) listingReceiver = currentReceiver;
    updateHeader(currentContactName);
    updateShareItemButton(canResend && isUuid(currentReceiver) && currentReceiver !== currentUserId);
    syncListingShareState();
  }
  updateBookingProposalButton();
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
    viewProfileButton.href = `/HTML/profile.html?profile_id=${encodeURIComponent(currentReceiver)}`;
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

  if (!currentItemTitle) {
    const latestListingMessage = [...currentMessages.values()]
      .sort((first, second) => new Date(second.created_at) - new Date(first.created_at))
      .map((message) => ({ message, listing: parseListingMessage(message) }))
      .filter((entry) => entry.listing)
      .find(Boolean);
    if (latestListingMessage) {
      const { message, listing } = latestListingMessage;
      currentItemTitle = listing.title || "this item";
      currentItemId = String(listing.item_id);
      currentItemPrice = listing.price_per_day == null ? "" : String(listing.price_per_day);
      currentItemCategory = listing.category || "";
      const canResend = message.sender_id === currentUserId;
      if (canResend) listingReceiver = receiverId;
      updateHeader(currentContactName);
      updateShareItemButton(canResend && isUuid(receiverId) && receiverId !== currentUserId);
    }
  }
  renderMessages();
  syncListingShareState();
  updateBookingProposalButton();
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
  updateHeader(contact.name, contact.id === "admin" ? "StyliCycle Support" : "Conversation");
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

async function respondToBooking(bookingId, accepted, button) {
  if (!/^\d+$/.test(String(bookingId))) {
    setChatStatus("This booking proposal has an invalid ID.");
    return;
  }
  const buttons = button.closest(".booking-message-actions").querySelectorAll("button");
  buttons.forEach((action) => { action.disabled = true; });
  setChatStatus(accepted ? "Confirming delivery booking..." : "Declining proposal...");
  try {
    const { data, error } = await chatClient.rpc("respond_rental_delivery", {
      p_booking_id: Number(bookingId),
      p_accept: accepted
    });
    if (error) throw error;
    const responseMessage = Array.isArray(data) ? data[0] : data;
    if (!responseMessage) throw new Error("Supabase did not return the booking response.");
    addMessage(responseMessage);
    setChatStatus(accepted
      ? "Booking confirmed. The delivery is now visible to both participants."
      : "The proposal was declined.");
    await loadMessages(currentReceiver);
    await loadContacts();
  } catch (error) {
    setChatStatus(`Could not respond to booking: ${error.message || String(error)}`);
    buttons.forEach((action) => { action.disabled = false; });
  }
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
    updateHeader(currentContactName || requestedName || "Conversation", "Conversation");
  }

  await loadContacts();
  if (!currentReceiver) {
    currentReceiver = "admin";
    currentContactName = "Admin Support";
    updateHeader(currentContactName, "StyliCycle Support");
    renderContacts();
  } else {
    updateHeader(currentContactName || requestedName || "Conversation", currentReceiver === "admin" ? "StyliCycle Support" : "Conversation");
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
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "messages"
    }, (payload) => {
      const message = payload.new;
      if (!isCurrentConversation(message) || !currentMessages.has(message.id)) return;
      currentMessages.set(message.id, message);
      renderMessages();
      updateBookingProposalButton();
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setChatStatus("Real-time connection failed. Check that messages is enabled in Supabase Realtime.");
      }
    });

  await loadMessages(currentReceiver);

  proposeDeliveryButton?.addEventListener("click", () => {
    if (!hasSharedCurrentListing() || !currentItemId || !/^\d+$/.test(currentItemId)) {
      setChatStatus("Send this item to its vendor before proposing a delivery.");
      return;
    }
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    const localDateTime = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    document.getElementById("bookingRentalStart").min = localDate;
    document.getElementById("bookingRentalStart").value = localDate;
    document.getElementById("bookingRentalEnd").min = localDate;
    document.getElementById("bookingRentalEnd").value = localDate;
    document.getElementById("bookingPickupTime").min = localDateTime;
    document.getElementById("bookingPickupTime").value = "";
    deliveryProposalStatus.textContent = "";
    deliveryProposalDialog.showModal();
  });

  document.getElementById("bookingRentalStart")?.addEventListener("change", (event) => {
    const rentalEnd = document.getElementById("bookingRentalEnd");
    rentalEnd.min = event.target.value;
    if (rentalEnd.value && rentalEnd.value < event.target.value) {
      rentalEnd.value = event.target.value;
    }
  });

  document.getElementById("deliveryProposalClose")?.addEventListener("click", () => deliveryProposalDialog.close());
  document.getElementById("deliveryProposalCancel")?.addEventListener("click", () => deliveryProposalDialog.close());
  deliveryProposalDialog?.addEventListener("click", (event) => {
    if (event.target === deliveryProposalDialog) deliveryProposalDialog.close();
  });

  deliveryProposalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasSharedCurrentListing() || !currentItemId || !/^\d+$/.test(currentItemId)) {
      deliveryProposalStatus.textContent = "Send this item to its vendor before proposing a delivery.";
      return;
    }
    const submitButton = deliveryProposalForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    deliveryProposalStatus.textContent = "Sending proposal...";
    try {
      const { data, error } = await chatClient.rpc("propose_rental_delivery", {
        p_item_id: Number(currentItemId),
        p_rental_start: document.getElementById("bookingRentalStart").value,
        p_rental_end: document.getElementById("bookingRentalEnd").value,
        p_pickup_address: document.getElementById("bookingPickupAddress").value.trim(),
        p_delivery_address: document.getElementById("bookingDeliveryAddress").value.trim(),
        p_pickup_time: document.getElementById("bookingPickupTime").value,
        p_notes: document.getElementById("bookingNotes").value.trim() || null
      });
      if (error) throw error;
      const proposalMessage = Array.isArray(data) ? data[0] : data;
      if (!proposalMessage) throw new Error("Supabase did not return the booking proposal.");
      addMessage(proposalMessage);
      deliveryProposalDialog.close();
      deliveryProposalForm.reset();
      await loadMessages(currentReceiver);
      setChatStatus("Proposal sent. The delivery will be scheduled after the vendor accepts.");
    } catch (error) {
      deliveryProposalStatus.textContent = `Could not send proposal: ${error.message || String(error)}`;
    } finally {
      submitButton.disabled = false;
    }
  });

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
        throw new Error("The item share was not returned by Supabase. Run the latest vendor_chat_setup.sql script, then try again.");
      }
      shareItemButton.dataset.sent = "true";
      shareItemButton.textContent = "Item already sent";
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
