const mongoose = require('mongoose');

const CloudinarySchema = new mongoose.Schema({
    image: { type: Buffer, contentType: String, required: true },
    video: { type: Buffer, contentType: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Cloudinary', CloudinarySchema);