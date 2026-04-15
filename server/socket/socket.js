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

    io.on("connection", (socket) => {
        const userId = socket.user._id.toString();
        console.log(`User connected: ${socket.id}`);

        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId).add(socket.id);

        broadcastOnlineUsers();

        socket.on("join-chat", async (chatId) => {
            if (!chatId) return socket.emit("error", "Chat ID is required");

            const isParticipant = await Chat.findOne({ _id: chatId, participants: { $in: [socket.user._id] } });
            if (!isParticipant) return socket.emit("error", "You are not a participant of this chat");

            socket.join(chatId);
        });

        socket.on("send-message", async ({ chatId, text }) => {
            if (!chatId || !text) return;
            const isParticipant = await Chat.findOne({ _id: chatId, participants: { $in: [socket.user._id] } });

            if (!isParticipant) return socket.emit("error", "You are not a participant of this chat");

            const message = await Message.create({ chatId, senderId: socket.user._id, text });
            await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, updatedAt: new Date() });
            io.to(chatId.toString()).emit("receive-message", message);
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
    });


};

module.exports = initSocket;