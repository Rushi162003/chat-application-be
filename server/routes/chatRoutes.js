const express = require('express');
const { createChat, getChats, getChat, getMessages, createMessage } = require('../controllers/chatController');
const protect = require('../middleware/authMiddlewaer');
const morgan = require('morgan');

const router = express.Router();
router.use(morgan('dev'));

router.post('/', protect, createChat);
router.get('/', protect, getChats);
router.get('/:id', protect, getChat);
router.post('/:id/message', protect, createMessage);
router.get('/:id/messages', protect, getMessages);
module.exports = router;