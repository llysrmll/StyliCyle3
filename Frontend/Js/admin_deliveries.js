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

async function loadAdminDeliveries() {
  deliveriesStatus.textContent = "Loading deliveries...";
  const { data, error } = await window.adminClient
    .from("deliveries")
    .select("id, user_id, auth_user_id, pickup_address, delivery_address, pickup_time, item_type, status, created_at")
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
    deliveriesBody.appendChild(row);
  }
  deliveriesStatus.textContent = data?.length ? `${data.length} delivery(ies)` : "No deliveries found.";
}

window.requireAdmin()
  .then((user) => user && loadAdminDeliveries())
  .catch((error) => { deliveriesStatus.textContent = error.message || String(error); });
