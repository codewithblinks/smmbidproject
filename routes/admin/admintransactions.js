import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";


router.get("/admin/deposits", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;


        const transactionsResult = await db.query("SELECT * FROM transactions WHERE type = 'deposit' ORDER BY created_at DESC LIMIT $1 OFFSET $2",[limit, offset])
        const transactions =transactionsResult.rows;

        transactions.forEach(transactions => {
            transactions.created_at = moment(transactions.created_at).format('D MMM h:mmA');
            transactions.amount = numeral(transactions.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM transactions WHERE transactions.type = 'deposit'";
        const countResult = await db.query(countQuery);
        const totalTransactions = parseInt(countResult.rows[0].count);

        res.render("admin/deposits", {
          transactions,
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit), user
        })
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/withdrawals", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;


        const transactionsResult = await db.query("SELECT * FROM transactions WHERE type = 'withdraw' ORDER BY created_at DESC LIMIT $1 OFFSET $2",[limit, offset])
        const transactions =transactionsResult.rows;

        transactions.forEach(transactions => {
            transactions.created_at = moment(transactions.created_at).format('D MMM h:mmA');
            transactions.amount = numeral(transactions.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM transactions WHERE transactions.type = 'withdraw'";
        const countResult = await db.query(countQuery);
        const totalTransactions = parseInt(countResult.rows[0].count);

        res.render("admin/withdraws", {
          transactions,
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit), user
        })
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/pending-deposit", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;


        const transactionsResult = await db.query(`
        SELECT pending_deposits.*, 
        transactions.reference AS transactions_ref,
        transactions.type AS type
        FROM pending_deposits
        JOIN transactions 
        ON pending_deposits.reference = transactions.reference
        WHERE pending_deposits.status = 'Pending'
        ORDER BY pending_deposits.created_at DESC 
        LIMIT $1 OFFSET $2`,[limit, offset])
        const transactions =transactionsResult.rows;

        transactions.forEach(transactions => {
            transactions.created_at = moment(transactions.created_at).format('D MMM h:mmA');
            transactions.amount = numeral(transactions.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM pending_deposits WHERE pending_deposits.status = 'pending'";
        const countResult = await db.query(countQuery);
        const totalTransactions = parseInt(countResult.rows[0].count);

        res.render("admin/pendingDeposit", {
          transactions,
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit), user
        })
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/admin/deposits/:id/approve', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const depositId = req.params.id;

  try {
      await db.query("UPDATE deposits SET status = 'Approved', verified_by_admin = TRUE WHERE id = $1", [depositId]);
      res.redirect('/admin/deposits');
  } catch (err) {
      console.error('Error updating deposit status:', err);
      res.status(500).send('Error updating deposit status');
  }
});

router.post('/admin/deposits/:id/reject', async (req, res) => {
  const depositId = req.params.id;

  try {
      await db.query("UPDATE deposits SET status = 'Rejected' WHERE id = $1", [depositId]);
      res.redirect('/admin/deposits');
  } catch (err) {
      console.error('Error updating deposit status:', err);
      res.status(500).send('Error updating deposit status');
  }
});



export default router;