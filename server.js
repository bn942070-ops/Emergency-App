const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DB_PATH = path.join(__dirname, "db.json");
const JWT_SECRET = process.env.JWT_SECRET || "medrush_secret_key_2024";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9]{10,15}$/;

// Email configuration (for doctor notifications)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "your-email@gmail.com",
    pass: process.env.EMAIL_PASS || "your-app-password"
  }
});

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

// Hospital suggestion based on symptoms
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
    burn: [
      { name: "Victory Burns Center", lat: 13.0827, lng: 77.5872, phone: "080-25551234" },
      { name: "HOSMAT Hospital", lat: 12.9716, lng: 77.5946, phone: "080-25591234" }
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
  if (symptomsLower.includes("burn") || emergencyType?.toLowerCase().includes("burn"))
    return hospitals.burn;
  return hospitals.general;
}

// Send notification to doctors
async function notifyDoctors(patient, hospital) {
  const db = readDB();
  const doctors = db.doctors || [];
  
  const alertMessage = `
    🚨 EMERGENCY ALERT 🚨
    
    Patient: ${patient.name}
    Emergency: ${patient.emergency_type}
    Symptoms: ${patient.symptoms}
    Phone: ${patient.phone}
    
    Hospital: ${hospital.name}
    Phone: ${hospital.phone}
    
    Time: ${new Date().toLocaleString()}
  `;

  // Store alert in database
  const alert = {
    id: Date.now(),
    patientId: patient.id,
    patientName: patient.name,
    emergencyType: patient.emergency_type,
    symptoms: patient.symptoms,
    hospital: hospital.name,
    createdAt: new Date().toISOString(),
    status: "pending"
  };
  db.alerts.push(alert);
  writeDB(db);

  // Send email notifications to doctors
  for (const doctor of doctors) {
    if (doctor.email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER || "medrush@emergency.com",
          to: doctor.email,
          subject: `🚨 EMERGENCY ALERT: ${patient.emergency_type} - Patient incoming to ${hospital.name}`,
          text: alertMessage
        });
      } catch (err) {
        console.log("Email error:", err);
      }
    }
  }
  
  return alert;
}

// ============= API ROUTES =============

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// Register
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

// Login
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

// Forgot Password
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!EMAIL_REGEX.test(email)) 
    return res.status(400).json({ message: "Invalid email" });
  
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(404).json({ message: "Email not found" });
  
  // Generate reset token (simplified for demo)
  const resetToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ 
    message: `Password reset link sent to ${email} (Demo: Use token ${resetToken.substring(0, 20)}...)` 
  });
});

// Save patient emergency details with hospital suggestion
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

  // Suggest hospital based on symptoms
  const suggestedHospitals = suggestHospital(symptoms, emergency_type);
  
  db.patients.push(patient);
  writeDB(db);
  
  res.json({ 
    message: "Patient details saved successfully", 
    patient,
    suggestedHospitals
  });
});

// Send alert to doctors and get hospital suggestions
app.post("/api/send-alert", auth, async (req, res) => {
  const { patientId, hospitalName, hospitalLat, hospitalLng, hospitalPhone } = req.body;
  const db = readDB();
  
  const patient = db.patients.find(p => p.id === patientId);
  if (!patient) return res.status(404).json({ message: "Patient not found" });

  const hospital = {
    name: hospitalName,
    lat: hospitalLat,
    lng: hospitalLng,
    phone: hospitalPhone
  };

  const alert = await notifyDoctors(patient, hospital);
  
  res.json({ 
    message: `Alert sent to doctors! Patient is coming to ${hospitalName}`,
    alert 
  });
});

// Get alerts for doctor dashboard
app.get("/api/alerts", auth, (req, res) => {
  const db = readDB();
  const alerts = db.alerts || [];
  res.json({ alerts: alerts.reverse() });
});

// Get hospital suggestions based on symptoms
app.post("/api/suggest-hospitals", auth, (req, res) => {
  const { symptoms, emergency_type } = req.body;
  const hospitals = suggestHospital(symptoms || "", emergency_type || "");
  res.json({ hospitals });
});

// Emergency call endpoint
app.post("/api/emergency-call", (req, res) => {
  res.json({ message: "Call 108 immediately for emergency services." });
});

// Get user profile
app.get("/api/profile", auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MedRush Server running on http://localhost:${PORT}`));