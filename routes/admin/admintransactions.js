import express from "express";
import db from "../../db/index.js"
import{adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"
import numeral from "numeral";
import moment from "moment";
import crypto from "crypto";
import { sendDepositApproveEmail, sendDepositRejectedEmail } from "../../config/emailMessages.js";

const router = express.Router();

function generateTransactionReference() {
  const prefix = "#CRE";
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 2);
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${timestamp}${randomPart}`;
}

router.get("/admin/deposits", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;


        const transactionsResult = await db.query("SELECT * FROM transactions WHERE type IN ('deposit', 'debit')  ORDER BY created_at DESC LIMIT $1 OFFSET $2",[limit, offset])
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
          totalPages: Math.ceil(totalTransactions / limit), user, messages: req.flash()
        })
  } catch (error) {
    console.error("Error getting admin deposits page", error);
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
        const transactions = transactionsResult.rows;

        transactions.forEach(transactions => {
            transactions.created_at = moment(transactions.created_at).format('D MMM h:mmA');
            transactions.amount = numeral(transactions.amount).format("0,0.00");
        })

        const countQuery = "SELECT COUNT(*) FROM pending_deposits WHERE pending_deposits.status = 'Pending'";
        const countResult = await db.query(countQuery);
        const totalTransactions = parseInt(countResult.rows[0].count);

        res.render("admin/pendingDeposit", {
          transactions,
          currentPage: page,
          totalPages: Math.ceil(totalTransactions / limit), user, messages: req.flash()
        })
  } catch (error) {
    console.error("Error fetching pending deposits:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/deposits/:id/approve', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const depositId = req.params.id;

  try {
    await db.query('BEGIN');

    const pendingTransQuery = await db.query(`
        UPDATE pending_deposits 
        SET status = 'Approved', 
        verified_by_admin = TRUE 
        WHERE id = $1 
        RETURNING amount, reference, user_id
        `, 
        [depositId]);

        if (pendingTransQuery.rows.length === 0) {
          await db.query('ROLLBACK');
          return res.status(404).send('Deposit not found.');
        }

        const {reference, user_id} = pendingTransQuery.rows[0];
        const rawAmount = pendingTransQuery.rows[0].amount;
        const amount = Number(rawAmount);

        if (isNaN(amount)) {
          console.error('Invalid amount:', rawAmount);
          await db.query('ROLLBACK');
          return res.status(400).send('Invalid deposit amount.');
        }

        const transactionUpdate = await db.query(`
          UPDATE transactions 
          SET status = 'success'
          WHERE user_id = $1 
          And reference = $2
          `, 
          [user_id, reference]);
          
          if (transactionUpdate.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).send('Transaction not found.');
          }

          const userResult = await db.query(`
            UPDATE userprofile 
            SET balance = balance + $1 
            WHERE id = $2 
            RETURNING username, email
          `, [amount, user_id]);

          if (userResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).send('User profile not found.');
          }
        
          const { username, email } = userResult.rows[0];

          await db.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)", 
            [user_id, 'deposit', `Your deposit of ₦${amount} was successfull and the amount credited into your balance` ])

            const depositCount = await db.query('SELECT COUNT(*) FROM deposits WHERE user_id = $1', [user_id]);
            const depositNumber = Number(depositCount.rows[0].count) + 1;

            if (depositNumber <= 3) {
              await db.query('INSERT INTO deposits (user_id, amount, deposit_number) VALUES ($1, $2, $3)', [user_id, amount, depositNumber]);
      
              const referral = await db.query('SELECT referred_by, commission_earned FROM referrals WHERE referred_user = $1', [user_id]);
      
              if (referral.rows.length > 0 && !referral.rows[0].commission_earned) {
                const referredBy = referral.rows[0].referred_by;
      
                let commissionPercentage = depositNumber === 1 ? 0.10 : depositNumber === 2 ? 0.06 : depositNumber === 3 ? 0.03 : 0;
      
                if (commissionPercentage > 0) {
                  const commissionAmount = amount * commissionPercentage;
                  await db.query(
                    'INSERT INTO commissions (user_id, referred_user_id, deposit_number, commission_amount) VALUES ($1, $2, $3, $4)',
                    [referredBy, user_id, depositNumber, commissionAmount]
                  );
                }
      
                if (depositNumber === 3) {
                  await db.query('UPDATE referrals SET commission_earned = TRUE WHERE referred_user = $1', [user_id]);
                }
              }
            }

            await db.query('DELETE FROM pending_deposits WHERE id = $1', [depositId]);

            await sendDepositApproveEmail(email, username, reference, amount);

            await db.query('COMMIT');

            req.flash("success", "You have succesfully approve this deposit.");

           res.redirect('/admin/pending-deposit');

  } catch (err) {
      await db.query('ROLLBACK');
      console.error('Error updating deposit status:', err);
      res.status(500).send('Error updating deposit status');
  }
});

router.post('/admin/deposits/:id/reject', async (req, res) => {
  const depositId = req.params.id;

  try {

      const pendingTransQuery = await db.query(`
        UPDATE pending_deposits 
        SET status = 'Rejected'
        WHERE id = $1 RETURNING amount, reference, user_id
        `, 
        [depositId]);

        if (pendingTransQuery.rows.length === 0) {
          return res.status(404).send('Deposit not found.');
        }

        const {reference, user_id} = pendingTransQuery.rows[0];
        const amount = Number(pendingTransQuery.rows[0].amount);

        await db.query(`
          UPDATE transactions 
          SET status = $1
          WHERE user_id = $2 
          And reference = $3
          `, 
          ['canceled', user_id, reference]);

          await db.query("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)", 
            [user_id, 'deposit', `Your deposit of ₦${amount} was canceled and no amount was credited into your balance` ])

            await db.query('DELETE FROM pending_deposits WHERE id = $1', [depositId]);

            const userQuery = await db.query(`
              SELECT username, email FROM userprofile 
              WHERE id = $1
              `, [user_id])

              if(userQuery.rows.length === 0) {
                return res.status(404).send('User not found.');
              }

              const { username, email } = userQuery.rows[0];

            await sendDepositRejectedEmail(email, username, reference, amount);

            req.flash("success", "You have succesfully rejected this deposit.");

             res.redirect('/admin/pending-deposit');
  } catch (err) {
      console.error('Error rejecting deposit:', err);
      res.status(500).send('Error updating deposit status');
  }
});

router.get('/admin/view-deposit/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT proof_image FROM pending_deposits WHERE id = $1', [id]);

    if (result.rows.length === 0) return res.status(404).send('Image not found');

    const proofImage = result.rows[0].proof_image;
    res.contentType('image/png');
    res.send(proofImage);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving image');
  }
});

router.post("/api/admin/update/payment", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const email = req.body.email;
  const userEmailLowerCase = email.toLowerCase();

  try {

    const UserResult = await db.query(`
      SELECT * FROM userprofile 
      WHERE email = $1 
      AND email_verified = $2 
      AND is_suspended = $3`, [userEmailLowerCase, true, false]);
  
      if (UserResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = UserResult.rows[0];

    res.json(user);
  } catch (error) {
    console.error("Error getting user details", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put("/api/admin/update/payment", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const { userType, useremail } = req.body;
  const updatedBalance = Number(req.body.updatedBalance);
  const transactionReference = generateTransactionReference()

  if (!updatedBalance || !userType || !useremail) {
    return res.status(400).json({
      error: 'Missing required fields. Please provide updatedBalance, userType, and useremail.',
    });
  }

  if (isNaN(updatedBalance)) {
    return res.status(400).json({
      error: 'Updated balance must be a valid number.',
    });
  }

  try {
    let result;

    if (userType === 'credit') {
      result = await db.query(`
        UPDATE userprofile 
        SET balance = balance + $1 
        WHERE email = $2 
        RETURNING *
      `, [updatedBalance, useremail]);
    } else if (userType === 'debit') {
      result = await db.query(`
        UPDATE userprofile 
        SET balance = balance - $1 
        WHERE email = $2 
        RETURNING *
      `, [updatedBalance, useremail]);
    } else {
      return res.status(400).json({
        error: 'Invalid userType. Please provide either "credit" or "debit".',
      });
    }

    if (result.rows.length === 0) {
      return res.status(404).send("User not found or balance not updated");
    }

    const returnedData = result.rows[0];
    
    let addTransactionQuery

  if (userType === 'credit') {
    addTransactionQuery = `
    INSERT INTO transactions 
    (user_id, type, amount, reference, status)
    VALUES ($1, $2, $3, $4, $5)
  `;
  await db.query(addTransactionQuery, 
    [returnedData.id, 'deposit', updatedBalance,
       transactionReference, 'success']);
  } else if (userType === 'debit') {
    addTransactionQuery = `
    INSERT INTO transactions 
    (user_id, type, amount, reference, status)
    VALUES ($1, $2, $3, $4, $5)
  `;
  await db.query(addTransactionQuery, 
    [returnedData.id, 'debit', updatedBalance,
       transactionReference, 'success']);
  } else {
    return res.status(400).json({
      error: 'Invalid userType. Please provide either "credit" or "debit".',
    });
  }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating balance:", error);
    res.status(500).send("Server error");
  }
});



export default router;