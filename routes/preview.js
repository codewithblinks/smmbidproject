import express from "express";
import db from "../db/index.js";
import formatDate from "../controller/formatDate.js";
import { io } from "../script.js";
import { sendEmail } from "../config/transporter.js";
import moment from "moment";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import { sendRejectEmailToBuyer } from "../config/sendEmail.js";
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function generateTransferId() {
  const prefix = "pur_ref";
  const uniqueId = uuidv4(); // Generate a unique UUID
  const buffer = Buffer.from(uniqueId.replace(/-/g, ''), 'hex'); // Remove dashes and convert to hex
  const base64Id = buffer.toString('base64').replace(/=/g, '').slice(0, 12);
  return `${prefix}_${base64Id}`;
}

router.get("/product/:id", ensureAuthenticated, userRole, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const usersResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = usersResult.rows[0];

    const productResult = await db.query(
      "SELECT * FROM product_list WHERE id = $1",
      [id]
    );
    const sellerResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [productResult.rows[0].user_id]
    );

    if (productResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Seller not found or no products listed" });
    }

    const notificationsResult = await db.query(
      "SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5",
      [userId, false]
    );

    const notifications = notificationsResult.rows;
    res.render("preview", {
      product: productResult.rows[0],
      seller: sellerResult.rows[0],
      userId,
      user,
      notifications,
      timeSince,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
});

router.post("/buyaccount", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { productId, sellerId } = req.body;
  const productAmount = Number(req.body.productAmount);

  try {
    const purchaseNumber = generateTransferId();

    const result = await db.query(
      "SELECT balance FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];

    const productRows = await db.query(
      "SELECT * FROM product_list WHERE id = $1",
      [productId]
    );
    const product = productRows.rows[0];

    if (product.payment_status === "sold") {
      req.flash("success", "Product already sold.");
      return res.redirect("/p2p");
    }

    if ( product.payment_status === "awaiting") {
      req.flash("success", "Product has been requested for purchase.");
      return res.redirect("/p2p");
    }

    if (user.balance >= productAmount) {
      const purchaseRows = await db.query(
        "INSERT INTO purchases (product_id, buyer_id, seller_id, status, purchase_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [productId, userId, sellerId, "pending", purchaseNumber]
      );
      const purchase = purchaseRows.rows[0];

      if (product.statustype === "instant") {
        const updateBalanceQuery =
          "UPDATE userprofile SET balance = balance - $1 WHERE id = $2";
        await db.query(updateBalanceQuery, [productAmount, userId]);

        const updateSellerBalanceQuery =
          "UPDATE userprofile SET business_balance = business_balance + $1 WHERE id = $2";
        await db.query(updateSellerBalanceQuery, [productAmount, sellerId]);

        await db.query(
          "UPDATE product_list SET payment_status = 'sold', sold_at = NOW() WHERE id = $1",
          [productId]
        );
      } else {
        const updateBalanceQuery =
          "UPDATE userprofile SET balance = balance - $1 WHERE id = $2";
        await db.query(updateBalanceQuery, [productAmount, userId]);

        await db.query(
          "UPDATE product_list SET payment_status = 'awaiting' WHERE id = $1",
          [productId]
        );
      }
      io.to(sellerId).emit("notification", {
        content: `New purchase from user ${userId} for product ${product.accont_type}`,
        purchaseId: purchase.id,
      });

      console.log("successful");
      res.redirect(`/purchase/${purchase.id}`);
    } else {
      req.flash("error", "Insufficient balance, please topup your balance");
      console.log("Insufficient balance, please topup your balance");
      return res.redirect("/p2p");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
});

router.get("/purchase/:purchaseId", ensureAuthenticated, userRole, async (req, res) => {
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

        const { rows: productRows } = await db.query(
          "SELECT * FROM product_list WHERE id = $1",
          [purchase.product_id]
        );

        const product = productRows[0];

        if (purchase.owner === 'admin') {
          res.redirect("/dashboard");
        } else {
          
        if (purchase.status === "rejected") {
          res.render("purchase", {
            purchase,
            product,
            user,
            notifications,
            timeSince,
            purchaseTime
          });
        } else {
          if (product.statustype === "instant") {
            res.render("purchase", {
              purchase,
              product,
              user,
              notifications,
              timeSince,
              purchaseTime
            });
            await db.query("UPDATE purchases SET status = $1 WHERE id = $2", [
              "confirmed",
              purchaseId,
            ]);
          } else if (product.statustype === "updated") {
            res.render("purchase", {
              purchase,
              product,
              user,
              notifications,
              timeSince,
              purchaseTime
            });
          }
          else {
            await sendEmailToSeller(product.user_id, product.id);
            res.render("purchase", {
              purchase,
              product,
              loading: true,
              user,
              notifications,
              timeSince,
              purchaseTime
            });
          }
        }
        }

      }
    } catch (error) {
      console.log(error);
      res.status(500).send("Server error");
    }
  }
);

