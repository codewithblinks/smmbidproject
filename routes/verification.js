import express from "express";
import db from "../db/index.js";
import axios from "axios";
import cron from "node-cron"
import FormData from "form-data"
import { io } from "../script.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";


const router = express.Router();

const BEARER_TOKEN = process.env.SMSPOOL_BEARER_TOKEN;

router.get("/verification", ensureAuthenticated, userRole, async (req, res) => {
  const userId = req.user.id;

  try {
    const countryResponse = await axios.get('https://api.smspool.net/country/retrieve_all', {
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`
      }
    });

    const serviceResponse = await axios.get('https://api.smspool.net/service/retrieve_all', {
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`
      }
    });
    const countries = countryResponse.data;
    const services = serviceResponse.data;

    const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
    const userDetails = userResult.rows[0];

    const notificationsResult = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
      [userId, false]
  );

  const notifications = notificationsResult.rows;
      res.render('verification', { messages: req.flash(), user: userDetails, countries, services, notifications, timeSince });

  } catch (error) {
    console.log(error);
    console.error(error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post("/smmpool/options", ensureAuthenticated, async (req, res) => {

  const { country, service} = req.body;

  try {
    const form = new FormData();
    form.append('country', country);
    form.append('service', service);

    const headers = {
      ...form.getHeaders(),  // Include form data headers
      'Authorization': `Bearer ${BEARER_TOKEN}`

    };

    const response = await axios.post('https://api.smspool.net/request/price', form, { headers });

    const data = response.data;

    res.json(data)

  } catch (err) {
    console.error(err.message);
    console.log(err.message);
    res.status(500).json({ err: 'Internal server error' });
  }
});

router.post("/smmpool/pool/retrieve_valid", ensureAuthenticated, async (req, res) => {

  const { country, service} = req.body;
  const web = 1;

  try {
    const form = new FormData();
    form.append('country', country);
    form.append('service', service);
    form.append('web', web);

    const headers = {
      ...form.getHeaders(),  // Include form data headers
      'Authorization': `Bearer ${BEARER_TOKEN}`

    };

    const response = await axios.post('https://api.smspool.net/pool/retrieve_valid', form, { headers });

    const data = response.data;

    res.json(data)

  } catch (err) {
    console.error(err.message);
    console.log(err.message);
    res.status(500).json({ err: 'Internal server error' });
  }
});

// fetch orderid
const fetchOrderCodesForUser = async (userId) => {
  const result = await db.query('SELECT order_id FROM sms_order WHERE user_id = $1', [userId]);
  return result.rows.map(row => row.order_id);
};

const fetchAllUserIds = async () => {
  const result = await db.query('SELECT DISTINCT user_id FROM sms_order');
  return result.rows.map(row => row.user_id);
};

// fetch pending order
const fetchAndFilterActiveOrders = async (orderCodes) => {
  try {

    const form = new FormData();
    form.append('key', BEARER_TOKEN);

    const headers = {
      ...form.getHeaders(),
      'Authorization': `Bearer ${BEARER_TOKEN}`

    };

    const response = await axios.post('https://api.smspool.net/request/active', form, { headers });

    const activeOrders = response.data;

    for (const order of activeOrders) {
      if (orderCodes.includes(order.order_code)) {
        if (order.status === 'completed') {
          try {
            await db.query(
              'UPDATE sms_order SET code = $1, status = $2 WHERE order_id = $3',
              [order.code, 'complete', order.order_code]
            );
            notifyOrderStatusChange(order);
            console.log(`Order updated to complete with code`);
          } catch (dbError) {
            console.error(`Error updating order ${order.order_code}:`, dbError);
          }
        }
      }
    }

    // Filter only pending orders to return
    const filteredOrders = activeOrders.filter(order => 
      (order.status === 'pending' || order.status === 'completed' || order.status === 'expired') 
      && orderCodes.includes(order.order_code));
    return filteredOrders;
  } catch (error) {
    console.error('Error fetching and filtering data:', error);
    return [];
  }
};

const notifyOrderStatusChange = (order) => {
  io.emit('orderStatusUpdated', order);
};

const fetchAndFilterExpiredOrders = async (orderCodes) => {
  try {
    const form = new FormData();
    form.append('key', BEARER_TOKEN);

    const headers = {
      ...form.getHeaders(),
      'Authorization': `Bearer ${BEARER_TOKEN}`,
    };

    const response = await axios.post('https://api.smspool.net/request/history', form, { headers });
    const orders = response.data; // Ensure this matches the actual response format from the API

    for (const order of orders) {
      if (orderCodes.includes(order.order_code)) {
        try {
          const orderResult = await db.query(
            'SELECT status, amount, user_id FROM sms_order WHERE order_id = $1',
            [order.order_code]
          );

          if (orderResult.rows.length > 0) {
            const { status, amount, user_id } = orderResult.rows[0];
            const refundAmount = Number(amount);

            // Skip orders already marked as refunded
            if (status === 'refunded') {
              continue;
            }

            if (order.status === 'refunded') {
              // Update order status to refunded and add balance to user's account
              await db.query('UPDATE sms_order SET status = $1 WHERE order_id = $2', ['refunded', order.order_code]);
              await db.query('UPDATE userprofile SET balance = balance + $1 WHERE id = $2', [refundAmount, user_id]);

              // Insert refund notification
              await db.query(
                'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
                [user_id, 'refund', `Your order ${order.order_code} has been refunded. Amount: ₦${refundAmount}`]
              );

              console.log(`Refund issued for order ${order.order_code}`);
            }

            if (order.status === 'expired') {
              await db.query('UPDATE sms_order SET status = $1 WHERE order_id = $2', [order.status, order.order_code]);
            }
          }
        } catch (dbError) {
          console.error(`Error updating order ${order.order_code} in the database:`, dbError);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching and filtering data:', error.response?.data || error.message);
  }
};

cron.schedule('* * * * *', async () => {

  try {
    const userIds = await fetchAllUserIds();
    for (const userId of userIds) {
      const orderCodes = await fetchOrderCodesForUser(userId);
      await fetchAndFilterActiveOrders(orderCodes);
      await fetchAndFilterExpiredOrders(orderCodes);
    }
  } catch (error) {
    console.log(error);
    console.error('Error during scheduled task:', error);
  }
});

const getPhoneNumbersByStatus = async (userId) => {
  try {
    const pendingResult = await db.query(
      'SELECT * FROM sms_order WHERE user_id = $1 AND status = $2',
      [userId, 'pending']
    );
    const completedResult = await db.query(
      'SELECT * FROM sms_order WHERE user_id = $1 AND status = $2',
      [userId, 'complete']
    );
    const expiredResult = await db.query(
      'SELECT * FROM sms_order WHERE user_id = $1 AND status = $2',
      [userId, 'expired']
    );


    return {
      pendingNumbers: pendingResult.rows,
      completedNumbers: completedResult.rows,
      expiredNumbers: expiredResult.rows
    };
  } catch (error) {
    console.log(error);
    console.error('Error fetching phone numbers by status:', error);
    return { pendingNumbers: [], completedNumbers: [],  expiredNumbers: []};
  }
};

router.get("/sms/check", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    const orderCodes = await fetchOrderCodesForUser(userId);
    const filteredOrders = (await fetchAndFilterActiveOrders(orderCodes)).slice(0, 8);
    const { pendingNumbers, completedNumbers, expiredNumbers } = await getPhoneNumbersByStatus(userId);

    const allNumbers = [...pendingNumbers, ...completedNumbers, ...expiredNumbers];

    res.json({ filteredOrders, allNumbers });

  } catch (error) {
    console.log(error);
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

router.post("/sms/cancel", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const orderId = req.body.orderId;

  if (!orderId) {
    return res.status(400).json({ success: false, message: 'Order ID is required' });
  }

  try {
    // Check if the order exists and is eligible for refund
    const orderResult = await db.query('SELECT * FROM sms_order WHERE order_id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];
    
    if (order.status !== 'pending' && order.status !== 'expired') {
      return res.status(400).json({ success: false, message: 'Order is not eligible for refund' });
    }

    const form = new FormData();
    form.append('orderid', orderId);

    const headers = {
      ...form.getHeaders(),
      'Authorization': `Bearer ${BEARER_TOKEN}`

    };

    const response = await axios.post('https://api.smspool.net/sms/cancel', form, { headers });

    const cancelOrders = response.data;

    if (cancelOrders.success !== 1) {
      return res.status(400).json({ success: false, message: 'Your order cannot be cancelled yet, please try again later.' });
    }

    await db.query('UPDATE sms_order SET status = $1 WHERE order_id = $2', ['refunded', orderId]);

    const orderAmount = Number(order.amount);

    const updateBalanceQuery = 'UPDATE userprofile SET balance = balance + $1 WHERE id = $2';
    await db.query(updateBalanceQuery, [orderAmount, userId]);

    await db.query(`
      INSERT INTO notifications (user_id, type, message) 
      VALUES ($1, $2, $3)`, 
      [userId, 'purchase', 
        `The order ${orderId} has been cancelled, and you have been refunded ${orderAmount}` 
      ])

    return res.json({ success: true, message: 'The order has been cancelled, and you have been refunded.' });
    

  } catch (error) {
    console.error('Error fetching data:', error);
    return res.status(500).json({ success: false, message: `${error.response.data.message}` });
  }
})

router.post("/sms/resend", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const orderId = req.body.orderId;


  if (!orderId) {
    return res.status(400).json({ success: false, message: 'Order ID is required' });
  }

  try {
    // Check if the order exists and is eligible for refund
    const orderResult = await db.query('SELECT * FROM sms_order WHERE order_id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const form = new FormData();
    form.append('orderid', orderId);

    const headers = {
      ...form.getHeaders(),
      'Authorization': `Bearer ${BEARER_TOKEN}`

    };

    const response = await axios.post('https://api.smspool.net/sms/resend', form, { headers });

    const resend = response.data;

    if ( resend.success !== 1) {
      return res.status(400).json({ success: false, message: `${resend.message}` });
    }

    const rateResult = await db.query('SELECT rate FROM miscellaneous WHERE id = 1');

    const rate = rateResult.rows[0].rate

    const orderCharge = resend.charge * rate;

    const charge = resend.charge === 0 ? 0 : Math.floor(orderCharge + 500);

    if (charge > 0) {
      const updateBalanceQuery = 'UPDATE userprofile SET balance = balance - $1 WHERE id = $2';
      await db.query(updateBalanceQuery, [charge, userId]);
    }

    await db.query('UPDATE sms_order SET status = $1, cost = $2, amount = $3 WHERE order_id = $4', ['pending',  resend.charge, charge, resend.order_id]);

    return res.json({ success: true, message: `${resend.message}` });

  } catch (error) {
    return res.status(400).json({ success: false, message: error.response ? error.response.data.message : error.message });
  }
})

router.post("/ordersms", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { country, service, pricing_option, quantity, charge } = req.body;
  const displaycharge1 = Number(req.body.displaycharge1);

  try {
    await db.query('BEGIN');

    const result = await db.query('SELECT balance FROM userprofile WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user || user.balance < displaycharge1) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: 'Insufficient balance, please top up your balance' });
    }

      const form = new FormData();
      form.append('country', country);
      form.append('service', service);
      form.append('pricing_option', pricing_option);
      form.append('quantity', quantity);

      const headers = {
        ...form.getHeaders(),  
        'Authorization': `Bearer ${BEARER_TOKEN}`

      };

      const response = await axios.post('https://api.smspool.net/purchase/sms', form, { headers });
      const data = response.data;

      const orderResult = await db.query("INSERT INTO sms_order (user_id, phone_number, order_id, country, service, cost, amount) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [userId, data.phonenumber, data.order_id, data.country, data.service, charge, displaycharge1])

        if (orderResult.rowCount === 0) {
          await db.query('ROLLBACK');
          return res.status(500).json({ error: 'Failed to record the order.' });
        }

        await db.query(`
          INSERT INTO notifications (user_id, type, message) 
          VALUES ($1, $2, $3)`, 
          [userId, 'purchase', 
            `You purchase a Phone Number for ${data.service} Verification with the order id ${data.order_id} Amount: ₦${displaycharge1}` 
          ])

      await db.query('UPDATE userprofile SET balance = balance - $1 WHERE id = $2', [displaycharge1, userId]);

      await db.query('COMMIT');

      return res.json({ message: data.message});

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error processing order:', error);

    if (error.response) {
      const errType = error.response.data.type;

    if (errType === "BALANCE_ERROR") {
      return res.status(400).json({ error: 'Service currently unavailable, try later or contact support' });
    } else if (errType === "OUT_OF_STOCK") {
      return res.status(400).json({ error: error.response.data.errors?.message || 'Out of stock' });
    } else if (errType === "PRICE_NOT_FOUND") {
      return res.status(400).json({ error: error.response.data[0]?.message || 'Price not found' });
    } else {
      return res.status(400).json({ error: error.response.data?.message || 'Unknown error' });
    }
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      return res.status(500).json({ error: 'Network error, try again later' });
    } else {
      console.error('Error setting up request:', error.message);
      return res.status(500).json({ error: 'Error setting up request' });
    }
  }
});


export default router;