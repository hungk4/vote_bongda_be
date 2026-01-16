// server/index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
// app.use(cors());

app.use(cors({
    origin: [
        "http://localhost:5173",                   
        "https://vote-bongda-fe.vercel.app"        
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));


// --- CẤU HÌNH ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 2. Kết nối MongoDB 
mongoose.connect(process.env.MONGODB)
    .then(() => console.log("✅ Đã nối MongoDB"))
    .catch(err => console.log("❌ Lỗi MongoDB:", err));

// --- MODEL ---
const PlayerSchema = new mongoose.Schema({
    name: String,
    hasPaid: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now } 
});
const Player = mongoose.model('Player', PlayerSchema);

// --- API ROUTES ---

// 1. Lấy danh sách (Ai cũng xem được)
app.get('/api/players', async (req, res) => {
    // Sắp xếp người mới nhất lên đầu (.sort)
    const players = await Player.find().sort({ createdAt: -1 });
    res.json(players);
});

// 2. Vote/Thêm tên (Ai cũng thêm được)
app.post('/api/players', async (req, res) => {
    if (!req.body.name) return res.status(400).json({message: "Cần nhập tên"});
    const newPlayer = new Player({ name: req.body.name });
    await newPlayer.save();
    res.json(newPlayer);
});

// 3. Tick tiền (CHỈ ADMIN - Cần password)
app.put('/api/players/:id/pay', async (req, res) => {
    const { adminPass } = req.body;
    
    // Check mật khẩu
    if (adminPass !== ADMIN_PASSWORD) {
        return res.status(403).json({ message: "Sai mật khẩu Admin!" });
    }

    const player = await Player.findById(req.params.id);
    if(player) {
        player.hasPaid = !player.hasPaid;
        await player.save();
        res.json(player);
    } else {
        res.status(404).json({ message: "Không tìm thấy" });
    }
});

// 4. Xóa người chơi (CHỈ ADMIN - Cần password)
app.delete('/api/players/:id', async (req, res) => {
    const { adminPass } = req.body;

    // Check mật khẩu
    if (adminPass !== ADMIN_PASSWORD) {
        return res.status(403).json({ message: "Sai mật khẩu Admin!" });
    }

    await Player.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa" });
});

// API Kiểm tra đăng nhập Admin
app.post('/api/login', (req, res) => {
    const { adminPass } = req.body;
    if (adminPass === ADMIN_PASSWORD) {
        res.json({ success: true, message: "Đăng nhập thành công" });
    } else {
        res.status(401).json({ success: false, message: "Sai mật khẩu" });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại port ${PORT}`));

module.exports = app;