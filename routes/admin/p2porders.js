import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import moment from "moment";
import numeral from "numeral";

router.get("/admin/product/active/accounts", adminEnsureAuthenticated, adminRole, 
    async (req, res) => {
        try {

            const limit = 15;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;

            
            const activeOrderResult = await db.query(`
                SELECT 
                product_list.*,
                userprofile.firstname,
                userprofile.lastname
                FROM product_list JOIN
                userprofile ON 
                product_list.user_id = userprofile.id
                WHERE status = $1 AND 
                payment_status = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
            ['approved', 'not sold', limit, offset]);
            const activeOrder = activeOrderResult.rows;

            const countQuery = "SELECT COUNT(*) FROM product_list";
            const countResult = await db.query(countQuery);
            const totalOrders = parseInt(countResult.rows[0].count);

            res.render("admin/allactiveaccounts", {activeOrder, messages: req.flash(),
                currentPage: page, 
                totalPages: Math.ceil(totalOrders / limit)
            })
        } catch (error) {
            console.log(error)
        }
})

router.post("/product/delete/active/account", adminEnsureAuthenticated, adminRole, 
    async (req, res) => {
        const productId = req.body.productId
        try {
             await db.query(`
                UPDATE product_list SET status = 'deleted'
                WHERE id = $1
                `, [productId])
            req.flash("success", "Product has been deleted");
            res.redirect("/admin/product/active/accounts");
        } catch (error) {
            console.log(error)
        }
})

router.get("/admin/product/sold/accounts",
    adminEnsureAuthenticated, adminRole,
    async(req, res) => {
        try {
            const limit = 15;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;

            const soldProducts = await db.query(`
                SELECT 
                product_list.*,
                userprofile.firstname,
                userprofile.lastname
                FROM product_list JOIN
                userprofile ON
                product_list.user_id = userprofile.id
                WHERE status = 'approved' AND payment_status = 'sold'
                ORDER BY product_list.created_at DESC LIMIT $1 OFFSET $2
                `, [limit, offset]);

                const products = soldProducts.rows;

                products.forEach((products) => {
                    products.amount = numeral(products.amount).format("0,0.00");
                    products.payment_recieved = numeral(products.payment_recieved).format("0,0.00");
                  });
            

                const countQuery = "SELECT COUNT(*) FROM purchase_history";
                const countResult = await db.query(countQuery);
                const totalOrders = parseInt(countResult.rows[0].count);

            res.render("admin/soldproducts", {products,
                currentPage: page, 
                totalPages: Math.ceil(totalOrders / limit)
            })
        } catch (error) {
            console.log(error)
        }
    }
)

router.get("/admin/product/awaiting", adminEnsureAuthenticated, adminRole,
    async(req, res) =>{
        try {
            const awaitingResult = await db.query(`
SELECT 
    purchases.product_id,
    purchases.buyer_id,
    purchases.seller_id,
    purchases.id AS purchases_id,
    purchases.date AS purchases_date,
    buyer.firstname AS buyerfirst_name,
	buyer.lastname AS buyerlast_name,
    seller.firstname AS sellerfirst_name,
    seller.lastname AS sellerlast_name,
    product_list.* -- Assuming you want all product details as well
FROM 
    purchases
JOIN 
    userprofile AS buyer ON purchases.buyer_id = buyer.id
JOIN 
    userprofile AS seller ON purchases.seller_id = seller.id
JOIN 
    product_list ON purchases.product_id = product_list.id
WHERE 
    purchases.status = 'pending'
AND 
    product_list.payment_status = 'awaiting' ORDER BY purchases.date DESC

                `)

                const awaiting = awaitingResult.rows;

                awaiting.forEach((awaiting) => {
                    awaiting.purchases_date = moment(awaiting.purchases_date).format("D MMM h:mmA");
                  });

            res.render("admin/allAwaitingProducts", {awaiting})
        } catch (error) {
            console.log(error)
        }
    }
)

router.post( "/admin/product/complete/order/:id", adminEnsureAuthenticated, adminRole, async (req, res) => {
    const { id } = req.params;
    const purchaseId1 = req.body.purchaseId;
    const productId = Number(id)
    const purchaseId = Number(purchaseId1)

    try {
      const productResult = await db.query(
        "SELECT * FROM product_list WHERE id = $1",
        [productId]
      );
      const product = productResult.rows[0];

      const amount = Number(product.payment_recieved);

      const statusResult = await db.query(
        "SELECT * FROM purchases WHERE id = $1",
        [purchaseId]
      );
      const status = statusResult.rows[0];
      
      if (status.status === "pending") {
        await db.query(
          "UPDATE userprofile SET business_balance = business_balance + $1 WHERE id = $2",
          [amount, product.user_id]
        );

        await db.query("UPDATE purchases SET status = $1 WHERE id = $2", [
          "confirmed",
          purchaseId,
        ]);

        await db.query(
          "UPDATE product_list SET payment_status = 'sold', sold_at = NOW() WHERE id = $1",
          [productId]
        );

        res.redirect("/admin/product/awaiting");
      } 
    } catch (err) {
      console.error(err);
      console.log(err);
      res.send("Error updating product");
    }
  }
);

export default router;