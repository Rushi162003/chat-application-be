const express = require('express');
const morgan = require('morgan');
const protect = require('../middleware/authMiddlewaer');
const { parseSingleFile } = require('../middleware/uploadMiddleware');
const { uploadImage, uploadVideo } = require('../controllers/cloudinaryController');

const router = express.Router();
router.use(morgan('dev'));

router.post("/image", protect, parseSingleFile, uploadImage);
router.post("/video", protect, parseSingleFile, uploadVideo);

module.exports = router;