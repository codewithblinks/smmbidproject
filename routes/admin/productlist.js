import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"


router.get("/admin/product/list", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const userResult = await db.query(`
      SELECT
        product_list.*,
        userprofile.username, 
        userprofile.firstname, 
        userprofile.lastname
        FROM product_list JOIN
        userprofile ON product_list.user_id = userprofile.id
        WHERE status = 'pending'`);
    const userDetails = userResult.rows;

      res.render('admin/pendingaprrovalproducts', { messages: req.flash(), user: userDetails });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/products/approve/:id', adminEnsureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("UPDATE product_list SET status = 'approved' WHERE id = $1", [id]);
        res.redirect('/admin/product/list');
    } catch (err) {
        console.err(err);
        console.log(err);
        res.status(500).send("Server Error");
    }
});

router.post('/admin/products/reject/:id', adminEnsureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("UPDATE product_list SET status = 'rejected' WHERE id = $1", [id]);
        req.flash("success", "Product rejected successfully")
        res.redirect('/admin/product/list');
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});


export default router;