async function sendEmailToSeller(sellerId, productId) {
  try {
    // Get seller email from the database
    const result = await db.query(
      "SELECT email FROM userprofile WHERE id = $1",
      [sellerId]
    );
    const sellerEmail = result.rows[0].email;

    // Call the reusable sendEmail function
    await sendEmail({
      to: sellerEmail,
      subject: "Action Required: Complete Details for Your Product",
      text: `A buyer has requested to purchase your product. Please complete the details for product ID: ${productId}.`,
    });

    console.log(`Email sent to ${sellerEmail} about product ${productId}`);
  } catch (error) {
    console.log(error);
    console.error(`Error sending email to seller: ${error.message}`);
  }
}

async function sendEmailToBuyer(buyerId, productId) {
  try {
    // Get seller email from the database
    const result = await db.query(
      "SELECT email FROM userprofile WHERE id = $1",
      [buyerId]
    );
    const buyerEmail = result.rows[0].email;

    // Call the reusable sendEmail function
    await sendEmail({
      to: buyerEmail,
      subject: "Action Required: Account Login Deatils Updated by Seller",
      text: `The login details of the account you just purchase has been updated by the seller login and confirm or reload the page.`,
    });

    console.log(`Email sent to ${buyerEmail} about product ${productId}`);
  } catch (err) {
    console.log(err);
    console.error(`Error sending email to seller: ${err.message}`);
  }
}

router.get("/product/complete/add", ensureAuthenticated, userRole, async (req, res) => {
    const userId = req.user.id;
    try {
      const usersResult = await db.query(
        "SELECT * FROM userprofile WHERE id = $1",
        [userId]
      );
      const user = usersResult.rows[0];

      const result = await db.query(
        `SELECT 
    pl.id AS product_list_id, 
    pl.status AS product_list_status, 
    pl.account_type, 
    pl.account_country,
    pl.amount, 
    pl.payment_status,
    pl.statustype,
    pl.user_id,
    pl.payment_recieved,
    p.purchase_id,
    p.date,
    p.status AS purchase_status
FROM 
    product_list pl
LEFT JOIN 
    (
        SELECT 
            purchases.id AS purchase_id, 
            purchases.date, 
            purchases.product_id,
            purchases.seller_id,
            purchases.status 
        FROM 
            purchases
        WHERE 
            purchases.seller_id = $1 
        AND 
            purchases.status = 'pending'
    ) p
ON 
    pl.id = p.product_id 
AND 
    pl.user_id = p.seller_id 
WHERE 
    pl.user_id = $2
AND 
    pl.statustype != 'instant'
AND 
    pl.statustype != 'updated'
AND 
    pl.payment_status = 'awaiting';

`,
        [userId, userId]
      );
      const products = result.rows;

      const purchaseTime = products.map(product => product.date);

      const notificationsResult = await db.query(
        'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
        [userId, false]
    );
  
    const notifications = notificationsResult.rows;

      res.render("manual", { 
        messages: req.flash(), 
        products, user, purchaseTime,
        timeSince, notifications
      });
    } catch (err) {
      console.log(err);
      res.send("Error retrieving products");
    }
  }
);

