import express from "express";
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import { v4 as uuidv4 } from 'uuid';
import numeral from "numeral";
import moment from "moment";

const router = express.Router();

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

      totals.total_deposit = numeral(totals.total_deposit).format('0,0.00');
    
        res.render('profile', { 
          user: userDetails, 
          messages: req.flash(),
          timeSince, notifications,
          referralLink, totals
         });
      } catch (error) {
        console.log(error);
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
        console.log(error);
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
  
    if (!Number.isInteger(transferAmount) || transferAmount <= 0) {
      req.flash("error", "Invalid transfer amount");
      return res.redirect("/referrals");
    }
  
    const transferId = generateTransferId();
  
    try {
      await db.query('BEGIN');
  
      const referralBalance = await getReferralBalance(userId);
  
      if (referralBalance < transferAmount) {
        req.flash("error", "Insufficient referral balance");
        return res.redirect("/referrals");
      }
  
      await insertWithdrawalRecord(userId, transferAmount);
  
      await db.query(`
        UPDATE userprofile SET balance = balance + $1 WHERE id = $2
      `, [transferAmount, userId]);
  
      await db.query(`
        INSERT INTO notifications (user_id, type, message) 
        VALUES ($1, 'transfer', $2)
      `, [userId, `Your transfer of ₦${transferAmount} was successful and the amount credited into your total balance`]);
  
      await db.query(`
        INSERT INTO transactions (user_id, type, amount, reference, status)
        VALUES ($1, 'transfer', $2, $3, 'completed')
      `, [userId, transferAmount, transferId]);
  
      await db.query('COMMIT');
  
      req.flash("success", `Your transfer of ₦${transferAmount} was successful and the amount credited into your total balance`);
      res.redirect("/referrals");
  
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Transaction error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  


  export default router;