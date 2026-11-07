const express = require('express');
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error('DATABASE_URL atau JWT_SECRET belum diatur di .env');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            success: true,
            status: 'online',
            database: 'connected',
            app: 'NGAJOL'
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'error',
            database: 'disconnected'
        });
    }
});

function createToken(user) {
    return jwt.sign(
        { id: user.id, nama: user.nama },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

async function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Silakan login terlebih dahulu.'
            });
        }

        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: 'Sesi tidak valid. Silakan login kembali.'
        });
    }
}

// REGISTRASI
app.post('/api/register', async (req, res) => {
    const nama = String(req.body.nama || '').trim();
    const no_hp = String(req.body.no_hp || '').trim();
    const password = String(req.body.password || '');
    const security_question = String(req.body.security_question || '').trim();
    const security_answer = String(req.body.security_answer || '')
        .trim().toLowerCase().replace(/\s+/g, ' ');
    const role = req.body.role === 'driver' ? 'driver' : 'penumpang';

    if (!nama || nama.length > 120 || !/^08[0-9]{8,13}$/.test(no_hp) ||
        password.length < 8 || password.length > 72 ||
        security_question.length < 5 || security_question.length > 200 ||
        Buffer.byteLength(security_answer, 'utf8') < 2 ||
        Buffer.byteLength(security_answer, 'utf8') > 72) {
        return res.status(400).json({
            success: false,
            message: 'Periksa nama, nomor HP, password, pertanyaan, dan jawaban keamanan.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const password_hash = await bcrypt.hash(password, 12);
        const security_answer_hash = await bcrypt.hash(security_answer, 12);

        const result = await client.query(
            `INSERT INTO users
             (nama, no_hp, password_hash, security_question, security_answer_hash)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nama, no_hp`,
            [nama, no_hp, password_hash, security_question, security_answer_hash]
        );

        const user = result.rows[0];
        let driverStatus = null;

        if (role === 'driver') {
            await client.query(
                `INSERT INTO driver_profiles (user_id, status)
                 VALUES ($1, 'pending')`,
                [user.id]
            );
            driverStatus = 'pending';
        }

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            message: role === 'driver'
                ? 'Pendaftaran berhasil. Pengajuan driver menunggu persetujuan admin.'
                : 'Pendaftaran berhasil. Silakan login.',
            user: { ...user, role: 'penumpang', driverStatus }
        });
    } catch (err) {
        await client.query('ROLLBACK');

        if (err.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Nomor HP sudah terdaftar.'
            });
        }

        console.error('Register error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Pendaftaran gagal. Periksa kembali server.'
        });
    } finally {
        client.release();
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const no_hp = String(req.body.no_hp || '').trim();
    const password = String(req.body.password || '');

    try {
        const result = await pool.query(
            `SELECT u.id, u.nama, u.no_hp, u.password_hash,
                    u.is_active, u.security_question, d.status AS driver_status
             FROM users u
             LEFT JOIN driver_profiles d ON d.user_id = u.id
             WHERE u.no_hp = $1`,
            [no_hp]
        );

        if (!result.rows.length) {
            return res.status(401).json({
                success: false,
                message: 'Nomor HP atau password salah.'
            });
        }

        const user = result.rows[0];

        if (!user.is_active ||
            !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({
                success: false,
                message: 'Nomor HP atau password salah.'
            });
        }

        const role = user.driver_status === 'approved'
            ? 'driver'
            : 'penumpang';

        const token = createToken(user);

        return res.json({
            success: true,
            token,
            user: {
                id: user.id,
                nama: user.nama,
                no_hp: user.no_hp,
                role,
                driverStatus: user.driver_status || null,
                hasSecurityQuestion: Boolean(user.security_question)
            }
        });
    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Login gagal. Periksa server database.'
        });
    }
});


