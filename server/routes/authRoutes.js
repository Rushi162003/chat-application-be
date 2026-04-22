const express = require('express');
const { signup, login, getMe } = require('../controllers/authController');
const morgan = require('morgan');
const protect = require('../middleware/authMiddlewaer');

const router = express.Router();
router.use(morgan('dev'));

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;    