import express from "express";
import db from "../../db/index.js";
import dotenv from 'dotenv';
import axios from "axios";
import crypto from "crypto"
import ensureAuthenticated, {userRole} from "../../authMiddleware/authMiddleware.js";
import timeSince from "../../controller/timeSince.js";
import {createTransaction, updateTransactionStatus} from "../../api/cryptomusService.js"; 
import { sendDepositPendingEmail, sendDepositPendingAdminEmail } from "../../config/emailMessages.js";
import { getExchangeRateCryptomus } from "../../controller/exchangeRateService.js";
import multer from "multer";


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

const { CRYPTOMUS_API_KEY, CRYPTOMUS_MERCHANT_ID, CRYPTOMUS_WHITELISTED_IPS} = process.env;

function isIpWhitelisted(ip) {
  return CRYPTOMUS_WHITELISTED_IPS.includes(ip);
}

function generateSignature(data) {
  const jsonData = JSON.stringify(data); // Convert request body to JSON
  const base64Data = Buffer.from(jsonData).toString('base64'); // Base64 encode
  const combined = base64Data + CRYPTOMUS_API_KEY; // Append API key
  return crypto.createHash('md5').update(combined).digest('hex'); // MD5 hash
}

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
    console.error("Error getting deposit page:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
  });

  function generateTransactionReference() {
    const prefix = "#DEP";
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 2);
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}${timestamp}${randomPart}`;
  }
  
router.post('/deposit/bank', ensureAuthenticated, upload.single('paymentProof'), async (req, res) => {
  const userId = req.user.id;
  const {email, username} = req.user;
  const {transaction_reference } = req.body;

  if (!req.file) {
    return res.status(200).json({ message: 'Image upload required' });
  }

  const proofImage = req.file.buffer;

  
    try {
      const bank_amount  = Number(req.body.bank_amount);
      if (isNaN(bank_amount) || bank_amount < 500) {
        return res.status(200).json({ error: "Please enter a valid number, minimum deposit amount is ₦500." });
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
    return res.json({ message: `Your deposit has been sent successfully, waiting for confirmation` });

    } catch (error) {
      console.error('Error processing deposit:', error);
        res.status(500).send('Error processing deposit');
    }
  });

router.post('/create-cryptomus-payment', ensureAuthenticated, async (req, res) => {
  let userId = req.user.id;
  const { cryptomus_amount, currency, userCurrency} = req.body;
  const order_id = generateTransactionReference();
  const minAmount = userCurrency === "USD" ? 3 : 1500;
  const sign = userCurrency === "USD" ? '$' : '₦';


  if (isNaN(cryptomus_amount) || cryptomus_amount < minAmount) {
    return res.status(200).json({ error: `Please enter a valid number, minimum deposit amount is ${sign}${minAmount}.` });
  }

  let amount = cryptomus_amount.toString();

  try {
    const urlCallback = `${process.env.BASE_URL}/cryptomus-webhook`;
    const url_success = `${process.env.BASE_URL}/transactions`;
    const url_return = `${process.env.BASE_URL}/deposit`;

    const payload = {
      amount: amount,
      currency,
      order_id,
      url_callback: urlCallback,
      url_success: url_success,
      url_return: url_return,
      is_payment_multiple: false,
      course_source: 'BinanceP2P',
    };

    const signature = generateSignature(payload);

    const response = await axios.post('https://api.cryptomus.com/v1/payment', payload, {
      headers: {
        'Content-Type': 'application/json',
        'merchant': CRYPTOMUS_MERCHANT_ID, // Set your merchant ID from environment
        'sign': signature, // Add the generated signature
      },
    });

    const paymentData = response.data.result;

    // Save transaction in the database
    await createTransaction({
      amount: paymentData.amount,
      status: paymentData.status,
      order_id: paymentData.order_id,
      userId,
      currency: paymentData.currency,
      type: 'deposit',
    });

    const paymentUrl = response.data.result.url;

    res.status(200).json({ success: true, paymentUrl});
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to create payment' });
  }
  });

  router.post('/cryptomus-webhook', async (req, res) => {
    try {

      const exchangeRates = await getExchangeRateCryptomus();

      const incomingIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      if (!isIpWhitelisted(incomingIp)) {
        console.error('Unauthorized IP address:', incomingIp);
        return res.status(403).json({ success: false, message: 'Unauthorized IP address' });
      }
  
      const requestBody = req.body;
      const receivedSign = requestBody.sign; 
      delete requestBody.sign;
  
      const jsonBody = JSON.stringify(requestBody, null, 0).replace(/\//g, '\\/');
      const base64Body = Buffer.from(jsonBody).toString('base64');
      const expectedSign = crypto
        .createHash('md5')
        .update(base64Body + CRYPTOMUS_API_KEY)
        .digest('hex');
  
      if (!crypto.timingSafeEqual(Buffer.from(receivedSign), Buffer.from(expectedSign))) {
        console.error('Invalid signature:', { receivedSign, expectedSign });
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
  
      const { amount, currency, status, order_id, uuid } = requestBody;
      console.log('Valid webhook received:', { amount, currency, status, order_id, uuid });
  
      const currentStatus = await updateTransactionStatus(order_id, status);

      if (currentStatus === 'already_paid') {
          console.log('Transaction already processed, skipping balance crediting.');
          return res.status(200).json({ success: true });
      }
      

      if (status === 'paid') {
        const rate = (exchangeRates.course).toFixed(2)
        await creditUserBalance(amount, order_id, currency, rate);
        console.log(`User balance credited: ${amount} ${currency}`);
      }
  
      // Respond to Cryptomus with a success status
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error processing webhook:', error.message);
      res.status(500).json({ success: false, error: 'Failed to process webhook' });
    }
  });

export default router;
