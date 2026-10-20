// delivery.js - Updated with variable fix

// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://kjiyvstudiqlmegyqfpg.supabase.co'; // Replace with your actual URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaXl2c3R1ZGlxbG1lZ3lxZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMDE5NTYsImV4cCI6MjEwNzg3Nzk1Nn0.6rizgXfBtyTrRdL7Q0sS4WKcgvmo1OdNom4957hP6Dg'; // Replace with your Publishable Key

// FIX: Renamed to supabaseClient to avoid collision with the CDN global 'supabase'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (document.getElementById('deliveryForm')) {
  let map;
  let marker;
  let routingControl;
  let pickupCoords = null;
  let deliveryCoords = null;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showMapFallback() {
    const fallback = document.getElementById('mapFallback');
    if (fallback) fallback.hidden = false;
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
  }

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

  // ==========================================
  // 3. SUPABASE DATABASE LOGIC
  // ==========================================
  async function loadDeliveries() {
    const deliveryList = document.getElementById('deliveryList');
    deliveryList.innerHTML = '<p>Loading deliveries...</p>';

    // FIX: Using supabaseClient here
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

      item.innerHTML = `
        <p><strong>Pickup:</strong> ${esc(delivery.pickup_address)}</p>
        <p><strong>Delivery:</strong> ${esc(delivery.delivery_address)}</p>
        <p><strong>Time:</strong> ${formattedTime}</p>
        <p><strong>Item:</strong> ${esc(delivery.item_type || '-')}</p>
        <p><strong>Distance:</strong> ${delivery.distance_km ? delivery.distance_km + ' km' : 'TBD'}</p>
        <p><strong>Fee:</strong> ${delivery.fee ? '₱' + delivery.fee : 'TBD'}</p>
        <p><strong>Status:</strong> <span>${esc(delivery.status)}</span></p>
        ${delivery.notes ? `<p><strong>Notes:</strong> ${esc(delivery.notes)}</p>` : ''}
      `;

      item.addEventListener('click', () => {
        if (delivery.pickup_lat != null && delivery.delivery_lat != null) {
          pickupCoords = [delivery.pickup_lat, delivery.pickup_lng];
          deliveryCoords = [delivery.delivery_lat, delivery.delivery_lng];
          updateRoute();
        }
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

    try {
      // FIX: Using supabaseClient here
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
      alert('Could not save the delivery. Check the console (F12) for details.');
    }
  });

  window.addEventListener('load', function () {
    initMap();
    loadDeliveries();
  });
}