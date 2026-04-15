const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: "*"
        },
    });
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
        console.log(`User connected: ${socket.id}`);

        socket.on("message", (message) => {
            console.log(`Message received: ${message}`);
            io.emit("receive-message", message);
        });

        socket.on("send-message", (message) => {
            console.log(`Message received: ${message}`);
            io.emit("receive-message", message);
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });


};

module.exports = initSocket;