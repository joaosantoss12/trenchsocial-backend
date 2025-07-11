import express from "express";
import { ObjectId } from "mongodb";

const sendError = (res, status, message) => res.status(status).json({ message });

export function createMessagesRouter(privateMessagesCollection, usersCollection) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const { senderId, receiverUsername, content } = req.body;

    const receiver = await usersCollection.findOne({ username: receiverUsername });

    if (!receiver) {
    console.log("Receiver not found for username:", receiverUsername);
    return sendError(res, 400, "Receiver not found.");
    }


    if (!senderId || !receiver._id || !content) {
        return sendError(res, 400, "senderId, receiverId and content are required.");
    }

    if (!ObjectId.isValid(senderId) || !ObjectId.isValid(receiver._id)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    try {
      const newMessage = {
        senderId: new ObjectId(senderId),
        receiverId: new ObjectId(receiver._id),
        content,
        createdAt: new Date(),
      };

      const result = await privateMessagesCollection.insertOne(newMessage);
      return res.status(201).json({ message: "Message sent.", id: result.insertedId });

    } catch (error) {
      console.error("Error sending message:", error);
      sendError(res, 500, "Internal server error.");
    }
  });


router.get("/conversations/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const conversations = await privateMessagesCollection.aggregate([
      {
        $match: {
          $or: [
            { senderId: new ObjectId(userId) },
            { receiverId: new ObjectId(userId) },
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            participants: {
              $cond: [
                { $gt: ["$senderId", "$receiverId"] },
                ["$receiverId", "$senderId"],
                ["$senderId", "$receiverId"]
              ]
            }
          },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $project: {
          lastMessage: 1,
          otherUserId: {
            $cond: [
              { $eq: ["$lastMessage.senderId", new ObjectId(userId)] },
              "$lastMessage.receiverId",
              "$lastMessage.senderId"
            ]
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "otherUserId",
          foreignField: "_id",
          as: "otherUser"
        }
      },
      { $unwind: "$otherUser" },
      {
        $project: {
          id: "$otherUser._id",
          userId: "$otherUser._id",
          userName: "$otherUser.name",
          userUsername: "$otherUser.username",
          userImage: "$otherUser.imageURL",
          lastMessage: {
            id: "$lastMessage._id",
            senderId: "$lastMessage.senderId",
            receiverId: "$lastMessage.receiverId",
            content: "$lastMessage.content",
            timestamp: "$lastMessage.createdAt"
          }
        }
      },
      { $sort: { "lastMessage.timestamp": -1 } }
    ]).toArray();

    return res.status(200).json(conversations);
  } catch (err) {
    console.error("Error fetching conversations:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
});



  router.get("/between/:user1Id/:user2Id", async (req, res) => {
    const { user1Id, user2Id } = req.params;

    try {
      const messages = await privateMessagesCollection.aggregate([
        {
          $match: {
            $or: [
              { senderId: new ObjectId(user1Id), receiverId: new ObjectId(user2Id) },
              { senderId: new ObjectId(user2Id), receiverId: new ObjectId(user1Id) },
            ],
          },
        },
        // Lookup para obter info do sender
        {
          $lookup: {
            from: "users",
            localField: "senderId",
            foreignField: "_id",
            as: "senderInfo"
          }
        },
        { $unwind: "$senderInfo" },
        // Lookup para obter info do receiver
        {
          $lookup: {
            from: "users",
            localField: "receiverId",
            foreignField: "_id",
            as: "receiverInfo"
          }
        },
        { $unwind: "$receiverInfo" },
        {
          $project: {
            content: 1,
            createdAt: 1,
            sender: {
              id: "$senderInfo._id",
              name: "$senderInfo.name",
              username: "$senderInfo.username",
              imageURL: "$senderInfo.imageURL"
            },
            receiver: {
              id: "$receiverInfo._id",
              name: "$receiverInfo.name",
              username: "$receiverInfo.username",
              imageURL: "$receiverInfo.imageURL"
            }
          }
        },
        { $sort: { createdAt: 1 } } // ordenar por data
      ]).toArray();

      return res.status(200).json(messages);

    } catch (err) {
      console.error("Error fetching messages:", err);
      return res.status(500).json({ message: "Internal server error." });
    }
  });

  return router;
}
