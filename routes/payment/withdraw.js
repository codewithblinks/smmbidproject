import express from "express";
import db from "../../db/index.js";
import dotenv from "dotenv";
import axios from "axios";
import cron from "node-cron";
import crypto from "crypto";
import ensureAuthenticated, {userRole} from "../../authMiddleware/authMiddleware.js";
import numeral from "numeral";
import timeSince from "../../controller/timeSince.js";

dotenv.config();
const router = express.Router();


router.get("/withdraw", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;
  try {
    const usersResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = usersResult.rows[0];

    user.business_balance = numeral(user.business_balance).format("0,0.00");

    const userBanksResult = await db.query(
      "SELECT * FROM withdrawal_details WHERE user_id = $1",
      [userId]
    );
    const userBanks = userBanksResult.rows;

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

    res.render("withdraw", { userBanks, messages: req.flash(), user, timeSince, notifications });
  } catch (error) {
    console.error("Error fetching banks or user bank accounts:", error);
    res.send("Error fetching banks or user bank accounts");
  }
});

function generateTransferReference() {
  return `trans_${crypto.randomBytes(8).toString("hex")}`;
}

router.post("/withdraw", ensureAuthenticated, async (req, res) => {
  const bankId = req.body.bank_id;
  const amount = Number(req.body.amount);
  const userId = req.user.id;

  try {
    // Fetch user details from database
    const userQuery = "SELECT * FROM userprofile WHERE id = $1";
    const userResult = await db.query(userQuery, [userId]);
    const user = userResult.rows[0];

    // Validate user exists
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Fetch user balance from database
    const balanceQuery = "SELECT business_balance FROM userprofile WHERE id = $1";
    const balanceResult = await db.query(balanceQuery, [userId]);
    const userBalance = Number(balanceResult.rows[0].business_balance) || 0;

    console.log(typeof userBalance)
    console.log(userBalance)

    // Check if the user has sufficient balance
    if (amount > userBalance) {
      req.flash("error", "Insufficient balance");
      return res.redirect("/withdraw");
    }

    // Fetch recipient code for the selected bank
    const recipientQuery =
      "SELECT recipient_code FROM withdrawal_details WHERE user_id = $1 AND id = $2";
    const recipientResult = await db.query(recipientQuery, [userId, bankId]);
    const recipient = recipientResult.rows[0];

    // Validate recipient code exists
    if (!recipient) {
      return res.status(404).json({ error: "Bank details not found for user" });
    }

    const recipientCode = recipient.recipient_code;

    // Generate transfer reference
    const transferReference = generateTransferReference();

    // Construct Paystack transfer payload
    const paystackTransferUrl = "https://api.paystack.co/transfer";
    const payload = {
      source: "balance",
      amount: amount * 100, // Paystack uses kobo (minor currency unit)
      recipient: recipientCode,
      reason: "Withdrawal from user account",
      reference: transferReference,
    };

    // Make request to Paystack API
    const headers = {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    };

    const response = await axios.post(paystackTransferUrl, payload, {
      headers,
    });
    const transferData = response.data.data;

    // Store transfer details in database (optional)
    const addTransferQuery = `
        INSERT INTO transactions (user_id, type, amount, reference, status)
        VALUES ($1, $2, $3, $4, $5,)
      `;
    await db.query(addTransferQuery, [
      userId,
      "withdraw",
      amount,
      transferReference,
      transferData.status,
    ]);

    const updateBalanceQuery =
      "UPDATE userprofile SET business_balance = business_balance - $1 WHERE id = $2";
    await db.query(updateBalanceQuery, [amount, userId]);
    req.flash("success", "Withdrawal initiated successfully");

    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Error initiating transfer:", error.message);

    // Check if Paystack API returned an error
    if (error.response && error.response.data && error.response.data.message) {
      const paystackErrorMessage = error.response.data.message;
      return res.status(400).json({ error: paystackErrorMessage });
    }

    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/webhook", async (req, res) => {
  const event = req.body;

  if (event.event === "transfer.success" || event.event === "transfer.failed") {
    const transferReference = event.data.reference;
    const transferStatus = event.data.status;

    // Update transfer status in database
    const updateTransferQuery = `
        UPDATE transactions
        SET status = $1
        WHERE reference = $2
      `;
    await db.query(updateTransferQuery, [transferStatus, transferReference]);

    return res
      .status(200)
      .json({ message: "Transfer status updated successfully" });
  }

  return res.status(400).json({ error: "Unsupported event type" });
});

export default router;
