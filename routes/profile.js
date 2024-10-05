import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import { v4 as uuidv4 } from 'uuid';

function generateTransferId() {
  const prefix = "trans_ref";
  const uniqueId = uuidv4(); // Generate a unique UUID
  const buffer = Buffer.from(uniqueId.replace(/-/g, ''), 'hex'); // Remove dashes and convert to hex
  const base64Id = buffer.toString('base64').replace(/=/g, '').slice(0, 12);
  return `${prefix}_${base64Id}`;
}

  router.get("/profile", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
    try {
        const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
        const userDetails = userResult.rows[0];

        const referralCode = userDetails.referral_code;
        const referralLink = `${req.protocol}://${req.get('host')}/register?ref=${referralCode}`;

        const notificationsResult = await db.query(
          'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
          [userId, false]
      );
    
      const notifications = notificationsResult.rows;

      const incomeResult = await db.query(
        "SELECT SUM(amount) AS total_sold_amount FROM product_list WHERE user_id = $1 AND payment_status = $2",
        [userId, 'sold']
      );
  
      const totalincome = incomeResult.rows[0].total_sold_amount || 0;

      const profitResult = await db.query(
        "SELECT SUM(payment_recieved) AS total_profit_amount FROM product_list WHERE user_id = $1 AND payment_status = $2",
        [userId, 'sold']
      );
  
      const totalProfit = profitResult.rows[0].total_profit_amount || 0;
    
        if (!userDetails) {
          return res.status(404).json({ error: 'User not found' });
        }
    
        res.render('profile', { 
          user: userDetails, 
          messages: req.flash(),
          timeSince, notifications,
          totalincome, totalProfit,
          referralLink
         });
      } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Internal server error' });
      }
  });

  router.get("/referrals", ensureAuthenticated, userRole, async(req, res) => {
   const userId = req.user.id;

    try {

      const limit = 10;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;

      const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
      const userDetails = userResult.rows[0];

      const notificationsResult = await db.query(
        'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
        [userId, false]
    );
  
    const notifications = notificationsResult.rows;

      const referralResult = await db.query(`
SELECT referrals.*, commissions.*, userprofile.username
FROM referrals
JOIN commissions ON referrals.referred_by = commissions.user_id
JOIN userprofile ON referrals.referred_user = userprofile.id
WHERE referrals.referred_by = $1 ORDER BY commissions.id DESC LIMIT $2 OFFSET $3;

        `, 
        [userId, limit, offset]);

        const countQuery = "SELECT COUNT(*) FROM commissions";
        const countResult = await db.query(countQuery);
        const totalcommissions = parseInt(countResult.rows[0].count);

        const referrals = referralResult.rows;

        const referralTotalEarned = await db.query(`
          SELECT SUM(commissions.commission_amount) AS total_referral_commission
          FROM referrals
          JOIN commissions ON referrals.referred_by = commissions.user_id
          WHERE referrals.referred_by = $1 AND referrals.commission_earned = $2
      `, [userId, true]);

      const totalEarned = referralTotalEarned.rows[0].total_referral_commission || 0;

      const withdrawalsResult = await db.query(
        'SELECT SUM(amount) AS total_withdrawn FROM referral_withdrawals WHERE user_id = $1',
        [userId]
      );
      
      const totalWithdrawn = withdrawalsResult.rows[0].total_withdrawn || 0;
  
      // Calculate the available referral balance
      const referralBalance = totalEarned - totalWithdrawn;

      res.render("referralPage", {
        referrals, referralBalance, user : userDetails, 
        timeSince, notifications,
        currentPage: page, 
        totalPages: Math.ceil(totalcommissions / limit)
      })
    } catch (error) {
      console.error(error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
  })

  router.post("/transfer/referral/balance", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
    const transferAmount = Number(req.body.transferAmount);

    const transferId = generateTransferId();

    try {
    const referralTotalEarned = await db.query(
      `
          SELECT SUM(commissions.commission_amount) AS total_referral_commission
          FROM referrals
          JOIN commissions ON referrals.referred_by = commissions.user_id
          WHERE referrals.referred_by = $1 AND referrals.commission_earned = $2
      `,
      [userId, true]
    );

    const totalEarned =
      referralTotalEarned.rows[0].total_referral_commission || 0;

    const withdrawalsResult = await db.query(
      "SELECT SUM(amount) AS total_withdrawn FROM referral_withdrawals WHERE user_id = $1",
      [userId]
    );

    const totalWithdrawn = withdrawalsResult.rows[0].total_withdrawn || 0;

    // Calculate the available referral balance
    const referralBalance = totalEarned - totalWithdrawn;
    

      if (referralBalance >= transferAmount) {

        const updateReferralBalanceQuery =
        "INSERT INTO referral_withdrawals (user_id, amount) VALUES ($1, $2) RETURNING *";
      await db.query(updateReferralBalanceQuery, [userId, transferAmount]);

      const updateBusinessBalanceQuery =
        "UPDATE userprofile SET business_balance = business_balance + $1 WHERE id = $2";
      await db.query(updateBusinessBalanceQuery, [transferAmount, userId]);

      await db.query(`
        INSERT INTO notifications 
        (user_id, type, message) 
        VALUES ($1, $2, $3)`,
         [userId, 'transfer', 
          `Your transfer of ${transferAmount} was successfull and the amount credited into your business balance` ]);

          const addTransactionQuery = `
          INSERT INTO transactions (user_id, type, amount, reference, status)
          VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        await db.query(addTransactionQuery, [userId, 'transfer', transferAmount, transferId, 'completed']);

      res.redirect("/referrals")
      } else {
        console.log('insufficient balance')
        res.redirect("/referrals")
      }
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  })


  export default router;