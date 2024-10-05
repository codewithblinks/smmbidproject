import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";


router.get("/admin/deposits", adminEnsureAuthenticated, adminRole, async (req, res) => {

  try {

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;


        const transactionsResult = await db.query("SELECT * FROM transactions WHERE type = 'deposit' ORDER BY created_at DESC LIMIT $1 OFFSET $2",[limit, offset])
        const transactions =transactionsResult.rows;

        transactions.forEach(transactions => {
            transactions.created_at = moment(transactions.created_at).format('D MMM h:mmA');
            transactions.amount = numeral(transactions.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM transactions";
        const countResult = await db.query(countQuery);
        const totalTransactions = parseInt(countResult.rows[0].count);

        res.render("admin/deposits", {
          transactions,
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit),
        })
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/admin/withdrawals", adminEnsureAuthenticated, adminRole, async (req, res) => {

  try {

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;


        const transactionsResult = await db.query("SELECT * FROM transactions WHERE type = 'withdraw' ORDER BY created_at DESC LIMIT $1 OFFSET $2",[limit, offset])
        const transactions =transactionsResult.rows;

        transactions.forEach(transactions => {
            transactions.created_at = moment(transactions.created_at).format('D MMM h:mmA');
            transactions.amount = numeral(transactions.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM transactions";
        const countResult = await db.query(countQuery);
        const totalTransactions = parseInt(countResult.rows[0].count);

        res.render("admin/withdraws", {
          transactions,
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit),
        })
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;