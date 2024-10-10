import express from "express";
import db from "../../db/index.js";
import {adminEnsureAuthenticated} from "../../authMiddleware/authMiddleware.js";
import flash from "connect-flash";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
import bcrypt from "bcrypt";
import { sendEmail } from "../../config/transporter.js";


dotenv.config();
const saltRounds = Number(process.env.SALT_ROUNDS);


const router = express.Router();

router.get("/admin/forgot", (req, res) => {
    res.render("admin/forgotPW", { message: req.flash('error'), successMessage: req.flash('success') })
  })

  router.post('/admin/forgot', async (req, res) => {
    const email = req.body.email.toLowerCase();
    try {
        const userRes = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
        const user = userRes.rows[0];
        if (!user) {
            req.flash('error', 'Email does not exist');
            return res.redirect('/admin/forgot');
        }
  
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        await db.query(
            `INSERT INTO admin_password_reset_tokens (admin_id, token, expires_at, used) 
             VALUES ($1, $2, $3, $4)`,
            [user.id, token, new Date(Date.now() + 600000), false] 
        );
  
        const mailOptions = {
            to: user.email,
            subject: 'Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
                   Please click on the following link, or paste this into your browser to complete the process:\n\n
                   http://${req.headers.host}/admin/reset/${token}\n\n
                   If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };
  
        await sendEmail(mailOptions);
  
        req.flash('success', 'An email has been sent to ' + user.email + ' with further instructions.');
        res.redirect('/login/admin');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/admin/forgot');
    }
  });

  router.get('/admin/reset/:token', async(req, res) => {
    const { token } = req.params;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRes = await db.query('SELECT * FROM admins WHERE id = $1', [decoded.id]);
        const user = userRes.rows[0];

        const userId = decoded.id;

        const tokenRes = await db.query(
            `SELECT * FROM admin_password_reset_tokens 
             WHERE token = $1 AND admin_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/admin/forgot');
        }

        const tokenRecord = tokenRes.rows[0];
        if (tokenRecord.used) {
            req.flash('error', 'This password reset link has already been used.');
            return res.redirect('/admin/forgot');
        }

        res.render('admin/resetPW', { token, message: req.flash('error') });
    } catch (err) {
        console.log(err)
        req.flash('error', 'Invalid or expired token');
        res.redirect('/admin/forgot');
    }
  });

  router.post('/admin/reset/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRes = await db.query('SELECT * FROM admins WHERE id = $1', [decoded.id]);
        const user = userRes.rows[0];

        const userId = decoded.id;

        const tokenRes = await db.query(
            `SELECT * FROM admin_password_reset_tokens 
             WHERE token = $1 AND admin_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/admin/forgot');
        }

        const tokenRecord = tokenRes.rows[0];
        if (tokenRecord.used) {
            req.flash('error', 'This password reset link has already been used.');
            return res.redirect('/admin/forgot');
        }


        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('UPDATE admins SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        await db.query(
            `UPDATE admin_password_reset_tokens
             SET used = TRUE 
             WHERE id = $1`,
            [tokenRecord.id]
        );

        const mailOptions = {
            to: user.email,
            subject: 'Your password has been changed',
            text: `Hello,\n\nThis is a confirmation that the password for your account ${user.email} has just been changed.\n`
        };

        await sendEmail(mailOptions);

        req.flash('success', 'Success! Your password has been changed.');
        res.redirect('/login/admin');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/forgot');
    }
});

export default router;