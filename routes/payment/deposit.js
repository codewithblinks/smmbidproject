import express from "express";
import db from "../../db/index.js";
import dotenv from 'dotenv';
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto"
import ensureAuthenticated, {userRole} from "../../authMiddleware/authMiddleware.js";
import timeSince from "../../controller/timeSince.js";
import {cryptomusService} from "../../api/cryptomusService.js"; 
import { sendDepositPendingEmail, sendDepositPendingAdminEmail } from "../../config/emailMessages.js";
import multer from "multer";
import path from "path";
import fs from "fs";


dotenv.config();
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FLW_WEBHOOK_SECRET = process.env.FLW_WEBHOOK_SECRET

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const paystackCreateRecipientUrl = process.env.PAYSTACK_RECIPIENT_URL;


router.get('/deposit', ensureAuthenticated, userRole, async(req, res) => {
  const userId = req.user.id;
  try {
    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

  const usersResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [userId]);
  const user = usersResult.rows[0]
   res.render('deposit', {user, notifications, timeSince, messages: req.flash()});
    
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
  });

  function generateTransactionReference() {
    return `trans_${crypto.randomBytes(8).toString('hex')}`;
  }
  
router.post('/deposit/bank', ensureAuthenticated, upload.single('paymentProof'), async (req, res) => {
  const userId = req.user.id;
  const {email, username} = req.user;
  const {transaction_reference } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'Image upload required' });
  }

  const proofImage = req.file.buffer;
  
    try {
      const bank_amount  = Number(req.body.bank_amount);
      if (isNaN(bank_amount) || bank_amount < 500) {
        return res.status(400).json({ error: "Please enter a valid number, minimum deposit amount is ₦500." });
      }

      const adminEmailQuery = await db.query(`
        SELECT email, username from admins 
        WHERE id = $1
        `, [1]);

        const adminEmail = adminEmailQuery.rows[0].email;
        const adminUsername = adminEmailQuery.rows[0].username;

      const transactionReference = generateTransactionReference();

      const result = await db.query(
        'INSERT INTO pending_deposits (user_id, amount, reference, transaction_reference, status, proof_image) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [userId, bank_amount, transactionReference, transaction_reference, 'Pending', proofImage]
    );

    const addTransactionQuery = `
    INSERT INTO transactions (user_id, type, amount, reference, status)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `;
  await db.query(addTransactionQuery, [userId, 'deposit', bank_amount, transactionReference, 'pending']);

    await sendDepositPendingEmail(email, username, transactionReference, bank_amount);

    await sendDepositPendingAdminEmail(
      adminEmail, username, 
      transactionReference, bank_amount, 
      adminUsername
    );

    req.flash("success", "Your deposit has been sent successfully, waiting for confirmation");
    
    res.redirect('/transactions');

    } catch (error) {
      console.error('Error processing deposit:', error);
        res.status(500).send('Error processing deposit');
    }
  });

router.post('/create-cryptomus-payment', async (req, res) => {
    const { amount, currency, orderId, successUrl, cancelUrl } = req.body;
  
    try {
      const paymentResponse = await cryptomusService.createPayment(amount, currency, orderId, successUrl, cancelUrl);
      res.json(paymentResponse);
    } catch (error) {
      res.status(500).json({ message: 'Error creating payment' });
    }
  });
  
router.post('/cryptomus-webhook', (req, res) => {
    const signature = req.headers['x-signature'];
    const data = req.body;
  
    if (cryptomusService.verifyWebhookSignature(data, signature)) {
      // Process the payment confirmation
      if (data.status === 'paid') {
        console.log(`Payment received for Order ID: ${data.order_id}`);
        // TODO: Update order status in your database here
      }
      res.status(200).send('OK');
    } else {
      res.status(400).send('Invalid signature');
    }
  });

export default router;
