let map, service, infowindow, savedPatientId = null;
let currentMapMarker = null;

function getToken() {
  return localStorage.getItem("token") || "";
}

function logout() {
  localStorage.removeItem("token");
  location.href = "login.html";
}

// Validation functions
function isLettersOnly(value) {
  return /^[A-Za-z ]+$/.test(value.trim());
}

function isNumbersOnly(value) {
  return /^[0-9]+$/.test(value.trim());
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateRegisterForm(name, email, phone, password) {
  if (!name || !email || !phone || !password) return "All fields are required";
  if (!isLettersOnly(name)) return "Name must contain only letters";
  if (!isValidEmail(email)) return "Enter a valid email";
  if (!isNumbersOnly(phone) || phone.length < 10 || phone.length > 15) return "Phone must be 10-15 digits";
  if (password.length < 6) return "Password must be at least 6 characters";
  return "";
}

function validatePatientForm(name, phone, emergencyType, symptoms) {
  if (!name || !phone || !emergencyType || !symptoms) return "All fields are required";
  if (!isLettersOnly(name)) return "Patient name must contain only letters";
  if (!isNumbersOnly(phone) || phone.length < 10 || phone.length > 15) return "Phone must be 10-15 digits";
  if (symptoms.trim().length < 5) return "Please provide detailed symptoms (min 5 characters)";
  return "";
}

// Register function
async function register() {
  const name = document.getElementById("rname")?.value;
  const email = document.getElementById("remail")?.value;
  const phone = document.getElementById("rphone")?.value;
  const password = document.getElementById("rpass")?.value;
  const role = document.getElementById("rrole")?.value || "patient";

  const err = validateRegisterForm(name, email, phone, password);
  if (err) return alert(err);

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, password, role })
  });

  const data = await res.json();
  alert(data.message);
  if (res.ok) location.href = "login.html";
}

// Login function
async function login() {
  const email = document.getElementById("lemail")?.value;
  const password = document.getElementById("lpass")?.value;

  if (!email || !password) {
    alert("Enter email and password");
    return;
  }

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) return alert(data.message);

  localStorage.setItem("token", data.token);
  localStorage.setItem("userRole", data.user.role);
  alert("Login success!");
  
  if (data.user.role === "doctor") {
    location.href = "doctor-dashboard.html";
  } else {
    location.href = "dashboard.html";
  }
}

// Forgot password
async function forgotPassword() {
  const email = prompt("Enter your email address:");
  if (!email) return;
  if (!isValidEmail(email)) return alert("Invalid email format");

  const res = await fetch("/api/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  const data = await res.json();
  alert(data.message);
}

// Save patient and get hospital suggestions
async function savePatient() {
  const name = document.getElementById("pname")?.value;
  const phone = document.getElementById("pphone")?.value;
  const emergencyType = document.getElementById("etype")?.value;
  const symptoms = document.getElementById("symptoms")?.value;

  const err = validatePatientForm(name, phone, emergencyType, symptoms);
  if (err) return alert(err);

  const res = await fetch("/api/patient", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + getToken()
    },
    body: JSON.stringify({ name, phone, emergency_type: emergencyType, symptoms })
  });

  const data = await res.json();
  if (data.patient) {
    savedPatientId = data.patient.id;
    alert(data.message);
    
    // Display suggested hospitals
    if (data.suggestedHospitals) {
      displaySuggestedHospitals(data.suggestedHospitals);
    }
  } else {
    alert(data.message);
  }
}

function displaySuggestedHospitals(hospitals) {
  const container = document.getElementById("suggestedHospitals");
  if (!container) return;
  
  container.innerHTML = `
    <h3>🏥 Recommended Hospitals Based on Symptoms:</h3>
    ${hospitals.map(h => `
      <div class="hospital-suggestion">
        <strong>${h.name}</strong>
        <p>📞 ${h.phone}</p>
        <button onclick="sendAlertToHospital('${h.name}', ${h.lat}, ${h.lng}, '${h.phone}')">
          🚑 Send Alert to this Hospital
        </button>
        <button onclick="navigateToHospital(${h.lat}, ${h.lng})">
          🧭 Navigate
        </button>
      </div>
    `).join('')}
  `;
}

async function sendAlertToHospital(hospitalName, lat, lng, phone) {
  if (!savedPatientId) {
    alert("Please save patient details first!");
    return;
  }
  
  const res = await fetch("/api/send-alert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + getToken()
    },
    body: JSON.stringify({
      patientId: savedPatientId,
      hospitalName: hospitalName,
      hospitalLat: lat,
      hospitalLng: lng,
      hospitalPhone: phone
    })
  });
  
  const data = await res.json();
  alert(data.message);
}

function navigateToHospital(lat, lng) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      const url = `https://www.google.com/maps/dir/${position.coords.latitude},${position.coords.longitude}/${lat},${lng}`;
      window.open(url, "_blank");
    }, () => {
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
    });
  } else {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  }
}

function emergencyCall() {
  window.location.href = "tel:108";
}

// Show nearby hospitals on map
function showNearbyHospitals() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      const mapEl = document.getElementById("map");
      if (!mapEl) return;

      map = new google.maps.Map(mapEl, {
        center: userLocation,
        zoom: 14
      });

      // Add user marker
      new google.maps.Marker({
        map: map,
        position: userLocation,
        icon: {
          url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
        },
        title: "Your Location"
      });

      const request = {
        location: userLocation,
        radius: 5000,
        type: "hospital"
      };

      service = new google.maps.places.PlacesService(map);
      infowindow = new google.maps.InfoWindow();

      service.nearbySearch(request, (results, status) => {
        const list = document.getElementById("hospitalList");
        if (!list) return;
        list.innerHTML = "";

        if (status === google.maps.places.PlacesServiceStatus.OK && results.length) {
          results.forEach((place) => {
            const marker = new google.maps.Marker({
              map,
              position: place.geometry.location,
              title: place.name
            });

            marker.addListener("click", () => {
              infowindow.setContent(`
                <div style="padding:10px">
                  <b>${place.name}</b><br>
                  ${place.vicinity || ""}<br>
                  <button onclick="navigateToHospital(${place.geometry.location.lat()}, ${place.geometry.location.lng()})">
                    🧭 Get Directions
                  </button>
                </div>
              `);
              infowindow.open(map, marker);
            });

            const div = document.createElement("div");
            div.className = "hospital";
            div.innerHTML = `
              <b>🏥 ${place.name}</b>
              <p>📍 ${place.vicinity || "Nearby hospital"}</p>
              <p>⭐ Rating: ${place.rating || "N/A"}</p>
              <button onclick="navigateToHospital(${place.geometry.location.lat()}, ${place.geometry.location.lng()})">
                🧭 Get Directions
              </button>
              ${savedPatientId ? `<button class="primary" onclick="sendAlertToHospital('${place.name}', ${place.geometry.location.lat()}, ${place.geometry.location.lng()}, '${place.formatted_phone_number || '108'}')">
                🚑 Send Alert
              </button>` : '<p class="info-text">Save patient details first to send alert</p>'}
            `;
            list.appendChild(div);
          });
        } else {
          list.innerHTML = "<p>No hospitals found nearby. Try a different location.</p>";
        }
      });
    },
    () => alert("Please allow location access to find nearby hospitals")
  );
}