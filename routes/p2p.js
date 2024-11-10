import express from "express";
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import moment from "moment";
import timeSince from "../controller/timeSince.js";
import { v4 as uuidv4 } from 'uuid';
import { sendOrderCompleteEmail } from "../config/emailMessages.js";


const router = express.Router();

function generateTransferId() {
  const prefix = "pur_ref";
  const uniqueId = uuidv4(); // Generate a unique UUID
  const buffer = Buffer.from(uniqueId.replace(/-/g, ''), 'hex'); // Remove dashes and convert to hex
  const base64Id = buffer.toString('base64').replace(/=/g, '').slice(0, 6);
  return `${prefix}_${base64Id}`;
}

router.get("/product/adminorderhistory", ensureAuthenticated, userRole, async (req, res) => {
  const buyer_id = req.user.id;

  try {
    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

   const usersResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [buyer_id]);
   const user = usersResult.rows[0]

    const purchasesResult = await db.query(
      `
SELECT 
    purchases_admin_product.id AS purchase_id, 
    purchases_admin_product.status AS purchase_status,
    purchases_admin_product.date_purchased,
    admin_products.id AS product_id,
    admin_products.account_type AS admin_product_account_type, 
    admin_products.amount AS admin_product_amount
FROM 
    purchases_admin_product
JOIN 
    admin_products 
ON 
    purchases_admin_product.product_id = admin_products.id 
WHERE 
    purchases_admin_product.buyer_id = $1
ORDER BY 
    date_purchased DESC
LIMIT $2 
OFFSET $3;

`,
      [buyer_id, limit, offset]
    );

    const purchase = purchasesResult.rows;

    purchase.forEach((purchase) => {
      purchase.formattedDate = moment(purchase.date_purchased).format("D MMM h:mmA");
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
          purchases_admin_product.id AS purchase_id, 
          purchases_admin_product.status AS purchase_status,
          purchases_admin_product.date_purchased,
          admin_products.id AS product_id,
          admin_products.account_type AS admin_product_account_type, 
          admin_products.amount AS admin_product_amount
      FROM 
          purchases_admin_product 
      JOIN 
          admin_products 
      ON 
          purchases_admin_product.product_id = admin_products.id 
      WHERE 
          purchases_admin_product.buyer_id = $1
  ) AS combined_results;
`;
const countResult = await db.query(countQuery, [buyer_id]);
const totalOrders = parseInt(countResult.rows[0].total_count, 10);


    res.render("adminproductorderhistory", { 
      purchase, user, 
      notifications, timeSince,
      currentPage: page, 
      totalPages: Math.ceil(totalOrders / limit),
    });
  } catch (error) {
    console.error("error fetching product history", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get('/searchAdminProducts', ensureAuthenticated, async (req, res) => {
  const query = req.query.query || '';
  const userId = req.user.id;
  
  try {
      const result = await db.query(
        `SELECT * FROM admin_products
         WHERE payment_status != 'sold' 
         AND payment_status != 'awaiting'
         AND (account_type ILIKE $1 OR CAST(amount AS TEXT) ILIKE $1)
         `,
        [`%${query}%`]
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
            return "bi bi-question-circle";
        }
      };

      const processedProducts = result.rows.map(product => ({
        ...product,
        iconClass: getIconClass(product.account_type) 
      }));

      res.json(processedProducts);
  } catch (error) {
     console.error("error searching products:", error);
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
    console.error("error get account puurchase page:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/all/account/buy", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;
  const productId = Number(req.body.productId) 

  try {

    const purchaseNumber = generateTransferId();

    const result = await db.query(
      "SELECT balance, username, email FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];

    const productRows = await db.query(
      "SELECT * FROM admin_products WHERE id = $1",
      [productId]
    );
    const product = productRows.rows[0];

    const adminResult = await db.query(`
      SELECT email from admins WHERE id = $1
      `, [product.admin_id]);

      const adminEmail = adminResult.rows[0];


    if (product.payment_status === "sold") {
      req.flash("success", "Product already sold.");
      return res.redirect("/all/accounts");
    }

    const amount = Number(product.amount)

    if (user.balance >= amount) {

      const adminId = product.admin_id;

      const purchaseRows = await db.query(
        "INSERT INTO purchases_admin_product (product_id, buyer_id, admin_id, status, purchase_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [productId, userId, adminId, "confirmed", purchaseNumber]
      );
      const purchase = purchaseRows.rows[0];

      await db.query(`
        INSERT INTO notifications (user_id, type, message) 
        VALUES ($1, $2, $3)`, 
        [userId, 'purchase', 
          `You have successfully purchase a ${product.account_type} account with the purchase id : ${purchaseNumber}` 
        ])


      const updateBalanceQuery =
      "UPDATE userprofile SET balance = balance - $1 WHERE id = $2";
    await db.query(updateBalanceQuery, [product.amount, userId])
    
    await db.query(
      "UPDATE admin_products SET payment_status = 'sold', sold_at = NOW() WHERE id = $1",
      [productId]
    );

    const email = user.email;
    const username = user.username;
    const purchaseId = purchaseNumber;

    await sendOrderCompleteEmail(email, username, purchaseId);

    req.flash("success", `You have successfully purchase a ${product.account_type} account with the purchase id : ${purchaseNumber}`);

      res.redirect(`/purchase/account/${purchase.id}`);
    } else {
      req.flash("error", "Insufficient balance, please topup your balance");
      return res.redirect("/all/accounts");
    }
  } catch (error) {
    console.error("error prchasing accouunt:", error);
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
      "SELECT * FROM purchases_admin_product WHERE id = $1 AND buyer_id = $2",
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

      const purchaseTime = purchase.date_purchased;

      purchase.formattedDate = moment(purchase.date_purchased).format("D MMM h:mmA");

      const { rows: adminProductRows } = await db.query(
        "SELECT * FROM admin_products WHERE id = $1",
        [purchase.product_id]
      );

      const product = adminProductRows[0];

        if (purchase.status === "confirmed") {
          res.render("adminPurchases.ejs", {
            purchase,
            product,
            user,
            notifications,
            timeSince,
            purchaseTime, messages: req.flash()
          });
        } 
    }
  } catch (err) {
    console.error("error fetching purchased account",err);
    res.status(500).send("Server error");
  }
}
);



export default router;
