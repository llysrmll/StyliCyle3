const rentalClient = window.stylicycleSupabase;
const listingsElement = document.getElementById("rentalListings");
const listingsHeading = document.querySelector(".listings-panel h3");
const listingsStatus = document.getElementById("rentalListingsStatus");
const rentalForm = document.getElementById("rentalForm");
const rentalTermsDialog = document.getElementById("rentalTermsDialog");
const rentalTermsCheckbox = document.getElementById("agreeTermsRental");
const openTermsModal = document.getElementById("openTermsModal");

openTermsModal?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  rentalTermsDialog?.showModal();
});

document.getElementById("closeTermsModal")?.addEventListener("click", () => {
  rentalTermsDialog?.close();
});

document.getElementById("dismissTermsModal")?.addEventListener("click", () => {
  rentalTermsDialog?.close();
});

document.getElementById("agreeRentalTermsButton")?.addEventListener("click", () => {
  if (!rentalTermsCheckbox) return;
  rentalTermsCheckbox.checked = true;
  rentalTermsCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
  rentalTermsDialog?.close();
});

const initialRentalParams = new URLSearchParams(window.location.search);
let searchTerm = initialRentalParams.get("search")?.trim() || "";
let selectedCategory = initialRentalParams.get("category")?.trim() || "";
let currentPublicUserId = null;
const rentalSearchForm = document.getElementById("rentalSearchForm");
const rentalSearchInput = document.getElementById("rentalSearchInput");
const categoryPills = [...document.querySelectorAll(".rental-category-pill")];
const validCategories = new Set(categoryPills.map((pill) => pill.dataset.category).filter(Boolean));
if (!validCategories.has(selectedCategory)) selectedCategory = "";
let showingSearchResults = Boolean(searchTerm || selectedCategory);

