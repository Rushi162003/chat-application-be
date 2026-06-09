const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

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
            const { name, avatar } = req.body;
            if (!name) {
                return res.status(400).json({ message: 'Name is required' });
            }
            if (participants.length < 2) {
                return res.status(400).json({ message: 'Group chat must have at least 2 participants' });
            }
            // const existingChat = await Chat.findOne({ type, participants: { $all: participants } });
            // if (existingChat) {
            //     return res.status(200).json(existingChat);
            // }
            const chat = await Chat.create({ type, participants: [...participants, req.user._id], name, avatar, createdBy: req.user._id });
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
            const lastMessage = await Message.findOne({ chatId: chat._id }).sort({ createdAt: -1 });
            const participants = await User.find({ _id: { $in: chat.participants } }).select('name');
            const receiver = participants.find(participant => participant._id.toString() !== req.user._id.toString());
            const sender = participants.find(participant => participant._id.toString() === req.user._id.toString());
            const unreadCount = await Message.countDocuments({ chatId: chat._id, readBy: { $ne: req.user._id }, senderId: { $ne: req.user._id } });
            return { ...chat._doc, lastMessage, receiver, sender, unreadCount, participants, name: chat.name, avatar: chat.avatar };
        }));
        console.log("chatsWithLastMessage: ", chatsWithLastMessage);
        return res.status(200).json(chatsWithLastMessage);
    } catch (error) {
        console.log("Error in getChats controller: ", error);
        return res.status(500).json({ message: 'Something went wrong' });
    }
}

exports.getChat = async (req, res) => {
    try {
        const chat = await Chat.findOne({ _id: req.params.id, participants: { $in: [req.user._id] } });
        const participants = await User.find({ _id: { $in: chat.participants } }).select(['name', 'email', 'avatar']);
        const createdBy = await User.findById(chat.createdBy).select('name', 'email', 'avatar');

        return res.status(200).json({ ...chat._doc, participants, createdBy });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    } 4
}


exports.createMessage = async (req, res) => {
    try {
        const { text, image, video, location } = req.body;
        const message = await Message.create({ chatId: req.params.id, senderId: req.user._id, text, image, video, location });

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
        const messages = await Message.find({ chatId: req.params.id })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        const participants = await User.find({ _id: { $in: messages.map(message => message.senderId) } }).select(['name', 'email', 'avatar']);
        // return res.status(200).json({ messages, participants });
        return res.status(200).json(messages);
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const message = await Message.findByIdAndDelete(req.params.id);
        return res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
}