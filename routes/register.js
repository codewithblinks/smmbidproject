import express from "express";
import db from "../db/index.js";
import bcrypt from "bcrypt";
import session from "express-session";
import bodyParser from "body-parser";
import { Strategy } from "passport-local";
import ensureAuthenticated, {checkAuthenticated} from "../authMiddleware/authMiddleware.js"
import {sendEmail} from "../config/transporter.js";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import multer from "multer";
import path from 'path';
import { fileURLToPath } from 'url';

const saltRounds = Number(process.env.SALT_ROUNDS);
const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer().none();

const registrationValidationRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 15 }).withMessage('Username must be between 3 and 15 characters.')
    .matches(/^\S*$/).withMessage('Username cannot contain spaces.')
    .escape(), // Sanitize input
  body('email')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(), // Normalize email format (lowercase and trim)
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.')
    .escape(), // Sanitize password
  body('firstname')
    .trim()
    .not().isEmpty().withMessage('First name is required.')
    .escape(),
  body('lastname')
    .trim()
    .not().isEmpty().withMessage('Last name is required.')
    .escape()
];

router.get("/register", checkAuthenticated, (req, res) => {
  res.render("register.ejs", { message: req.flash('error') });
});

router.get("/register-admin", (req, res) => {
  res.render("registerAdmin.ejs", { message: req.flash('error') });
});

router.post("/register", upload, registrationValidationRules, async (req, res) => {
  const { username, firstname, lastname, password } = req.body;
  const email = req.body.email.toLowerCase();
  const verificationCode = crypto.randomBytes(3).toString('hex');
  const verificationCodeExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const referralCode = generateReferralCode(username);

  const ref = req.query.ref || req.body.ref;

  // Handle validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      param: error.param, // Get the specific field (username, email, etc.)
      msg: error.msg      // Get the error message
    }));
    return res.status(400).json({ success: false, errors: errorMessages });
  }


  try {
    const [checkResult, checkUsername] = await Promise.all([
      db.query("SELECT * FROM userprofile WHERE email = $1", [email]),
      db.query("SELECT * FROM userprofile WHERE username = $1", [username])
    ]);

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ success: false, errors: ['Email already exists'] });
    }

    if (checkUsername.rows.length > 0) {
      return res.status(400).json({ success: false, errors: ['Username already exists'] });
    }

    let referredByUserId = null;
    if (ref) {
      const referringUser = await db.query("SELECT id FROM userprofile WHERE referral_code = $1", [ref]);
      if (referringUser.rows.length > 0) {
        referredByUserId = referringUser.rows[0].id;
      }
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      `INSERT INTO userprofile 
      (username, firstname, lastname, email, password, verification_code, verification_code_expires_at, last_verification_code_sent_at, referral_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8) RETURNING *`,
      [username, firstname, lastname, email, hashedPassword, verificationCode, verificationCodeExpiresAt, referralCode]
    );

    if (referredByUserId) {
      await db.query(
        `INSERT INTO referrals (referred_by, referred_user) VALUES ($1, $2)`,
        [referredByUserId, result.rows[0].id]
      );
    }

    const referralLink = `${req.protocol}://${req.get('host')}/register?ref=${referralCode}`;

    const mailOptions = {
      to: email,
      subject: 'Email Verification',
      text: `Your verification code is: ${verificationCode} this code expires in 30 minutes`
    };

    await sendEmail(mailOptions);
    return res.json({ success: true, message: 'Registration successful! Please check your email to verify your account.' });

  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, errors: ['An error occurred. Please try again.'] });
  }
});

function generateReferralCode(username) {
  return username + '-' + Math.random().toString(36).substring(2, 8); // Example: user123-1623859300
}

