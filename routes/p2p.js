import express from "express";
const router = express.Router();
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import moment from "moment";
import timeSince from "../controller/timeSince.js";

router.get("/p2p", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const usersResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = usersResult.rows[0];

    const userResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const result = await db.query(
      `SELECT product_list.*, 
      userprofile.firstname, 
      userprofile.lastname, 
      userprofile.username
      FROM product_list 
      JOIN userprofile ON 
      product_list.user_id = userprofile.id
      WHERE product_list.user_id != $1 
      AND status != 'pending' 
      AND status != 'rejected'
      AND status != 'deleted'  
      AND payment_status != 'sold'
      AND payment_status != 'awaiting'
      ORDER BY 
      CASE 
      WHEN status LIKE '%instant%' THEN 1
      WHEN status LIKE '%manual%' THEN 2
      ELSE 3
      END,
      random();
  `,
      [userId]
    );

    const userDetails = userResult.rows[0];
    const products = result.rows;

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

    const getIconClass = (type) => {
      switch (type.toLowerCase()) {
        case "facebook":
          return "bi bi-facebook";
        case "twitter":
          return "bi bi-twitter";
        case "snapchat":
          return "bi bi-snapchat";
        case "instagram":
          return "bi bi-instagram";
        case "tiktok":
          return "bi bi-tiktok";
        default:
          return "bi bi-question-circle"; // Default icon if type is unknown
      }
    };

    res.render("p2pmarket", {
      products,
      userDetails,
      getIconClass,
      messages: req.flash(),
      user,
      notifications, timeSince
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/p2porderhistory", ensureAuthenticated, userRole, async (req, res) => {
  const buyer_id = req.user.id;

  try {

    const limit = 20;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

   const usersResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [buyer_id]);
   const user = usersResult.rows[0]

    const purchasesResult = await db.query(
      `
    SELECT 
    purchases.id AS purchase_id, 
    purchases.status AS purchase_status,
    purchases.date,
    purchases.owner,
    product_list.id AS product_id, 
    product_list.status AS product_status,
    product_list.account_type AS product_account_type, 
    product_list.amount AS product_amount,
    NULL AS admin_product_account_type,  -- No data from admin_products for these rows
    NULL AS admin_product_amount
FROM 
    purchases 
JOIN 
    product_list 
ON 
    purchases.product_id = product_list.id 
WHERE 
    purchases.buyer_id = $1

UNION ALL

SELECT 
    purchases.id AS purchase_id, 
    purchases.status AS purchase_status,
    purchases.date,
    purchases.owner,
    admin_products.id AS product_id, 
    NULL AS product_status,  -- No data from product_list for these rows
    NULL AS product_account_type, 
    NULL AS product_amount,
    admin_products.account_type AS admin_product_account_type, 
    admin_products.amount AS admin_product_amount
FROM 
    purchases 
JOIN 
    admin_products 
ON 
    purchases.product_id = admin_products.id 
WHERE 
    purchases.buyer_id = $1

ORDER BY 
    date DESC
LIMIT $2 
OFFSET $3;

`,
      [buyer_id, limit, offset]
    );

    const purchase = purchasesResult.rows;

    purchase.forEach((purchase) => {
      purchase.formattedDate = moment(purchase.date).format("D MMM h:mmA");
    });

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [buyer_id, false]
  );

  const notifications = notificationsResult.rows;

  const countQuery = `
  SELECT COUNT(*) AS total_count
  FROM (
      SELECT 
          purchases.id AS purchase_id, 
          purchases.status AS purchase_status,
          purchases.date,
          purchases.owner,
          product_list.id AS product_id, 
          product_list.status AS product_status,
          product_list.account_type AS product_account_type, 
          product_list.amount AS product_amount,
          NULL AS admin_product_account_type,
          NULL AS admin_product_amount
      FROM 
          purchases 
      JOIN 
          product_list 
      ON 
          purchases.product_id = product_list.id 
      WHERE 
          purchases.buyer_id = $1

      UNION ALL

      SELECT 
          purchases.id AS purchase_id, 
          purchases.status AS purchase_status,
          purchases.date,
          purchases.owner,
          admin_products.id AS product_id, 
          NULL AS product_status,
          NULL AS product_account_type, 
          NULL AS product_amount,
          admin_products.account_type AS admin_product_account_type, 
          admin_products.amount AS admin_product_amount
      FROM 
          purchases 
      JOIN 
          admin_products 
      ON 
          purchases.product_id = admin_products.id 
      WHERE 
          purchases.buyer_id = $1
  ) AS combined_results;
`;
const countResult = await db.query(countQuery, [buyer_id]);
const totalOrders = parseInt(countResult.rows[0].total_count, 10);


    res.render("p2porderhistory", { 
      purchase, user, 
      notifications, timeSince,
      currentPage: page, 
      totalPages: Math.ceil(totalOrders / limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get('/searchProducts', ensureAuthenticated, async (req, res) => {
  const query = req.query.query || '';
  const userId = req.user.id;
  
  try {

      const result = await db.query(
        `SELECT product_list.*, userprofile.firstname, userprofile.lastname, userprofile.username
         FROM product_list 
         JOIN userprofile ON product_list.user_id = userprofile.id
         WHERE product_list.user_id != $1 AND status != 'pending' 
         AND status != 'rejected' AND payment_status != 'sold' 
         AND payment_status != 'awaiting'
         AND (account_type ILIKE $2 OR CAST(amount AS TEXT) ILIKE $2)
         `,
        [userId, `%${query}%`]
      );

      const getIconClass = (type) => {
        switch (type.toLowerCase()) {
          case "facebook":
            return "bi bi-facebook";
          case "twitter":
            return "bi bi-twitter";
          case "snapchat":
            return "bi bi-snapchat";
          case "instagram":
            return "bi bi-instagram";
          case "tiktok":
            return "bi bi-tiktok";
          default:
            return "bi bi-question-circle"; // Default icon if type is unknown
        }
      };

      const processedProducts = result.rows.map(product => ({
        ...product,
        iconClass: getIconClass(product.account_type) // Assuming 'account_type' holds the social media type
      }));

      res.json(processedProducts); // Send back the matching products as JSON
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while searching for products' });
  }
});

router.get("/all/accounts", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;

  try {

    const usersResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );

    const user = usersResult.rows[0];
    
    const result = await db.query(
      `SELECT * FROM admin_products
   WHERE payment_status = $1
   ORDER BY RANDOM();`,
  ['not sold']
    );

    const products = result.rows;

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;


    const getIconClass = (type) => {
      switch (type.toLowerCase()) {
        case "facebook":
          return "bi bi-facebook";
        case "twitter":
          return "bi bi-twitter";
        case "snapchat":
          return "bi bi-snapchat";
        case "instagram":
          return "bi bi-instagram";
        case "tiktok":
          return "bi bi-tiktok";
        default:
          return "bi bi-question-circle"; // Default icon if type is unknown
      }
    };

    res.render("adminproducts", {
      products,
      getIconClass,
      messages: req.flash(),
      user, timeSince, notifications
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/all/account/buy", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;
  const productId = Number(req.body.productId) 

  try {

    const result = await db.query(
      "SELECT balance FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];

    const productRows = await db.query(
      "SELECT * FROM admin_products WHERE id = $1",
      [productId]
    );
    const product = productRows.rows[0];

    if (product.payment_status === "sold") {
      req.flash("success", "Product already sold.");
      return res.redirect("/all/account/buy");
    }

    const amount = Number(product.amount)

    if (user.balance >= amount) {

      const adminId = product.admin_id;

      const purchaseRows = await db.query(
        "INSERT INTO purchases (product_id, buyer_id, seller_id, status) VALUES ($1, $2, $3, $4) RETURNING *",
        [productId, userId, adminId, "confirmed"]
      );
      const purchase = purchaseRows.rows[0];

      const updateBalanceQuery =
      "UPDATE userprofile SET balance = balance - $1 WHERE id = $2";
    await db.query(updateBalanceQuery, [product.amount, userId])
    
    await db.query(
      "UPDATE admin_products SET payment_status = 'sold', sold_at = NOW() WHERE id = $1",
      [productId]
    );
      console.log("successful");
      res.redirect(`/purchase/account/${purchase.id}`);
    } else {
      req.flash("error", "Insufficient balance, please topup your balance");
      console.log("Insufficient balance, please topup your balance");
      return res.redirect("/all/accounts");
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/purchase/account/:purchaseId", ensureAuthenticated, userRole, async (req, res) => {
  const { purchaseId } = req.params;
  const userId = req.user.id;

  try {
    const usersResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = usersResult.rows[0];

    const { rows: purchaseRows } = await db.query(
      "SELECT * FROM purchases WHERE id = $1 AND buyer_id = $2",
      [purchaseId, userId]
    );
    

    const notificationsResult = await db.query(
      "SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5",
      [userId, false]
    );

    const notifications = notificationsResult.rows;

    if (purchaseRows.length === 0) {
      req.flash("errors", "Purchase not found");
      res.redirect("/dashboard");
    } else {
      const purchase = purchaseRows[0];

      const purchaseTime = purchase.date;

      purchase.formattedDate = moment(purchase.date).format("D MMM h:mmA");

      const { rows: adminProductRows } = await db.query(
        "SELECT * FROM admin_products WHERE id = $1",
        [purchase.product_id]
      );

      const product = adminProductRows[0];

        if (purchase.status === "confirmed") {
          res.render("purchase", {
            purchase,
            product,
            user,
            notifications,
            timeSince,
            purchaseTime
          });
        } 
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
}
);

export default router;
