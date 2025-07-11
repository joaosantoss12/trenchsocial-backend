import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

import { connectToMongo } from "./db/mongoClient.js";
import { createPostsRouter } from "./routes/posts.js";
import { createUsersRouter } from "./routes/users.js";
import { createMessagesRouter } from "./routes/messages.js";
import { createReportsRouter } from "./routes/reports.js";
import { createAuthRouter } from "./routes/auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// MIDDLEWARE
app.use(cors());
app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

(async () => {
  const { postsCollection, usersCollection, commentsCollection, chatMessagesCollection, privateMessagesCollection, reportsCollection, verificationCodesCollection } = await connectToMongo();
  console.log("✅ Connected to MongoDB");

  // REST routes
  app.use("/api/posts", createPostsRouter(postsCollection, usersCollection));
  app.use("/api/users", createUsersRouter(usersCollection, postsCollection, commentsCollection));
  app.use("/api/messages", createMessagesRouter(privateMessagesCollection, usersCollection));
  app.use("/api/reports", createReportsRouter(reportsCollection));
  app.use("/api/auth", createAuthRouter(usersCollection, verificationCodesCollection));

  let connectedUsers = 0;
  // WebSocket logic
  io.on("connection", async (socket) => {
    connectedUsers++;
    console.log(`🟢 User connected (${connectedUsers} online)`);
    io.emit("usersOnline", connectedUsers); 

    const lastMessages = await chatMessagesCollection
      .find()
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    socket.emit("loadMessages", lastMessages.reverse());

    socket.on("sendMessage", async (msg) => {
      msg.timestamp = new Date();

      const user = await usersCollection.findOne({ username: msg.username });
      msg.verified = user?.verified || false;

      await chatMessagesCollection.insertOne(msg);

      const total = await chatMessagesCollection.countDocuments();
      if (total > 100) {
        const excess = total - 100;
        const oldMessages = await chatMessagesCollection
          .find()
          .sort({ timestamp: 1 })
          .limit(excess)
          .toArray();

        for (const doc of oldMessages) {
          await chatMessagesCollection.deleteOne({ _id: doc._id });
        }
      }

      io.emit("receiveMessage", msg);
    });
  });

  io.on("disconnect", () => {
    connectedUsers--;
    console.log(`🔴 User disconnected (${connectedUsers} online)`);
    io.emit("usersOnline", connectedUsers);
  });

  // Start HTTP + WebSocket server
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})();
