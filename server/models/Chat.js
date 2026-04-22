const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    name: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Chat', chatSchema);