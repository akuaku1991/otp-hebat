const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Hubungkan ke Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Database Konek!"))
  .catch(err => console.log("❌ Database Error:", err));

// Skema Data Pengguna
const User = mongoose.model("User", {
  email: String,
  balance: { type: Number, default: 0 }
});

// --- RUTE API ---

// 1. Ambil Saldo
app.get("/balance", async (req, res) => {
  const user = await User.findOne({ email: req.query.email });
  res.json({ balance: user ? user.balance : 0 });
});

// 2. Ambil Harga dari 5SIM
app.get("/price", async (req, res) => {
  const { country, service } = req.query;
  const r = await fetch(`https://5sim.net/v1/guest/prices?country=${country}`);
  const data = await r.json();
  const costUSD = data[country][service]["any"].cost;
  
  // Logika Harga: (Harga Modal * Kurs) + Untung
  const finalPrice = Math.ceil((costUSD * 1500) + 3000); 
  res.json({ price: finalPrice });
});

// 3. Beli OTP (Potong Saldo & Tembak 5SIM)
app.post("/buy-otp", async (req, res) => {
  const { email, amount, country, service } = req.body;
  const user = await User.findOne({ email });

  if (!user || user.balance < amount) return res.json({ success: false, message: "Saldo Kurang!" });

  // Panggil 5SIM
  const response = await fetch(`https://5sim.net/v1/user/buy/activation/${country}/any/${service}`, {
    headers: { Authorization: `Bearer ${process.env.API_KEY}` }
  });
  const otpData = await response.json();

  if (otpData.id) {
    user.balance -= amount; // Potong Saldo
    await user.save();
    res.json({ success: true, data: otpData });
  } else {
    res.json({ success: false, message: "Stok Habis!" });
  }
});

// 4. Webhook (Otomatis tambah saldo saat bayar)
app.post("/webhook", async (req, res) => {
  const event = req.body;
  if (event.event === "charge.success") {
    const user = await User.findOneAndUpdate(
      { email: event.data.customer.email },
      { $inc: { balance: event.data.amount } },
      { upsert: true, new: true }
    );
    console.log("Saldo Bertambah!");
  }
  res.sendStatus(200);
});

module.exports = app; // Penting untuk Vercel
