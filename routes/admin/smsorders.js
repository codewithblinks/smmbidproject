import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";


router.get("/admin/smsorders", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

        const smsOrders = await db.query("SELECT * FROM sms_order ORDER BY timestamp DESC LIMIT $1 OFFSET $2", [limit, offset])
        const smsOrder = smsOrders.rows;

        smsOrder.forEach(smsOrder => {
          smsOrder.timestamp = moment(smsOrder.timestamp).format('D MMM h:mmA');
          smsOrder.cost = numeral(smsOrder.cost).format("0,0.00");
          smsOrder.amount = numeral(smsOrder.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM sms_order";
        const countResult = await db.query(countQuery);
        const totalOrders = parseInt(countResult.rows[0].count);

        res.render("admin/smsOrders", {smsOrder, 
          currentPage: page, 
          totalPages: Math.ceil(totalOrders / limit), user
        })
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});





export default router;