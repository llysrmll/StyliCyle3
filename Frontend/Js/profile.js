// profile.js - load on profile.html (after common.js)

// ---------- Name and contact number ----------
const profileNameEl = document.getElementById("profileName");
const contactNumberEl = document.getElementById("contactNumber");

if (profileNameEl) {
  const savedName = localStorage.getItem("userName") || profileNameEl.value || "Guest User";
  profileNameEl.value = savedName;
  profileNameEl.addEventListener("blur", function () {
    const name = profileNameEl.value.trim() || "Guest User";
    profileNameEl.value = name;
    localStorage.setItem("userName", name);
  });
}

if (contactNumberEl) {
  contactNumberEl.value = localStorage.getItem("contactNumber") || contactNumberEl.value || "";
  contactNumberEl.addEventListener("blur", function () {
    localStorage.setItem("contactNumber", contactNumberEl.value.trim());
  });
}

// ---------- Profile picture ----------
const profileImageInput = document.getElementById("profileImageInput");
const profileAvatarImg = document.getElementById("profileAvatarImg");
if (profileImageInput && profileAvatarImg) {
  const savedImage = localStorage.getItem("profileImageData");
  if (savedImage) {
    profileAvatarImg.src = savedImage;
  }

  profileImageInput.addEventListener("change", function () {
    const file = this.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
      const result = event.target?.result;
      if (typeof result === "string") {
        profileAvatarImg.src = result;
        localStorage.setItem("profileImageData", result);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Posts ----------
const profilePosts = [
  {
    title: "Silver Sequin Gown",
    detail: "Perfect for parties and evening events.",
    image: "evening.jpg"
  },
  {
    title: "Black Tuxedo Suit",
    detail: "Sharp wedding and formal event attire.",
    image: "tuxedo.jpg"
  },
  {
    title: "Ivory Bridal Gown",
    detail: "Elegant and timeless bridal choice.",
    image: "bridal.jpg"
  }
];

const postsContainer = document.getElementById("postsContainer");
if (postsContainer) {
  postsContainer.innerHTML = "";
  profilePosts.forEach((item) => {
    const card = document.createElement("div");
    card.className = "profile-post-card";
    card.innerHTML = `
      <img src="${item.image}" alt="${item.title}">
      <div class="profile-post-card-content">
        <strong>${item.title}</strong>
        <span>${item.detail}</span>
      </div>
    `;
    postsContainer.appendChild(card);
  });
}

// Create a post
const imageUploadBtn = document.getElementById("imageUploadBtn");
const postImage = document.getElementById("postImage");
imageUploadBtn?.addEventListener("click", () => {
  postImage?.click();
});

document.getElementById("submitPostBtn")?.addEventListener("click", () => {
  const content = document.getElementById("postContent")?.value.trim();
  const file = postImage?.files?.[0];
  if (content || file) {
    showToast("Post submitted successfully!");
    document.getElementById("postContent").value = "";
    postImage.value = "";
  } else {
    showToast("Please add some content or an image to post.");
  }
});

// ---------- Navigation ----------
document.getElementById("profileAdminChatBtn")?.addEventListener("click", () => {
  window.location.href = "message.html";
});