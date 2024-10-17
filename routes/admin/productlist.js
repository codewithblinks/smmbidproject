import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"


router.get("/admin/product/list", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
    const user = adminResult.rows[0];

                const limit = 15;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;
    
    const userResult = await db.query(`
      SELECT
        product_list.*,
        userprofile.username, 
        userprofile.firstname, 
        userprofile.lastname
        FROM product_list JOIN
        userprofile ON product_list.user_id = userprofile.id
        WHERE status = 'pending'
        ORDER BY product_list.id DESC LIMIT $1 OFFSET $2
        `, [limit, offset]);
    const userDetails = userResult.rows;

    const countQuery = "SELECT COUNT(*) FROM product_list WHERE product_list.status = 'pending'";
    const countResult = await db.query(countQuery);
    const totalOrders = parseInt(countResult.rows[0].count);

      res.render('admin/pendingaprrovalproducts', { 
        messages: req.flash(), user, userDetails,
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit)
       });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/products/approve/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("UPDATE product_list SET status = 'approved' WHERE id = $1", [id]);
        res.redirect('/admin/product/list');
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/admin/products/reject/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("UPDATE product_list SET status = 'rejected' WHERE id = $1", [id]);
        req.flash("success", "Product rejected successfully")
        res.redirect('/admin/product/list');
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Internal server error' });
    }
});


export default router;