router.post("/products/:id/complete", ensureAuthenticated, async (req, res) => {
  const {
    loginusername,
    loginemail,
    loginpassword,
    logindetails,
    idForCompleteAdd,
  } = req.body;
  const { id } = req.params;

  try {
    await db.query(
      "UPDATE product_list SET loginusername = $1, loginemail = $2, loginpassword = $3, logindetails = $4, statustype = $5  WHERE id = $6",
      [loginusername, loginemail, loginpassword, logindetails, "updated", id]
    );

    const purchaseResult = await db.query(
      "SELECT * FROM purchases WHERE id = $1",
      [idForCompleteAdd]
    );
    const purchase = purchaseResult.rows[0];
    // Notify the buyer (you could use websockets for real-time notification)
    await sendEmailToBuyer(purchase.buyer_id, id);

    req.flash("success", `Product Login details successfully updated`);
    res.redirect("/product/complete/add");
  } catch (error) {
    console.log(error);
    res.send("Error updating product");
  }
});

router.post("/products/:id/reject", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const product_id = req.body.product_id;

  try {
    const productResult = await db.query(
      "SELECT * FROM product_list WHERE id = $1",
      [product_id]
    );
    const product = productResult.rows[0];

    const purchaseResult = await db.query(
      "SELECT * FROM purchases WHERE id = $1",
      [id]
    );
    const purchase = purchaseResult.rows[0];

    await db.query(
      "UPDATE product_list SET payment_status = $1 WHERE id = $2",
      ["not sold", product_id]
    );

    await db.query(
      "UPDATE userprofile SET balance = balance + $1 WHERE id = $2",
      [product.amount, purchase.buyer_id]
    );

    await db.query("UPDATE purchases SET status = $1 WHERE id = $2", [
      "rejected",
      id,
    ]);

    req.flash(
      "success",
      `Purchase order has been rejected ${product.amount} refunded to the buyer`
    );

    await sendRejectEmailToBuyer(purchase.buyer_id, product_id);

    res.redirect("/product/complete/add");
  } catch (err) {
    req.flash(
      "errors",
      `There was an error rejecting purchase order please contact support`
    );
    console.log(err);
    res.send("Error reject order");
  }
});

router.post( "/product/complete/order/:id", ensureAuthenticated, async (req, res) => {
    const { id } = req.params;
    const purchaseId = req.body.purchaseId;

    try {
      const productResult = await db.query(
        "SELECT * FROM product_list WHERE id = $1",
        [id]
      );
      const product = productResult.rows[0];

      const amount = Number(product.payment_recieved);

      const statusResult = await db.query(
        "SELECT * FROM purchases WHERE id = $1",
        [purchaseId]
      );
      const status = statusResult.rows[0];
      
      if (status.status === "pending") {
      console.log('amount', amount)
      console.log('product.user_id', product.user_id)

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
          [id]
        );

        res.redirect("/dashboard");
      } else {
        res.redirect("/p2p");
        console.log("error update");
      }
    } catch (err) {
      console.log(err);
      res.send("Error updating product");
    }
  }
);

router.post("/submit-review", ensureAuthenticated, async (req, res) => {
  const writer_id = req.user.id;
  const { userId, ratingValue, review } = req.body;

  try {
    const reviewResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [writer_id]
    );
    const writer_username = reviewResult.rows[0];

    const result = await db.query(
      "INSERT INTO ratings_reviews (user_id, rating, review, writer_id, writer_username) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [userId, ratingValue, review, writer_id, writer_username.username]
    );
    req.flash("success", `Review submited`);
    res.redirect("/p2p");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

router.get('/api/check-approval-status/:purchaseId', async (req, res) => {
  const {purchaseId} = req.params; // Get the purchase ID from the query params
  try {
      const result = await db.query('SELECT statustype FROM product_list WHERE id = $1', [purchaseId]);
     
      if (result.rows.length > 0) {
         const approved = result.rows
          res.json({ approved});
      } else {
          res.status(404).json({ approved: false });
      }
  } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});






export default router;
