const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

const initSocket = (httpServer) => {

    const onlineUsers = new Map();
    const activeCalls = new Set();
    const callSessions = new Map();

    const io = new Server(httpServer, {
        cors: {
            origin: "*"
        },
    });

    const broadcastOnlineUsers = () => {
        const onlineUserIds = Array.from(onlineUsers.keys()); // unique user ids
        io.emit("online-users", onlineUserIds);
    };

    const toUserIdString = (id) => {
        if (!id) return null;
        if (typeof id === "object" && id._id) return String(id._id);
        return String(id);
    };

    const relayToUser = (toUserId, event, data, fromUserId) => {
        const targetId = toUserIdString(toUserId);
        if (!targetId) return false;
        io.to(targetId).emit(event, { ...data, fromUserId: toUserIdString(fromUserId) });
        return true;
    };

    const isUserOnline = (userId) => onlineUsers.has(toUserIdString(userId));

    const assertDirectChatPeers = async (chatId, userId, toUserId) => {
        const chat = await Chat.findById(chatId).select("participants type").lean();
        if (!chat) return { ok: false, message: "Chat not found" };
        const ids = chat.participants.map((p) => p.toString());
        const uid = toUserIdString(userId);
        const tid = toUserIdString(toUserId);
        if (!ids.includes(uid)) return { ok: false, message: "Not a participant" };
        if (!ids.includes(tid)) return { ok: false, message: "User is not in this chat" };
        if (uid === tid) return { ok: false, message: "Cannot call yourself" };
        return { ok: true };
    };

    const normalizeSessionDescription = (raw) => {
        if (!raw) return null;
        if (typeof raw === "string") return { type: "offer", sdp: raw };
        if (raw.type && raw.sdp) return { type: raw.type, sdp: raw.sdp };
        if (raw.sdp?.type && raw.sdp?.sdp) return { type: raw.sdp.type, sdp: raw.sdp.sdp };
        return null;
    };

    const normalizeIceCandidate = (raw) => {
        if (raw === null) return null;
        if (raw === undefined) return undefined;
        const src = raw.candidate !== undefined ? raw : { candidate: raw };
        return {
            candidate: src.candidate ?? "",
            sdpMid: src.sdpMid ?? null,
            sdpMLineIndex: src.sdpMLineIndex ?? null,
            ...(src.usernameFragment != null && { usernameFragment: src.usernameFragment }),
        };
    };

    const getCallSession = (callId) => callSessions.get(String(callId));

    const resolveCallPeerId = (callId, senderId, toUserId) => {
        const session = getCallSession(callId);
        const sender = toUserIdString(senderId);
        if (!session) return toUserIdString(toUserId);
        if (sender !== session.callerId && sender !== session.calleeId) return null;
        const expectedPeer =
            sender === session.callerId ? session.calleeId : session.callerId;
        const requested = toUserIdString(toUserId);
        return requested === expectedPeer ? requested : expectedPeer;
    };

    const endCallSession = (callId) => {
        const session = getCallSession(callId);
        if (!session) return;
        activeCalls.delete(session.callerId);
        activeCalls.delete(session.calleeId);
        callSessions.delete(String(callId));
    };

    const markCallActive = (callId) => {
        const session = getCallSession(callId);
        if (!session) return;
        activeCalls.add(session.callerId);
        activeCalls.add(session.calleeId);
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

        socket.on("send-message", async ({ chatId, text, location }) => {
            if (!chatId || (!text && !location)) return;
            const isParticipant = await Chat.findOne({ _id: chatId, participants: { $in: [socket.user._id] } });

            if (!isParticipant) return socket.emit("error", "You are not a participant of this chat");

            const message = await Message.create({ chatId, senderId: socket.user._id, text, location, type: text ? "text" : "location" });
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

        socket.on("call-user", async ({ toUserId, chatId, callType, callId }) => {
            const calleeId = toUserIdString(toUserId);
            const callKey = callId != null ? String(callId) : null;
            if (!calleeId || !chatId || !callType || !callKey) return;

            const check = await assertDirectChatPeers(chatId, userId, calleeId);
            if (!check.ok) return socket.emit("error", check.message);

            if (activeCalls.has(calleeId)) {
                return socket.emit("call-busy", { callId: callKey, reason: "busy" });
            }

            if (!isUserOnline(calleeId)) {
                return socket.emit("call-offline", { callId: callKey, reason: "offline" });
            }

            callSessions.set(callKey, {
                callerId: userId,
                calleeId,
                chatId: String(chatId),
            });

            relayToUser(calleeId, "incoming-call", {
                callId: callKey,
                chatId: String(chatId),
                callType,
                fromUserName: socket.user.name,
            }, userId);
        });

        socket.on("call-accepted", ({ toUserId, callId }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            if (!callKey || !peerId) return;
            markCallActive(callKey);
            relayToUser(peerId, "call-accepted", { callId: callKey }, userId);
        });

        socket.on("call-rejected", ({ toUserId, callId }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            if (!callKey || !peerId) return;
            relayToUser(peerId, "call-rejected", { callId: callKey, reason: "rejected" }, userId);
            endCallSession(callKey);
        });

        socket.on("call-ended", ({ toUserId, callId }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            if (!callKey || !peerId) return;
            relayToUser(peerId, "call-ended", { callId: callKey, reason: "ended" }, userId);
            endCallSession(callKey);
        });

        socket.on("call-busy", ({ toUserId, callId }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            if (!callKey || !peerId) return;
            relayToUser(peerId, "call-busy", { callId: callKey, reason: "busy" }, userId);
            endCallSession(callKey);
        });

        socket.on("webrtc-offer", ({ toUserId, callId, sdp, offer }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            const sessionDescription = normalizeSessionDescription(sdp ?? offer);
            if (!callKey || !peerId || !sessionDescription) return;
            relayToUser(peerId, "webrtc-offer", { callId: callKey, sdp: sessionDescription }, userId);
        });

        socket.on("webrtc-answer", ({ toUserId, callId, sdp, answer }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            const sessionDescription = normalizeSessionDescription(sdp ?? answer);
            if (!callKey || !peerId || !sessionDescription) return;
            relayToUser(peerId, "webrtc-answer", { callId: callKey, sdp: sessionDescription }, userId);
        });

        socket.on("ice-candidate", ({ toUserId, callId, candidate }) => {
            const callKey = callId != null ? String(callId) : null;
            const peerId = resolveCallPeerId(callKey, userId, toUserId);
            if (!callKey || !peerId) return;
            if (candidate === undefined) return;
            const normalized = normalizeIceCandidate(candidate);
            if (normalized === undefined) return;
            relayToUser(peerId, "ice-candidate", { callId: callKey, candidate: normalized }, userId);
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
            const sockets = onlineUsers.get(userId);
            if (!sockets) return;
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                onlineUsers.delete(userId);
                broadcastOnlineUsers();

                const activeCallKeys = [];
                for (const [callKey, session] of callSessions.entries()) {
                    if (session.callerId !== userId && session.calleeId !== userId) continue;
                    activeCallKeys.push({
                        callKey,
                        peerId: session.callerId === userId ? session.calleeId : session.callerId,
                    });
                }
                for (const { callKey, peerId } of activeCallKeys) {
                    relayToUser(peerId, "call-ended", { callId: callKey, reason: "ended" }, userId);
                    endCallSession(callKey);
                }
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

        socket.on("edit-message", async ({ chatId, messageId, text }) => {
            if (!chatId || !messageId || !text) return;
            const message = await Message.findByIdAndUpdate(messageId, { text }, { new: true });
            if (!message) return;
            await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, updatedAt: new Date() });
            const chat = await Chat.findById(chatId);
            const participantIds = chat.participants.map(participant => participant.toString());
            participantIds.forEach((participantId) => {
                io.to(participantId).emit("message-edited", message);
            });
            await emitReceiptToParticipants(chatId, { type: "edited", chatId: String(chatId), message });
        });

        socket.on("delete-message", async ({ chatId, messageId }) => {
            if (!chatId || !messageId) return;
            const message = await Message.findByIdAndDelete(messageId);
            if (!message) return;
            await Chat.findByIdAndUpdate(chatId, { $pull: { messages: messageId } });
            const chat = await Chat.findById(chatId);
            const participantIds = chat.participants.map(participant => participant.toString());
            participantIds.forEach((participantId) => {
                io.to(participantId).emit("message-deleted", { chatId: String(chatId), messageId });
            });
        });


    });
}
module.exports = initSocket;