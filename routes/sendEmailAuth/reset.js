import express from "express";
import db from "../../db/index.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {sendEmail} from "../../config/transporter.js";
import dotenv from 'dotenv';

dotenv.config();
const saltRounds = Number(process.env.SALT_ROUNDS);
const router = express.Router();

router.get('/reset/:token', async(req, res) => {
    const { token } = req.params;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRes = await db.query('SELECT * FROM userprofile WHERE id = $1', [decoded.id]);
        const user = userRes.rows[0];

        const userId = decoded.id;

        const tokenRes = await db.query(
            `SELECT * FROM password_reset_tokens 
             WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }

        const tokenRecord = tokenRes.rows[0];
        if (tokenRecord.used) {
            req.flash('error', 'This password reset link has already been used.');
            return res.redirect('/forgot');
        }

        res.render('reset', { token, message: req.flash('error') });
    } catch (err) {
        console.log(err)
        req.flash('error', 'Invalid or expired token');
        res.redirect('/forgot');
    }
  });

router.post('/reset/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRes = await db.query('SELECT * FROM userprofile WHERE id = $1', [decoded.id]);
        const user = userRes.rows[0];

        const userId = decoded.id;

        const tokenRes = await db.query(
            `SELECT * FROM password_reset_tokens 
             WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }

        const tokenRecord = tokenRes.rows[0];
        if (tokenRecord.used) {
            req.flash('error', 'This password reset link has already been used.');
            return res.redirect('/forgot');
        }


        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('UPDATE userprofile SET password = $1 WHERE id = $2', [hashedPassword, userId]);

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

        const mailOptions = {
            to: user.email,
            subject: 'Your password has been changed',
            text: `Hello,\n\nThis is a confirmation that the password for your account ${user.email} has just been changed.\n`
        };

        await sendEmail(mailOptions);

        req.flash('success', 'Success! Your password has been changed.');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/forgot');
    }
});


  export default router;
  