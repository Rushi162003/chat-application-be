const Chat = require('../models/Chat');
const Message = require('../models/Message');

exports.createChat = async (req, res) => {
    try {
        const { type, participants } = req.body;
        if (type === 'direct') {
            if (participants.length !== 2) {
                return res.status(400).json({ message: 'Direct chat must have exactly 2 participants' });
            }
            const existingChat = await Chat.findOne({ type, participants: { $all: participants } });
            if (existingChat) {
                return res.status(200).json(existingChat);
            }
            const chat = await Chat.create({ type, participants });
            return res.status(200).json(chat);
        }
        if (type === 'group') {
            if (participants.length < 2) {
                return res.status(400).json({ message: 'Group chat must have at least 2 participants' });
            }
            const existingChat = await Chat.findOne({ type, participants: { $all: participants } });
            if (existingChat) {
                return res.status(200).json(existingChat);
            }
            const chat = await Chat.create({ type, participants });
            return res.status(200).json(chat);
        }
        return res.status(400).json({ message: 'Invalid chat type' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
}

exports.getChats = async (req, res) => {
    try {
        const chats = await Chat.find({ participants: { $in: [req.user._id] } }).sort({ updatedAt: -1 });
        const chatsWithLastMessage = await Promise.all(chats.map(async (chat) => {
            const lastMessage = await Message.findOne({ chatId: chat._id, senderId: { $ne: req.user._id } }).sort({ createdAt: -1 });
            console.log("lastMessage: ", lastMessage);
            console.log("senderId: ", chat.senderId);
            console.log("req.user._id: ", req.user._id);
            return { ...chat._doc, lastMessage };
        }));
        console.log("chatsWithLastMessage: ", chatsWithLastMessage);
        return res.status(200).json(chatsWithLastMessage);
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
}

exports.getChat = async (req, res) => {
    try {
        const chat = await Chat.findOne({ _id: req.params.id, participants: { $in: [req.user._id] } });
        return res.status(200).json(chat);
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
}


exports.createMessage = async (req, res) => {
    try {
        const { text } = req.body;
        const message = await Message.create({ chatId: req.params.id, senderId: req.user._id, text });

        const isParticipant = await Chat.findOne({ _id: req.params.id, participants: { $in: [req.user._id] } });
        if (!isParticipant) {
            return res.status(400).json({ message: 'You are not a participant of this chat' });
        }

        await Chat.findByIdAndUpdate(req.params.id, { lastMessage: message._id, updatedAt: new Date() });

        return res.status(201).json(message);
    } catch (error) {
        console.log("Error in createMessage controller: ", error);
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

exports.getMessages = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    try {
        const messages = await Message.find({ chatId: req.params.id, participants: { $in: [req.user._id] } })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        return res.status(200).json(messages);
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
};
