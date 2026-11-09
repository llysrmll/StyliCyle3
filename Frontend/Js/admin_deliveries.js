const deliveriesBody = document.getElementById("adminDeliveriesBody");
const deliveriesStatus = document.getElementById("adminDeliveriesStatus");
const deliveryStatuses = ["Pending", "Preparing", "Out for Delivery", "Delivered"];

async function updateDeliveryStatus(deliveryId, status, select) {
  select.disabled = true;
  deliveriesStatus.textContent = "";
  try {
    const { error } = await window.adminClient
      .from("deliveries")
      .update({ status })
      .eq("id", deliveryId)
      .select("id")
      .single();

    if (error) throw error;
    select.dataset.originalStatus = status;
    deliveriesStatus.textContent = `Delivery ${deliveryId} updated to ${status}.`;
  } catch (error) {
    deliveriesStatus.textContent = `Could not update delivery: ${error.message || String(error)}`;
    select.value = select.dataset.originalStatus;
  } finally {
    select.disabled = false;
  }
}

async function verifyDeliveryReturn(deliveryId, button) {
  button.disabled = true;
  deliveriesStatus.textContent = "";
  try {
    const { error } = await window.adminClient.rpc("admin_verify_delivery_return", {
      p_delivery_id: deliveryId
    });
    if (error) throw error;
    await loadAdminDeliveries();
    deliveriesStatus.textContent = `Return for delivery ${deliveryId} marked as resolved.`;
  } catch (error) {
    deliveriesStatus.textContent = `Could not resolve return: ${error.message || String(error)}`;
    button.disabled = false;
  }
}

async function loadAdminDeliveries() {
  deliveriesStatus.textContent = "Loading deliveries...";
  const { data, error } = await window.adminClient
    .from("deliveries")
    .select("id, user_id, auth_user_id, pickup_address, delivery_address, pickup_time, item_type, status, return_condition, return_photo_url, admin_verified, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    deliveriesStatus.textContent = `Could not load deliveries: ${error.message}`;
    return;
  }

  const authUserIds = [...new Set((data || []).map((delivery) => delivery.auth_user_id).filter(Boolean))];
  const publicUserIds = [...new Set((data || []).map((delivery) => delivery.user_id).filter(Boolean))];
  const { data: userDetails, error: detailsError } = await window.adminClient.rpc("admin_public_user_details", {
    p_auth_user_ids: authUserIds,
    p_public_user_ids: publicUserIds
  });
  if (detailsError) {
    deliveriesStatus.textContent = `Could not load delivery user names: ${detailsError.message}`;
    return;
  }
  const usersByAuthId = new Map((userDetails || []).map((user) => [user.auth_user_id, user]));
  const usersByPublicId = new Map((userDetails || []).map((user) => [String(user.public_user_id), user]));

  deliveriesBody.replaceChildren();
  for (const delivery of data || []) {
    const row = document.createElement("tr");
    const user = usersByAuthId.get(delivery.auth_user_id) || usersByPublicId.get(String(delivery.user_id));
    const values = [
      delivery.id,
      delivery.pickup_address,
      delivery.delivery_address,
      delivery.pickup_time ? new Date(delivery.pickup_time).toLocaleString() : "—",
      delivery.item_type || "—"
    ];
    for (let index = 0; index < values.length; index += 1) {
      const cell = document.createElement("td");
      cell.textContent = values[index] ?? "—";
      if (index === 0) {
        row.appendChild(cell);
        const userCell = document.createElement("td");
        const userName = document.createElement("span");
        userName.textContent = user?.full_name || user?.email || "Unknown user";
        userCell.appendChild(userName);
        if (user?.email && user.full_name) {
          const userEmail = document.createElement("small");
          userEmail.textContent = user.email;
          userEmail.style.display = "block";
          userCell.appendChild(userEmail);
        }
        row.appendChild(userCell);
        continue;
      }
      row.appendChild(cell);
    }

    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");
    statusSelect.dataset.originalStatus = delivery.status;
    for (const status of deliveryStatuses) {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusSelect.appendChild(option);
    }
    if (!deliveryStatuses.includes(delivery.status)) {
      const option = document.createElement("option");
      option.value = delivery.status;
      option.textContent = delivery.status;
      statusSelect.appendChild(option);
    }
    statusSelect.value = delivery.status;
    statusSelect.setAttribute("aria-label", `Update delivery ${delivery.id} status`);
    statusSelect.addEventListener("change", () => {
      updateDeliveryStatus(delivery.id, statusSelect.value, statusSelect);
    });
    statusCell.appendChild(statusSelect);
    row.appendChild(statusCell);

    const returnCell = document.createElement("td");
    if (["Returned", "Completed - Damaged"].includes(delivery.status)) {
      const condition = document.createElement("p");
      condition.textContent = delivery.return_condition || "Return condition not recorded";
      returnCell.appendChild(condition);

      let photoUrl = null;
      try {
        const parsedPhotoUrl = new URL(delivery.return_photo_url);
        if (parsedPhotoUrl.protocol === "https:") photoUrl = parsedPhotoUrl.href;
      } catch {
        photoUrl = null;
      }
      if (photoUrl) {
        const photoLink = document.createElement("a");
        photoLink.href = photoUrl;
        photoLink.target = "_blank";
        photoLink.rel = "noopener noreferrer";
        photoLink.setAttribute("aria-label", `Open return photo for delivery ${delivery.id}`);
        const photo = document.createElement("img");
        photo.src = photoUrl;
        photo.alt = `Return photo for delivery ${delivery.id}`;
        photo.className = "admin-return-photo";
        photoLink.appendChild(photo);
        returnCell.appendChild(photoLink);
      } else {
        const missingPhoto = document.createElement("p");
        missingPhoto.textContent = delivery.return_photo_url
          ? "Return photo unavailable"
          : "No return photo provided";
        returnCell.appendChild(missingPhoto);
      }

      if (delivery.admin_verified) {
        const resolved = document.createElement("p");
        resolved.textContent = "Resolved";
        returnCell.appendChild(resolved);
      } else if (delivery.return_condition && photoUrl) {
        const verifyButton = document.createElement("button");
        verifyButton.type = "button";
        verifyButton.textContent = "Mark as Resolved";
        verifyButton.addEventListener("click", () => verifyDeliveryReturn(delivery.id, verifyButton));
        returnCell.appendChild(verifyButton);
      }
    } else {
      returnCell.textContent = "—";
    }
    row.appendChild(returnCell);
    deliveriesBody.appendChild(row);
  }
  deliveriesStatus.textContent = data?.length ? `${data.length} delivery(ies)` : "No deliveries found.";
}

window.requireAdmin()
  .then((user) => user && loadAdminDeliveries())
  .catch((error) => { deliveriesStatus.textContent = error.message || String(error); });