function updateRentalUrl() {
  const params = new URLSearchParams();
  if (searchTerm) params.set("search", searchTerm);
  if (selectedCategory) params.set("category", selectedCategory);
  const query = params.toString();
  window.history.replaceState({}, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

function updateCategoryPills() {
  for (const pill of categoryPills) {
    const active = pill.dataset.category === selectedCategory;
    pill.classList.toggle("active", active);
    pill.setAttribute("aria-pressed", String(active));
  }
}

function setListingsStatus(message) {
  if (listingsStatus) listingsStatus.textContent = message;
}

function renderListings(items) {
  listingsElement.replaceChildren();
  for (const item of items) {
    const listItem = document.createElement("li");
    const canMessageVendor = item.owner_id && String(item.owner_id) !== String(currentPublicUserId);
    const card = document.createElement(canMessageVendor ? "a" : "article");
    card.className = "listing-card listing-card-clickable";
    if (canMessageVendor) {
      const params = new URLSearchParams({
        partner_id: String(item.owner_id),
        name: item.vendor_name || "Vendor",
        item: item.title || "",
        item_id: String(item.id),
        item_price: String(item.price_per_day ?? ""),
        item_category: item.category || ""
      });
      card.href = `/HTML/chatbox.html?${params.toString()}`;
      card.setAttribute("aria-label", `Message ${item.vendor_name || "the vendor"} about ${item.title || "this listing"}`);
      card.addEventListener("click", async (event) => {
        event.preventDefault();
        card.setAttribute("aria-busy", "true");
        try {
          const { data: claimed, error: claimError } = await rentalClient.rpc("claim_rental_item", {
            p_item_id: item.id
          });
          if (claimError) throw claimError;
          if (claimed !== true) {
            await window.showModal("Listing unavailable", "This rental is no longer available.", "error");
            await refreshListings();
            return;
          }
          window.location.href = card.href;
        } catch (error) {
          await window.showModal("Could not start rental chat", error.message || String(error), "error");
        } finally {
          card.removeAttribute("aria-busy");
        }
      });
    } else {
      card.classList.remove("listing-card-clickable");
    }

    if (item.image_path) {
      const image = document.createElement("img");
      image.src = resolveListingImageUrl(item.image_path);
      image.alt = item.title || "Rental listing";
      image.loading = "lazy";
      image.onerror = () => {
        image.onerror = null;
        image.src = "/Images/avatar-placeholder.svg";
        image.alt = "Listing image unavailable";
      };
      card.appendChild(image);
    }

    function resolveListingImageUrl(imagePath) {
      const value = String(imagePath || "").trim();
      if (!value) return "";
      if (/^(https?:|data:|blob:)/i.test(value)) return value;
      const imageMarker = value.match(/(?:^|\/)Frontend\/Images\/(.+)$/i);
      if (imageMarker) return `/Images/${imageMarker[1].split("/").map(encodeURIComponent).join("/")}`;
      if (/^Images\//i.test(value)) {
        return `/${value.split("/").map(encodeURIComponent).join("/")}`;
      }
      return value.startsWith("/") ? value : `/${value.split("/").map(encodeURIComponent).join("/")}`;
    }

    const content = document.createElement("div");
    content.className = "listing-card-content";
    const title = document.createElement("strong");
    title.textContent = item.title || "Untitled listing";
    const details = document.createElement("span");
    details.textContent = `${item.description || item.category || ""} — ₱${item.price_per_day}/day · Size ${item.size || "-"}`;
    content.append(title, details);
    if (canMessageVendor) {
      const vendor = document.createElement("span");
      vendor.className = "listing-vendor";
      vendor.textContent = `Message ${item.vendor_name || "vendor"}`;
      content.appendChild(vendor);
    }
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
    .select("id, owner_id, title, category, price_per_day, size, description, image_path, status, created_at")
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
  searchTerm = query;
  showingSearchResults = true;
  const filters = [];
  if (query) filters.push(`“${query}”`);
  if (selectedCategory) filters.push(selectedCategory);
  if (listingsHeading) listingsHeading.textContent = filters.length ? `Search Results: ${filters.join(" · ")}` : "Available Rentals";
  setListingsStatus("Searching rentals...");

  const { data, error } = await rentalClient.rpc("search_rentals_with_vendors", {
    p_query: query,
    p_category: selectedCategory || null
  });
  if (error) {
    setListingsStatus(`Could not search rentals: ${error.message}`);
    return;
  }
  renderListings(data || []);
  setListingsStatus(data?.length ? `${data.length} result(s)` : "No matching rentals found.");
}

async function refreshListings() {
  if (showingSearchResults) {
    await searchListings(searchTerm);
  } else {
    await loadMyListings();
  }
}

if (rentalForm) {
  rentalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const requiredValidation = window.validateRequiredFields(rentalForm);
    if (requiredValidation !== true) {
      await requiredValidation;
      return;
    }
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
  searchTerm = "";
  selectedCategory = "";
  showingSearchResults = false;
  updateCategoryPills();
  if (rentalSearchInput) rentalSearchInput.value = "";
  updateRentalUrl();
  loadMyListings();
  listingsElement.scrollIntoView({ behavior: "smooth", block: "center" });
});

rentalSearchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = rentalSearchInput?.value.trim() || "";
  if (!query && !selectedCategory) {
    setListingsStatus("Enter a title or select a category to search.");
    rentalSearchInput?.focus();
    return;
  }

  searchTerm = query;
  updateRentalUrl();
  await searchListings(query);
  listingsElement.scrollIntoView({ behavior: "smooth", block: "center" });
});

for (const pill of categoryPills) {
  pill.addEventListener("click", async () => {
    searchTerm = rentalSearchInput?.value.trim() || "";
    selectedCategory = pill.dataset.category || "";
    showingSearchResults = true;
    updateCategoryPills();
    updateRentalUrl();
    await searchListings(searchTerm);
    listingsElement.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

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
  if (rentalSearchInput) rentalSearchInput.value = searchTerm;
  updateCategoryPills();
  await refreshListings();
}

initializeRentals().catch((error) => {
  setListingsStatus(error.message || String(error));
});
