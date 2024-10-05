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

  } catch (err) {
    console.error(err.message);
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
    form.append('key', '');

    const headers = {
      ...form.getHeaders(),
      'Authorization': `Bearer ${BEARER_TOKEN}`

    };

    const response = await axios.post('https://api.smspool.net/request/active', form, { headers });

    const activeOrders = response.data;

    for (const order of activeOrders) {
      if (orderCodes.includes(order.order_code)) {
        if (order.status === 'completed') {
          // Update database with verification code and status
          await db.query(
            'UPDATE sms_order SET code = $1, status = $2 WHERE order_id = $3',
            [order.code, 'complete', order.order_code]
          );
          notifyOrderStatusChange(order);
          console.log(`Order updated to complete with code`);
        }
      }

    }

    // Filter only pending orders to return
    const filteredOrders = activeOrders.filter(order => order.status === 'pending' || order.status === 'completed' && orderCodes.includes(order.order_code));
    return filteredOrders;
  } catch (error) {
    console.error('Error fetching and filtering data:', error);
    return [];
  }
};

const notifyOrderStatusChange = (order) => {
  io.emit('orderStatusUpdated', order);
};

cron.schedule('*/2 * * * *', async () => {

  try {
    const userIds = await fetchAllUserIds();
    for (const userId of userIds) {
      const orderCodes = await fetchOrderCodesForUser(userId);
      const filteredOrders = await fetchAndFilterActiveOrders(orderCodes);
    }
  } catch (error) {
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

    return {
      pendingNumbers: pendingResult.rows,
      completedNumbers: completedResult.rows,
    };
  } catch (err) {
    console.error('Error fetching phone numbers by status:', err);
    return { pendingNumbers: [], completedNumbers: [] };
  }
};

router.get("/sms/check", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    const orderCodes = await fetchOrderCodesForUser(userId);
    const filteredOrders = await fetchAndFilterActiveOrders(orderCodes);
    const { pendingNumbers, completedNumbers } = await getPhoneNumbersByStatus(userId);

    const allNumbers = [...pendingNumbers, ...completedNumbers];

    res.json({ filteredOrders, allNumbers });

  } catch (error) {
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
    if (order.status !== 'pending') {
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

    const updateBalanceQuery = 'UPDATE userprofile SET balance = balance + $1 WHERE id = $2';
    await db.query(updateBalanceQuery, [order.amount, userId]);

    return res.json({ success: true, message: 'The order has been cancelled, and you have been refunded.' });

  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    const order = orderResult.rows[0];

    const rateResult = await db.query('SELECT rate FROM miscellaneous WHERE id = 1');

    const rate = rateResult.rows[0].rate

    const orderCharge = order.charge * rate;

    const charge = Math.floor(orderCharge + 500); 

    const updateBalanceQuery = 'UPDATE userprofile SET balance = balance - $1 WHERE id = $2';
    await db.query(updateBalanceQuery, [charge, userId]);

    return res.json({ success: true, message: `${resend.message}` });

  } catch (error) {
    return res.status(400).json({ success: false, message: error.response ? error.response.data.message : error.message });
  }
})

router.post("/ordersms", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { country, service, pricing_option, quantity, charge } = req.body;

  const displaycharge1 = Number(req.body.displaycharge1);


  console.log(quantity)


  try {
    const result = await db.query('SELECT balance FROM userprofile WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (user.balance >= displaycharge1) {

      const form = new FormData();
      form.append('country', country);
      form.append('service', service);
      form.append('pricing_option', pricing_option);
      form.append('quantity', quantity);

      const headers = {
        ...form.getHeaders(),  // Include form data headers
        'Authorization': `Bearer ${BEARER_TOKEN}`

      };

      const response = await axios.post('https://api.smspool.net/purchase/sms', form, { headers });

      const data = response.data;

      db.query("INSERT INTO sms_order (user_id, phone_number, order_id, country, service, cost, amount) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [userId, data.phonenumber, data.order_id, data.country, data.service, charge, displaycharge1])

      const updateBalanceQuery = 'UPDATE userprofile SET balance = balance - $1 WHERE id = $2';
      await db.query(updateBalanceQuery, [displaycharge1, userId]);

      req.flash('success', `${data.message}`)
      res.redirect('/verification')
    } else {
      req.flash('error', 'Insufficient balance, please topup your balance');
      return res.redirect('/verification');
    }

  } catch (error) {

    if (error.response) {
      if (error.response.data.type === "BALANCE_ERROR") {
        req.flash('error', 'Service currently unavailable, Try later or contact support')
        res.redirect('/verification')
      } else {
        if (error.response.data.type === "OUT_OF_STOCK") {
          req.flash('error', `${error.response.data.errors.message}`)
          res.redirect('/verification')
        } else {
          if (error.response.data.type === "PRICE_NOT_FOUND") {
            req.flash('error', `${error.response.data[0].message}`)
            res.redirect('/verification')
          } else {
            if (error.response.data) {
              req.flash('error', `${error.response.data.message}`)
              res.redirect('/verification')
            }
          }
        }
      }

    } else if (error.request) {
      console.error('No response received from API:', error.request);
      // res.status(500).json({ error: 'No response received from API' });
      req.flash('error', "error from the network, try later")
      res.redirect('/verification')
    } else {
      console.log('3')
      console.error('Error setting up request:', error.message);
      res.status(500).json({ error: 'Error setting up request' });
    }
  }
});


export default router;