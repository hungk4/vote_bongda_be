// server/index.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
// app.use(cors());

app.use(
  cors({
    origin: ["http://localhost:5173", "https://vote-bongda-fe.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

// --- CẤU HÌNH ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 2. Kết nối MongoDB
mongoose
  .connect(process.env.MONGODB)
  .then(() => console.log("✅ Đã nối MongoDB"))
  .catch((err) => console.log("❌ Lỗi MongoDB:", err));

// --- MODEL ---
const PlayerSchema = new mongoose.Schema({
  name: String,
  hasPaid: { type: Boolean, default: false },
  team: { type: String, default: null },
  clientId: { type: String },
  createdAt: { type: Date, default: Date.now },
});
const Player = mongoose.model("Player", PlayerSchema);

const matchSchema = new mongoose.Schema({
  location: String,
  time: Date,
});
const Match = mongoose.model("Match", matchSchema);

// --- API ROUTES ---
// 1. Lấy danh sách (Ai cũng xem được)
app.get("/api/players", async (req, res) => {
  // Sắp xếp người mới nhất lên đầu (.sort)
  const players = await Player.find().sort({ createdAt: -1 });
  res.json(players);
});

// 2. Vote/Thêm tên (Ai cũng thêm được)
app.post("/api/players", async (req, res) => {
  const { name, clientId } = req.body;

  if (!name) return res.status(400).json({ message: "Cần nhập tên" });

  if (name.length > 25) {
    return res
      .status(400)
      .json({ message: "Tên không được vượt quá 25 ký tự" });
  }

  const existingName = await Player.findOne({ name });
  if (existingName) {
    return res.status(400).json({
      message: "Tên này đã được đăng ký rồi! Vui lòng chọn tên khác.",
    });
  }

  if (clientId) {
    const existing = await Player.findOne({ clientId });
    if (existing) {
      return res.status(400).json({
        message: "Máy này đã đăng ký rồi! Vui lòng hủy trước khi đăng ký lại.",
      });
    }
  }

  const newPlayer = new Player({ name, clientId });
  await newPlayer.save();
  res.json(newPlayer);
});

// [API] Kiểm tra trạng thái máy này đã vote chưa
app.get("/api/players/check-status", async (req, res) => {
  const { clientId } = req.query;

  if (!clientId) return res.json({ hasVoted: false });

  const player = await Player.findOne({ clientId });

  res.json({ hasVoted: !!player });
});

// [API] Hủy tham gia (Dành cho User)
app.post("/api/players/unvote", async (req, res) => {
  const clientId = req.body.clientId;

  if (!clientId) return res.status(400).json({ message: "Lỗi Client ID" });

  const result = await Player.findOneAndDelete({ clientId });
  if (result) {
    res.json({ success: true, message: "Đã hủy tham gia" });
  } else {
    res.status(404).json({ message: "Bạn chưa tham gia!" });
  }
});

// 3. Tick tiền (CHỈ ADMIN - Cần password)
app.put("/api/players/:id/pay", async (req, res) => {
  const { adminPass } = req.body;

  // Check mật khẩu
  if (adminPass !== ADMIN_PASSWORD) {
    return res.status(403).json({ message: "Sai mật khẩu Admin!" });
  }

  const player = await Player.findById(req.params.id);
  if (player) {
    player.hasPaid = !player.hasPaid;
    await player.save();
    res.json(player);
  } else {
    res.status(404).json({ message: "Không tìm thấy" });
  }
});

// 4. Xóa người chơi (CHỈ ADMIN - Cần password)
app.delete("/api/players/:id", async (req, res) => {
  const { adminPass } = req.body;

  // Check mật khẩu
  if (adminPass !== ADMIN_PASSWORD) {
    return res.status(403).json({ message: "Sai mật khẩu Admin!" });
  }

  await Player.findByIdAndDelete(req.params.id);
  res.json({ message: "Đã xóa" });
});

// API Kiểm tra đăng nhập Admin
app.post("/api/login", (req, res) => {
  const { adminPass } = req.body;
  if (adminPass === ADMIN_PASSWORD) {
    res.json({ success: true, message: "Đăng nhập thành công" });
  } else {
    res.status(401).json({ success: false, message: "Sai mật khẩu" });
  }
});

// API Chia đội hình (Admin gọi)
app.put("/api/players/split", async (req, res) => {
  const { adminPass, teamA_Ids, teamB_Ids } = req.body;

  // Check mật khẩu
  if (adminPass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Sai mật khẩu Admin!" });
  }

  try {
    // Reset toàn bộ về null trước
    await Player.updateMany({}, { team: null });

    // Update Team A
    if (teamA_Ids.length > 0) {
      await Player.updateMany({ _id: { $in: teamA_Ids } }, { team: "A" });
    }
    // Update Team B
    if (teamB_Ids.length > 0) {
      await Player.updateMany({ _id: { $in: teamB_Ids } }, { team: "B" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Match Routes
app.get("/api/match", async (req, res) => {
  try {
    // Luôn lấy phần tử đầu tiên vì chỉ có 1 trận
    const match = await Match.findOne();
    res.json(match || { location: "", time: null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cập nhật thông tin trận đấu (Admin dùng)
app.post("/api/match", async (req, res) => {
  try {
    const { location, time } = req.body;
    let match = await Match.findOne();

    if (!match) {
      // Nếu chưa có thì tạo mới
      match = new Match({ location, time });
    } else {
      // Nếu có rồi thì cập nhật
      match.location = location;
      match.time = time;
    }

    await match.save();
    res.json({ success: true, match });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại port ${PORT}`));

module.exports = app;
