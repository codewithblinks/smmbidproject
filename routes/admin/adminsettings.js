import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import ensureAuthenticated, {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"

router.get('/admin/settings', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;
  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const rateResult = await db.query("SELECT * FROM Miscellaneous WHERE id = $1", [1]);
    const rate = rateResult.rows[0];

    res.render('admin/adminsettings', {rate, user});
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
  
});

router.post('/admin/rates', adminEnsureAuthenticated, adminRole, async (req, res) => {
    const userId = req.params.id;
    const rate = req.body.rate

    try {
        await db.query("UPDATE Miscellaneous SET rate = $1 WHERE id = 1", [rate])

        res.redirect('/admin/settings');
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/admin/email', adminEnsureAuthenticated, adminRole, async (req, res) => {
    const email = req.body.email;
    const pass = req.body.pass;

    try {
        await db.query("UPDATE miscellaneous SET smtp_email = $1 AND smtp_pass = $2 WHERE id = 1", [email, pass])

        res.redirect('/admin/settings');
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/admin/insert/email', adminEnsureAuthenticated, adminRole, async (req, res) => {
    const email = req.body.email;
    const pass = req.body.pass;

    try {
        await db.query("INSERT INTO miscellaneous (smtp_email, smtp_pass) VALUES ($1, $2)", [email, pass])

        res.redirect('/admin/settings');
    } catch (error) {
      console.log(error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/admin/sms/price', adminEnsureAuthenticated, adminRole, async (req, res) => {
    const sms_price = req.body.sms_price;

    try {
        await db.query("UPDATE miscellaneous SET sms_price = $1 WHERE id = 1", [sms_price])
        res.redirect('/admin/settings');
    } catch (error) {
      console.log(error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/exchange-rate', ensureAuthenticated, async (req, res) => {
    try {
      const result = await db.query('SELECT rate FROM Miscellaneous WHERE id = 1');
      if (result.rows.length > 0) {
        res.json({ rate: result.rows[0].rate });
      } else {
        res.status(404).json({ error: 'Exchange rate not found' });
      }
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/sms-price', ensureAuthenticated, async (req, res) => {
    try {
      const result = await db.query('SELECT sms_price FROM Miscellaneous WHERE id = 1');
      if (result.rows.length > 0) {
        res.json({ smsprice: result.rows[0].sms_price });
      } else {
        res.status(404).json({ error: 'Exchange rate not found' });
      }
    } catch (error) {
       console.log(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

export default router;