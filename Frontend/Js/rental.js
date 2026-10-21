const rentalClient = window.stylicycleSupabase;
const listingsElement = document.getElementById("rentalListings");
const listingsHeading = document.querySelector(".listings-panel h3");
const listingsStatus = document.getElementById("rentalListingsStatus");
const rentalForm = document.getElementById("rentalForm");
const searchTerm = new URLSearchParams(window.location.search).get("search")?.trim() || "";
let currentPublicUserId = null;
let showingSearchResults = Boolean(searchTerm);

function setListingsStatus(message) {
  if (listingsStatus) listingsStatus.textContent = message;
}

function renderListings(items) {
  listingsElement.replaceChildren();
  for (const item of items) {
    const listItem = document.createElement("li");
    const card = document.createElement("article");
    card.className = "listing-card";

    if (item.image_path) {
      const image = document.createElement("img");
      image.src = item.image_path;
      image.alt = item.title || "Rental listing";
      image.loading = "lazy";
      card.appendChild(image);
    }

    const content = document.createElement("div");
    content.className = "listing-card-content";
    const title = document.createElement("strong");
    title.textContent = item.title || "Untitled listing";
    const details = document.createElement("span");
    details.textContent = `${item.description || item.category || ""} — ₱${item.price_per_day}/day · Size ${item.size || "-"}`;
    content.append(title, details);
    card.appendChild(content);
    listItem.appendChild(card);
    listingsElement.appendChild(listItem);
  }
}

async function getPublicUserId() {
  const { data, error } = await rentalClient.rpc("current_public_user_id");
  if (error) throw new Error(`Could not link your account to its rental profile: ${error.message}`);
  if (!data) throw new Error("Your account profile is not linked yet. Contact support to repair the account link.");
  return data;
}

async function loadMyListings() {
  showingSearchResults = false;
  if (listingsHeading) listingsHeading.textContent = "My Listings";
  setListingsStatus("Loading your listings...");

  const { data, error } = await rentalClient
    .from("items")
    .select("id, title, category, price_per_day, size, description, image_path, status, created_at")
    .eq("owner_id", currentPublicUserId)
    .order("created_at", { ascending: false });

  if (error) {
    setListingsStatus(`Could not load your listings: ${error.message}`);
    return;
  }
  renderListings(data || []);
  setListingsStatus(data?.length ? `${data.length} listing(s)` : "You have no saved listings yet.");
}

async function searchListings(query) {
  showingSearchResults = true;
  if (listingsHeading) listingsHeading.textContent = `Search Results for “${query}”`;
  setListingsStatus("Searching rentals...");

  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const [titleResults, categoryResults] = await Promise.all([
    rentalClient
      .from("items")
      .select("id, title, category, price_per_day, size, description, image_path, status, created_at")
      .eq("status", "available")
      .ilike("title", pattern)
      .order("created_at", { ascending: false }),
    rentalClient
      .from("items")
      .select("id, title, category, price_per_day, size, description, image_path, status, created_at")
      .eq("status", "available")
      .ilike("category", pattern)
      .order("created_at", { ascending: false })
  ]);

  const error = titleResults.error || categoryResults.error;
  if (error) {
    setListingsStatus(`Could not search rentals: ${error.message}`);
    return;
  }

  const itemsById = new Map();
  for (const item of [...(titleResults.data || []), ...(categoryResults.data || [])]) {
    itemsById.set(item.id, item);
  }
  const items = [...itemsById.values()].sort(
    (first, second) => new Date(second.created_at) - new Date(first.created_at)
  );
  renderListings(items);
  setListingsStatus(items.length ? `${items.length} result(s)` : "No matching rentals found.");
}

async function refreshListings() {
  if (searchTerm && showingSearchResults) {
    await searchListings(searchTerm);
  } else {
    await loadMyListings();
  }
}

if (rentalForm) {
  rentalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = rentalForm.querySelector('button[type="submit"]');
    const formData = new FormData(rentalForm);
    const imageFile = formData.get("image");
    submitButton.disabled = true;
    setListingsStatus("Publishing your listing...");

    let uploadedPath = null;
    try {
      const { data: userData, error: userError } = await rentalClient.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        window.location.replace("/HTML/login.html");
        return;
      }

      const ownerId = await getPublicUserId();
      let imagePath = null;
      if (imageFile instanceof File && imageFile.size > 0) {
        const extensionByType = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp"
        };
        const extension = extensionByType[imageFile.type];
        if (!extension) throw new Error("Choose a JPG, PNG, or WEBP image.");
        if (imageFile.size > 3 * 1024 * 1024) throw new Error("Image must be 3 MB or smaller.");

        uploadedPath = `${userData.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await rentalClient.storage
          .from("item-images")
          .upload(uploadedPath, imageFile, {
            contentType: imageFile.type,
            cacheControl: "3600",
            upsert: false
          });
        if (uploadError) throw new Error(`Could not upload image: ${uploadError.message}`);
        imagePath = rentalClient.storage.from("item-images").getPublicUrl(uploadedPath).data.publicUrl;
      }

      const item = {
        owner_id: ownerId,
        title: String(formData.get("title") || "").trim(),
        category: String(formData.get("category") || "").trim(),
        price_per_day: Number(formData.get("price_per_day")),
        size: String(formData.get("size") || "").trim(),
        chest_cm: formData.get("chest_cm") ? Number(formData.get("chest_cm")) : null,
        waist_cm: formData.get("waist_cm") ? Number(formData.get("waist_cm")) : null,
        length_cm: formData.get("length_cm") ? Number(formData.get("length_cm")) : null,
        description: String(formData.get("description") || "").trim(),
        image_path: imagePath,
        status: "available"
      };

      const { error: insertError } = await rentalClient.from("items").insert(item);
      if (insertError) throw new Error(`Could not save listing: ${insertError.message}`);

      rentalForm.reset();
      setListingsStatus("Your listing was published.");
      await loadMyListings();
    } catch (error) {
      let cleanupMessage = "";
      if (uploadedPath) {
        const { error: cleanupError } = await rentalClient.storage.from("item-images").remove([uploadedPath]);
        if (cleanupError) cleanupMessage = ` The uploaded image could not be cleaned up: ${cleanupError.message}`;
      }
      setListingsStatus(`${error.message || String(error)}${cleanupMessage}`);
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.getElementById("rentalMyListingsBtn")?.addEventListener("click", () => {
  window.history.replaceState({}, "", window.location.pathname);
  loadMyListings();
  listingsElement.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("rentalViewMessagesBtn")?.addEventListener("click", () => {
  window.location.href = "/HTML/chatbox.html";
});

document.getElementById("rentalNotificationsBtn")?.addEventListener("click", () => {
  document.getElementById("navNotificationBtn")?.click();
});

async function initializeRentals() {
  const { data, error } = await rentalClient.auth.getUser();
  if (error) throw error;
  if (!data.user) {
    window.location.replace("/HTML/login.html");
    return;
  }

  currentPublicUserId = await getPublicUserId();
  await refreshListings();
}

initializeRentals().catch((error) => {
  setListingsStatus(error.message || String(error));
});
