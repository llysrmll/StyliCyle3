// auth.js - load on index.html (login) and signup.html
// Talks to the PHP backend. Path is relative to the HTML page (Frontend/HTML/).
const API = "../../Backend/";

async function postJSON(url, data) {
  const res = await fetch(API + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

// ---------- Register ----------
document.getElementById("registerForm")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  const firstName = document.getElementById("firstName").value.trim();
  const middleName = document.getElementById("middleName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const age = document.getElementById("age").value;
  const role = document.getElementById("role").value;
  const agreeTermsSignup = document.getElementById("agreeTermsSignup")?.checked;

  if (!agreeTermsSignup) return alert("You must agree to the Terms and Conditions to register.");
  if (password !== confirmPassword) return alert("Passwords do not match!");
  if (isNaN(age) || age <= 0) return alert("Please enter a valid age.");
  if (!firstName || !lastName || !email) return alert("Please fill in all required fields.");
  if (role === "admin") return alert("Admin accounts can only be created by an existing administrator.");
  if (role !== "user") return alert("Please select a valid account type.");

  try {
    const r = await postJSON("register.php", { firstName, middleName, lastName, age, email, password, role });
    if (!r.ok) return alert(r.error);
    alert("Registration successful! Please log in.");
    window.location.href = "index.html";
  } catch (err) {
    alert("Could not reach the server. Is Apache running and are you using http://localhost/ ?");
  }
});

// ---------- Login ----------
document.getElementById("loginForm")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const r = await postJSON("login.php", { email, password });
    if (!r.ok) return alert(r.error);
    window.location.href = "home.html";
  } catch (err) {
    alert("Could not reach the server. Is Apache running and are you using http://localhost/ ?");
  }
});
