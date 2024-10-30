import express from "express";
import db from "../../db/index.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {sendEmail} from "../../config/transporter.js";
import dotenv from 'dotenv';
import { sendResetEmailConfirmation } from "../../config/emailMessages.js";

dotenv.config();
const saltRounds = Number(process.env.SALT_ROUNDS);
const router = express.Router();

router.get('/reset/:token', async(req, res) => {
    const { token } = req.params;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        const userRes = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]); 
        if (userRes.rows.length === 0) {
            req.flash('error', 'Invalid or expired token');
            return res.redirect('/forgot');
        }   

        const tokenRes = await db.query(
            `SELECT * FROM password_reset_tokens 
             WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0 || tokenRes.rows[0].used) {
            req.flash('error', 'Password reset token is invalid, expired, or already used.');
            return res.redirect('/forgot');
        }

        res.render('reset', { token, message: req.flash('error') });
    } catch (error) {
        console.error("Error resetting user password", error);
        req.flash('error', 'Invalid or expired token');
        res.redirect('/forgot');
    }
  });

router.post('/reset/:token', async (req, res) => {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.json({ success: false, message: 'Passwords do not match.' });
    }
    if (password.length < 8 || confirmPassword.length < 8) {
        return res.json({ success: false, message: 'Passwords must be at least 8 characters long.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        const userRes = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid or expired token.' });
        }

        const user = userRes.rows[0];

        const tokenRes = await db.query(
            `SELECT * FROM password_reset_tokens 
             WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0 || tokenRes.rows[0].used) {
            return res.json({ success: false, message: 'Password reset token is invalid, expired, or already used.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('UPDATE userprofile SET password = $1 WHERE id = $2', [hashedPassword, userId]);
        
        const tokenRecord = tokenRes.rows[0];
        await db.query(
            `UPDATE password_reset_tokens 
             SET used = TRUE 
             WHERE id = $1`,
            [tokenRecord.id]
        );

        await db.query(
            `INSERT INTO activity_log 
            (user_id, activity)
            VALUES
            ($1, $2)`,
            [userId, 'Password was changed']
        );

        const { username, email } = user;

        await sendResetEmailConfirmation(email, username);

        return res.json({ success: true, message: 'Success! Your password has been changed.' });
    } catch (error) {
        console.error("Error in password reset:", error);
        return res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

  export default router;
  