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

  deliveriesBody.replaceChildren();
  for (const delivery of data || []) {
    const row = document.createElement("tr");
    const values = [
      delivery.id,
      delivery.auth_user_id || delivery.user_id || "—",
      delivery.pickup_address,
      delivery.delivery_address,
      delivery.pickup_time ? new Date(delivery.pickup_time).toLocaleString() : "—",
      delivery.item_type || "—"
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
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
