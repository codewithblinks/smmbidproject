import express from "express";
import db from "../../db/index.js";
import ensureAuthenticated, {userRole} from "../../authMiddleware/authMiddleware.js";
import numeral from "numeral";
import moment from "moment";
import timeSince from "../../controller/timeSince.js";

const router = express.Router();

router.get("/transactions", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;

  try {

    const usersResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = usersResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const transactionsResult = await db.query(
      "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    const transaction = transactionsResult.rows;

    transaction.forEach((transaction) => {
      transaction.formattedDate = moment(transaction.created_at).format(
        "D MMM h:mmA"
      );
      transaction.amount = numeral(transaction.amount).format("0,0.00");
    });

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

    const countQuery = "SELECT COUNT(*) FROM transactions";
    const countResult = await db.query(countQuery);
    const totalTransactions = parseInt(countResult.rows[0].count);

    res.render("transactions", {
      transaction,
      currentPage: page,
      totalPages: Math.ceil(totalTransactions / limit),
      user, notifications, timeSince
    });
  } catch (error) {
    console.log(error);
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

export default router;
