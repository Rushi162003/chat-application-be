const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { createServer } = require('http');
const initSocket = require('./socket/socket');

dotenv.config();
connectDB()

const app = express()

app.use(cors());
app.use(express.json());

//routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use("/api/users", require('./routes/userRoutes'));
app.use("/api/chats", require('./routes/chatRoutes'));
app.use("/api/keys", require('./routes/keyBundleRoutes'));

app.get('/', (req, res) => {
    res.send('Api running ');
});

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});