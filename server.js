const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// IMPORTANT: These must be in correct order
app.use(cors());
app.use(express.json());

// ✅ FIX: Serve static files from "public" folder
app.use(express.static(path.join(__dirname, "public")));

// ✅ FIX: Handle root route - serve login.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ✅ FIX: Handle all other HTML routes
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/doctor-dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "doctor-dashboard.html"));
});

app.get("/about.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "about.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "style.css"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.js"));
});

// Database setup
const DB_PATH = path.join(__dirname, "db.json");
const JWT_SECRET = process.env.JWT_SECRET || "medrush_secret_key_2024";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9]{10,15}$/;

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    writeDB({ users: [], patients: [], alerts: [], doctors: [] });
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// Hospital suggestion function
function suggestHospital(symptoms, emergencyType) {
  const hospitals = {
    cardiac: [
      { name: "Apollo Heart Institute", lat: 12.9716, lng: 77.5946, phone: "080-1234567" },
      { name: "Fortis Escorts Heart Institute", lat: 12.9345, lng: 77.6267, phone: "080-7654321" }
    ],
    neuro: [
      { name: "NIMHANS", lat: 12.9425, lng: 77.5997, phone: "080-26995000" },
      { name: "Manipal Neurology Center", lat: 12.9985, lng: 77.5569, phone: "080-22225555" }
    ],
    trauma: [
      { name: "St. John's Trauma Center", lat: 12.9351, lng: 77.5625, phone: "080-22065000" },
      { name: "Columbia Asia Hospital", lat: 13.0359, lng: 77.5971, phone: "080-61656666" }
    ],
    general: [
      { name: "General Hospital", lat: 12.9716, lng: 77.5946, phone: "108" },
      { name: "City Hospital", lat: 12.9345, lng: 77.6267, phone: "102" }
    ]
  };

  const symptomsLower = symptoms.toLowerCase();
  if (symptomsLower.includes("chest") || symptomsLower.includes("heart") || emergencyType?.toLowerCase().includes("cardiac"))
    return hospitals.cardiac;
  if (symptomsLower.includes("head") || symptomsLower.includes("brain") || emergencyType?.toLowerCase().includes("neuro"))
    return hospitals.neuro;
  if (symptomsLower.includes("accident") || symptomsLower.includes("injury") || emergencyType?.toLowerCase().includes("trauma"))
    return hospitals.trauma;
  return hospitals.general;
}

// ============= API ROUTES =============

app.post("/api/register", async (req, res) => {
  const { name, email, phone, password, role = "patient" } = req.body;
  
  if (!name || !email || !phone || !password) 
    return res.status(400).json({ message: "All fields required" });
  if (!EMAIL_REGEX.test(email)) 
    return res.status(400).json({ message: "Invalid email format" });
  if (!PHONE_REGEX.test(phone)) 
    return res.status(400).json({ message: "Phone must be 10-15 digits" });
  if (!/^[A-Za-z ]+$/.test(name.trim())) 
    return res.status(400).json({ message: "Name must contain only letters" });
  if (password.length < 6) 
    return res.status(400).json({ message: "Password must be at least 6 characters" });

  const db = readDB();
  if (db.users.some(u => u.email === email)) 
    return res.status(400).json({ message: "Email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = { 
    id: Date.now(), 
    name: name.trim(), 
    email: email.trim(), 
    phone: phone.trim(), 
    passwordHash,
    role 
  };
  db.users.push(newUser);
  
  if (role === "doctor") {
    if (!db.doctors) db.doctors = [];
    db.doctors.push({ id: newUser.id, email: email.trim(), name: name.trim() });
  }
  
  writeDB(db);
  res.json({ message: "Registered successfully", user: { id: newUser.id, name: newUser.name } });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!EMAIL_REGEX.test(email)) 
    return res.status(400).json({ message: "Invalid email format" });

  const db = readDB();
  const user = db.users.find(u => u.email === email.trim());
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || "patient" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ 
    message: "Login success", 
    token, 
    user: { id: user.id, name: user.name, role: user.role || "patient" } 
  });
});

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!EMAIL_REGEX.test(email)) 
    return res.status(400).json({ message: "Invalid email" });
  
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(404).json({ message: "Email not found" });
  
  res.json({ message: `Password reset link sent to ${email} (Demo mode)` });
});

app.post("/api/patient", auth, async (req, res) => {
  const { name, phone, emergency_type, symptoms } = req.body;
  
  if (!name || !phone || !emergency_type || !symptoms) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!/^[A-Za-z ]+$/.test(name.trim())) 
    return res.status(400).json({ message: "Patient name must contain only letters" });
  if (!/^[0-9]+$/.test(phone.trim()) || phone.length < 10 || phone.length > 15) 
    return res.status(400).json({ message: "Phone must be 10-15 digits only" });
  if (symptoms.trim().length < 5) 
    return res.status(400).json({ message: "Please provide detailed symptoms (min 5 characters)" });

  const db = readDB();
  const patient = {
    id: Date.now(),
    userId: req.user.id,
    name: name.trim(),
    phone: phone.trim(),
    emergency_type: emergency_type.trim(),
    symptoms: symptoms.trim(),
    createdAt: new Date().toISOString()
  };

  const suggestedHospitals = suggestHospital(symptoms, emergency_type);
  
  db.patients.push(patient);
  writeDB(db);
  
  res.json({ 
    message: "Patient details saved successfully", 
    patient,
    suggestedHospitals
  });
});

app.post("/api/send-alert", auth, async (req, res) => {
  const { patientId, hospitalName, hospitalLat, hospitalLng, hospitalPhone } = req.body;
  const db = readDB();
  
  const patient = db.patients.find(p => p.id === patientId);
  if (!patient) return res.status(404).json({ message: "Patient not found" });

  const alert = {
    id: Date.now(),
    patientId: patient.id,
    patientName: patient.name,
    emergencyType: patient.emergency_type,
    symptoms: patient.symptoms,
    hospital: hospitalName,
    createdAt: new Date().toISOString(),
    status: "pending"
  };
  
  db.alerts.push(alert);
  writeDB(db);
  
  res.json({ 
    message: `Alert sent to doctors! Patient is coming to ${hospitalName}`,
    alert 
  });
});

app.get("/api/alerts", auth, (req, res) => {
  const db = readDB();
  const alerts = db.alerts || [];
  res.json({ alerts: alerts.reverse() });
});

app.post("/api/emergency-call", (req, res) => {
  res.json({ message: "Call 108 immediately for emergency services." });
});

// ✅ FIX: 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "login.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MedRush Server running on port ${PORT}`));