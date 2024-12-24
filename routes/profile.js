import express from "express";
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import crypto from "crypto";
import numeral from "numeral";
import { calculateUserTotalDeposit } from "../middlewares/totalUserSpent.js";
import { convertedTotalDeposit } from "./dashboard/userDashboard.js";
import getExchangeRate from "../controller/exchangeRateService.js";

const router = express.Router();

function generateTransferId() {
  const prefix = "#REF";
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 2);
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${timestamp}${randomPart}`;
}

  router.get("/profile", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
    try {
      const rate = await getExchangeRate();

       let userTotalSpent = await calculateUserTotalDeposit(userId);

        const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
        const userDetails = userResult.rows[0];

        const referralCode = userDetails.referral_code;
        const referralLink = `${req.protocol}://${req.get('host')}/register?ref=${referralCode}`;

        const notificationsResult = await db.query(
          'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
          [userId, false]
      );
    
      const notifications = notificationsResult.rows;
    
        if (!userDetails) {
          return res.status(404).json({ error: 'User not found' });
        }

        const result = await db.query(`
          SELECT
               COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS total_deposit,
               COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END), 0) AS total_withdrawal
          FROM
              transactions
          WHERE
              user_id = $1 AND status = $2;
      `, [userId, 'success']);
    
      const totals = result.rows[0];

      const convertedResult = await convertedTotalDeposit(rate.NGN, totals.total_deposit, userDetails.currency, userTotalSpent.totalSuccessfulTransaction);
      let convertedDeposit = convertedResult.convertedDeposit;
      let convertedSpent = convertedResult.convertedSpent;

      convertedDeposit = numeral(convertedDeposit).format('0,0.00');
      convertedSpent = numeral(convertedSpent).format('0,0.00');
    
        res.render('profile', { 
          user: userDetails, 
          messages: req.flash(),
          timeSince, notifications,
          referralLink, convertedDeposit, userTotalSpent: convertedSpent
         });
      } catch (error) {
        console.error("error getting profile", error);
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
        totalPages: Math.ceil(totalcommissions / limit), messages: req.flash()
      })
    } catch (error) {
        console.error("error getting referral", error);
        res.status(500).json({ error: 'Internal server error' });
    }
  })

  const getReferralBalance = async (userId) => {
    const referralTotalEarned = await db.query(`
      SELECT SUM(commissions.commission_amount) AS total_referral_commission
      FROM referrals
      JOIN commissions ON referrals.referred_by = commissions.user_id
      WHERE referrals.referred_by = $1 AND referrals.commission_earned = $2
    `, [userId, true]);
  
    const totalEarned = Number(referralTotalEarned.rows[0].total_referral_commission || 0);
  
    const withdrawalsResult = await db.query(`
      SELECT SUM(amount) AS total_withdrawn FROM referral_withdrawals WHERE user_id = $1
    `, [userId]);
  
    const totalWithdrawn = Number(withdrawalsResult.rows[0].total_withdrawn || 0);
  
    return totalEarned - totalWithdrawn;
  };
  
  const insertWithdrawalRecord = async (userId, transferAmount) => {
    return await db.query(`
      INSERT INTO referral_withdrawals (user_id, amount) VALUES ($1, $2) RETURNING *
    `, [userId, transferAmount]);
  };

  router.post("/transfer/referral/balance", ensureAuthenticated, userRole, async (req, res) => {
    const userId = req.user.id;
    const transferAmount = Number(req.body.transferAmount);
    const minWithdrawalAmount = 1500;

    const referralBalance = await getReferralBalance(userId);
  
    if (!Number.isInteger(transferAmount) || transferAmount <= 0) {
      return res.status(200).json({ error: 'Invalid transfer amount' });
    }

    if (transferAmount < minWithdrawalAmount) {
      return res.status(200).json({ error: `minimum referral withdrawal amount is ₦${minWithdrawalAmount} and your current referral balance is ₦${referralBalance}`});
    }
  
    const transferId = generateTransferId();
    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(transferAmount);
  
    try {
      await db.query('BEGIN');
  
      if (referralBalance < transferAmount) {
        return res.status(200).json({ error: 'Insufficient referral balance' });
      }
  
      await insertWithdrawalRecord(userId, transferAmount);
  
      await db.query(`
        UPDATE userprofile SET balance = balance + $1 WHERE id = $2
      `, [transferAmount, userId]);
  
      await db.query(`
        INSERT INTO notifications (user_id, type, message) 
        VALUES ($1, 'transfer', $2)
      `, [userId, `Your transfer of ₦${formattedAmount} was successful and the amount credited into your total balance`]);
  
      await db.query(`
        INSERT INTO transactions (user_id, type, amount, reference, status)
        VALUES ($1, 'transfer', $2, $3, 'completed')
      `, [userId, transferAmount, transferId]);
  
      await db.query('COMMIT');
  
      req.flash("success", `Your transfer of ₦${transferAmount} was successful and the amount credited into your total balance`);
      return res.json({ message: `Your transfer of ${formattedAmount} was successful and credited to your total balance.` });
  
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Transaction error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  export default router;