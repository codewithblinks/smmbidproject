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
    const result = await db.query(
      "SELECT order_id FROM purchase_history WHERE status != $1",
      ["Completed"]
    );
    const orders = result.rows;

    await Promise.all(
      orders.map(async (order) => {
        const orderId = order.order_id;

        try {
      const response = await axios.post(
        `${API_URL}?key=${API_KEY}&action=status&order=${orderId}`
      );
      const orderData = response.data;

      const purchaseResult = await db.query(
        "SELECT * FROM purchase_history WHERE order_id = $1",
        [orderId]
      );
      const purchase = purchaseResult.rows[0];

      if (!purchase) {
        console.warn(`No purchase record found for order ID ${orderId}`);
        return;
      }

      await db.query("BEGIN");

      // Partial Status - Process Refund for Remaining
      if (orderData.status === "Partial" && purchase.status !== "Partial") {
        const amountRefund = (purchase.charge / purchase.quantity) * purchase.remain;

        // Refund the user balance
        const userId = await db.query(
          "UPDATE userprofile SET balance = balance + $1 WHERE id = $2 RETURNING id",
          [amountRefund, purchase.user_id]
        ).rows[0].id;

        await db.query(
          "UPDATE purchase_history SET status = $1, refund_amount = $2 WHERE order_id = $3",
          [orderData.status, amountRefund, orderId]
        );

        await db.query(`
          INSERT INTO notifications (user_id, type, message) 
          VALUES ($1, $2, $3)`, 
          [userId, 'purchase', `Your SMM Service with order ID ${orderId} 
            was partially fulfilled. A refund of ₦${amountRefund} has been credited to your main balance.`]
        );
        console.log(`Partial order ${orderId} refunded with amount ${amountRefund}`);

      } else if (orderData.status === "Canceled" && purchase.status !== "Canceled") {
        // Refund the user balance with full charge amount
        const userId = await db.query(
          "UPDATE userprofile SET balance = balance + $1 WHERE id = $2 RETURNING id",
          [purchase.charge, purchase.user_id]
        ).rows[0].id;

        await db.query(
          "UPDATE purchase_history SET status = $1, start_count = $2, remain = $3, refund_amount = $4 WHERE order_id = $5",
          [orderData.status, orderData.start_count, orderData.remains, purchase.charge, orderId]
        );

        await db.query(`
          INSERT INTO notifications (user_id, type, message) 
          VALUES ($1, $2, $3)`, 
          [userId, 'purchase', `Your SMM Service with order ID ${orderId} was canceled. 
            A full refund of ₦${purchase.charge} has been credited to your main balance.`]
        );
        console.log(`Canceled order ${orderId} refunded with amount ${purchase.charge}`);

      } else if (orderData.status !== "Completed") {
        await db.query(
          "UPDATE purchase_history SET status = $1, start_count = $2, remain = $3 WHERE order_id = $4",
          [orderData.status, orderData.start_count, orderData.remains, orderId]
        );
      } else {
        await db.query(
          "UPDATE purchase_history SET status = $1, start_count = $2, remain = $3 WHERE order_id = $4",
          ["Completed", orderData.start_count, orderData.remains, orderId]
        );
      }

      await db.query("COMMIT");
  } catch (orderError) {
    await db.query("ROLLBACK");
    console.error(`Error processing order ${order.order_id}:`, orderError);
      }
    })
    ); 
    console.log("Order statuses, start_count, and remain updated successfully.");
  } catch (err) {
    console.error("Error updating order statuses:", err);
  }
});

router.get("/exchange-rate", async (req, res) => {
  try {
    const rates = await getExchangeRate();
    res.json({ rate: rates.NGN });
  } catch (error) {
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
      "SELECT * FROM userprofile WHERE id = $1",
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
    console.error("error at smm route", error.message);
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
    console.error("error getting smm options", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/buysmm", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { serviceId, link, quantity, service } = req.body;
  const amount = Number(req.body.amount);

  try {
    await db.query("BEGIN");

    const userResult = await db.query("SELECT balance FROM userprofile WHERE id = $1", [userId]);
    const user = userResult.rows[0];

    if (!user || user.balance < amount) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance, please top-up your balance." });
    }

    const response = await axios.post(
      `${API_URL}?key=${API_KEY}&action=add&service=${serviceId}&link=${link}&quantity=${quantity}`
    );
    const data = response.data;

    const order = data.order;

    if (order) {
      const orderResponse = await axios.post(
        `${API_URL}?key=${API_KEY}&action=status&order=${order}`
      );
      const orderData = orderResponse.data;
      const orderStatus = orderData.status || 'Pending';

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

      const updateBalanceQuery = "UPDATE userprofile SET balance = balance - $1 WHERE id = $2";
      await db.query(updateBalanceQuery, [amount, userId]);

      await db.query(`
        INSERT INTO notifications (user_id, type, message) 
        VALUES ($1, $2, $3)`, 
        [userId, 'purchase', `You have successfully purchased an SMM Service with the order id ${order}`]
      );

      await db.query("COMMIT");

      return res.status(200).json({ message: "Service purchase successful, processing now." });
    } else {
      await db.query("ROLLBACK")

      const errorMessage = data.error === "Not enough funds on balance"
        ? "Unable to complete purchase at the moment, try again later."
        : data.error || "An error occurred, please try again.";

      return res.status(400).json({ error: errorMessage });
    }
  } catch (error) {
    await db.query("ROLLBACK")
    console.error("Error processing purchase:", error.message);
    res.status(500).json({ error: "Internal server error. Please try again." });
  }
});


export default router;
