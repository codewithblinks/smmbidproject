import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";
import timeSince from "../../controller/timeSince.js";

function getCurrentWeek() {
  const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
  const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
  return { startOfWeek, endOfWeek };
}

const getDaysSinceRegistration = (registrationDate) => {
  const registrationMoment = moment(registrationDate);
  const now = moment();
  const diffDays = now.diff(registrationMoment, 'days');
  return diffDays;
};


router.get("/admin/users/list", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const userResult = await db.query(`
      SELECT * FROM userprofile 
      WHERE is_suspended = $1 
      AND email_verified = $2 
      ORDER BY id DESC LIMIT $3 OFFSET $4`
      , 
      [false, true, limit, offset]);
    const userDetails = userResult.rows;

    const TotalUsersResult = await db.query(`
      SELECT * FROM userprofile 
      WHERE is_suspended = $1 
      AND email_verified = $2`
      , 
      [false, true]);
    const TotalUsers = TotalUsersResult.rows;

    userDetails.forEach(userDetails => {
      userDetails.balance = numeral(userDetails.balance).format('0,0.00');
  });

  const countQuery = "SELECT COUNT(*) FROM userprofile WHERE is_suspended = $1 AND email_verified = $2";
  const countResult = await db.query(countQuery, [false, true]);
  const totalOrders = parseInt(countResult.rows[0].count);

      res.render('admin/users', { 
        messages: req.flash(), user, userDetails,
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit), TotalUsers
      });
  
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/users/list/suspend", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const suspendUserResult = await db.query(`
      SELECT * FROM userprofile 
      WHERE is_suspended = $1 
      AND email_verified = $2 
      ORDER BY id DESC LIMIT $3 OFFSET $4`, 
      [true, true, limit, offset]);
    const suspendUser = suspendUserResult.rows;

    suspendUser.forEach(suspendUser => {
      suspendUser.balance = numeral(suspendUser.balance).format('0,0.00');
  });

  const countQuery = "SELECT COUNT(*) FROM userprofile WHERE is_suspended = $1 AND email_verified = $2";
  const countResult = await db.query(countQuery, [true, true]);
  const totalOrders = parseInt(countResult.rows[0].count);

      res.render('admin/suspendedUsers', { 
        messages: req.flash(), user, suspendUser, 
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit)
       });
  
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/users/list/unverified", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const suspendUserResult = await db.query("SELECT * FROM userprofile WHERE email_verified = $1 ORDER BY id DESC LIMIT $2 OFFSET $3", [false, limit, offset]);
    const suspendUser = suspendUserResult.rows;

    suspendUser.forEach(suspendUser => {
      suspendUser.balance = numeral(suspendUser.balance).format('0,0.00');
  });

  const countQuery = "SELECT COUNT(*) FROM userprofile WHERE email_verified = $1";
  const countResult = await db.query(countQuery, [false]);
  const totalOrders = parseInt(countResult.rows[0].count);

      res.render('admin/unverifiedUsers', { 
        messages: req.flash(), user, suspendUser,
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit)
       });
  
  } catch (error) {
    console.log(error);
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/admin/users/user/:userId/personal', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const {userId} = req.params;
  const adminId = req.user.id;
  
  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const admin = adminResult.rows[0];
    
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

    const countQuery = "SELECT COUNT(*) FROM transactions WHERE user_id = $1";
    const countResult = await db.query(countQuery, [userId]);
    const totalOrders = parseInt(countResult.rows[0].count);

    const smsQuery = "SELECT COUNT(*) FROM sms_order WHERE user_id = $1";
    const smsResultQuery = await db.query(smsQuery, [userId]);
    const smsOrders = parseInt(smsResultQuery.rows[0].count);

    const smmQuery = "SELECT COUNT(*) FROM purchase_history WHERE user_id = $1";
    const smmResultQuery = await db.query(smmQuery, [userId]);
    const smmOrders = parseInt(smmResultQuery.rows[0].count);
  

      res.render("admin/userPersonalProfile", {
        user, transactions, admin,
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit),
        sms, smm,
        smstotalPages: Math.ceil(smsOrders / limit),
        smmtotalPages: Math.ceil(smmOrders / limit),
        referralBalance
      })
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

router.get("/admin/review/profile/:id", adminEnsureAuthenticated, adminRole, async(req, res) => {
  const userId = req.user.id;
  const id = req.params.id

  try {
    const usersResult = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
    const user = usersResult.rows[0]

    const productResult = await db.query("SELECT payment_status FROM product_list WHERE user_id = $1 AND payment_status = $2", [id, 'sold'])
    const soldProductCount = productResult.rows;

       const badReviewResult = await db.query("SELECT * FROM ratings_reviews WHERE user_id = $1 AND rating IN (1, 3)", [id])
       const badReview = badReviewResult.rows

       const goodReviewResult = await db.query("SELECT * FROM ratings_reviews WHERE user_id = $1 AND rating IN (4, 5)", [id])
       const goodReview = goodReviewResult.rows

       const userResult = await db.query("SELECT created_at FROM userprofile WHERE id = $1", [id])
       const registrationDate = userResult.rows[0].created_at

       const daysSinceRegistration = getDaysSinceRegistration(registrationDate);

       goodReview.forEach(review => {
        review.formattedDate = moment(review.created_at).format('D MMM h:mmA');
    });

    badReview.forEach(review => {
      review.badReviewformattedDate = moment(review.created_at).format('D MMM h:mmA');
  });

    const othersResult = await db.query("SELECT email_verified, firstname, lastname FROM userprofile WHERE id = $1", [id])
    const other = othersResult.rows[0]

    res.render('admin/reviewProfile', {
      daysSinceRegistration, 
      soldProductCount, other, user,
      timeSince,
      badReview, goodReview
    })
  } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});



export default router;