import express from "express";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcrypt";

export function createAuthRouter(usersCollection, verificationCodesCollection) {
  const router = express.Router();

  async function sendVerificationEmail(to, code) {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"TrenchSocial" <${process.env.SMTP_USER}>`,
      to,
      subject: "Your verification code",
      text: `Your TrenchSocial verification code is ${code}. It expires in 5 minutes.`,
    });
  }

  async function sendResetEmail(email, link) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, // app password
        },
    });

    const mailOptions = {
        from: process.env.SMTP_USER,
        to: email,
        subject: "Reset your password",
        html: `<p>You requested a password reset.</p>
            <p><a href="${link}">Click here to reset it</a></p>
            <p>This link expires in 15 minutes.</p>`,
    };

    await transporter.sendMail(mailOptions);
    }

  // POST /api/auth/send-code
  router.post("/send-code", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await verificationCodesCollection.deleteMany({ email });
      await verificationCodesCollection.insertOne({ email, code, expiresAt });

      await sendVerificationEmail(email, code);
      res.json({ success: true });
    } catch (err) {
      console.error("Error sending code:", err);
      res.status(500).json({ success: false, error: "Internal error" });
    }
  });

  // POST /api/auth/verify-code
  router.post("/verify-code", async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code required" });

    try {
      const record = await verificationCodesCollection.findOne({ email, code });
      if (!record) return res.status(400).json({ success: false, error: "Invalid code" });

      if (record.expiresAt < new Date()) {
        await verificationCodesCollection.deleteOne({ _id: record._id });
        return res.status(400).json({ success: false, error: "Code expired" });
      }

      await verificationCodesCollection.deleteOne({ _id: record._id }); // one‑time use
      res.json({ success: true });
    } catch (err) {
      console.error("Verify code error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // POST /api/auth/forgot-password
    router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await usersCollection.findOne({ email });
    if (!user) {
        return res.status(200).json({ success: true }); // Don't reveal if user exists
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 1 hour

    await usersCollection.updateOne(
        { email },
        { $set: { resetToken: token, resetTokenExpiresAt: expiresAt } }
    );

    const resetLink = `https://trenchsocial-backend.onrender.com/reset-password?resetToken=${token}`;
    await sendResetEmail(email, resetLink);

    res.json({ success: true });
    });


    router.post("/reset-password", async (req, res) => {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: "Missing token or password" });

        const user = await usersCollection.findOne({ resetToken: token });
        if (!user || new Date(user.resetTokenExpiresAt) < new Date()) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        const hash = await bcrypt.hash(password, 10);
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { password: hash }, $unset: { resetToken: "", resetTokenExpiresAt: "" } }
        );

        res.json({ success: true });
    });


  return router;
}
