const profileClient = window.stylicycleSupabase;
const profileStatus = document.getElementById("profileStatus");
const portfolioList = document.getElementById("portfolioList");
const portfolioStatus = document.getElementById("portfolioStatus");
const editModal = document.getElementById("profileEditModal");
const editForm = document.getElementById("profileEditForm");
const editStatus = document.getElementById("profileEditStatus");
const avatarPlaceholder = "/Images/avatar-placeholder.svg";
let currentAuthUser = null;
let currentProfile = null;
let isOwnProfile = true;

function setText(id, value, fallback = "Not provided") {
  const element = document.getElementById(id);
  if (element) element.textContent = value || fallback;
}

function setEditStatus(message) {
  if (editStatus) editStatus.textContent = message;
}

function formatMemberSince(value) {
  if (!value) return "Member date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Member date unavailable"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function displayName(profile) {
  return profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    profile.business_name ||
    (isOwnProfile ? currentAuthUser?.user_metadata?.full_name || currentAuthUser?.email : "") ||
    "StyliCycle Member";
}

function renderProfile(profile) {
  currentProfile = profile;
  setText("profileName", displayName(profile));
  setText("profileBusiness", profile.business_name, "Business name not provided");
  setText("profilePhone", profile.phone, "Phone not provided");
  setText("profileEmail", profile.email || currentAuthUser?.email, "Email unavailable");
  setText("profileBio", profile.bio, "No bio added yet.");
  setText("profileLocation", profile.location);
  setText("profileSpecialty", profile.specialty);
  setText("profileMemberSince", formatMemberSince(profile.member_since));

  const image = document.getElementById("profileImage");
  image.src = profile.avatar_url || avatarPlaceholder;
  image.alt = `${displayName(profile)} profile picture`;
  image.onerror = () => {
    image.onerror = null;
    image.src = avatarPlaceholder;
  };
}

function renderPortfolio(items) {
  portfolioList.replaceChildren();
  if (!items.length) {
    portfolioStatus.textContent = "No rental listings have been added to this portfolio yet.";
    return;
  }

  for (const item of items) {
    const entry = document.createElement("li");
    entry.className = "portfolio-item";
    const title = document.createElement("span");
    title.className = "item-name";
    title.textContent = item.title || "Untitled listing";
    const description = document.createElement("span");
    description.className = "item-desc";
    description.textContent = item.description || item.category || "No description provided.";
    entry.append(title, description);
    portfolioList.appendChild(entry);
  }
  portfolioStatus.textContent = `${items.length} portfolio item(s)`;
}

function fillEditForm(profile) {
  document.getElementById("editFullName").value = displayName(profile);
  document.getElementById("editBusinessName").value = profile.business_name || "";
  document.getElementById("editPhone").value = profile.phone || "";
  document.getElementById("editLocation").value = profile.location || "";
  document.getElementById("editSpecialty").value = profile.specialty || "";
  document.getElementById("editBio").value = profile.bio || "";
  document.getElementById("editAvatar").value = "";
  setEditStatus("");
}

async function loadProfile() {
  const { data: authResult, error: authError } = await profileClient.auth.getUser();
  if (authError) throw authError;
  if (!authResult.user) {
    window.location.replace("/HTML/login.html");
    return;
  }
  currentAuthUser = authResult.user;

  const targetUserId = new URLSearchParams(window.location.search).get("user_id");
  if (targetUserId && targetUserId !== currentAuthUser.id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      throw new Error("The requested profile ID is invalid.");
    }
    isOwnProfile = false;
    document.getElementById("profileEditBtn").hidden = true;
    document.getElementById("profileAdminChatBtn").hidden = true;
    document.getElementById("profileManageRentalsBtn").hidden = true;
    document.getElementById("profileMessageBtn").hidden = false;
    editModal.hidden = true;

    const { data: profileRows, error: profileError } = await profileClient.rpc("chat_partner_profile", {
      p_auth_user_id: targetUserId
    });
    if (profileError) throw profileError;
    const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
    if (!profile) {
      throw new Error("This profile is not available to your account.");
    }

    renderProfile(profile);
    setText("profileEmail", "Contact via chat");
    document.getElementById("profileMessageBtn").href =
      `/HTML/chatbox.html?receiver_id=${encodeURIComponent(targetUserId)}&name=${encodeURIComponent(displayName(profile))}`;
    const { data: items, error: itemsError } = await profileClient.rpc("chat_partner_portfolio", {
      p_auth_user_id: targetUserId
    });
    if (itemsError) throw itemsError;
    renderPortfolio(items || []);
    if (profileStatus) profileStatus.textContent = "";
    return;
  }

  const { data: publicUserId, error: mappingError } = await profileClient.rpc("current_public_user_id");
  if (mappingError) throw mappingError;
  if (!publicUserId) {
    document.getElementById("profileName").textContent = "Profile not linked";
    profileStatus.textContent = "Your login is not linked to a vendor profile yet. Contact support to link your account.";
    document.getElementById("profileEditBtn").disabled = true;
    portfolioStatus.textContent = "Portfolio unavailable until your profile is linked.";
    return;
  }

  const { data: profileRows, error: profileError } = await profileClient.rpc("current_vendor_profile");
  if (profileError) throw profileError;
  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
  if (!profile) {
    document.getElementById("profileName").textContent = "Profile not found";
    profileStatus.textContent = "We could not find a profile for your login. Contact support to repair the account link.";
    document.getElementById("profileEditBtn").disabled = true;
    portfolioStatus.textContent = "Portfolio unavailable until your profile is restored.";
    return;
  }

  renderProfile(profile);
  const { data: items, error: itemsError } = await profileClient
    .from("items")
    .select("id, title, category, description, created_at")
    .eq("owner_id", publicUserId)
    .order("created_at", { ascending: false });
  if (itemsError) throw itemsError;
  renderPortfolio(items || []);
}

