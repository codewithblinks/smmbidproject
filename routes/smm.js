import express from "express";
import db from "../db/index.js";
import axios from "axios";
import cron from "node-cron";
import getExchangeRate from "../controller/exchangeRateService.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";

const router = express.Router();


const API_URL = process.env.WKSMM_API_URL;
const API_KEY = process.env.WKSMM_API_KEY;

cron.schedule("*/2 * * * *", async () => {
  try {
    // Get all orders with status 'pending' from the database
    const result = await db.query(
      "SELECT order_id FROM purchase_history WHERE status != $1",
      ["Completed"]
    );
    const orders = result.rows;

    for (const order of orders) {
      const orderId = order.order_id;
      const response = await axios.post(
        `${API_URL}?key=${API_KEY}&action=status&order=${orderId}`
      );
      const orderData = response.data;
      // Update the status in the database if it has changed
      if (orderData.status === "Partial") {
        const purchaseResult = await db.query(
          "SELECT * FROM purchase_history WHERE order_id = $1",
          [orderId]
        );
        const purchase = purchaseResult.rows[0];

        if (purchase.status === "Partial") {
          const totalResult = purchase.charge / purchase.quantity;

          const amountRefund = totalResult * purchase.remain;
          await db.query(
            "UPDATE userprofile SET balance = balance + $1 WHERE id = $2",
            [amountRefund, purchase.user_id]
          );
          await db.query(
            "UPDATE purchase_history SET status = $1, refund_amount = $2 WHERE order_id = $3",
            ["Refunded", amountRefund, orderId]
          );
        }
        if (purchase.status === "Refunded") {
          console.log("Payment already refunded");
        }
      } else if (orderData.status === "Canceled") {
        const purchaseResult = await db.query(
          "SELECT * FROM purchase_history WHERE order_id = $1",
          [orderId]
        );
        const purchase = purchaseResult.rows[0];

        if (purchase.status === "Canceled") {
          await db.query(
            "UPDATE userprofile SET balance = balance + $1 WHERE id = $2",
            [purchase.charge, purchase.user_id]
          );

          await db.query(
            "UPDATE purchase_history SET status = $1, start_count = $2, remain = $3, refund_amount = $4 WHERE order_id = $5",
            ["Order Canceled", orderData.start_count, orderData.remains, purchase.charge, orderId]
          );

        }
        if (purchase.status === "Order Canceled") {
          console.log("Order Canceled");
        }
      }  else if (orderData.status !== "Completed") {
        await db.query(
          "UPDATE purchase_history SET status = $1, start_count = $2, remain = $3 WHERE order_id = $4",
          [orderData.status, orderData.start_count, orderData.remains, orderId]
        );
      }
      else {
        // Update the status to 'completed' if the order is completed;
        await db.query(
          "UPDATE purchase_history SET status = $1, start_count = $2, remain = $3 WHERE order_id = $4",
          [orderData.status, orderData.start_count, orderData.remains, orderId]
        );
      }
    }

    console.log("Order statuses, start_count, and remain updated successfully");
  } catch (err) {
    console.log(err)
    console.error("Error updating order statuses:", err.message);
  }
});

router.get("/exchange-rate", async (req, res) => {
  try {
    const rates = await getExchangeRate();
    res.json({ rate: rates.NGN });
  } catch (error) {
    console.log(error);
    console.error("Error fetching exchange rate:", error);
    res.status(500).json({ error: "Unable to fetch exchange rate" });
  }
});

router.get("/smm", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;
  try {
    const response = await axios.get(
      `${API_URL}?key=${API_KEY}&action=services`
    );

    const data = response.data;

    const excludedCategories = [
      "WKSMM PROMO 📣",
      "WKSMM | High Demand Services | Never Failed",
    ];
    const filteredData = await data.filter(
      (item) => !excludedCategories.includes(item.category)
    );

    const result = await db.query("SELECT * FROM userprofile WHERE id = $1", [
      userId,
    ]);
    const details = result.rows[0];
    const userResult = await db.query(
      "SELECT * FROM userprofile JOIN product_list ON userprofile.id = product_list.user_id WHERE userprofile.id = $1",
      [userId]
    );
    const userDetails = userResult.rows;

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;

    if (!userDetails) {
      return res.status(404).json({ error: "User not found" });
    }

    res.render("smm", {
      messages: req.flash(),
      userDetails,
      details,
      filteredData, notifications, timeSince
    });
  } catch (error) {
    console.log(error);
    console.error(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/smm/options", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  try {
    const response = await axios.get(
      `${API_URL}?key=${API_KEY}&action=services`
    );

    const data = response.data;
    res.json(data);
  } catch (error) {
    console.log(error);
    console.error(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/buysmm", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { serviceId, link, quantity, service } = req.body;
  const amount = Number(req.body.amount);

  try {
    const response = await axios.post(
      `${API_URL}?key=${API_KEY}&action=add&service=${serviceId}&link=${link}&quantity=${quantity}`
    );
    const data = response.data;

    const order = data.order;

    const result = await db.query(
      "SELECT balance FROM userprofile WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];

    if (user.balance >= amount) {
      if (order) {
        const orderResponse = await axios.post(
          `${API_URL}?key=${API_KEY}&action=status&order=${order}`
        );
        const orderData = orderResponse.data;

        const orderStatus = orderData.status === '' ? 'Pending' : orderData.status;

        const addTransferQuery = `
        INSERT INTO purchase_history (user_id, charge, order_id, status, start_count, remain, quantity, link, service)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
        await db.query(addTransferQuery, [
          userId,
          amount,
          order,
          orderStatus,
          orderData.start_count,
          orderData.remains,
          quantity,
          link,
          service,
        ]);

        const updateBalanceQuery =
          "UPDATE userprofile SET balance = balance - $1 WHERE id = $2";
        await db.query(updateBalanceQuery, [amount, userId]);

        await db.query(`
          INSERT INTO notifications (user_id, type, message) 
          VALUES ($1, $2, $3)`, 
          [userId, 'purchase', 
            `You have successfully purchase an SMM Service with the order id ${order}` 
          ])

        req.flash("success", "Service purchase successful, processing now.");
        return res.redirect("/dashboard");
      } else if (data.error == "Not enough funds on balance") {
        req.flash(
          "error",
          "Unable to complete purchase at the moment, try again later."
        );
        return res.redirect("/dashboard");
      } else if (data.error === "Quantity more than maximum 1000") {
        req.flash("error", data.error);
        return res.redirect("/smm");
      } else if (data.error === "Quantity less than minimal 1000") {
        req.flash("error", data.error);
        return res.redirect("/smm");
      }
    } else {
      req.flash("error", "Insufficient balance, please topup your balance");
      return res.redirect("/smm");
    }
  } catch (error) {
    console.log(error);
    console.error(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
