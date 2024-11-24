import express from "express";
import db from "../../db/index.js";
import ensureAuthenticated, {userRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";
import timeSince from "../../controller/timeSince.js";
import getExchangeRate from "../../controller/exchangeRateService.js";
import { calculateUserTotalDeposit } from "../../middlewares/totalUserSpent.js";
import { convertPriceForProducts } from "../../middlewares/convertUserProductPrice.js";

const router = express.Router();

async function convertPrice(rate, userCurrency, userBalance) {
  if (userCurrency === 'USD') {
      return userBalance / rate;
    } else if (userCurrency === 'NGN') {
      return userBalance;
    }
  return userBalance;
}

export async function convertedTotalDeposit(rate, totalDeposit, userCurrency, userTotalSpent) {
  if (userCurrency === 'USD') {
    return {
      convertedDeposit: totalDeposit / rate,
      convertedSpent: userTotalSpent / rate
    };
  } else if (userCurrency === 'NGN') {
    return {
      convertedDeposit: totalDeposit,
      convertedSpent: userTotalSpent
    };
  }
  return {
    convertedDeposit: totalDeposit,
    convertedSpent: userTotalSpent
  };
}

router.get("/dashboard", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;

  try {

    const rate = await getExchangeRate();
    let userTotalSpent = await calculateUserTotalDeposit(userId);

    const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
    const userDetails = userResult.rows[0];

    const userBalance = Number(userDetails.balance);

    let convertedPrice = await convertPrice(rate.NGN, userDetails.currency, userBalance)

    const userRecentOrders = await db.query(`
      SELECT purchases_admin_product.status AS purchases_status, 
      purchases_admin_product.date_purchased AS p_date,
		  product_id, buyer_id, account_type,
		  admin_products.amount, admin_products.account_type
		  FROM purchases_admin_product
      JOIN admin_products
      ON purchases_admin_product.product_id = admin_products.id
      WHERE buyer_id = $1 ORDER BY purchases_admin_product.date_purchased DESC LIMIT 5`, [userId]);

    const recentOrders = userRecentOrders.rows;

    const transactionsResult = await db.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    const transaction = transactionsResult.rows;

    const productResult = await db.query(`
      SELECT * FROM admin_products 
      WHERE payment_status = $1 
      ORDER BY created_at DESC`, 
      ['not sold']);

    const product = productResult.rows;

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

  const activityResult = await db.query("SELECT * FROM activity_log WHERE user_id = $1 ORDER BY time DESC LIMIT 6", [userId])
  const activity = activityResult.rows;

    const getIconClass = (type) => {
      switch (type.toLowerCase()) {
        case 'facebook':
          return 'bi bi-facebook';
        case 'twitter':
          return 'bi bi-twitter';
        case 'snapchat':
          return 'bi bi-snapchat';
          case 'instagram':
            return 'bi bi-instagram';
            case 'tiktok':
            return 'bi bi-tiktok';
        default:
          return 'bi bi-question-circle';
      }
    };

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

   let products = await convertPriceForProducts(rate.NGN, product, userDetails.currency)

    transaction.forEach(transaction => {
      transaction.formattedDate = moment(transaction.created_at).format('D MMM h:mmA');
      transaction.amount = numeral(transaction.amount).format('0,0.00');
      products.convertedProductPrice = numeral(products.convertedProductPrice).format('0,0.00');
  });

    convertedPrice = numeral(convertedPrice).format('0,0.00');
    userDetails.balance = numeral(userDetails.balance).format('0,0.00');
    convertedDeposit = numeral(convertedDeposit).format('0,0.00');
    convertedSpent = numeral(convertedSpent).format('0,0.00');

      res.render('userDashboard', { messages: req.flash(),
         user: userDetails, convertedPrice, 
         getIconClass, userId, product: products, 
         transactions: transaction, totalDeposit: convertedDeposit, notifications, timeSince,
          activity, recentOrders, userTotalSpent: convertedSpent });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/delete/activity-log/:id', ensureAuthenticated, async (req, res) => {
  const activityId = req.params.id;
  const userId = req.user.id

  try {
    const result = await db.query('DELETE FROM activity_log WHERE id = $1 AND user_id = $2', [activityId, userId]);

    if (result.rowCount > 0) {
      res.status(200).json({ message: 'Activity log deleted successfully' });
    } else {
      res.status(404).json({ error: 'Activity log not found' });
    }
  } catch (error) {
    console.error('Error deleting activity log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;