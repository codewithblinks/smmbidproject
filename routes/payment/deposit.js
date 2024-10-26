import express from "express";
import db from "../../db/index.js";
import dotenv from 'dotenv';
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto"
import ensureAuthenticated, {userRole} from "../../authMiddleware/authMiddleware.js";
import timeSince from "../../controller/timeSince.js";


dotenv.config();
const router = express.Router();


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
   res.render('deposit', {user, notifications, timeSince});
    
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
  });

  function generateTransactionReference() {
    return `trans_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  
router.post('/deposit', ensureAuthenticated, async (req, res) => {
    const { paystack_amount } = req.body;
    const userId = req.user.id;
  
    try {
      // Fetch user details from database
    const userQuery = 'SELECT * FROM userprofile WHERE id = $1';
    const userResult = await db.query(userQuery, [userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate transaction reference
    const transactionReference = generateTransactionReference();

    // Construct Paystack initialize transaction payload
    const paystackInitializeUrl = 'https://api.paystack.co/transaction/initialize';
    const payload = {
      email: user.email,
      amount: paystack_amount * 100, 
      reference: transactionReference,
      callback_url: `${process.env.BASE_URL}/verify-deposit`,
      metadata: {
        id: userId,
        cancel_action: `${process.env.BASE_URL}/cancel-deposit?reference=${transactionReference}`
      }
    };

    // Make request to Paystack API
    const headers = {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };


    const response = await axios.post(paystackInitializeUrl, payload, { headers });
    const { authorization_url } = response.data.data;
      
    const addTransactionQuery = `
    INSERT INTO transactions (user_id, type, amount, reference, status)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `;
  await db.query(addTransactionQuery, [userId, 'deposit', paystack_amount, transactionReference, 'pending']);
  

  return res.redirect(authorization_url);
  } catch (error) {
    console.error('Error initializing deposit:', error.message);
    console.log(error);
    // Check if Paystack API returned an error
    if (error.response && error.response.data && error.response.data.message) {
      const paystackErrorMessage = error.response.data.message;
      return res.status(400).json({ error: paystackErrorMessage });
    }

    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/cancel-deposit', ensureAuthenticated, async (req, res) => {
  const { reference } = req.query;
  const userId = req.user.id;

  console.log("reference", reference)

  if (!reference) {
    return res.status(400).json({ error: 'Reference is required' });
  }

  try {
    // Update the transaction status to "canceled"
    const updateTransactionQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2';
    const result = await db.query(updateTransactionQuery, ['canceled', reference]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transactionResult = await db.query("SELECT amount from transactions WHERE reference = $1", [reference]);
    const transactionAmount = transactionResult.rows[0];

    await db.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)", [userId, 'deposit', `Your deposit of ₦${transactionAmount.amount} was canceled by you` ])

    req.flash("success", "Your deposit has been canceled.");
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error updating transaction status:', error.message);
    console.log(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/verify-deposit', ensureAuthenticated, async (req, res) => {
  const { reference } = req.query;
  const userId = req.user.id;

  try {
    // Verify transaction with Paystack API
    const paystackVerifyUrl = `https://api.paystack.co/transaction/verify/${reference}`;
    const headers = {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };

    const response = await axios.get(paystackVerifyUrl, { headers });
    const transactionData = response.data.data;

    if (transactionData.status === 'success') {

      const existingTransaction = await db.query('SELECT status FROM transactions WHERE reference = $1', [reference]);

      if (existingTransaction.rows[0]?.status === 'success') {
        console.log("Transaction already processed:", reference);
        req.flash("info", "This transaction has already been processed.");
        return res.redirect('/dashboard');
      }

      await db.query('BEGIN');

      const updateBalanceQuery = 'UPDATE userprofile SET balance = balance + $1 WHERE id = $2';
      await db.query(updateBalanceQuery, [transactionData.amount / 100, transactionData.metadata.id]);

      // Update transaction status
      const updateTransactionQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2';
      await db.query(updateTransactionQuery, ['success', reference]);

      const transactionResult = await db.query("SELECT amount from transactions WHERE reference = $1", [reference]);
      const transactionAmount = transactionResult.rows[0];
  
      await db.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)", [userId, 'deposit', `Your deposit of ₦${transactionAmount.amount} was successfull and the amount credited into your balance` ])

      const depositCount = await db.query('SELECT COUNT(*) FROM deposits WHERE user_id = $1', [userId]);
      const depositNumber = Number(depositCount.rows[0].count) + 1;


      if (depositNumber <= 3) {
        await db.query('INSERT INTO deposits (user_id, amount, deposit_number) VALUES ($1, $2, $3)', [userId, transactionAmount.amount, depositNumber]);

        const referral = await db.query('SELECT referred_by, commission_earned FROM referrals WHERE referred_user = $1', [userId]);

        if (referral.rows.length > 0 && !referral.rows[0].commission_earned) {
          const referredBy = referral.rows[0].referred_by;

          let commissionPercentage = depositNumber === 1 ? 0.10 : depositNumber === 2 ? 0.06 : depositNumber === 3 ? 0.03 : 0;

          if (commissionPercentage > 0) {
            const commissionAmount = transactionAmount.amount * commissionPercentage;
            await db.query(
              'INSERT INTO commissions (user_id, referred_user_id, deposit_number, commission_amount) VALUES ($1, $2, $3, $4)',
              [referredBy, userId, depositNumber, commissionAmount]
            );
          }

          if (depositNumber === 3) {
            await db.query('UPDATE referrals SET commission_earned = TRUE WHERE referred_user = $1', [userId]);
          }
        }
      }

      await db.query('COMMIT');
  
      req.flash("success", "Deposit successful");
      res.redirect('/dashboard');
  } else {
    let newStatus;
    if (transactionData.status === 'abandoned') {
      newStatus = 'abandoned';
      req.flash("error", "Deposit abandoned");
    } else if (transactionData.status === 'processing') {
      newStatus = 'processing';
      req.flash("error", "Deposit is still processing");
    } else {
      newStatus = transactionData.status || 'failed';
      req.flash("error", "Deposit verification failed");
    }

    // Update transaction status accordingly
    const updateTransactionQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2';
    await db.query(updateTransactionQuery, [newStatus, reference]);

    res.redirect('/dashboard');
  }
} catch (error) {
  await db.query('ROLLBACK');
  console.error('Error verifying deposit:', error.message);
  return res.status(500).json({ error: 'Server error' });
}
});

