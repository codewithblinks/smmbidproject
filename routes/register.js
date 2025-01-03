import express from "express";
import db from "../db/index.js";
import bcrypt from "bcrypt";
import session from "express-session";
import bodyParser from "body-parser";
import { Strategy } from "passport-local";
import ensureAuthenticated, {checkAuthenticated, checkAdminAuthenticated, userRole} from "../authMiddleware/authMiddleware.js"
import {sendEmail} from "../config/transporter.js";
import { sendWelcomeEmail, resendVericationEmail } from "../config/emailMessages.js";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import multer from "multer";
import path from 'path';
import { fileURLToPath } from 'url';
import axios from "axios";
import ejs from "ejs";

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

async function validateRecaptcha(token) {
  const secretKey = process.env.reCAPTCHA_SecretKey_login;
  const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;

  try {
    const response = await axios.post(url);
    const data = response.data;

    if (data.success && data.score >= 0.5) {
      console.log('reCAPTCHA passed with score:', data.score);
      return true;
    } else {
      console.log('reCAPTCHA failed with score:', data.score);
      return false;
    }
  } catch (error) {
    console.error('Error validating reCAPTCHA:', error);
    return false;
  }
}

router.get("/register", checkAuthenticated, (req, res) => {
  res.render("register.ejs", { message: req.flash('error') });
});

router.get("/register-admin", checkAdminAuthenticated, async (req, res) => {
  const checkResult = await db.query("SELECT * FROM admins");

  const admin = checkResult.rows;

  if (admin.length > 0) {
   res.render("admin/404")
  } else {
     res.render("registerAdmin.ejs", { message: req.flash('error') });
  }
});

const sendVerificationEmail = async (email, username, verificationCode) => {
  const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'verifyEmail.ejs');

  const appName = 'SMMBIDMEDIA';
  
  try {
    const html = await ejs.renderFile(templatePath, {
      name: username,
      verificationCode: verificationCode,
      appName: appName
    });

    const mailOptions = {
      to: email,
      subject: 'Email Verification',
      html: html
    };

    await sendEmail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

router.post("/register", upload, registrationValidationRules, async (req, res) => {
  const { username, newPassword, password, terms } = req.body;
  let { firstname, lastname, } = req.body;
  firstname = capitalizeFirstLetter(firstname);
  lastname = capitalizeFirstLetter(lastname);
  const email = req.body.email.toLowerCase();
  const verificationCode = crypto.randomBytes(3).toString('hex');
  const verificationCodeExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const referralCode = generateReferralCode(username);
  const token = req.body.g_recaptcha_response; 
  const ref = req.query.ref || req.body.ref;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      param: error.param, 
      msg: error.msg  
    }));
    return res.status(400).json({ success: false, errors: errorMessages });
  }


  try {
    const isHuman = await validateRecaptcha(token);
    if (!isHuman) {
        return res.status(400).json({ success: false, errors: ['reCAPTCHA failed. Are you a robot?'] });
    }

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

    if (!terms) {
      return res.status(400).json({ success: false, errors: ['You must accept the Terms and Conditions before registering.'] });
    }

    if (newPassword !== password) {
      return res.status(400).json({ success: false, errors: ['Password does not match, check and try again.'] });
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

    await sendVerificationEmail(email, username, verificationCode);


    return res.json({ success: true, message: 'Registration successful! Please check your email to verify your account.' });

  } catch (error) {
    console.error("error registering user", error);
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
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
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
              res.redirect("/login/admin");
            }
          });
        }
      });
    }
  } catch (err) {
    console.error("error with admin registration", err);
    req.flash('error', 'An error occurred. Please try again.');
    res.redirect('/register-admin');
  }
});

router.post('/verify-email', async (req, res) => {
  const { email, verificationCode } = req.body;

  try {
      const result = await db.query(
          "SELECT id, email_verified, verification_code_expires_at, username FROM userprofile WHERE email = $1 AND verification_code = $2",
          [email, verificationCode]
      );

      if (result.rows.length === 0 || result.rows[0].email_verified) {
        return res.status(400).json({ message: 'Invalid verification code or email already verified' });
      }

      if (new Date() > new Date(result.rows[0].verification_code_expires_at)) {
        return res.status(400).json({ message: 'Verification code has expired' });
      }

      // Update user as verified
      await db.query(
          "UPDATE userprofile SET email_verified = true, verification_code = NULL, verification_code_expires_at = NULL WHERE id = $1",
          [result.rows[0].id]
      );

      const {username} = result.rows[0];

        await sendWelcomeEmail(email, username);

        return res.json({ message: 'Email verified and logged in successfully!'});

  } catch (err) {
    console.error('Error verifying email:', err);
    res.status(500).json({ message: 'An error occurred. Please try again.' });
  }
});

router.post('/resend-verification-code', async (req, res) => {
  const { email } = req.body;

  try {
      const result = await db.query(
          "SELECT id, email_verified, last_verification_code_sent_at, username FROM userprofile WHERE email = $1",
          [email]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ message: 'Email not found.' });
      }

      if (result.rows[0].email_verified) {
        return res.status(400).json({ message: 'Email is already verified.' });
      }

      const lastSent = new Date(result.rows[0].last_verification_code_sent_at);
      const now = new Date();
      
      const timeElapsed = now - lastSent; 
      const waitTime = 1 * 60 * 1000;
      const timeRemaining = waitTime - timeElapsed; 
      
      if (timeElapsed < waitTime) {
          const minutesRemaining = Math.ceil(timeRemaining / (60 * 1000)); 
          let imeRemaining = Math.max(0, Math.ceil(timeRemaining / 1000));
          return res.status(400).json({
              message: `You can only resend the code every 1 minute. Time left: ${imeRemaining}`
          });
      }
      

      const verificationCode = crypto.randomBytes(3).toString('hex');
      const verificationCodeExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);

      // Update the verification code and expiration time
      await db.query(
          "UPDATE userprofile SET verification_code = $2, verification_code_expires_at = $3, last_verification_code_sent_at = NOW() WHERE id = $1",
          [result.rows[0].id, verificationCode, verificationCodeExpiresAt]
      );

      const username = result.rows[0].username;

      await resendVericationEmail(email, username, verificationCode);

      return res.json({ message: 'Verification code resent successfully. Please check your email.'});

  } catch (err) {
    console.error('Error resending verication email:', err);
    res.status(500).json({ message: 'An error occurred. Please try again.' });
  }
});

router.get("/verifyemail", (req, res) => {
  try {
    res.render('verifyEmail',  { messages: req.flash() });
  } catch (error) {
    console.error('Error displaying the verify email page:', error);
    res.status(500).send('Internal Server Error');
  }
})

router.get("/resend-verification-code", (req, res) => {
  res.render('resendemailcode',  { messages: req.flash() });
})



export default router;