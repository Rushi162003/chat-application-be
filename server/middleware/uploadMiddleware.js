const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

const parseSingleFile = (req, res, next) => {
    upload.any()(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message });
        if (!req.files?.length) {
            return res.status(400).json({ message: "No file uploaded" });
        }
        req.file = req.files[0];
        next();
    });
};

module.exports = { parseSingleFile };
