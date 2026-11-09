// delivery.js - Final Fix

// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
const supabaseClient = window.stylicycleSupabase;

if (document.getElementById('deliveryForm')) {
  let map;
  let marker;
  let routingControl;
  let pickupCoords = null;
  let deliveryCoords = null;
  let currentAuthUserId = null;

  function showMapFallback() {
    const fallback = document.getElementById('mapFallback');
    if (fallback) fallback.hidden = false;
  }

  async function geocodeAddress(address) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) {
      throw new Error(`Address lookup failed (${response.status}).`);
    }
    const results = await response.json();
    const location = results[0];
    if (!location) throw new Error(`Could not locate: ${address}`);
    return [Number(location.lat), Number(location.lon)];
  }

  // ==========================================
  // 2. MAP LOGIC
  // ==========================================
  function initMap() {
    const defaultLocation = [14.5995, 120.9842];
    map = L.map('map').setView(defaultLocation, 12);

    if (window.location.protocol === 'file:') {
      showMapFallback();
      marker = L.marker(defaultLocation, { draggable: true }).addTo(map);
      return;
    }

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    });
    let tileErrors = 0;
    tileLayer.on('tileerror', () => {
      tileErrors += 1;
      if (tileErrors >= 2) showMapFallback();
    });
    tileLayer.addTo(map);

    marker = L.marker(defaultLocation, { draggable: true }).addTo(map);

    // FIX: Force map to redraw after CSS Grid finishes layout
    setTimeout(() => {
      map.invalidateSize();
    }, 500); 
  }

  async function searchAddress(input) {
    const address = input.value.trim();
    if (!address) {
      alert('Please enter an address to search');
      return;
    }

    try {
      const coords = await geocodeAddress(address);

      if (input.id === 'pickupAddress') {
        pickupCoords = coords;
      } else {
        deliveryCoords = coords;
      }

      map.setView(coords, 15);
      marker.setLatLng(coords);
      updateRoute();
    } catch (error) {
      console.error('Geocoding error:', error);
      alert('Error searching for address. Please try again.');
    }
  }

  document.getElementById('pickupSearchButton').addEventListener('click', () => {
    searchAddress(document.getElementById('pickupAddress'));
  });
  document.getElementById('deliverySearchButton').addEventListener('click', () => {
    searchAddress(document.getElementById('deliveryAddress'));
  });

  function updateRoute() {
    if (routingControl) {
      map.removeControl(routingControl);
    }

    if (pickupCoords && deliveryCoords) {
      routingControl = L.Routing.control({
        waypoints: [
          L.latLng(pickupCoords[0], pickupCoords[1]),
          L.latLng(deliveryCoords[0], deliveryCoords[1])
        ],
        lineOptions: {
          styles: [{ color: '#d62828', opacity: 0.9, weight: 6 }]
        },
        routeWhileDragging: false,
        createMarker: function (i, waypoint, n) {
          const markerOptions = { draggable: true };
          const base = {
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
          };
          if (i === 0) {
            markerOptions.icon = L.icon({ ...base, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' });
          } else if (i === n - 1) {
            markerOptions.icon = L.icon({ ...base, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' });
          }
          return L.marker(waypoint.latLng, markerOptions);
        }
      }).addTo(map);
      routingControl.on('routingerror', () => {
        const routeStatus = document.getElementById('deliveryRouteStatus');
        if (routeStatus) routeStatus.textContent = 'The route could not be calculated. Verify both addresses and try again.';
      });
      const routeStatus = document.getElementById('deliveryRouteStatus');
      if (routeStatus) routeStatus.textContent = 'Calculating route...';
      routingControl.on('routesfound', () => {
        if (routeStatus) routeStatus.textContent = 'Route displayed in red.';
      });

      setTimeout(() => {
        map.fitBounds(L.latLngBounds([pickupCoords, deliveryCoords]), { padding: [20, 20] });
      }, 1000);
    }
  }

  function clearRoute() {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    pickupCoords = null;
    deliveryCoords = null;
    marker.setLatLng([14.5995, 120.9842]);
    map.setView([14.5995, 120.9842], 12);
  }

  // ==========================================
  // 3. SUPABASE DATABASE LOGIC
  // ==========================================
  function addDeliveryDetail(container, label, value) {
    const paragraph = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(value));
    container.appendChild(paragraph);
  }

  function renderReturnDetails(container, delivery) {
    if (!delivery.return_condition && !delivery.return_photo_url) return;

    addDeliveryDetail(container, 'Return condition', delivery.return_condition || 'Not recorded');
    let photoUrl = null;
    try {
      const parsedPhotoUrl = new URL(delivery.return_photo_url);
      if (parsedPhotoUrl.protocol === 'https:') photoUrl = parsedPhotoUrl.href;
    } catch (error) {
      console.warn('Ignoring invalid return photo URL:', error);
    }
    if (photoUrl) {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = photoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Open return photo in a new tab');
      const image = document.createElement('img');
      image.src = delivery.return_photo_url;
      image.alt = 'Vendor-uploaded return condition';
      image.className = 'delivery-return-photo';
      link.appendChild(image);
      paragraph.append(link);
      container.appendChild(paragraph);
    } else if (delivery.return_photo_url) {
      addDeliveryDetail(container, 'Return photo', 'Unavailable');
    }

    if (delivery.admin_verified) {
      addDeliveryDetail(container, 'Admin verification', 'Resolved');
    }
  }

  function createReturnForm(delivery, container) {
    const form = document.createElement('form');
    form.className = 'delivery-return-form';
    form.addEventListener('click', event => event.stopPropagation());

    const conditionLabel = document.createElement('label');
    conditionLabel.textContent = 'Return condition';
    const condition = document.createElement('select');
    condition.required = true;
    condition.setAttribute('aria-label', 'Return condition');
    condition.innerHTML = '<option value="">Select condition</option><option value="Returned">Returned</option><option value="Completed - Damaged">Completed - Damaged</option>';
    conditionLabel.appendChild(condition);

    const photoLabel = document.createElement('label');
    photoLabel.textContent = 'Return photo';
    const photo = document.createElement('input');
    photo.type = 'file';
    photo.accept = 'image/jpeg,image/png,image/webp';
    photo.required = true;
    photoLabel.appendChild(photo);

    const status = document.createElement('p');
    status.className = 'delivery-return-status';
    status.setAttribute('role', 'status');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Confirm Return';
    form.append(conditionLabel, photoLabel, submit, status);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopPropagation();
      const file = photo.files?.[0];
      const extensionByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const extension = file && extensionByType[file.type];
      if (!currentAuthUserId) {
        await window.showModal('Session expired', 'Please log in again before confirming this return.', 'error');
        return;
      }
      if (!condition.value) {
        await window.showModal('Return condition required', 'Choose the condition of the returned item.', 'error');
        return;
      }
      if (!extension) {
        await window.showModal('Return photo required', 'Choose a JPG, PNG, or WEBP photo.', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        await window.showModal('Photo is too large', 'Return photos must be 5 MB or smaller.', 'error');
        return;
      }

      submit.disabled = true;
      status.textContent = 'Uploading return photo...';
      let uploadedPath = null;
      let returnSaved = false;
      try {
        uploadedPath = `${currentAuthUserId}/returns/${delivery.id}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabaseClient.storage
          .from('item-images')
          .upload(uploadedPath, file, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false
          });
        if (uploadError) throw new Error(`Could not upload return photo: ${uploadError.message}`);

        const photoUrl = supabaseClient.storage.from('item-images').getPublicUrl(uploadedPath).data.publicUrl;
        const { error } = await supabaseClient.rpc('confirm_rental_return', {
          p_delivery_id: delivery.id,
          p_return_condition: condition.value,
          p_return_photo_url: photoUrl
        });
        if (error) throw error;
        returnSaved = true;

        status.textContent = 'Return confirmed.';
        await window.showModal(
          'Return confirmed',
          condition.value === 'Returned'
            ? 'The item is available for rent again.'
            : 'The damaged return has been recorded for admin verification.',
          'success'
        );
        await loadDeliveries();
      } catch (error) {
        if (uploadedPath && !returnSaved) {
          const { error: cleanupError } = await supabaseClient.storage.from('item-images').remove([uploadedPath]);
          if (cleanupError) console.error('Could not remove unused return photo:', cleanupError);
        }
        status.textContent = error.message || String(error);
        await window.showModal('Could not confirm return', error.message || String(error), 'error');
      } finally {
        submit.disabled = false;
      }
    });

    container.appendChild(form);
  }

  async function loadDeliveries() {
    const deliveryList = document.getElementById('deliveryList');
    deliveryList.innerHTML = '<p>Loading deliveries...</p>';

    const { data: authData, error: authError } = await supabaseClient.auth.getUser();
    if (authError) {
      console.error('Could not load delivery session:', authError);
      deliveryList.innerHTML = '<p>Could not verify your session.</p>';
      return;
    }
    currentAuthUserId = authData.user?.id || null;

    const { data: deliveries, error } = await supabaseClient
      .from('deliveries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading:', error);
      deliveryList.innerHTML = `<p>Error loading deliveries.</p>`;
      return;
    }

    deliveryList.innerHTML = '';
    if (!deliveries || deliveries.length === 0) {
      deliveryList.innerHTML = '<p>No deliveries yet.</p>';
      return;
    }

    deliveries.forEach(delivery => {
      const item = document.createElement('div');
      item.className = 'delivery-item';
      item.style.cursor = 'pointer';

      let formattedTime = '-';
      if (delivery.pickup_time) {
        formattedTime = new Date(delivery.pickup_time).toLocaleString();
      }

      addDeliveryDetail(item, 'Pickup', delivery.pickup_address || '-');
      addDeliveryDetail(item, 'Delivery', delivery.delivery_address || '-');
      addDeliveryDetail(item, 'Time', formattedTime);
      addDeliveryDetail(item, 'Item', delivery.item_type || '-');
      addDeliveryDetail(item, 'Distance', delivery.distance_km ? `${delivery.distance_km} km` : 'TBD');
      addDeliveryDetail(item, 'Fee', delivery.fee ? `₱${delivery.fee}` : 'TBD');
      addDeliveryDetail(item, 'Status', delivery.status || '-');
      if (delivery.notes) addDeliveryDetail(item, 'Notes', delivery.notes);
      renderReturnDetails(item, delivery);
      if (
        delivery.vendor_auth_user_id === currentAuthUserId &&
        delivery.rental_booking_id &&
        delivery.status === 'Delivered'
      ) {
        createReturnForm(delivery, item);
      }

      item.addEventListener('click', async () => {
        const routeStatus = document.getElementById('deliveryRouteStatus');
        try {
          if (
            delivery.pickup_lat != null && delivery.pickup_lng != null &&
            delivery.delivery_lat != null && delivery.delivery_lng != null
          ) {
            pickupCoords = [Number(delivery.pickup_lat), Number(delivery.pickup_lng)];
            deliveryCoords = [Number(delivery.delivery_lat), Number(delivery.delivery_lng)];
          } else {
            if (routeStatus) routeStatus.textContent = 'Locating saved addresses...';
            pickupCoords = await geocodeAddress(delivery.pickup_address);
            await new Promise(resolve => window.setTimeout(resolve, 1100));
            deliveryCoords = await geocodeAddress(delivery.delivery_address);
          }
          updateRoute();
        } catch (error) {
          if (routeStatus) routeStatus.textContent = `Could not display route: ${error.message || String(error)}`;
        }
      });

      deliveryList.appendChild(item);
    });
  }

  document.getElementById('deliveryForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const requiredValidation = window.validateRequiredFields(this);
    if (requiredValidation !== true) {
      await requiredValidation;
      return;
    }

    if (!pickupCoords || !deliveryCoords) {
      alert('Please click Search beside BOTH addresses so the map can find them.');
      return;
    }

    const payload = {
      pickup_address: document.getElementById('pickupAddress').value,
      delivery_address: document.getElementById('deliveryAddress').value,
      pickup_time: document.getElementById('pickupTime').value,
      item_type: document.getElementById('itemType').value,
      notes: document.getElementById('notes').value,
      pickup_lat: pickupCoords[0],
      pickup_lng: pickupCoords[1],
      delivery_lat: deliveryCoords[0],
      delivery_lng: deliveryCoords[1],
      status: 'Pending'
    };

    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const { data: authData, error: authError } = await supabaseClient.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        throw new Error('Your session has expired. Please log in again.');
      }
      payload.auth_user_id = authData.user.id;
      const { data: publicUserId, error: mappingError } = await supabaseClient.rpc('current_public_user_id');
      if (mappingError) throw mappingError;
      if (!publicUserId) throw new Error('Your account has no linked profile. Contact support to repair the account link.');
      payload.user_id = publicUserId;

      const { data, error } = await supabaseClient
        .from('deliveries')
        .insert([payload]);

      if (error) throw error;

      alert('Delivery scheduled successfully!');
      this.reset();
      clearRoute();
      loadDeliveries(); 
    } catch (err) {
      console.error('Supabase insert error:', err);
      const message = err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : err instanceof Error
          ? err.message
          : String(err);
      const code = err && typeof err === 'object' && 'code' in err
        ? ` (code: ${String(err.code)})`
        : '';
      const details = err && typeof err === 'object' && 'details' in err && err.details
        ? ` ${String(err.details)}`
        : '';
      const hint = err && typeof err === 'object' && 'hint' in err && err.hint
        ? ` ${String(err.hint)}`
        : '';
      alert(`Could not save the delivery: ${message}${code}${details}${hint}`);
    } finally {
      submitButton.disabled = false;
    }
  });

  window.addEventListener('load', function () {
    initMap();
    loadDeliveries();
  });
}