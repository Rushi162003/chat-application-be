const express = require('express');
const { getAllUsers, getUser } = require('../controllers/userController');
const morgan = require('morgan');
const protect = require('../middleware/authMiddlewaer');

const router = express.Router();
router.use(morgan('dev'));

router.get("/", protect, getAllUsers)
router.get("/:id", protect, getUser)

module.exports = router;