router.post("/register-admin", async (req, res) => {
  const { username, firstname, lastname, password } = req.body;
  const email = req.body.email.toLowerCase();
  try {
    const checkResult = await db.query(
      "SELECT * FROM admins WHERE email = $1",
      [email]);
    const checkUsername = await db.query(
      "SELECT * FROM admins WHERE username = $1",
      [username]
    );
    if (checkResult.rows.length > 0) {
      req.flash('error', 'Email already exists');
      return res.redirect("/register-admin");
    } else if (checkUsername.rows.length > 0) {
      req.flash('error', 'Username already exists');
      return res.redirect("/register-admin");
    }
    else {
      //hashing the password and saving it in the database
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          // console.log("Password hashed:", hash)
          const result = await db.query(
            "INSERT INTO admins (username, firstname, lastname, email, password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [username, firstname, lastname, email, hash]
          );

          const id = result.rows[0].id;

          req.login({ id, role: 'admin' }, (err) => {
            if (err) {
              console.error("Error during login:", err);
              req.flash('error', 'Registration successful, but an error occurred during login. Please log in manually.');
              return res.redirect('/login/admin');
            } else {
              req.flash('success', 'Registration successful! Please log in.');
              console.log("success");
              res.redirect("/login/admin");
            }
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
    req.flash('error', 'An error occurred. Please try again.');
    res.redirect('/register-admin');
  }
});

router.post('/verify-email', async (req, res) => {
  const { email, verificationCode } = req.body;

  try {
      const result = await db.query(
          "SELECT id, email_verified, verification_code_expires_at FROM userprofile WHERE email = $1 AND verification_code = $2",
          [email, verificationCode]
      );

      if (result.rows.length === 0 || result.rows[0].email_verified) {
          req.flash('error', 'Invalid verification code or email already verified');
          return res.redirect('/verifyemail');
      }

      if (new Date() > new Date(result.rows[0].verification_code_expires_at)) {
          req.flash('error', 'Verification code has expired.');
          return res.redirect('/verifyemail');
      }

      // Update user as verified
      await db.query(
          "UPDATE userprofile SET email_verified = true, verification_code = NULL, verification_code_expires_at = NULL WHERE id = $1",
          [result.rows[0].id]
      );

      req.flash('success', 'Email verified successfully! You can now log in.');
      res.redirect('/login');

  } catch (err) {
      console.log(err);
      req.flash('error', 'An error occurred. Please try again.');
      res.redirect('/verifyemail');
  }
});

router.post('/resend-verification-code', async (req, res) => {
  const { email } = req.body;

  try {
      const result = await db.query(
          "SELECT id, email_verified, last_verification_code_sent_at FROM userprofile WHERE email = $1",
          [email]
      );

      if (result.rows.length === 0) {
          req.flash('error', 'Email not found.');
          console.log(email)
          return res.redirect('/resend-verification-code');
      }

      if (result.rows[0].email_verified) {
          req.flash('error', 'Email is already verified.');
          return res.redirect('/login');
      }

      const lastSent = new Date(result.rows[0].last_verification_code_sent_at);
      const now = new Date();

      if (now - lastSent < 1 * 60 * 1000) { // 5-minute cooldown
          req.flash('error', 'You can only resend the code every 1 minutes.');
          return res.redirect('/resend-verification-code');
      }

      const verificationCode = crypto.randomBytes(3).toString('hex');
      const verificationCodeExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);

      // Update the verification code and expiration time
      await db.query(
          "UPDATE userprofile SET verification_code = $2, verification_code_expires_at = $3, last_verification_code_sent_at = NOW() WHERE id = $1",
          [result.rows[0].id, verificationCode, verificationCodeExpiresAt]
      );

      const mailOptions = {
          to: email,
          subject: 'Resend Email Verification',
          text: `Your new verification code is: ${verificationCode}`
      };

      await sendEmail(mailOptions);
      req.flash('success', 'Verification code resent successfully. Please check your email.');
      return res.redirect('/verifyemail');

  } catch (err) {
      console.log(err);
      req.flash('error', 'An error occurred. Please try again.');
      res.redirect('/resend-verification-code');
  }
});

router.get("/verifyemail", (req, res) => {
  res.render('verifyEmail',  { messages: req.flash() });
})

router.get("/resend-verification-code", (req, res) => {
  res.render('resendemailcode',  { messages: req.flash() });
})




export default router;