// PENGATURAN PERTANYAAN KEAMANAN AKUN LAMA
app.post('/api/security-question', authenticate, async (req, res) => {
    const question = String(req.body.security_question || '').trim();
    const answer = String(req.body.security_answer || '')
        .trim().toLowerCase().replace(/\s+/g, ' ');

    if (question.length < 5 || question.length > 200 ||
        Buffer.byteLength(answer, 'utf8') < 2 ||
        Buffer.byteLength(answer, 'utf8') > 72) {
        return res.status(400).json({
            success: false,
            message: 'Pertanyaan 5-200 karakter dan jawaban 2-72 byte.'
        });
    }

    try {
        const answerHash = await bcrypt.hash(answer, 12);
        const result = await pool.query(
            `UPDATE users
             SET security_question = $1, security_answer_hash = $2
             WHERE id = $3 AND security_question IS NULL
             RETURNING id`,
            [question, answerHash, req.user.id]
        );

        if (!result.rows.length) {
            return res.status(409).json({
                success: false,
                message: 'Pertanyaan keamanan sudah pernah diatur atau akun tidak ditemukan.'
            });
        }

        return res.json({
            success: true,
            message: 'Pertanyaan keamanan berhasil disimpan.'
        });
    } catch (err) {
        console.error('Security question error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Gagal menyimpan pertanyaan keamanan.'
        });
    }
});


// CARI PERTANYAAN KEAMANAN UNTUK LUPA PASSWORD
app.post('/api/forgot-password/question', async (req, res) => {
    const no_hp = String(req.body.no_hp || '').trim();

    if (!/^08[0-9]{8,13}$/.test(no_hp)) {
        return res.status(400).json({
            success: false,
            message: 'Format nomor HP tidak valid.'
        });
    }

    try {
        const result = await pool.query(
            `SELECT security_question
             FROM users
             WHERE no_hp = $1
               AND is_active = TRUE
               AND security_question IS NOT NULL
               AND security_answer_hash IS NOT NULL`,
            [no_hp]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Akun tidak ditemukan atau belum memiliki pertanyaan keamanan.'
            });
        }

        return res.json({
            success: true,
            security_question: result.rows[0].security_question
        });
    } catch (err) {
        console.error('Forgot password question error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil pertanyaan keamanan.'
        });
    }
});


// RESET PASSWORD DENGAN JAWABAN KEAMANAN
app.post('/api/forgot-password/reset', async (req, res) => {
    const no_hp = String(req.body.no_hp || '').trim();
    const answer = String(req.body.security_answer || '')
        .trim().toLowerCase().replace(/\s+/g, ' ');
    const newPassword = String(req.body.new_password || '');

    if (!/^08[0-9]{8,13}$/.test(no_hp) ||
        Buffer.byteLength(answer, 'utf8') < 2 ||
        Buffer.byteLength(answer, 'utf8') > 72 ||
        newPassword.length < 8 || newPassword.length > 72) {
        return res.status(400).json({
            success: false,
            message: 'Periksa nomor HP, jawaban keamanan, dan password baru minimal 8 karakter.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `SELECT id, security_answer_hash, security_answer_attempts,
                    security_locked_until
             FROM users
             WHERE no_hp = $1 AND is_active = TRUE
             FOR UPDATE`,
            [no_hp]
        );

        if (!result.rows.length ||
            !result.rows[0].security_answer_hash) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Nomor HP atau jawaban keamanan salah.'
            });
        }

        const user = result.rows[0];

        if (user.security_locked_until &&
            new Date(user.security_locked_until) > new Date()) {
            await client.query('ROLLBACK');
            return res.status(429).json({
                success: false,
                message: 'Terlalu banyak percobaan. Coba lagi setelah 15 menit.'
            });
        }

        const valid = await bcrypt.compare(
            answer,
            user.security_answer_hash
        );

        if (!valid) {
            const attempts = Number(user.security_answer_attempts || 0) + 1;

            await client.query(
                `UPDATE users
                 SET security_answer_attempts = $1,
                     security_locked_until = CASE
                         WHEN $1 >= 5 THEN NOW() + INTERVAL '15 minutes'
                         ELSE NULL
                     END
                 WHERE id = $2`,
                [attempts, user.id]
            );

            await client.query('COMMIT');

            return res.status(400).json({
                success: false,
                message: attempts >= 5
                    ? 'Jawaban salah 5 kali. Akun dikunci selama 15 menit.'
                    : `Jawaban salah. Sisa percobaan: ${5 - attempts}.`
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await client.query(
            `UPDATE users
             SET password_hash = $1,
                 security_answer_attempts = 0,
                 security_locked_until = NULL,
                 updated_at = NOW()
             WHERE id = $2`,
            [passwordHash, user.id]
        );

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: 'Password berhasil diubah. Silakan login kembali.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Forgot password reset error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengubah password.'
        });
    } finally {
        client.release();
    }
});

// PROFIL AKUN
app.get('/api/me', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.nama, u.no_hp,
                    d.status AS driver_status
             FROM users u
             LEFT JOIN driver_profiles d ON d.user_id = u.id
             WHERE u.id = $1 AND u.is_active = TRUE`,
            [req.user.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false });
        }

        const u = result.rows[0];

        res.json({
            success: true,
            user: {
                id: u.id,
                nama: u.nama,
                no_hp: u.no_hp,
                role: u.driver_status === 'approved' ? 'driver' : 'penumpang',
                driverStatus: u.driver_status || null
            }
        });
    } catch (err) {
        console.error('Profile error:', err.message);
        res.status(500).json({ success: false });
    }
});

