import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import { Strategy } from "passport-local";
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js";
import numeral from "numeral";

// Helper function to get totals based on week
async function getWeeklyTotals() {
  const query = `
    SELECT 
        type,
        EXTRACT(WEEK FROM created_at) AS week,
        SUM(amount) AS total_amount
    FROM 
        transactions
    WHERE 
        status = 'success'
        AND EXTRACT(WEEK FROM created_at) = EXTRACT(WEEK FROM CURRENT_DATE)
    GROUP BY 
        type, week;
  `;

  try {
    const result = await db.query(query);
    return result.rows;
  } catch (err) {
    console.error('Error executing query', err.stack);
    throw err;
  }
}

// Helper function to get totals based on period
async function getTotalsByPeriodAndType(period, type) {
  let query;

  switch (period) {
    case 'today':
      query = `
        SELECT 
            SUM(amount) AS total_amount
        FROM 
            transactions
        WHERE 
            status = 'success'
            AND type = $1
            AND DATE(created_at) = CURRENT_DATE;
      `;
      break;

    case 'week':
      query = `
        SELECT 
            SUM(amount) AS total_amount
        FROM 
            transactions
        WHERE 
            status = 'success'
            AND type = $1
            AND EXTRACT(WEEK FROM created_at) = EXTRACT(WEEK FROM CURRENT_DATE);
      `;
      break;

    case 'month':
      query = `
        SELECT 
            SUM(amount) AS total_amount
        FROM 
            transactions
        WHERE 
            status = 'success'
            AND type = $1
            AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE);
      `;
      break;

    default:
      throw new Error('Invalid period');
  }

  const result = await db.query(query, [type]);
  return result.rows[0]?.total_amount || 0; // return 0 if no result found
}

async function getTotalAdminSoldAndProfit(period) {
  let query;

  switch (period) {
    case 'today':
      query = `
        SELECT 
            COUNT(*) AS total_products_sold,
            SUM(amount) AS total_sold_amount
        FROM 
            admin_products
        WHERE 
            payment_status = 'sold'
            AND DATE(sold_at) = CURRENT_DATE;
      `;
      break;

    case 'week':
      query = `
        SELECT 
            COUNT(*) AS total_products_sold,
            SUM(amount) AS total_sold_amount
        FROM 
            admin_products
        WHERE 
            payment_status = 'sold'
            AND EXTRACT(WEEK FROM sold_at) = EXTRACT(WEEK FROM CURRENT_DATE);
      `;
      break;

    case 'month':
      query = `
        SELECT 
            COUNT(*) AS total_products_sold,
            SUM(amount) AS total_sold_amount
        FROM 
            admin_products
        WHERE 
            payment_status = 'sold'
            AND EXTRACT(MONTH FROM sold_at) = EXTRACT(MONTH FROM CURRENT_DATE);
      `;
      break;

    default:
      throw new Error('Invalid period');
  }

  const result = await db.query(query);
  const totalAdminProductsSold = result.rows[0]?.total_products_sold || 0;
  const totalAdminSoldAmount = result.rows[0]?.total_sold_amount || 0;

  return { totalAdminProductsSold, totalAdminSoldAmount };
}

async function getTotalSmmProfit(period) {
  let query;

  switch (period) {
    case 'today':
      query = `
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'Completed' THEN charge ELSE 0 END), 0) AS total_completed,
            COALESCE(SUM(CASE WHEN status = 'Refunded' THEN (charge - refund_amount) ELSE 0 END), 0) AS total_not_refunded
        FROM 
            purchase_history
        WHERE
            DATE(order_date) = CURRENT_DATE;
      `;
      break;

    case 'week':
      query = `
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'Completed' THEN charge ELSE 0 END), 0) AS total_completed,
            COALESCE(SUM(CASE WHEN status = 'Refunded' THEN (charge - refund_amount) ELSE 0 END), 0) AS total_not_refunded
        FROM 
            purchase_history
        WHERE 
            EXTRACT(WEEK FROM order_date) = EXTRACT(WEEK FROM CURRENT_DATE);
      `;
      break;

    case 'month':
      query = `
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'Completed' THEN charge ELSE 0 END), 0) AS total_completed,
            COALESCE(SUM(CASE WHEN status = 'Refunded' THEN (charge - refund_amount) ELSE 0 END), 0) AS total_not_refunded
        FROM 
            purchase_history
        WHERE 
            EXTRACT(MONTH FROM order_date) = EXTRACT(MONTH FROM CURRENT_DATE);
      `;
      break;

    default:
      throw new Error('Invalid period');
  }

  const result = await db.query(query);
  const totalComplete = result.rows[0]?.total_completed || 0;
  const totalRefundAmount = result.rows[0]?.total_not_refunded || 0; 

  return { totalComplete, totalRefundAmount };
}

async function getTotalSmsProfit(period) {
  let query;

  switch (period) {
    case 'today':
      query = `
        SELECT 
            SUM(amount) AS total_successful_sms_purchases
        FROM 
            sms_order
        WHERE 
            status = 'complete'
            AND DATE(timestamp) = CURRENT_DATE;
      `;
      break;

    case 'week':
      query = `
        SELECT 
           SUM(amount) AS total_successful_sms_purchases
        FROM 
            sms_order
        WHERE 
            status = 'complete'
            AND EXTRACT(WEEK FROM timestamp) = EXTRACT(WEEK FROM CURRENT_DATE);
      `;
      break;

    case 'month':
      query = `
        SELECT 
           SUM(amount) AS total_successful_sms_purchases
        FROM 
            sms_order
        WHERE 
            status = 'complete'
            AND EXTRACT(MONTH FROM timestamp) = EXTRACT(MONTH FROM CURRENT_DATE);
      `;
      break;

    default:
      throw new Error('Invalid period');
  }

  const result = await db.query(query);
  const totalSmsComplete = result.rows[0]?.total_successful_sms_purchases || 0;

  return { totalSmsComplete };
}

