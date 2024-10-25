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
        const userRes = await db.query('SELECT * FROM userprofile WHERE email = $1', [email]);
        const user = userRes.rows[0];
        if (!user) {
            req.flash('error', 'Email does not exist');
            return res.redirect('/forgot');
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
  
        req.flash('success', 'An email has been sent to ' + user.email + ' with further instructions.');
        res.redirect('/login');
    } catch (error) {
        console.log(error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/forgot');
    }
  });

  export default router;
  