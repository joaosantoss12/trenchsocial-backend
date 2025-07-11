// routes/posts.js
import express from 'express';

export function createPostsRouter(postsCollection, usersCollection) {
  const router = express.Router();

  // GET /api/posts + find verified users
  router.get("/", async (req, res) => {
    try {
      // Busca os posts
      const posts = await postsCollection.find().sort({ createdAt: -1 }).toArray();

      // Busca os usuários que aparecem nos posts, para evitar várias queries, pegar só os relevantes
      const usernames = [...new Set(posts.map(post => post.username))];
      const users = await usersCollection.find({ username: { $in: usernames } }).toArray();

      // Criar um map username => user
      const usersMap = {};
      users.forEach(user => {
        usersMap[user.username] = user;
      });

      // Adicionar campo verified em cada post, baseado no usuário correspondente
      const postsWithVerified = posts.map(post => ({
        ...post,
        verified: usersMap[post.username]?.verified || false
      }));

      res.json(postsWithVerified);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch posts with verified status" });
    }
  });

  // GET /api/posts/user/:username
  router.get("/user/:username", async (req, res) => {
    const { username } = req.params;

    try {
      const userPosts = await postsCollection
        .find({ username })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json(userPosts);
    } catch (error) {
      console.error("Error fetching posts by username:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // POST /api/posts
  router.post("/", async (req, res) => {
    const { id, name, username, text, images, imageURL, createdAt, likes, retruths, comments } = req.body;

    const newPost = {
      id,
      name,
      username,
      text,
      images: images || [],
      imageURL: imageURL || null,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      likes: likes || [],
      retruths: retruths || [],
      comments: comments || [],
    };

    const result = await postsCollection.insertOne(newPost);
    res.status(201).json({ ...newPost, _id: result.insertedId });
  });

  // POST /api/posts/:id/comments
  router.post("/:id/comments", async (req, res) => {
    const postId = req.params.id;
    const { id, name, username, imageURL, text, createdAt, likes } = req.body;

    const newComment = { id, name, username, imageURL, text, createdAt, likes };

    const result = await postsCollection.updateOne(
      { id: postId },
      { $push: { comments: newComment } }
    );

    if (result.modifiedCount === 1) {
      res.status(201).json(newComment);
    } else {
      res.status(404).json({ error: "Post not found" });
    }
  });


  // PATCH /api/posts/:id/like
  router.patch("/:id/like", async (req, res) => {
    const postId = req.params.id;
    const { userId, unlike } = req.body;

    const update = unlike
      ? { $pull: { likes: { id: userId } } }
      : { $addToSet: { likes: { id: userId } } };

    const result = await postsCollection.updateOne({ id: postId }, update);

    if (result.modifiedCount === 1) {
      const updatedPost = await postsCollection.findOne({ id: postId });
      res.status(200).json(updatedPost);
    } else {
      res.status(404).json({ error: "Post not found" });
    }
  });


  // PATCH /api/posts/:postId/comments/:commentId/like
  router.patch("/:postId/comments/:commentId/like", async (req, res) => {
    const { postId, commentId } = req.params;
    const { userId, unlike } = req.body;

    const update = unlike
      ? { $pull: { "comments.$.likes": { id: userId } } }
      : { $addToSet: { "comments.$.likes": { id: userId } } };

    const result = await postsCollection.updateOne(
      { id: postId, "comments.id": commentId },
      update
    );

    if (result.matchedCount === 1) {
      const updatedPost = await postsCollection.findOne({ id: postId });
      if (!updatedPost) {
        return res.status(404).json({ error: "Post not found" });
      }
      const updatedComment = updatedPost.comments.find(c => c.id === commentId);
      if (!updatedComment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      res.status(200).json(updatedComment);
    } else {
      res.status(404).json({ error: "Post or comment not found" });
    }
  });

  // PATCH /api/posts/:id/retruth
  router.patch("/:id/retruth", async (req, res) => {
    const postId = req.params.id;
    const { userId, unretruth } = req.body;

    const update = unretruth
      ? { $pull: { retruths: { id: userId } } }
      : { $addToSet: { retruths: { id: userId } } };

    const result = await postsCollection.updateOne(
      { id: postId },
      update
    );

    if (result.modifiedCount === 1) {
      const updatedPost = await postsCollection.findOne({ id: postId });
      res.status(200).json(updatedPost);
    } else {
      res.status(404).json({ error: "Post not found" });
    }
  });


  // DELETE /api/posts/:id
  router.delete("/:id", async (req, res) => {
    const postId = req.params.id;

    const result = await postsCollection.deleteOne({ id: postId });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: "Post deleted successfully" });
    } else {
      res.status(404).json({ error: "There was an error deleting the post" });
    }
  });

  // DELETE /api/posts/:postId/comments/:commentId
  router.delete("/:postId/comments/:commentId", async (req, res) => {
    const { postId, commentId } = req.params;

    const result = await postsCollection.updateOne(
      { id: postId },
      { $pull: { comments: { id: commentId } } }
    );

    if (result.modifiedCount === 1) {
      res.status(200).json({ message: "Comment deleted successfully" });
    } else {
      res.status(404).json({ error: "There was an error deleting comment" });
    }
  });
  

  // GET /api/posts/most-liked
router.get("/most-liked", async (req, res) => {
  try {
    const posts = await postsCollection
      .aggregate([
        { $addFields: { likeCount: { $size: "$likes" } } },
        { $sort: { likeCount: -1 } },
        { $limit: 5 }
      ])
      .toArray();

    res.json(posts);
  } catch (error) {
    console.error("Error fetching most liked posts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/posts/most-retruths
router.get("/most-retruths", async (req, res) => {
  try {
    const posts = await postsCollection
      .aggregate([
        { $addFields: { retruthCount: { $size: "$retruths" } } },
        { $sort: { retruthCount: -1 } },
        { $limit: 5 }
      ])
      .toArray();

    res.json(posts);
  } catch (error) {
    console.error("Error fetching most retruthed posts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


  return router;
}
