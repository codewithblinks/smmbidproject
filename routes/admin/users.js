import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";

function getCurrentWeek() {
  const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
  const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
  return { startOfWeek, endOfWeek };
}


router.get("/admin/users/list", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const userResult = await db.query("SELECT * FROM userprofile WHERE is_suspended = $1 AND email_verified = $2 ORDER BY id DESC", [false, true]);
    const userDetails = userResult.rows;

    userDetails.forEach(userDetails => {
      userDetails.balance = numeral(userDetails.balance).format('0,0.00');
  });

      res.render('admin/users', { messages: req.flash(), user: userDetails });
  
  } catch (err) {
    console.err(err);
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/users/list/suspend", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const suspendUserResult = await db.query("SELECT * FROM userprofile WHERE is_suspended = $1 AND email_verified = $2 ORDER BY id DESC", [true, true]);
    const suspendUser = suspendUserResult.rows;

    suspendUser.forEach(suspendUser => {
      suspendUser.balance = numeral(suspendUser.balance).format('0,0.00');
  });

      res.render('admin/suspendedUsers', { messages: req.flash(), user: suspendUser });
  
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/users/list/unverified", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const suspendUserResult = await db.query("SELECT * FROM userprofile WHERE email_verified = $1 ORDER BY id DESC", [false]);
    const suspendUser = suspendUserResult.rows;

    suspendUser.forEach(suspendUser => {
      suspendUser.balance = numeral(suspendUser.balance).format('0,0.00');
  });

      res.render('admin/unverifiedUsers', { messages: req.flash(), user: suspendUser });
  
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/searchActiveUsers', adminEnsureAuthenticated, async (req, res) => {
  const query = req.query.query || '';
  const userId = req.user.id;
  
  try {

      const result = await db.query(
        `SELECT * FROM userprofile
        WHERE is_suspended = $1
         AND (firstname ILIKE $2 OR lastname ILIKE $2 OR email ILIKE $2)
         ORDER BY id DESC
         `,
        [false, `%${query}%`]
      );

      res.json(result.rows); 
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while searching for products' });
  }
});

router.get('/searchSuspendedUsers', adminEnsureAuthenticated, async (req, res) => {
  const query = req.query.query || '';
  const userId = req.user.id;
  
  try {

      const result = await db.query(
        `SELECT * FROM userprofile
        WHERE is_suspended = $1
         AND (firstname ILIKE $2 OR lastname ILIKE $2 OR email ILIKE $2)
         ORDER BY id DESC
         `,
        [true, `%${query}%`]
      );

      res.json(result.rows); 
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while searching for products' });
  }
});

router.get('/searchUnverifiedUsers', adminEnsureAuthenticated, async (req, res) => {
  const query = req.query.query || '';
  const userId = req.user.id;
  
  try {

      const result = await db.query(
        `SELECT * FROM userprofile
        WHERE email_verified = $1
         AND (firstname ILIKE $2 OR lastname ILIKE $2 OR email ILIKE $2)
         ORDER BY id DESC
         `,
        [false, `%${query}%`]
      );

      res.json(result.rows); 
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while searching for products' });
  }
});

router.get('/admin/users/user/:userId/personal', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const {userId} = req.params;
  
  try {
      const limit = 15;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;

      const smsResult = await db.query(`
        SELECT * FROM sms_order
        WHERE user_id = $1
        ORDER BY timestamp 
        DESC LIMIT $2 OFFSET $3
        `, [userId, limit, offset]
      )
      const sms = smsResult.rows;

      const smmResult = await db.query(`
        SELECT * FROM purchase_history
        WHERE user_id = $1
        ORDER BY order_date
        DESC LIMIT $2 OFFSET $3
        `, [userId, limit, offset]
      )

      const smm = smmResult.rows;

      const userResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [userId]);
      const user = userResult.rows[0];

      const userTransactions = await db.query(`
        SELECT * FROM transactions 
        WHERE user_id = $1 
        ORDER BY created_at 
        DESC LIMIT $2 OFFSET $3`,
         [userId, limit, offset]);

      const transactions = userTransactions.rows;

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

      user.created_at = moment(user.created_at).format("D MMM h:mmA");
      user.balance = numeral(user.balance).format('0,0.00');
      user.referralBalance = numeral(referralBalance).format('0,0.00');
     
      transactions.forEach(transactions => {
        transactions.amount = numeral(transactions.amount).format('0,0.00');
        transactions.created_at = moment(transactions.created_at).format("D MMM h:mmA");
    });

    sms.forEach(sms => {
      sms.amount = numeral(sms.amount).format('0,0.00');
      sms.timestamp = moment(sms.timestamp).format("D MMM h:mmA");
  });

  smm.forEach(smm => {
    smm.charge = numeral(smm.charge).format('0,0.00');
    smm.order_date = moment(smm.order_date).format("D MMM h:mmA");
});

    const countQuery = "SELECT COUNT(*) FROM transactions";
    const countResult = await db.query(countQuery);
    const totalOrders = parseInt(countResult.rows[0].count);

    const smsQuery = "SELECT COUNT(*) FROM sms_order";
    const smsResultQuery = await db.query(smsQuery);
    const smsOrders = parseInt(smsResultQuery.rows[0].count);

    const smmQuery = "SELECT COUNT(*) FROM purchase_history";
    const smmResultQuery = await db.query(smmQuery);
    const smmOrders = parseInt(smmResultQuery.rows[0].count);
  

      res.render("admin/userPersonalProfile", {
        user, transactions,
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit),
        sms, smm,
        smstotalPages: Math.ceil(smsOrders / limit),
        smmtotalPages: Math.ceil(smmOrders / limit),
        referralBalance
      })
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while searching for products' });
  }
});

router.get("/admin/weekly/challenges/history", adminEnsureAuthenticated, adminRole, async(req, res) => {
  try {
    const { startOfWeek } = getCurrentWeek();

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

     const challengeResult = await db.query(`SELECT * FROM challenge WHERE progress = $1 AND week_start = $2 ORDER BY challenge.id DESC LIMIT $3 OFFSET $4`, [100, startOfWeek, limit, offset]);

     const challenge = challengeResult.rows;

     const countQuery = "SELECT COUNT(*) FROM challenge";
     const countResult = await db.query(countQuery);
     const totalOrders = parseInt(countResult.rows[0].count);

         
     challenge.forEach(challenge => {
      challenge.total_transaction = numeral(challenge.total_transaction).format('0,0.00');
      challenge.week_end = moment(challenge.week_end).format("D MMM h:mmA");
  });


     res.render("admin/weeklychallenge", {challenge,
      currentPage: page, 
      totalPages: Math.ceil(totalOrders / limit),
     })
  } catch (error) {
    
  }
})



export default router;