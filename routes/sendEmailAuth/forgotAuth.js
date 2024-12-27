import express from "express";
import db from "../../db/index.js";
import jwt from "jsonwebtoken"
import dotenv from 'dotenv';
import {sendEmail} from "../../config/transporter.js";
import { forgotPasswordEmail } from "../../config/emailMessages.js";


dotenv.config();
const saltRounds = Number(process.env.SALT_ROUNDS);
const router = express.Router();


router.get("/forgot", (req, res) => {
    res.render("forgotPw", { message: req.flash('error'), successMessage: req.flash('success') })
  })

  
 router.post('/forgot', async (req, res) => {
    const email = req.body.email.toLowerCase();

    try {
        if (!email) {
            return res.status(400).json({ success: false, error: "Email cannot be empty." });
          }    
        const userRes = await db.query('SELECT * FROM userprofile WHERE email = $1', [email]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(400).json({ success: false, error: "Email does not exist" });
        }
  
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        await db.query(
            `INSERT INTO password_reset_tokens (user_id, token, expires_at, used) 
             VALUES ($1, $2, $3, $4)`,
            [user.id, token, new Date(Date.now() + 600000), false] 
        );
  
        const resetLink = `http://${req.headers.host}/reset/${token}`;
        const username = user.username;

        await forgotPasswordEmail(email, username, resetLink);
  
        res.json({ success: true, message: 'An email has been sent to ' + user.email + ' with further instructions.'});
    } catch (error) {
        console.error("Error sending forget email:", err);
       res.status(500).json({ success: false, error: "An unexpected server error occurred." });
    }
  });

  export default router;
  