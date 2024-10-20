import express from "express";
import db from "../db/index.js";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import ensureAuthenticated, {checkAuthenticated, checkAdminAuthenticated} from "../authMiddleware/authMiddleware.js";
import geoip from "geoip-lite";
import { sendEmail } from "../config/transporter.js";
import axios from "axios";

const router = express.Router();

router.get('/login', checkAuthenticated, (req, res) => {
    res.render('login', { message: req.flash('error'), successMessage: req.flash('success')});
});

router.post('/login', (req, res, next) => {
  const recaptchaResponse = req.body['g-recaptcha-response'];
  const secretKey = process.env.reCAPTCHA_SecretKey_login; 

  if (!recaptchaResponse) {
    req.flash('error', 'Please complete the reCAPTCHA challenge.');
    return res.redirect('/login');
  }

  const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}`;

  axios.post(verificationUrl).then(async (recaptchaVerificationResponse) => {
    if (!recaptchaVerificationResponse.data.success) {
      req.flash('error', 'reCAPTCHA verification failed. Please try again.');
      return res.redirect('/login');
    }

    // Proceed with authentication
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
          "SELECT email, username, email_verified, notify_unusual_activity, last_login_ip FROM userprofile WHERE id = $1",
          [user.id]
        );

        if (result.rows.length > 0) {
          const { email, username, email_verified, notify_unusual_activity, last_login_ip } = result.rows[0];

          if (!email_verified) {
            req.flash('error', 'Please verify your email before logging in.');
            return res.redirect('/resend-verification-code');
          }

          // Unusual activity detection logic
          if (notify_unusual_activity) {
            const currentIP = req.ip === '::1' || req.ip === '127.0.0.1' ? '127.0.0.1' : req.ip; // Handle local IPs

            if (currentIP === '127.0.0.1') {
              console.log('Local login detected, skipping location lookup');
            } else {
              const currentLocation = geoip.lookup(currentIP);

              if (currentLocation && currentLocation.city) {
                const mailOptions = {
                  to: email,
                  subject: 'Unusual Activity Detected',
                  text: `Hi ${username}, we detected unusual activity in your account. You just logged in from a different IP address: ${currentLocation.city}. If this wasn't you, please secure your account.`
                };

                // Only proceed if the current location was found
                if (last_login_ip && last_login_ip !== currentLocation.city) {
                  // Unusual login location detected, send an email
                  await sendEmail(mailOptions);
                }

                // Update user's last login location
                await db.query(
                  'UPDATE userprofile SET last_login_ip = $1 WHERE id = $2', 
                  [currentLocation.city, user.id]
                );
              } else {
                console.log(`Location not found for IP: ${currentIP}`);
              }
            }
          }
        }

        // Log in the user
        req.logIn(user, (err) => {
          if (err) {
            return next(err);
          }
          return res.redirect('/dashboard');
        });
      } catch (dbErr) {
        console.log(dbErr);
        req.flash('error', 'An error occurred. Please try again.');
        return res.redirect('/login');
      }
    })(req, res, next);
  }).catch((error) => {
    console.error('reCAPTCHA verification error:', error);
    req.flash('error', 'An error occurred during reCAPTCHA verification. Please try again.');
    return res.redirect('/login');
  });
});

router.get('/login/admin', checkAdminAuthenticated, (req, res) => {
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