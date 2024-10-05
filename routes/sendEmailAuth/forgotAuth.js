import express from "express";
import db from "../../db/index.js";
import jwt from "jsonwebtoken"
import dotenv from 'dotenv';
import {sendEmail} from "../../config/transporter.js";


dotenv.config();
const saltRounds = Number(process.env.SALT_ROUNDS);
const router = express.Router();


router.get("/forgot", (req, res) => {
    res.render("forgotPw", { message: req.flash('error'), successMessage: req.flash('success') })
  })

  
 router.post('/forgot', async (req, res) => {
    const email = req.body.email.toLowerCase();
    console.log(email)
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
  
        const mailOptions = {
            to: user.email,
            subject: 'Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
                   Please click on the following link, or paste this into your browser to complete the process:\n\n
                   http://${req.headers.host}/reset/${token}\n\n
                   If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };
  
        await sendEmail(mailOptions);
  
        req.flash('success', 'An email has been sent to ' + user.email + ' with further instructions.');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/forgot');
    }
  });

  export default router;
  