const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Konfigurasi Database PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ngajol_db',
    password: '',
    port: 5432,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Endpoint Register (Simpan ke Database PostgreSQL)
app.post('/api/register', async (req, res) => {
    const { nama, no_hp, password, role } = req.body;
    try {
        // Cek apakah nomor HP sudah terdaftar
        const checkUser = await pool.query('SELECT * FROM users WHERE no_hp = $1', [no_hp]);
        if (checkUser.rows.length > 0) {
            return res.json({ success: false, message: 'Nomor HP sudah terdaftar!' });
        }

        // Simpan user baru ke database
        const newUser = await pool.query(
            'INSERT INTO users (nama, no_hp, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [nama, no_hp, password, role]
        );

        res.json({ success: true, user: newUser.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server database' });
    }
});

// 2. Endpoint Login (Cek dari Database PostgreSQL)
app.post('/api/login', async (req, res) => {
    const { no_hp, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE no_hp = $1 AND password = $2', [no_hp, password]);
        
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false, message: 'Nomor HP atau Password salah!' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server database' });
    }
});

// Socket.IO Real-time Komunikasi
io.on('connection', (socket) => {
    console.log('User terhubung via Socket.IO:', socket.id);

    socket.on('register_driver', (driverId) => {
        socket.join('drivers_room');
        console.log(`Driver ID ${driverId} siap di drivers_room`);
    });

    socket.on('new_order', (orderData) => {
        // Teruskan orderan ke semua driver yang online
        io.to('drivers_room').emit('incoming_order', orderData);
    });

    socket.on('send_message', (data) => {
        socket.broadcast.emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('User terputus:', socket.id);
    });
});

const PORT = 4000;
server.listen(PORT, () => {
    console.log(`Server Ngajol berjalan di http://localhost:${PORT}`);
});
