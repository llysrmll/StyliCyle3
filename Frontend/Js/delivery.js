// delivery.js - load on delivery.html (after common.js AND after the Leaflet + Leaflet Routing Machine scripts)
// Same map code as before; deliveries are now saved to the PHP backend instead of localStorage.

if (document.getElementById('deliveryForm')) {
  const API = '../../Backend/';
  let map;
  let marker;
  let routingControl;
  let pickupCoords = null;
  let deliveryCoords = null;
  let isAdmin = false;

  const STATUSES = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Returned'];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showMapFallback() {
    const fallback = document.getElementById('mapFallback');
    if (fallback) fallback.hidden = false;
  }

  function initMap() {
    // Default location (Manila, Philippines)
    const defaultLocation = [14.5995, 120.9842];

    map = L.map('map').setView(defaultLocation, 12);

    // Browsers commonly block public tile requests when this page is opened from file://.
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
  }

  // Address search function using Nominatim (OpenStreetMap geocoding)
  async function searchAddress(address) {
    if (!address.trim()) {
      alert('Please enter an address to search');
      return;
    }

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const data = await response.json();

      if (data && data.length > 0) {
        const location = data[0];
        const coords = [parseFloat(location.lat), parseFloat(location.lon)];

        const pickupInput = document.getElementById('pickupAddress');
        const deliveryInput = document.getElementById('deliveryAddress');

        if (address === pickupInput.value) {
          pickupInput.value = location.display_name;
          pickupCoords = coords;
        } else if (address === deliveryInput.value) {
          deliveryInput.value = location.display_name;
          deliveryCoords = coords;
        }

        map.setView(coords, 15);
        marker.setLatLng(coords);
        updateRoute();
      } else {
        alert('Address not found. Please try a different search term.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      alert('Error searching for address. Please try again.');
    }
  }

  // Update route between pickup and delivery points
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

  async function loadDeliveries() {
    const deliveryList = document.getElementById('deliveryList');
    const res = await fetch(API + 'deliveries.php');
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!data.ok) {
      deliveryList.innerHTML = `<p>${esc(data.error)}</p>`;
      return;
    }

    isAdmin = data.isAdmin;
    deliveryList.innerHTML = '';
    if (!data.deliveries.length) {
      deliveryList.innerHTML = '<p>No deliveries yet.</p>';
      return;
    }

    data.deliveries.forEach(delivery => {
      const item = document.createElement('div');
      item.className = 'delivery-item';
      item.style.cursor = 'pointer';

      const statusHtml = isAdmin
        ? `<select class="status-select">${STATUSES.map(s => `<option ${s === delivery.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`
        : esc(delivery.status);

      item.innerHTML = `
        ${isAdmin && delivery.customer ? `<p><strong>Customer:</strong> ${esc(delivery.customer)}</p>` : ''}
        <p><strong>Pickup:</strong> ${esc(delivery.pickup_address)}</p>
        <p><strong>Delivery:</strong> ${esc(delivery.delivery_address)}</p>
        <p><strong>Time:</strong> ${delivery.pickup_time ? new Date(delivery.pickup_time.replace(' ', 'T')).toLocaleString() : '-'}</p>
        <p><strong>Item:</strong> ${esc(delivery.item_type || '-')}</p>
        <p><strong>Distance:</strong> ${esc(delivery.distance_km)} km</p>
        <p><strong>Fee:</strong> ₱${esc(delivery.fee)}</p>
        <p><strong>Status:</strong> <span>${statusHtml}</span></p>
        ${delivery.notes ? `<p><strong>Notes:</strong> ${esc(delivery.notes)}</p>` : ''}
      `;

      // Click an entry to show its route on the map
      item.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'SELECT') return;
        if (delivery.pickup_lat != null && delivery.delivery_lat != null) {
          pickupCoords = [delivery.pickup_lat, delivery.pickup_lng];
          deliveryCoords = [delivery.delivery_lat, delivery.delivery_lng];
          updateRoute();
        } else {
          alert('Route coordinates not available for this delivery.');
        }
      });

      // Admin: change status
      item.querySelector('.status-select')?.addEventListener('change', async (ev) => {
        const r = await fetch(API + 'deliveries.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_status', id: delivery.id, status: ev.target.value })
        });
        const out = await r.json();
        showToast(out.ok ? 'Status updated.' : out.error);
      });

      deliveryList.appendChild(item);
    });
  }

  document.getElementById('deliveryForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!pickupCoords || !deliveryCoords) {
      alert('Please click Search beside BOTH addresses so the map can find them.');
      return;
    }

    const payload = {
      pickupAddress: document.getElementById('pickupAddress').value,
      deliveryAddress: document.getElementById('deliveryAddress').value,
      pickupTime: document.getElementById('pickupTime').value,
      itemType: document.getElementById('itemType').value,
      notes: document.getElementById('notes').value,
      pickupCoords,
      deliveryCoords
    };

    try {
      const res = await fetch(API + 'deliveries.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        window.location.href = 'index.html';
        return;
      }
      const data = await res.json();
      if (!data.ok) return alert(data.error);

      alert(`Delivery scheduled! Distance: ${data.distance_km} km. Delivery fee: ₱${data.fee}`);
      this.reset();
      clearRoute();
      loadDeliveries();
    } catch (err) {
      alert('Could not reach the server.');
    }
  });

  window.addEventListener('load', function () {
    initMap();
    loadDeliveries();
  });
}
