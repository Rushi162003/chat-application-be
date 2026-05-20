const express = require("express");
const morgan = require("morgan");
const protect = require("../middleware/authMiddlewaer");
const { uploadKeyBundle, getKeyBundle } = require("../controllers/userKeyBundle");

const router = express.Router();
router.use(morgan("dev"));

router.post("/upload", protect, uploadKeyBundle);
router.get("/:userId", protect, getKeyBundle);

module.exports = router;