router.post('/webhook', express.json(), async (req, res) => {
  res.status(200).send('Webhook received');

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.log("Unauthorized webhook access detected.");
    return; 
  }

  const { event, data } = req.body;
  console.log('Webhook event received:', event, data);

  try {
    if (event === 'charge.success') {
      const existingTransaction = await db.query('SELECT status FROM transactions WHERE reference = $1', [data.reference]);

      if (existingTransaction.rows[0]?.status !== 'success') {
        const updateTransferQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2 RETURNING user_id, amount';
        const result = await db.query(updateTransferQuery, [data.status, data.reference]);

        if (result.rows.length > 0) {
          const { user_id } = result.rows[0];
          const amount = parseFloat(result.rows[0].amount); 

          // Credit the user's balance
          const creditUserQuery = 'UPDATE userprofile SET balance = balance + $1 WHERE id = $2';
          await db.query(creditUserQuery, [amount, user_id]);

          console.log(`Successfully credited user ${user_id} with amount ₦${amount}`);
        } else {
          console.error('Transaction not found or failed to update');
        }
      } else {
        console.log("Duplicate webhook event ignored for transaction:", data.reference);
      }
    } else {
      // Handle non-charge.success events by updating transaction status only
      await db.query('UPDATE transactions SET status = $1 WHERE reference = $2', [data.status, data.reference]);
      console.log(`Updated transaction ${data.reference} status to: ${data.status}`);
    }
  } catch (error) {
    console.error('Error handling Paystack webhook:', error.message);
    console.log(error);
  }
});

  
router.post('/deposit/bank', ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { bank_amount, transaction_reference } = req.body;
  
    try {

      const transactionReference = generateTransactionReference();

      const result = await db.query(
        'INSERT INTO pending_deposits (user_id, amount, reference, transaction_reference, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, bank_amount, transactionReference, transaction_reference, 'Pending']
    );

    const addTransactionQuery = `
    INSERT INTO transactions (user_id, type, amount, reference, status)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `;
  await db.query(addTransactionQuery, [userId, 'deposit', bank_amount, transactionReference, 'pending']);


    req.flash("success", "Your deposit has been sent successfully, waiting for confirmation");
    res.redirect('/transactions');

    } catch (error) {
        console.error('Error saving deposit:', error);
        res.status(500).send('Error processing deposit');
    }
  });

export default router;
