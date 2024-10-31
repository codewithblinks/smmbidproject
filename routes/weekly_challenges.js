import express from "express";
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import moment from "moment";
import timeSince from "../controller/timeSince.js";
import cron from "node-cron";
import numeral from "numeral";
const router = express.Router();


function getCurrentWeek() {
  const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
  const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
  return { startOfWeek, endOfWeek };
}

async function calculateUserProgress(userId) {
  const { startOfWeek, endOfWeek } = getCurrentWeek();

  // SQL query for calculating total successful transactions
  const query = `
    WITH successful_transactions AS (
        SELECT user_id, amount, timestamp AS date
        FROM sms_order
        WHERE status = 'complete' AND user_id = $1

        UNION ALL

        SELECT purchases_admin_product.buyer_id AS user_id, admin_products.amount AS amount, purchases_admin_product.date_purchased AS date
        FROM purchases_admin_product
        JOIN admin_products ON purchases_admin_product.product_id = admin_products.id
        WHERE purchases_admin_product.status = 'confirmed' 
        AND purchases_admin_product.buyer_id = $1
        AND admin_products.payment_status = 'sold'

        UNION ALL

        SELECT user_id, purchase_history.charge AS amount, order_date AS date
        FROM purchase_history
        WHERE status = 'Completed'
    )
    SELECT COALESCE(SUM(amount), 0) AS total_transactions
    FROM successful_transactions
    WHERE user_id = $1 AND date BETWEEN $2 AND $3
  `;

  try {
    // Execute the query and pass the userId, startOfWeek, and endOfWeek as parameters
    const result = await db.query(query, [userId, startOfWeek, endOfWeek]);

    // Total successful transactions in the current week
    const totalSuccessfulTransaction = result.rows[0].total_transactions;

    // Calculate progress (up to a max of 100%)
    const progress = Math.min((totalSuccessfulTransaction / 20000) * 100, 100);

    // Update or insert challenge progress into the database
    await db.query(`
      INSERT INTO challenge (user_id, week_start, week_end, progress, total_transaction)
      VALUES ($1, $2::date, $3::date, $4, $5)
      ON CONFLICT (user_id, week_start) DO UPDATE
      SET progress = EXCLUDED.progress, total_transaction = EXCLUDED.total_transaction;
    `, [userId, startOfWeek, endOfWeek, progress, totalSuccessfulTransaction]);

    return { totalSuccessfulTransaction, progress };
    
  } catch (error) {
    console.log(error);
    console.error('Error calculating user progress:', error);
  }
}

router.get('/weekly-progress', ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
try {
    const { totalSuccessfulTransaction, progress } = await calculateUserProgress(userId);
    const formattedTransaction = numeral(totalSuccessfulTransaction).format('0,0.00');
    res.json({
        totalSuccessfulTransaction: formattedTransaction,
        progress
       });
} catch (error) {
  console.log(error);
}

});

async function resetChallenges() {
  const { startOfWeek } = getCurrentWeek();

  try {
     await db.query(`
    UPDATE challenge
    SET progress = 0, total_transaction = 0, challenge_complete = FALSE
    WHERE week_start < $1 AND challenge_complete = FALSE;
  `, [startOfWeek]);
  } catch (error) {
    console.log(error);
    console.error('Error fetching completed challenges:', error.message);
  }
}

async function awardPrizes() {
  const { startOfWeek, endOfWeek } = getCurrentWeek();

  try {
    const completedChallenges = await db.query(`
      SELECT user_id, total_transaction 
      FROM challenge 
      WHERE week_start = $1 AND progress = 100 AND challenge_complete = FALSE;
    `, [startOfWeek]);
  
    // Loop through each user and award them the prize
    for (const row of completedChallenges.rows) {
      const userId = row.user_id;
      const totalTransaction = row.total_transaction;
      const prize = totalTransaction * 0.1; // 20% of total transactions
  
      // Update the user's balance
      await db.query(`
        UPDATE userprofile 
        SET balance = balance + $1
        WHERE id = $2;
      `, [prize, userId]);
  
      // Mark the challenge as complete and award the prize
      await db.query(`
        UPDATE challenge 
        SET challenge_complete = TRUE
        WHERE user_id = $1 AND week_start = $2;
      `, [userId, startOfWeek]);
  
      await db.query(
        `INSERT INTO activity_log 
        (user_id, activity)
        VALUES
        ($1, $2)`,
        [userId, `You won this week Transaction Challenge and ${prize} credited into your Total Balance`]
    );
  
      console.log(`Awarded ${prize} Naira to user ${userId}.`);
    }
  
    console.log('Prizes awarded to all users who completed the challenge.');
  } catch (error) {
    console.log(error)
    console.error('Error fetching completed challenges:', error.message);
  }
}

// Reset Challenges every Monday at 12:00 AM
cron.schedule('0 0 * * MON', () => {
  console.log('Resetting challenges for the new week...');
  resetChallenges();
});

// Award Prizes every Sunday at 11:59 PM
cron.schedule('59 23 * * SUN', () => {
  console.log('Awarding prizes to users who completed the challenge...');
  awardPrizes();
});


export default router;