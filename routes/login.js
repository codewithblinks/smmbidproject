import express from "express";
import db from "../db/index.js";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import ensureAuthenticated, {checkAuthenticated} from "../authMiddleware/authMiddleware.js";

const router = express.Router();

router.get('/login', checkAuthenticated, (req, res) => {
    res.render('login', { message: req.flash('error'), successMessage: req.flash('success')});
});

router.post('/login', (req, res, next) => {
    passport.authenticate('user-local', async (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user && info.message === "2FA required") {
            req.session.userIdFor2FA = info.userId;
            return res.redirect('/2fa');
        }
        if (!user) {
            req.flash('error', info.message);
            return res.redirect('/login');
        }
        try {
            const result = await db.query(
                "SELECT email_verified FROM userprofile WHERE id = $1",
                [user.id]
            );
            if (result.rows.length > 0 && !result.rows[0].email_verified) {
                req.flash('error', 'Please verify your email before logging in.');
                return res.redirect('/resend-verification-code');
            }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            return res.redirect('/dashboard');
        });
    } catch (dbErr) {
        console.error(dbErr);
        req.flash('error', 'An error occurred. Please try again.');
        return res.redirect('/login');
    }
    })(req, res, next);
});

router.get('/login/admin', (req, res) => {
    res.render('loginAdmin', { message: req.flash('error'), successMessage: req.flash('success') });
});

router.post('/login/admin', (req, res, next) => {
    passport.authenticate('admin-local', {
        successRedirect: '/admin/dashboard',
        failureRedirect: '/login/admin',
        failureFlash: true
    })(req, res, next);
});




export default router;