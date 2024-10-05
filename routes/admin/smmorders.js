import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";


router.get("/admin/smmorders", adminEnsureAuthenticated, adminRole, async (req, res) => {

  try {

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;
    
        const smmOrders = await db.query("SELECT * FROM purchase_history ORDER BY order_date DESC LIMIT $1 OFFSET $2", [limit, offset])
        const smmOrder = smmOrders.rows;

        smmOrder.forEach(smmOrder => {
          smmOrder.order_date = moment(smmOrder.order_date).format('D MMM h:mmA');
          smmOrder.charge = numeral(smmOrder.charge).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM purchase_history";
        const countResult = await db.query(countQuery);
        const totalOrders = parseInt(countResult.rows[0].count);

        res.render("admin/smmOrders", {smmOrder, 
          currentPage: page, 
          totalPages: Math.ceil(totalOrders / limit),
        })
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});





export default router;