// routes/users.js
import express from "express";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuração do multer para enviar direto para o Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "profilePictures",  // pasta dentro do Cloudinary
    allowed_formats: ["jpg", "jpeg", "png"],
  },
});

export const upload = multer({ storage });
export { cloudinary };



// LOCAL IMAGE URL SAVE
import multer from "multer";
import { ObjectId } from "mongodb";

const JWT_SECRET = process.env.JWT_SECRET;

const sendError = (res, status, message) => res.status(status).json({ message });


// users, posts, comments because of profile update
export function createUsersRouter(usersCollection, postsCollection, commentsCollection) {
  const router = express.Router();

  // GET all users
  router.get("/", async (req, res) => {
    try {
      const users = await usersCollection.find().toArray();
      // Exclude password, followers, following, createdat, verified
      const usersWithoutDetails = users.map(user => {
        const { password, followers, following, createdAt, verified, ...userData } = user;
        return userData;
      });
      res.status(200).json(usersWithoutDetails);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  });

  // 🚀 Register endpoint
  router.post("/register", async (req, res) => {
    let { email, password, name, username } = req.body;

    if (!email || !password || !name || !username) {
      return sendError(res, 400, "All fields are required.");
    }

    username = username.trim().toLowerCase();
    email = email.trim().toLowerCase();

    try {
       const emailExists = await usersCollection.findOne({ email });
      if (emailExists) return sendError(res, 409, "This email already exists.");

      const usernameExists = await usersCollection.findOne({ username });
      if (usernameExists) return sendError(res, 409, "This username is already in use.");

      const hashedPassword = await bcrypt.hash(password, 10);

      const defaultImageURL  = "https://upload.wikimedia.org/wikipedia/commons/a/ac/Default_pfp.jpg";
      
      const newUser = {
        email,
        password: hashedPassword,
        name,
        username,
        imageURL: defaultImageURL,
        createdAt: new Date(),
        followers: [],
        following: [],
        verified: false,
      };

      await usersCollection.insertOne(newUser);
      return res.status(201).json({ message: `Successfully registered as @${username}` });
    
    } catch (error) {
      console.error("Error during registration:", error + ' ' + error.message);
      return sendError(res, 500, "Internal server error." + error.message);
    }
  });


  // 🚪 Login endpoint
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) return sendError(res, 400, "Email and password are required.");

    try {
        const user = await usersCollection.findOne({ email });

        if (!user) return sendError(res, 401, "Invalid credentials.");

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) return sendError(res, 401, "Invalid credentials.");

        /* const token = jwt.sign(
        {
            id: user._id,
            email: user.email,
            username: user.username,
        },
        JWT_SECRET,
          { expiresIn: "7d" }
        ); */

        return res.status(200).json({
            message: "Welcome back @" + user.username + user.verified,
            //token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                imageURL: user.imageURL,
                createdAt: user.createdAt,
                followers: user.followers || [],
                following: user.following || [],
                verified: user.verified,
            }
        });
    } catch (error) {
      return sendError(res, 500, "Internal server error.");
    }
  });


    // GET /api/users/most-followers
  router.get("/most-followers", async (req, res) => {
    try {
      const users = await usersCollection
        .aggregate([
          { $addFields: { followerCount: { $size: "$followers" } } },
          { $sort: { followerCount: -1 } },
          { $limit: 5 }
        ])
        .toArray();

      res.json(users);
    } catch (error) {
      console.error("Error fetching most followed users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });



// GET /api/users/most-contributions
router.get("/most-contributions", async (req, res) => {
  try {

    const postsByUser = await postsCollection.aggregate([
      { $group: { _id: "$username", postCount: { $sum: 1 } } }
    ]).toArray();

    const commentsByUser = await commentsCollection.aggregate([
      { $group: { _id: "$username", commentCount: { $sum: 1 } } }
    ]).toArray();


    const contributionsMap = new Map();
    postsByUser.forEach(({ _id, postCount }) => {
      contributionsMap.set(_id, { username: _id, postCount, commentCount: 0 });
    });
    commentsByUser.forEach(({ _id, commentCount }) => {
      if (contributionsMap.has(_id)) {
        contributionsMap.get(_id).commentCount = commentCount;
      } else {
        contributionsMap.set(_id, { username: _id, postCount: 0, commentCount });
      }
    });

    const users = await usersCollection
      .find({ username: { $in: Array.from(contributionsMap.keys()) } })
      .project({ _id: 1, username: 1, name: 1, imageURL: 1, verified: 1 })
      .toArray();

    const result = users
      .map(u => {
        const c = contributionsMap.get(u.username) || { postCount: 0, commentCount: 0 };
        return {
          id: u._id,
          name: u.name,
          username: u.username,
          imageURL: u.imageURL,
          verified: u.verified,
          postCount: c.postCount,
          commentCount: c.commentCount,
          total: c.postCount + c.commentCount
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    res.json(result);
  } catch (err) {
    console.error("Error fetching most contributions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/users/most-posts
router.get("/most-posts", async (req, res) => {
  try {

    const postsByUser = await postsCollection.aggregate([
      { $group: { _id: "$username", postCount: { $sum: 1 } } },
      { $sort: { postCount: -1 } },
      { $limit: 5 }                      
    ]).toArray();


    const usernames = postsByUser.map(p => p._id);

    const users = await usersCollection
      .find({ username: { $in: usernames } })
      .project({ _id: 1, username: 1, name: 1, imageURL: 1, verified: 1 })
      .toArray();


    const result = postsByUser.map(p => {
      const u = users.find(x => x.username === p._id);
      if (!u) return null;              
      return {
        id: u._id,
        name: u.name,
        username: u.username,
        imageURL: u.imageURL,
        verified: u.verified,
        postCount: p.postCount
      };
    }).filter(Boolean);

    return res.json(result);
  } catch (error) {
    console.error("Error fetching most posts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// PUT /api/users/:id
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { currentEmail, name, username, email } = req.body;
  const imageFile = req.file;

  if (!name || !email)
    return sendError(res, 400, "Name and email are required.");

  const updatedData = { name, email };
  if (imageFile) updatedData.imageURL = imageFile.path;

  try {
    if (!ObjectId.isValid(id)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    // Verificar se o novo email já está em uso
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser && existingUser.email !== currentEmail) {
      return sendError(res, 400, "Email already used.");
    }

    // 1. PRIMEIRO: Buscar o usuário atual ANTES de alterar
    const currentUser = await usersCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );

    if (!currentUser) {
      return sendError(res, 404, "User not found.");
    }

    console.log("Current user before update:", {
      name: currentUser.name,
      email: currentUser.email,
      username: currentUser.username
    });

    // 2. SEGUNDO: Atualizar o usuário na base de dados PRIMEIRO
    const updateResult = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    if (updateResult.matchedCount === 0) {
      return sendError(res, 404, "User not found.");
    }

    // 3. TERCEIRO: Só após sucesso na atualização do usuário, atualizar posts e comments
    const newUserData = {
      name: updatedData.name,
      email: updatedData.email,
      imageURL: updatedData.imageURL || currentUser.imageURL
    };

    // Atualizar posts do usuário (usando username que nunca muda)
    const postsUpdateResult = await postsCollection.updateMany(
      { "username": currentUser.username },
      { 
        $set: { 
          "name": newUserData.name,
          "imageURL": newUserData.imageURL
        }
      }
    );

    // Atualizar comments dentro dos posts (usando username que nunca muda)
      const postCommentsUpdateResult = await postsCollection.updateMany(
        { "comments.username": currentUser.username },
        { 
          $set: { 
            "comments.$[elem].name": newUserData.name,
            "comments.$[elem].imageURL": newUserData.imageURL
          }
        },
        {
          arrayFilters: [{ "elem.username": currentUser.username }]
        }
      );

    // 4. QUARTO: Buscar o usuário atualizado
    const updatedUser = await usersCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );

    // Adicionar o campo 'id' para compatibilidade
    if (updatedUser && !updatedUser.id) {
      updatedUser.id = updatedUser._id.toString();
    }

    console.log("✅ User updated successfully");
    console.log(`✅ Updated ${postsUpdateResult.modifiedCount} posts`);
    console.log(`✅ Updated ${postCommentsUpdateResult.modifiedCount} post comments`);
    
    return res.status(200).json(updatedUser);

  } catch (err) {
    console.error("❌ Profile update error:", err);
    return sendError(res, 500, "Internal server error.");
  }
});

// GET USER INFO BY ID
router.get("/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Exclude password from the response
    const { password, ...userData } = user;

    return res.status(200).json(userData);
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});


// GET USER INFO BY USERNAME
router.get("/username/:username", async (req, res) => {
  const username = req.params.username;

  try {
    const user = await usersCollection.findOne({ username: username });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user by username:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/:username/follow", async (req, res) => {
  const targetUsername = req.params.username;
  const { followerId, followerName, followerUsername, followerImageURL } = req.body;

  console.log("Follower ID:", followerId);
  console.log("Target Username:", targetUsername);
  console.log("Follower Name:", followerName);
  console.log("Follower Username:", followerUsername);

  if (!followerId || !targetUsername) {
    return res.status(400).json({ message: "Follower ID and Target username are required." });
  }

  if (!ObjectId.isValid(followerId)) {
    return res.status(400).json({ message: "Invalid follower ID." });
  }

  try {
    // Buscar usuário alvo pelo username
    const targetUser = await usersCollection.findOne({ username: targetUsername });
    const followerUser = await usersCollection.findOne({ _id: new ObjectId(followerId) });

    if (!targetUser || !followerUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if already following
    const isAlreadyFollowing = targetUser.followers?.some(f => f.id === followerId);
    if (isAlreadyFollowing) {
      return res.status(400).json({ message: "You are already following this user." });
    }

    // Add follower to target user
    await usersCollection.updateOne(
      { username: targetUsername },
      {
        $push: {
          followers: {
            id: followerId,
            name: followerName,
            username: followerUsername,
            imageURL: followerImageURL,
          },
        },
      }
    );

    // Add target to follower's following list
    await usersCollection.updateOne(
      { _id: new ObjectId(followerId) },
      {
        $push: {
          following: {
            id: targetUser._id.toString(),
            name: targetUser.name,
            username: targetUser.username,
            imageURL: targetUser.imageURL,
          },
        },
      }
    );

    return res.status(200).json({
      message: `Successfully followed ${targetUser.username}`,
      follower: {
        id: followerId,
        name: followerName,
        username: followerUsername,
        imageURL: followerImageURL,
      },
      target: {
        id: targetUser._id.toString(),
        name: targetUser.name,
        username: targetUser.username,
        imageURL: targetUser.imageURL,
      }
    });
  } catch (error) {
    console.error("Error following user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});


router.post("/:username/unfollow", async (req, res) => {
  const targetUsername = req.params.username;
  const { followerId } = req.body;

  if (!followerId || !targetUsername) {
    return res.status(400).json({ message: "Follower ID and Target username are required." });
  }

  if (!ObjectId.isValid(followerId)) {
    return res.status(400).json({ message: "Invalid follower ID." });
  }

  try {
    const targetUser = await usersCollection.findOne({ username: targetUsername });
    const followerUser = await usersCollection.findOne({ _id: new ObjectId(followerId) });

    if (!targetUser || !followerUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if actually following
    const isFollowing = targetUser.followers?.some(f => f.id === followerId);
    if (!isFollowing) {
      return res.status(400).json({ message: "You are not following this user." });
    }

    // Remove follower from target user
    await usersCollection.updateOne(
      { username: targetUsername },
      {
        $pull: {
          followers: { id: followerId }
        }
      }
    );

    // Remove target from follower's following list
    await usersCollection.updateOne(
      { _id: new ObjectId(followerId) },
      {
        $pull: {
          following: { id: targetUser._id.toString() }
        }
      }
    );

    return res.status(200).json({
      message: `Successfully unfollowed ${targetUser.username}`,
      unfollowedUserUsername: targetUsername
    });
  } catch (error) {
    console.error("Error unfollowing user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});


  
  // VERIFY USER BY USERNAME
  router.patch("/verify/:username", async (req, res) => {
    const username = req.params.username;

    try {
      const result = await usersCollection.updateOne(
        { username: username },
        { $set: { verified: true } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "User not found. Verification will be made manually." });
      }

      return res.status(200).json({ message: "User verified successfully." });
    } catch (error) {
      console.error("Error verifying user by username:", error);
      return res.status(500).json({ message: "Internal server error." });
    }
  });


  return router;
}







