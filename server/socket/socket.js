const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

const initSocket = (httpServer) => {

    const onlineUsers = new Map();

    const io = new Server(httpServer, {
        cors: {
            origin: "*"
        },
    });

    const broadcastOnlineUsers = () => {
        const onlineUserIds = Array.from(onlineUsers.keys()); // unique user ids
        io.emit("online-users", onlineUserIds);
    };

    console.log("Socket initialized");
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error("Unauthorized"));
            }
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select("-password");

            if (!user) {
                return next(new Error("Unauthorized: user not found"));
            }
            socket.user = user;
            next();
        } catch (error) {
            return next(new Error("Unauthorized"));
        }
    })

    io.on("connection", async (socket) => {
        const userId = socket.user._id.toString();
        console.log(`User connected: ${socket.id}`);
        socket.join(userId);

        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId).add(socket.id);

        broadcastOnlineUsers();

        // Mark delivered only for messages in chats this user is in, not sent by them, not already delivered.
        try {
            const userObjectId = socket.user._id;
            const participantChats = await Chat.find({ participants: userObjectId }).select("_id").lean();
            const chatIds = participantChats.map((c) => c._id);
            if (chatIds.length > 0) {
                await Message.updateMany(
                    {
                        chatId: { $in: chatIds },
                        senderId: { $ne: userObjectId },
                        $expr: {
                            $not: { $in: [userObjectId, { $ifNull: ["$deliveredTo", []] }] },
                        },
                    },
                    { $addToSet: { deliveredTo: userObjectId } }
                );
            }
        } catch (e) {
            console.error("Bulk delivered on connect failed:", e);
        }

        socket.on("join-chat", async (chatId) => {
            if (!chatId) return socket.emit("error", "Chat ID is required");

            const isParticipant = await Chat.findOne({ _id: chatId, participants: { $in: [socket.user._id] } });
            if (!isParticipant) return socket.emit("error", "You are not a participant of this chat");

            socket.join(String(chatId));
        });

        socket.on("send-message", async ({ chatId, text }) => {
            if (!chatId || !text) return;
            const isParticipant = await Chat.findOne({ _id: chatId, participants: { $in: [socket.user._id] } });

            if (!isParticipant) return socket.emit("error", "You are not a participant of this chat");

            const message = await Message.create({ chatId, senderId: socket.user._id, text });
            await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, updatedAt: new Date() });
            const chat = await Chat.findById(chatId);
            const participantIds = chat.participants.map(participant => participant.toString());
            participantIds.forEach((participantId) => {
                io.to(participantId).emit("receive-message", message);
            });
        });

        const emitReceiptToParticipants = async (chatId, payload) => {
            const chat = await Chat.findById(chatId).select("participants");
            if (!chat) return;
            chat.participants.forEach((p) => {
                io.to(p.toString()).emit("message-receipt", payload);
            });
        };

        socket.on("recive-message", async ({ chatId, messageId }) => {
            if (!chatId || !messageId) return;
            const message = await Message.findByIdAndUpdate(
                messageId,
                { $addToSet: { deliveredTo: socket.user._id } },
                { new: true }
            );
            if (!message) return;
            await emitReceiptToParticipants(chatId, { type: "delivered", chatId: String(chatId), message });
        });

        socket.on("read-message", async ({ chatId, messageId }) => {
            if (!chatId || !messageId) return;
            const chatRoom = String(chatId);
            if (!socket.rooms.has(chatRoom)) {
                return socket.emit("error", "Join the chat before marking messages as read");
            }
            const isParticipant = await Chat.findOne({ _id: chatId, participants: { $in: [socket.user._id] } });
            if (!isParticipant) return socket.emit("error", "You are not a participant of this chat");

            const existing = await Message.findById(messageId).select("chatId");
            if (!existing || existing.chatId.toString() !== chatRoom) return;

            const message = await Message.findByIdAndUpdate(
                messageId,
                { $addToSet: { readBy: socket.user._id } },
                { new: true }
            );
            if (!message) return;
            await emitReceiptToParticipants(chatId, { type: "read", chatId: chatRoom, message });
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
            const sockets = onlineUsers.get(userId);
            if (!sockets) return;
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                onlineUsers.delete(userId);
                broadcastOnlineUsers();
            }
        });

        socket.on("message-delivered", async ({ chatId, messageId }) => {
            if (!chatId || !messageId) return;
            const message = await Message.findByIdAndUpdate(
                messageId,
                { $addToSet: { deliveredTo: socket.user._id } },
                { new: true }
            );
            if (!message) return;
            await emitReceiptToParticipants(chatId, { type: "delivered", chatId: String(chatId), message });
        });
    });


};

module.exports = initSocket;