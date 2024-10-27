import express from "express";
import db from "../db/index.js";
import session from "express-session";
import flash from "connect-flash"
import axios from "axios";
import bcrypt from "bcrypt";
import crypto from "crypto";
import {sendEmail} from "../config/transporter.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import { sendChangeEmail, sendChangeEmailConfirmation, sendDeleteAccounEmail } from "../config/emailMessages.js";

const router = express.Router();

const saltRounds = Number(process.env.SALT_ROUNDS);

router.get("/settings", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;
  // const banks = await getBanks();
  try {
    const response = await axios.get("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const banks = response.data.data;

    const userResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const userBank = await db.query(
      "SELECT * FROM withdrawal_details WHERE user_id = $1",
      [userId]
    );
    const userDetails = userResult.rows[0];
    const bankDetails = userBank.rows;
    const accountCount = bankDetails.length;

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

    if (!userDetails) {
      return res.status(404).json({ error: "User not found" });
    }

    res.render("accountsettings", {
      messages: req.flash(),
      user: userDetails,
      banks,
      bankDetails,
      accountCount,
      timeSince,
      notifications
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/payment", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { account_number, bank_code, bank_name } = req.body;

  try {
    const userQuery = "SELECT * FROM userprofile WHERE id = $1";
    const userResult = await db.query(userQuery, [userId]);
    const user = userResult.rows[0];

    const bankQuery =
      "SELECT * FROM withdrawal_details WHERE user_id = $1";
    const bankResult = await db.query(bankQuery, [userId]);
    const bank = bankResult.rows;

    const fullname = `${user.firstname} ${user.lastname}`;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    } else {
      const accountExists = bank.some(
        (bank) => bank.account_number === account_number && bank.bank_name === bank_name
      );
    
      if (accountExists) {
        req.flash("error", "Bank account already exist");
        res.redirect("/settings");
      } else {
        // Construct Paystack create recipient payload
        const paystackCreateRecipientUrl = process.env.PAYSTACK_RECIPIENT_URL;
        const payload = {
          type: "nuban",
          name: fullname,
          account_number: account_number,
          bank_code: bank_code,
          currency: "NGN",
          metadata: {
            userId: userId,
            userEmail: user.email,
          },
        };
  
        // Make request to Paystack API
        const headers = {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        };
  
        const response = await axios.post(paystackCreateRecipientUrl, payload, {
          headers,
        });
        const recipientData = response.data.data;
        const errortData = response.data.message;
  
        const userPayment = await db.query(
          "INSERT INTO withdrawal_details (user_id, bank_name, account_number, bank_code, recipient_code) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [
            userId,
            bank_name,
            account_number,
            bank_code,
            recipientData.recipient_code,
          ]
        );

        await db.query(
          `INSERT INTO activity_log 
          (user_id, activity)
          VALUES
          ($1, $2)`,
          [userId, 'New bank account added']
      );

        req.flash("success", "Bank account successfully add");
        res.redirect("settings");
      }
    }
    
  } catch (error) {
    if (error.response && error.response.data && error.response.data.message) {
      req.flash("error", "Invalid bank account");
      return res.redirect("/settings");
    }
    console.error(error.message);
    console.log("error data", error)
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/user/deleteBankAccount/:accountId", ensureAuthenticated, async (req, res) => {
    const accountId = req.params.accountId;
    const userId = req.user.id

    try {
      await db.query("DELETE FROM withdrawal_details WHERE id = $1", [
        accountId,
      ]);

      await db.query(
        `INSERT INTO activity_log 
        (user_id, activity)
        VALUES
        ($1, $2)`,
        [userId, 'Bank account deleted']
    );

      req.flash("success", "Bank account successfully deleted");
      res.redirect("/settings");
    } catch (error) {
      console.log(error);
      req.flash("error", "Error: unable to delete bank account");
      res.status(500).send("Error deleting account");
    }
  }
);

router.post("/changeEmail", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const newEmail = req.body.newEmail.toLowerCase();
  const currentPassword = req.body.currentPassword;

  try {
    const checkResult = await db.query(
      "SELECT * FROM userprofile WHERE email = $1",
      [newEmail]
    );

    if (checkResult.rows.length > 0) {
      return res.json({ success: false, error: "email_exists" });
    } else {
      const checkPassword = await db.query(
        "SELECT * FROM userprofile WHERE id = $1",
        [userId]
      );

      const userPassword = checkPassword.rows[0];

      const isPasswordCorrect = await bcrypt.compare(
        currentPassword,
        userPassword.password
      );
      if (!isPasswordCorrect) {
        return res.json({ success: false, error: "incorrect_password" });
      } else {
        const verificationCode = crypto.randomBytes(3).toString("hex");
        await db.query(
          "UPDATE userprofile SET verification_code = $1 WHERE id = $2",
          [verificationCode, userId]
        );

        const username = userPassword.username;

        await sendChangeEmail(newEmail, username, verificationCode);
        

        req.session.newEmail = newEmail;
        res.json({ success: true });
      }
    }
  } catch (error) {
    res.redirect("/settings");
    console.log(error);
  }
});

router.post('/change-email-verify-code', ensureAuthenticated, async(req, res) => {
  const { verificationCode } = req.body;
  const userId = req.user.id;
  const newEmail = req.session.newEmail.toLowerCase();

  try {
      const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
      const user = userResult.rows[0];

      if (user.verification_code !== verificationCode) {
          req.flash('error', 'Invalid verification code.');
          return res.redirect('/settings');
      } else {
        await db.query('UPDATE userprofile SET email = $1, verification_code = NULL WHERE id = $2', [newEmail, userId]);
        await db.query(
          `INSERT INTO activity_log 
          (user_id, activity)
          VALUES
          ($1, $2)`,
          [userId, 'Email Address was changed']
      );

      const username = user.username;

      await sendChangeEmailConfirmation(newEmail, username);

        req.flash('success', 'Email updated successfully.');
        res.redirect('/settings');
      }
  } catch (err) {
      console.log(error);
      res.status(500).send('Server Error');
  }
});

router.post('/cancelEmailVerify', ensureAuthenticated, async(req, res) => {
  const userId = req.user.id;

  try {
      const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
      const user = userResult.rows[0];

        await db.query('UPDATE userprofile SET verification_code = NULL WHERE id = $1', [userId]);
        req.flash('success', 'Update email cancel.');
        res.redirect('/settings');

  } catch (err) {
      console.log(error);
      res.status(500).send('Server Error');
  }
});

router.post("/updateUserInfo", ensureAuthenticated, async(req, res) => {
  const userId = req.user.id;
  const {firstname, lastname} = req.body;

  try {
    const userResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [userId]);
    const user = userResult.rows[0]

    if (!user) {
      console.log('user not found.')
    } else {
      await db.query("UPDATE userprofile SET firstname = $1, lastname = $2 WHERE id = $3", [firstname, lastname, userId]);
      req.flash('success', 'User details updated.')
      res.redirect("/settings")
    }
  } catch (error) {
    console.log(error);
    res.status(500).send('Server Error');
  }
})

