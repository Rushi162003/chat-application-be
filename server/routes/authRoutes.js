const express = require('express');
const { signup, login } = require('../controllers/authController');
const morgan = require('morgan');

const router = express.Router();
router.use(morgan('dev'));

router.post('/signup', signup);
router.post('/login', login);

module.exports = router;