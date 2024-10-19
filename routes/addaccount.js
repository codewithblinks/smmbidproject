import express from "express";
import db from "../db/index.js";
const router = express.Router();
import flash from "connect-flash";
import crypto from "crypto";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";




function generateRandomData() {
  const randomWord = crypto.randomBytes(4).toString('hex');
  const randomNumber = Math.floor(Math.random() * 100);
  return `${randomWord}-${randomNumber}`;
}

router.get("/add", ensureAuthenticated, userRole,  async(req, res) => {
  const userId = req.user.id;
  const data = generateRandomData();
  try {

    const p2pmarketEnabledReslt = await db.query(`
      SELECT p2pmarket_enabled 
      FROM miscellaneous WHERE id = $1
      `, [1])

      const p2pmarketEnabled = p2pmarketEnabledReslt.rows[0].p2pmarket_enabled;

      if(!p2pmarketEnabled) {
        req.flash("error", "Listing of accounts disabled at the moment");
        return res.redirect("/dashboard");
      }

      const userResult = await db.query('SELECT * FROM userprofile WHERE id = $1', [userId]);
      const userDetails = userResult.rows[0];

      const notificationsResult = await db.query(
        'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
        [userId, false]
    );
  
      const notifications = notificationsResult.rows;

      const userBalanceResult = await db.query("SELECT balance FROM userprofile WHERE id = $1", [userId]);
      const userBalance = Number(userBalanceResult.rows[0].balance);
  
      if (userBalance >= 5) {
        if (!userDetails) {
          return res.status(404).json({ error: 'User not found' });
        }
        res.render('addaccount.ejs', {messages: req.flash(), user: userDetails, word: data, notifications, timeSince  });
        
      } else {
        req.flash("error", "You must have a minimum available balance of ₦ 5000 before you can list an account for sale.");
        res.redirect("/dashboard");
      }
  
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

router.post("/add", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const {
    accountUsername,
    option1,
    years,
    url,
    country,
    price,
    followers,
    description,
    loginusername,
    loginemail,
    loginpassword,
    logindetails,
    verifycode,
  } = req.body;
  const statustype = loginusername && loginemail && loginpassword && logindetails ? 'instant' : 'manual';
  const payment = (price * 80) / 100 ;
  

  try {
    const result = await db.query(
      "INSERT INTO product_list (account_username, account_type, years, profile_link, account_country, amount, total_followers, description, user_id, payment_recieved, loginusername, loginemail, loginpassword, logindetails, verifycode, statustype ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16 ) RETURNING *",
      [
        accountUsername,
        option1,
        years,
        url,
        country,
        price,
        followers,
        description,
        userId,
        payment,
        loginusername,
        loginemail,
        loginpassword,
        logindetails,
        verifycode,
        statustype
      ]
    );
    req.flash("success", "Account listed successfully, wait for approval from Admin");
    res.redirect("/add");
  } catch (error) {
    console.log(error);
    req.flash("error", "Error: listing account was not successfully");
    return res.redirect("/add");
  }
});

export default router;
