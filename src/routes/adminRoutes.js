const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Halaman Dashboard Admin
router.get('/', adminController.getDashboard);

// API Endpoint untuk Auth Simpel
router.post('/api/register', adminController.registerUser);
router.post('/api/login', adminController.loginUser);

module.exports = router;
