import express from "express";
import db from "../../db/index.js";
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js";
import flash from "connect-flash";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
import bcrypt from "bcrypt";
import numeral from "numeral";
import moment from "moment";
import { forgotPasswordAdminEmail, sendResetPasswordAdminConfirmation } from "../../config/emailMessages.js";


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
  
        const username = user.username;

        const resetLink = `http://${req.headers.host}/admin/reset/${token}`;

        await forgotPasswordAdminEmail(email, username, resetLink);
  
        req.flash('success', 'An email has been sent to ' + user.email + ' with further instructions.');
        res.redirect('/login/admin');
    } catch (error) {
        console.error("Error with admin forget passowrd", error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/admin/forgot');
    }
  });

  router.get('/admin/reset/:token', async(req, res) => {
    const { token } = req.params;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        const userRes = await db.query('SELECT * FROM admins WHERE id = $1', [userId]);

        if (userRes.rows.length === 0) {
            req.flash('error', 'Invalid or expired token');
            return res.redirect('/admin/forgot');
        }

        const tokenRes = await db.query(
            `SELECT * FROM admin_password_reset_tokens 
             WHERE token = $1 AND admin_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0 || tokenRes.rows[0].used) {
            req.flash('error', 'Password reset token is invalid, expired, or already used.');
            return res.redirect('/admin/forgot');
        }
        res.render('admin/resetPW', { token, message: req.flash('error') });
    } catch (error) {
        console.error("Error resetting admin password", error);
        req.flash('error', 'Invalid or expired token');
        res.redirect('/admin/forgot');
    }
  });

router.post('/admin/reset/:token', async (req, res) => {
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

        const userRes = await db.query('SELECT * FROM admins WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid or expired token.' });
        }
        const user = userRes.rows[0];

        const tokenRes = await db.query(
            `SELECT * FROM admin_password_reset_tokens 
             WHERE token = $1 AND admin_id = $2 AND expires_at > NOW()`,
            [token, userId]
        );

        if (tokenRes.rows.length === 0 || tokenRes.rows[0].used) {
            return res.json({ success: false, message: 'Password reset token is invalid, expired, or already used.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('UPDATE admins SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        const tokenRecord = tokenRes.rows[0];
        await db.query(
            `UPDATE admin_password_reset_tokens
             SET used = TRUE 
             WHERE id = $1`,
            [tokenRecord.id]
        );

        const { username, email } = user;

        await sendResetPasswordAdminConfirmation(email, username);

        return res.json({ success: true, message: 'Success! Your password has been changed.' });
    } catch (error) {
        console.error("Error in admin password reset:", error)
        return res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

router.get("/admin/account/delete", adminEnsureAuthenticated, adminRole, async (req, res) => {
    const adminId = req.user.id;

    try {
        const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
        const user = adminResult.rows[0];

        const userDeletionRequest = await db.query(`
            SELECT userprofile.*, deletion_date.request_time
            FROM userprofile
            JOIN deletion_date 
            ON userprofile.id = deletion_date.user_id
            WHERE userprofile.deletion_requested = $1
        `, [true]);        

            const deletionRequest = userDeletionRequest.rows;

            deletionRequest.forEach(deletionRequest => {
                deletionRequest.request_time = moment(deletionRequest.request_time).format('D MMM h:mmA');
                deletionRequest.balance = numeral(deletionRequest.balance).format("0,0.00");
              })
      
    
        res.render("admin/deletionRequest", {user, deletionRequest})
    } catch (error) {
        console.error("error deplaying deletion page", error)
        res.status(500).json({ error: 'Internal server error' });
    }
  })

router.post('/admin/account/delete/:userId', adminEnsureAuthenticated, adminRole, async (req, res) => {
    const userId = req.params.userId;
    const action = req.body.action;

    try {
        if (action === 'approve') {
            await db.query('DELETE FROM userprofile WHERE id = $1', [userId]);
        } else if (action === 'reject') {
            await db.query('UPDATE userprofile SET deletion_requested = $1 WHERE id = $2', [false, userId]);
        }
       
        return res.redirect("/admin/account/delete")
    } catch (error) {
        console.error('Error updating account status:', error);
        res.status(500).send('Internal server error');
    }
});

export default router;