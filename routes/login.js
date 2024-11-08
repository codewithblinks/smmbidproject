import express from "express";
import db from "../db/index.js";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import ensureAuthenticated, {
  checkAuthenticated,
  checkAdminAuthenticated,
} from "../authMiddleware/authMiddleware.js";
import { sendUnusualActivityEmail } from "../config/emailMessages.js";
import { sendEmail } from "../config/transporter.js";
import axios from "axios";

const router = express.Router();

async function validateRecaptcha(token) {
  const secretKey = process.env.reCAPTCHA_SecretKey_login;
  const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;

  try {
    const response = await axios.post(url);
    const data = response.data;

    if (data.success && data.score >= 0.5) {
      console.log("reCAPTCHA passed with score:", data.score);
      return true;
    } else {
      console.log("reCAPTCHA failed with score:", data.score);
      return false;
    }
  } catch (error) {
    console.error("Error validating reCAPTCHA:", error);
    return false;
  }
}

router.get("/login", checkAuthenticated, (req, res) => {
  res.render("login", {
    message: req.flash("error"),
    successMessage: req.flash("success"),
  });
});

router.post("/login", async (req, res, next) => {
  const token = req.body.g_recaptcha_response;

  const isHuman = await validateRecaptcha(token);
  if (!isHuman) {
    req.flash("error", "reCAPTCHA failed. Are you a robot?");
    return res.redirect("/login");
  }

  passport.authenticate("user-local", async (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user && info.message === "2FA required") {
      req.session.userIdFor2FA = info.userId;
      return res.redirect("/2fa");
    }
    if (!user) {
      req.flash("error", info.message);
      return res.redirect("/login");
    }
    try {
      const result = await db.query(
        "SELECT email, username, email_verified, notify_unusual_activity, last_login_ip, deletion_requested FROM userprofile WHERE id = $1",
        [user.id]
      );

      if (result.rows.length > 0) {
        const {
          email,
          username,
          email_verified,
          notify_unusual_activity,
          last_login_ip,
          deletion_requested,
        } = result.rows[0];

        if (deletion_requested) {
          req.flash(
            "error",
            "You submitted a request to delete your account, deletion is pending approval. If you changed your mind contact customer support"
          );
          return res.redirect("/login");
        }

        if (!email_verified) {
          req.flash("error", "Please verify your email before logging in.");
          return res.redirect("/resend-verification-code");
        }

        if (notify_unusual_activity) {
          const currentIP = String(req.headers['x-forwarded-for'] || req.ip);

          if (currentIP === "127.0.0.1" || currentIP === '::1' || currentIP.startsWith('::ffff:')) {
            console.log("Local login detected, skipping location lookup");
          } else {
            try {
              const response = await axios.get(
                `http://ip-api.com/json/${currentIP}`
              );
              const currentLocation = response.data;

              if (currentLocation && currentLocation.city) {
                console.log(
                  `IP: ${currentIP}, Location City: ${currentLocation.city}`
                );

                if (last_login_ip && last_login_ip !== currentLocation.city) {
                  await sendUnusualActivityEmail(email, username, verificationCode);
                }

                await db.query(
                  "UPDATE userprofile SET last_login_ip = $1 WHERE id = $2",
                  [currentLocation.city, user.id]
                );
              } else {
                console.log(`Location not found for IP: ${currentIP}`);
              }
            } catch (locationError) {
              console.log(
                `Error fetching location for IP: ${currentIP}`,
                locationError
              );
            }
          }
        }
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.redirect("/dashboard");
      });
    } catch (dbErr) {
      console.log(dbErr);
      console.error(dbErr);
      req.flash("error", "An error occurred. Please try again.");
      return res.redirect("/login");
    }
  })(req, res, next);
});

router.get("/login/admin", checkAdminAuthenticated, (req, res) => {
  res.render("loginAdmin", {
    message: req.flash("error"),
    successMessage: req.flash("success"),
  });
});

router.post("/login/admin", (req, res, next) => {
  passport.authenticate("admin-local", {
    successRedirect: "/admin/dashboard",
    failureRedirect: "/login/admin",
    failureFlash: true,
  })(req, res, next);
});

export default router;
