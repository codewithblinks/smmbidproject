import express from "express";
const router = express.Router();
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import numeral from "numeral";
import moment from "moment";
import timeSince from "../controller/timeSince.js";


  router.get("/orderhistory", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
  
    try {
      const limit = 15;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;

      const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
      const userDetails = userResult.rows[0];

      const orderHistory = await db.query('SELECT * FROM purchase_history WHERE user_id = $1 ORDER BY order_date DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
       const orders = orderHistory.rows;

      orders.forEach((order) => {
        order.formattedDate = moment(order.order_date).format(
          "D MMM h:mmA"
        );
        order.charge = numeral(order.charge).format("0,0.00");
      });

      const countQuery = "SELECT COUNT(*) FROM purchase_history";
      const countResult = await db.query(countQuery);
      const totalOrders = parseInt(countResult.rows[0].count);

      const notificationsResult = await db.query(
        'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
        [userId, false]
    );
  
    const notifications = notificationsResult.rows;
  
      res.render("orderHistory", {
        orders, userDetails, 
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit),
        notifications, timeSince
      })
    } catch (error) {
        console.log(error);;
        res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  export default router;