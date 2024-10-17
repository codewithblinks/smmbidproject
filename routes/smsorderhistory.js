import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import moment from "moment";


  router.get('/smsorderhistory', ensureAuthenticated, userRole, async (req, res) => {
    const userId = req.user.id; 
    try {
      const users = await db.query("SELECT * FROM userprofile WHERE id = $1", [userId]);
      const user = users.rows[0];

      const limit = 20;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;

        const orderResult = await db.query("SELECT * FROM sms_order WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3", [userId, limit, offset]);
        const order = orderResult.rows

        const notificationsResult = await db.query(
          'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
          [userId, false]
      );
    
      const notifications = notificationsResult.rows;


      const countQuery = "SELECT COUNT(*) FROM sms_order";
      const countResult = await db.query(countQuery);
      const totalSms = parseInt(countResult.rows[0].count);

      order.forEach(order => {
        order.timestamp = moment(order.timestamp).format('D MMM h:mmA');
    });

        res.render('smsorderhistory', {
          order, user, 
          notifications, timeSince,
          currentPage: page,
          totalPages: Math.ceil(totalSms / limit),
        });
    } catch (error) {
      console.log(error);
    }
  });
  
 

export default router;