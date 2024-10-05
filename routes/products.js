import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import moment from "moment";
import numeral from "numeral";
import timeSince from "../controller/timeSince.js";

router.get("/products", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;
  try {
    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const result = await db.query("SELECT * FROM userprofile WHERE id = $1", [
      userId,
    ]);
    const details = result.rows[0];

    const userResult = await db.query(
      `
          SELECT * FROM product_list
          WHERE user_id = $1
          ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const userDetails = userResult.rows;

    userDetails.forEach((userDetails) => {
      userDetails.formattedDate = moment(userDetails.created_at).format("D MMM h:mmA");
      userDetails.amount1 = numeral(userDetails.amount).format("0,0.00");
      userDetails.payment_received = numeral(userDetails.payment_recieved).format("0,0.00");
    });

    details.business_balance = numeral(details.business_balance).format("0,0.00")

    const countQuery = "SELECT COUNT(*) FROM product_list";
    const countResult = await db.query(countQuery);
    const totalTransactions = parseInt(countResult.rows[0].count);

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;
  
    res.render("products", {
      userDetails,
      user : details,
      currentPage: page,
      totalPages: Math.ceil(totalTransactions / limit),
      notifications, timeSince
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