// SOCKET.IO: wajib memakai token login
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Login diperlukan'));

        socket.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        next(new Error('Sesi tidak valid'));
    }
});

io.on('connection', async (socket) => {
    const userId = socket.user.id;

    try {
        const result = await pool.query(
            `SELECT u.is_active, d.status AS driver_status
             FROM users u
             LEFT JOIN driver_profiles d ON d.user_id = u.id
             WHERE u.id = $1`,
            [userId]
        );

        if (!result.rows.length || !result.rows[0].is_active) {
            socket.disconnect(true);
            return;
        }

        const account = result.rows[0];

        socket.join(`user_${userId}`);

        socket.on('register_driver', async () => {
            const check = await pool.query(
                `SELECT status FROM driver_profiles WHERE user_id = $1`,
                [userId]
            );

            if (check.rows[0]?.status !== 'approved') {
                socket.emit('driver_not_approved', {
                    message: 'Akun driver belum disetujui admin.'
                });
                return;
            }

            socket.join('drivers_room');
            socket.emit('driver_ready');
        });

        socket.on('new_order', (data) => {
            if (!data || account.driver_status === 'approved') return;

            const order = {
                passengerName: socket.user.nama,
                pickup: String(data.pickup || '').slice(0, 300),
                destination: String(data.destination || '').slice(0, 300),
                distance: Number(data.distance) || 0,
                fare: String(data.fare || '').slice(0, 50),
                layanan: String(data.layanan || 'ojek').slice(0, 40)
            };

            io.to('drivers_room').emit('incoming_order', order);
        });

        socket.on('send_message', (data) => {
            if (!data || typeof data.pesan !== 'string') return;

            const pesan = data.pesan.trim().slice(0, 1000);
            if (!pesan) return;

            socket.broadcast.emit('receive_message', {
                senderRole: account.driver_status === 'approved'
                    ? 'driver' : 'passenger',
                pesan
            });
        });

        socket.on('disconnect', () => {});
    } catch (err) {
        console.error('Socket error:', err.message);
        socket.disconnect(true);
    }
});

const PORT = Number(process.env.PORT) || 4000;

server.listen(PORT, () => {
    console.log(`Server NGAJOL berjalan di port ${PORT}`);
});

process.on('SIGTERM', async () => {
    await pool.end();
    server.close();
});