router.get("/admin/dashboard", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const totalsThisWeek = await getWeeklyTotals();

    const userResult = await db.query('SELECT * FROM admins WHERE id = $1', [userId]);
    const userDetails = userResult.rows[0];

    const result = await db.query(`
      SELECT
           COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS total_deposit,
           COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END), 0) AS total_withdrawal
      FROM
          transactions
      WHERE
          status = $1;
  `, ['success']);

  const totals = result.rows[0];

  const smmPanelResult = await db.query(`
     SELECT
                COALESCE(SUM(CASE WHEN status = 'Completed' THEN charge ELSE 0 END), 0) AS total_completed,
                COALESCE(SUM(CASE WHEN status = 'Refunded' THEN (charge - refund_amount) ELSE 0 END), 0) AS total_not_refunded
            FROM purchase_history;
`);

const totalSmmAmount = smmPanelResult.rows[0];

const smsResult = await db.query(`
  SELECT SUM(amount) AS total_successful_sms_purchases
  FROM sms_order
  WHERE status = 'complete';
`);

const totalSmsAmount = smsResult.rows[0];

const totalCompleted = Number(totalSmmAmount.total_completed) || 0; 
const totalNotRefunded = Number(totalSmmAmount.total_not_refunded) || 0;

let totalSmmAmount1 = totalCompleted + totalNotRefunded;

  totals.total_deposit = numeral(totals.total_deposit).format('0,0.00');
  totals.total_withdrawal = numeral(totals.total_withdrawal).format('0,0.00');
  totalSmmAmount1 = numeral(totalSmmAmount1).format('0,0.00');
  totalSmsAmount.total_successful_sms_purchases = numeral(totalSmsAmount.total_successful_sms_purchases).format('0,0.00');

  const weekTotalDeposit = totalsThisWeek.find(row => row.type === 'deposit')?.total_amount || 0;
  const weekTotalWithdawal = totalsThisWeek.find(row => row.type === 'withdrawal')?.total_amount || 0;

  const totalAdminSold = await db.query("SELECT * FROM admin_products WHERE payment_status = 'sold'");
  const adminSold = totalAdminSold.rows;

const resultAdminSold = await db.query(`
  SELECT
       SUM(amount) AS total_admin_sold
  FROM
      admin_products
  WHERE
      payment_status = $1;
`, ['sold']);;

const totalAdminSoldp2p = numeral(resultAdminSold.rows[0]?.total_admin_sold || 0).format('0,0.00'); 

      res.render('adminDashboard', { 
        messages: req.flash(), 
        user: userDetails,
        totalDeposit: totals.total_deposit,
        totalWithdrawal: totals.total_withdrawal,
        weekTotalDeposit,
        weekTotalWithdawal, totalSmmAmount1, 
        totalSmsAmount, adminSold, totalAdminSoldp2p
       });
    
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/totals/deposits/:period', async (req, res) => {
  const period = req.params.period;

  try {
    const totalDeposits = await getTotalsByPeriodAndType(period, 'deposit');

    const totalDeposit1 = numeral(totalDeposits).format('0,0.00');

    res.json({ totalDeposits: totalDeposit1 });
  } catch (err) {
    console.error('Error fetching deposit totals', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route to get withdrawal totals by period
router.get('/totals/withdrawals/:period', async (req, res) => {
  const period = req.params.period;

  try {
    const totalWithdrawals = await getTotalsByPeriodAndType(period, 'withdrawal');

    const totalWithdrawal1 = numeral(totalWithdrawals).format('0,0.00');

    res.json({ totalWithdrawals: totalWithdrawal1 });
  } catch (err) {
    console.error('Error fetching withdrawal totals', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/totals/admin/sold/:period', async (req, res) => {
  const period = req.params.period;

  try {
    const { totalAdminProductsSold, totalAdminSoldAmount } = await getTotalAdminSoldAndProfit(period);

    const totalAdminSoldAmount1 = numeral(totalAdminSoldAmount).format('0,0.00');

    res.json({ totalAdminProductsSold, totalAdminSoldAmount1 });
  } catch (err) {
    console.error('Error fetching total sold amount and profit', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/totals/smmpanel/:period', async (req, res) => {
  const period = req.params.period;

  try {
    const { totalComplete, totalRefundAmount} = await getTotalSmmProfit(period);

    const total_completed = numeral(totalComplete).format('0,0.00');
    const total_not_refunded = numeral(totalRefundAmount).format('0,0.00');

    const totalSmm = totalComplete + total_not_refunded;

    res.json({ totalSmm });
  } catch (err) {
    console.error('Error fetching total sold amount and profit', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/totals/sms/:period', async (req, res) => {
  const period = req.params.period;

  try {
    const { totalSmsComplete } = await getTotalSmsProfit(period);

    const total_sms_completed = numeral(totalSmsComplete).format('0,0.00');

    res.json({ total_sms_completed });
  } catch (err) {
    console.error('Error fetching total sold amount and profit', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


export default router;