import express from 'express';

export function createReportsRouter(reportsCollection) {
  const router = express.Router();

  // 📝 POST Report Endpoint
  router.post("/", async (req, res) => {
    const { type, message, name, username, email, createdAt } = req.body;

    if (!type || !message || !name || !username || !email || !createdAt) {
        return res.status(400).json({ message: "All fields are required." });
    }

    try {
        const newReport = {
            type,
            message,
            name,
            username,
            email,
            date: new Date(),
        };

        await reportsCollection.insertOne(newReport);

        return res.status(201).json({ message: "Report submitted successfully." });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error." });
    }
    });


  return router;
}