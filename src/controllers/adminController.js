// Simulasi database array lokal (sebelum connect ke PostgreSQL)
const users = [];
const orders = [];

// Register Simpel
exports.registerUser = (req, res) => {
    const { nama, no_hp, password, role } = req.body;
    if (!nama || !no_hp || !password) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap!' });
    }
    
    const userExist = users.find(u => u.no_hp === no_hp);
    if (userExist) {
        return res.status(400).json({ success: false, message: 'No HP sudah terdaftar!' });
    }

    const newUser = { id: users.length + 1, nama, no_hp, password, role: role || 'penumpang' };
    users.push(newUser);
    res.json({ success: true, message: 'Pendaftaran berhasil!', user: newUser });
};

// Login Simpel
exports.loginUser = (req, res) => {
    const { no_hp, password } = req.body;
    const user = users.find(u => u.no_hp === no_hp && u.password === password);
    
    if (!user) {
        return res.status(401).json({ success: false, message: 'No HP atau Password salah!' });
    }
    res.json({ success: true, message: 'Login berhasil!', user });
};

// Dashboard Admin (Pantau Riwayat & Pendapatan)
exports.getDashboard = (req, res) => {
    res.render('dashboard', {
        title: 'Panel Admin Ngajol',
        stats: {
            totalOrders: orders.length,
            activeDrivers: users.filter(u => u.role === 'driver').length,
            totalRevenue: 'Rp ' + orders.reduce((acc, curr) => acc + (curr.tarif || 0), 0).toLocaleString('id-ID')
        }
    });
};
