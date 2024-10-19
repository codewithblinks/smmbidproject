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

    console.log(transactionAmount)

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

      const updateBalanceQuery = 'UPDATE userprofile SET balance = balance + $1 WHERE id = $2';
      await db.query(updateBalanceQuery, [transactionData.amount / 100, transactionData.metadata.id]);

      // Update transaction status
      const updateTransactionQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2';
      await db.query(updateTransactionQuery, ['success', reference]);

      const transactionResult = await db.query("SELECT amount from transactions WHERE reference = $1", [reference]);
      const transactionAmount = transactionResult.rows[0];
  
      await db.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)", [userId, 'deposit', `Your deposit of ₦${transactionAmount.amount} was successfull and the amount credited into your balance` ])

      const depositCount = await db.query(
        'SELECT COUNT(*) FROM deposits WHERE user_id = $1',
        [userId]
      );
      const depositNumber = Number(depositCount.rows[0].count) + 1;

      if (depositNumber <= 3) {
        // Save the deposit
        await db.query(
          'INSERT INTO deposits (user_id, amount, deposit_number) VALUES ($1, $2, $3)',
          [userId, transactionAmount.amount, depositNumber]
        );

        const referral = await db.query(
          'SELECT referred_by, commission_earned FROM referrals WHERE referred_user = $1',
          [userId]
        );

        if (referral.rows.length > 0 && !referral.rows[0].commission_earned) {
          const referredBy = referral.rows[0].referred_by;
    
          // Calculate commission (e.g., 5% of deposit)
          if (depositNumber === 1) {
            const commissionAmount = transactionAmount.amount * 0.1;

            await db.query(
              'INSERT INTO commissions (user_id, referred_user_id, deposit_number, commission_amount) VALUES ($1, $2, $3, $4)',
              [referredBy, userId, depositNumber, commissionAmount]
            );
          }

          if (depositNumber === 2) {
            const commissionAmount = transactionAmount.amount * 0.06;

            await db.query(
              'INSERT INTO commissions (user_id, referred_user_id, deposit_number, commission_amount) VALUES ($1, $2, $3, $4)',
              [referredBy, userId, depositNumber, commissionAmount]
            );
          }

          if (depositNumber === 3) {
            const commissionAmount = transactionAmount.amount * 0.03;

            await db.query(
              'INSERT INTO commissions (user_id, referred_user_id, deposit_number, commission_amount) VALUES ($1, $2, $3, $4)',
              [referredBy, userId, depositNumber, commissionAmount]
            );
          }
          
    
          // Insert into the commission table

          if (depositNumber === 3) {
            await db.query(
              'UPDATE referrals SET commission_earned = TRUE WHERE referred_user = $1',
              [userId]
            );
          }
        }
      }
  
      req.flash("success", "Deposit successful");
      res.redirect('/dashboard');
  } else {
    return res.status(400).json({ error: 'Deposit verification failed' });
  }
    
  } catch (error) {
    console.error('Error verifying deposit:', error.message);
    console.log(error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/webhook', express.json(), ensureAuthenticated, async (req, res) => {
    const { event, data } = req.body;
    
    try {
      if (event === 'charge.success') {
        // Update transfer status in database
        const updateTransferQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2';
        await db.query(updateTransferQuery, [data.status, data.reference]);
      } else  {
        // Update transfer status in database
        const updateTransferQuery = 'UPDATE transactions SET status = $1 WHERE reference = $2';
        await db.query(updateTransferQuery, [data.status, data.reference]);
      }
  
      res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Error handling Paystack webhook:', error.message);
      console.log(error);
      res.status(500).send('Server error');
    }
  });
  

// flutterWave

router.post('/deposit/flutterwave', ensureAuthenticated, async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id; 
    const fname = req.user.firstname; 
    const lname = req.user.lastname; 
    const email = req.user.email; 
  
    try {
      const response = await axios.post('https://api.flutterwave.com/v3/payments', {
        tx_ref: `tx-${Date.now()}`,
        amount: amount,
        currency: 'NGN',
        redirect_url: 'http://localhost:3000/deposit-success',
        customer: {
          email: `${email}`,
          phonenumber: '08012345678',
          name: `${fname} ${lname}`,
        },
        customizations: {
          title: 'Deposit',
          description: 'Make a deposit',
          logo: 'http://www.piedpiper.com/app/themes/joystick-v27/images/logo.png',
        },
      }, {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      });
  
      const paymentLink = response.data.data.link;
      res.redirect(paymentLink);
    } catch (error) {
      console.error('Error initiating deposit:', error.response ? error.response.data : error.message);
      res.status(500).send('Error initiating deposit');
    }
  });

  // Endpoint for handling the deposit success redirect
router.get('/deposit-success', ensureAuthenticated, async (req, res) => {
    const { transaction_id, tx_ref } = req.query;
  
    try {
      const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
        },
      });
  
      const transaction = response.data.data;
      const userId = req.user.id;
  
      if (transaction.status === 'successful' && transaction.tx_ref === tx_ref) {
        // Update the user's balance
        await db.query('UPDATE userprofile SET balance = balance + $1 WHERE id = $2', [transaction.amount, userId]);
  
        // Log the transaction
        await db.query('INSERT INTO transactions (user_id, type, amount, status) VALUES ($1, $2, $3, $4)', [userId, 'deposit', transaction.amount, 'success']);
        
        res.send('Deposit successful!');
      } else {
        res.status(400).send('Deposit verification failed');
      }
    } catch (error) {
      console.error('Error verifying deposit:', error.response ? error.response.data : error.message);
      res.status(500).send('Error verifying deposit');
    }
  });

  router.post('/flutterwave-webhook', ensureAuthenticated, async (req, res) => {
    const hash = crypto.createHmac('sha256', FLW_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
  
    if (hash === req.headers['verif-hash']) {
      const event = req.body.event;
      const transactionId = req.body.data.id;
      const txRef = req.body.data.tx_ref;
      const amount = req.body.data.amount;
      const status = req.body.data.status;
      const type = req.body.data.narration === 'Withdrawal' ? 'withdraw' : 'deposit';
  
      if (event === 'charge.completed' && type === 'deposit') {
        if (status === 'successful') {
          // Update the user's balance
          await db.query('UPDATE userprofile SET balance = balance + $1 WHERE id = $2', [amount, userId]); // Assume user ID is 1 for simplicity
  
          // Log the transaction
          await db.query('INSERT INTO transactions (user_id, type, amount, status) VALUES ($1, $2, $3, $4)', [userId, 'deposit', amount, 'success']); // Assume user ID is 1 for simplicity
        } else {
          await db.query('INSERT INTO transactions (user_id, type, amount, status) VALUES ($1, $2, $3, $4)', [userId, 'deposit', amount, 'failed']); // Assume user ID is 1 for simplicity
        }
      } else if (event === 'transfer.completed' && type === 'withdraw') {
        const transaction = await db.query('SELECT * FROM transactions WHERE transfer_reference = $1', [txRef]);
  
        if (transaction.rows.length) {
          if (status === 'successful') {
            await db.query('UPDATE transactions SET status = $1 WHERE transfer_reference = $2', ['success', txRef]);
          } else {
            await db.query('UPDATE transactions SET status = $1 WHERE transfer_reference = $2', ['failed', txRef]);
  
            // Refund the amount to the user's balance
            await db.query('UPDATE userprofile SET balance = balance + $1 WHERE id = $2', [transaction.rows[0].amount, transaction.rows[0].user_id]);
          }
        }
      }
    } else {
      return res.status(400).send('Invalid hash');
    }

  res.sendStatus(200);
});
  


export default router;
