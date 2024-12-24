import express from "express";
import db from "../../db/index.js"
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js";
import numeral from "numeral";
import timeSince from "../../controller/timeSince.js";

const router = express.Router();

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
  return result.rows[0]?.total_amount || 0;
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
            SUM(amount) AS total_successful_sms_purchases,
            COUNT(*) AS total_sms_sold
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
           SUM(amount) AS total_successful_sms_purchases,
           COUNT(*) AS total_sms_sold
        FROM 
            sms_order
        WHERE 
            status = 'complete'
            AND EXTRACT(WEEK FROM timestamp) = EXTRACT(WEEK FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM timestamp) = EXTRACT(YEAR FROM CURRENT_DATE);
      `;
      break;

    case 'month':
      query = `
        SELECT 
           SUM(amount) AS total_successful_sms_purchases,
           COUNT(*) AS total_sms_sold
        FROM 
            sms_order
        WHERE 
            status = 'complete'
            AND EXTRACT(MONTH FROM timestamp) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM timestamp) = EXTRACT(YEAR FROM CURRENT_DATE);
      `;
      break;

    default:
      throw new Error('Invalid period');
  }

  const result = await db.query(query);
  const totalSmsComplete = result.rows[0]?.total_successful_sms_purchases || 0;
  const totalSmsSold = result.rows[0]?.total_sms_sold || 0;

  return { totalSmsComplete, totalSmsSold };
}

async function getRecentSold() {
  const query = `
    SELECT 
        pap.*, 
        ad.id AS admin_product_id, 
        ad.account_category,
        ad.amount,
        up.username
    FROM 
        purchases_admin_product pap
    JOIN 
        admin_products ad ON pap.product_id = ad.id
    JOIN 
        userprofile up ON pap.buyer_id = up.id
    WHERE 
        pap.status = 'confirmed' 
        AND ad.payment_status = 'sold'
        ORDER BY 
        pap.date_purchased DESC;
  `;

  try {
    const result = await db.query(query);
    const rows = result.rows.map(row => {
      row.username = row.username.length > 3 ? `...${row.username.slice(-3)}` : row.username;

      const maxCategoryLength = 15;
      row.account_category = row.account_category.length > maxCategoryLength 
        ? `${row.account_category.slice(0, maxCategoryLength)}...` 
        : row.account_category;

      return row;
    });
    return rows;
  } catch (err) {
    console.error('Error executing query', err.stack);
    throw err;
  }
}


router.get("/admin/dashboard", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const totalsThisWeek = await getWeeklyTotals();

    const RecentSold = await getRecentSold();

    const userResult = await db.query('SELECT * FROM admins WHERE id = $1', [userId]);
    const userDetails = userResult.rows[0];

    const result = await db.query(`
      SELECT
           COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS total_deposit
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
  SELECT SUM(amount) AS total_successful_sms_purchases,
  COUNT(*) AS total_sms_sold
  FROM sms_order
  WHERE status = 'complete';
`);

const totalSmsAmount = smsResult.rows[0];

const totalCompleted = Number(totalSmmAmount.total_completed) || 0; 
const totalNotRefunded = Number(totalSmmAmount.total_not_refunded) || 0;

let totalSmmAmount1 = totalCompleted + totalNotRefunded;

  totals.total_deposit = numeral(totals.total_deposit).format('0,0.00');
  totalSmmAmount1 = numeral(totalSmmAmount1).format('0,0.00');
  totalSmsAmount.total_successful_sms_purchases = numeral(totalSmsAmount.total_successful_sms_purchases).format('0,0.00');

  const weekTotalDeposit = totalsThisWeek.find(row => row.type === 'deposit')?.total_amount || 0;

  const totalAdminSold = await db.query("SELECT * FROM admin_products WHERE payment_status = 'sold'");
  const adminSold = totalAdminSold.rows;

  const avalableStocks = await db.query("SELECT * FROM admin_products WHERE payment_status = 'not sold'");
  const stock = avalableStocks.rows;

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
        weekTotalDeposit, totalSmmAmount1, 
        totalSmsAmount, adminSold, totalAdminSoldp2p, stock, RecentSold, timeSince
       });
    
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/totals/deposits/:period', adminEnsureAuthenticated, adminRole, async (req, res) => {
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

router.get('/totals/admin/sold/:period', adminEnsureAuthenticated, adminRole, async (req, res) => {
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

router.get('/totals/smmpanel/:period', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const period = req.params.period;

  try {
    const { totalComplete, totalRefundAmount} = await getTotalSmmProfit(period);

    let totalSmm1 =  totalComplete + totalRefundAmount;

    const totalSmm = numeral(totalSmm1).format('0,0.00');

    res.json({ totalSmm });
  } catch (err) {
    console.error('Error fetching total sold amount and profit', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/totals/sms/:period', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const period = req.params.period;

  try {
    const { totalSmsComplete, totalSmsSold } = await getTotalSmsProfit(period);

    const total_sms_completed = numeral(totalSmsComplete).format('0,0.00');
    console.log(totalSmsSold)

    res.json({ total_sms_completed, totalSmsSold });
  } catch (err) {
    console.error('Error fetching total sold amount and profit', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


export default router;