document.getElementById("profileEditBtn")?.addEventListener("click", () => {
  if (!currentProfile) return;
  fillEditForm(currentProfile);
  editModal.showModal();
});

document.getElementById("profileEditClose")?.addEventListener("click", () => editModal.close());
document.getElementById("profileEditCancel")?.addEventListener("click", () => editModal.close());
editModal?.addEventListener("click", (event) => {
  if (event.target === editModal) editModal.close();
});

editForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = editForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  setEditStatus("Saving your profile...");

  let uploadedPath = null;
  let profileSaved = false;
  try {
    const formData = new FormData(editForm);
    const avatarFile = formData.get("avatar");
    let avatarUrl = currentProfile.avatar_url;

    if (avatarFile instanceof File && avatarFile.size > 0) {
      const extensionByType = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };
      const extension = extensionByType[avatarFile.type];
      if (!extension) throw new Error("Choose a JPG, PNG, or WEBP profile picture.");
      if (avatarFile.size > 4 * 1024 * 1024) throw new Error("Profile pictures must be 4 MB or smaller.");

      uploadedPath = `${currentAuthUser.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await profileClient.storage
        .from("avatars")
        .upload(uploadedPath, avatarFile, {
          contentType: avatarFile.type,
          cacheControl: "3600",
          upsert: false
        });
      if (uploadError) throw new Error(`Could not upload profile picture: ${uploadError.message}`);
      avatarUrl = profileClient.storage.from("avatars").getPublicUrl(uploadedPath).data.publicUrl;
    }

    const { error: updateError } = await profileClient.rpc("update_current_vendor_profile", {
      p_full_name: String(formData.get("full_name") || "").trim(),
      p_business_name: String(formData.get("business_name") || "").trim() || null,
      p_phone: String(formData.get("phone") || "").trim() || null,
      p_location: String(formData.get("location") || "").trim() || null,
      p_specialty: String(formData.get("specialty") || "").trim() || null,
      p_bio: String(formData.get("bio") || "").trim() || null,
      p_avatar_url: avatarUrl || null
    });
    if (updateError) throw updateError;
    profileSaved = true;

    const { data: updatedRows, error: reloadError } = await profileClient.rpc("current_vendor_profile");
    if (reloadError) throw reloadError;
    const updatedProfile = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
    if (!updatedProfile) throw new Error("Profile saved, but could not reload it. Refresh the page to verify.");
    renderProfile(updatedProfile);
    editModal.close();
    if (typeof showToast === "function") showToast("Profile updated.");
  } catch (error) {
    let cleanupMessage = "";
    if (uploadedPath && !profileSaved) {
      const { error: cleanupError } = await profileClient.storage.from("avatars").remove([uploadedPath]);
      if (cleanupError) cleanupMessage = ` The new image could not be cleaned up: ${cleanupError.message}`;
    }
    setEditStatus(`${error.message || String(error)}${cleanupMessage}`);
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("profileAdminChatBtn")?.addEventListener("click", () => {
  window.location.href = "/HTML/chatbox.html?partner=admin";
});

loadProfile().catch((error) => {
  if (profileStatus) profileStatus.textContent = `Could not load profile: ${error.message || String(error)}`;
  if (portfolioStatus) portfolioStatus.textContent = "Could not load portfolio.";
});