router.post('/contact-home', async (req, res) => {
  const { fullName, email, message, phone, 'g-recaptcha-response': recaptchaToken } = req.body;

  const secretKey = process.env.reCAPTCHA_SecretKey;
  const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;

  const adminEmailResult = await db.query("SELECT smtp_email FROM miscellaneous WHERE id = 1");

  const adminEmail = adminEmailResult.rows[0].smtp_email;

  try {
    const response = await axios.post(verificationURL);
    if (!response.data.success) {
      return res.status(400).send('reCAPTCHA verification failed');
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send('Error verifying reCAPTCHA');
  }

  const mailOptions = {
    to: adminEmail,
    subject: 'New Contact Form Submitted',
    text: `Name: ${fullName}\nEmail Address: ${email}\nPhone: ${phone}\nMessage: ${message}`
  };

  await sendEmail(mailOptions);
});

router.post('/update-notification-preference', ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id; 

  try {
     const notifyUnusualActivity = req.body.notify_unusual_activity ? true : false;

  await db.query('UPDATE userprofile SET notify_unusual_activity = $1 WHERE id = $2', [notifyUnusualActivity, userId]);

  res.redirect('/settings');
  } catch (error) {
    console.log(error)
  }
 
});

router.post('/account/delete', ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    await db.query(
      `INSERT INTO deletion_date (user_id, request_time) VALUES ($1, NOW()) RETURNING *`,
      [userId]
    );

    const result = await db.query('UPDATE userprofile SET deletion_requested = $1 WHERE id = $2 RETURNING username, email', [true, userId]);

    const { username, email } = result.rows[0];

    await sendDeleteAccounEmail(email, username,);

    req.logout((err) => {
      if (err) {
        console.error('Error logging out:', err);
        return res.status(500).send('Error logging out');
      }

      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error('Error destroying session:', sessionErr);
          return res.status(500).send('Error clearing session');
        }

        res.redirect('/login'); 
      });
    });

  } catch (error) {
    console.error('Error requesting account deletion:', error);
    res.status(500).send('Internal server error');
  }
});



export default router;
