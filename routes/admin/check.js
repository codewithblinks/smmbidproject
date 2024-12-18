import express from "express";
import db from "../../db/index.js"
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js";

const router = express.Router();

router.post('/admin/suspend-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    if (!userId) {
      return res.status(400).json({ message: 'Invalid or missing ID.' });
    }
    
  const suspendedUserQuery =  await db.query('UPDATE userprofile SET is_suspended = TRUE WHERE id = $1 RETURNING firstname, lastname', [userId]);

  if (suspendedUserQuery.rows.length === 0) {
    return res.status(400).json({ message: 'User not found or already suspended.' });
  }

  const {firstname, lastname} = suspendedUserQuery.rows[0];
  return res.json({ message: `User ${firstname} ${lastname} has been suspended`});
  } catch (error) {
    console.error("Error suspending user", error);
    res.status(500).json({ message: 'An error occurred. Please try again.' });
  }
});

router.post('/admin/unsuspend-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {

    if (!userId) {
      return res.status(400).json({ message: 'Invalid or missing ID.' });
    }

    const suspendedUserQuery = await db.query('UPDATE userprofile SET is_suspended = FALSE WHERE id = $1 RETURNING firstname, lastname', [userId]);

    if (suspendedUserQuery.rows.length === 0) {
      return res.status(400).json({ message: 'User not found or already unsuspended.' });
    }

    const {firstname, lastname} = suspendedUserQuery.rows[0];
    return res.json({ message: `User ${firstname} ${lastname} has been unsuspended`});
  } catch (error) {
    console.error("Error unsuspending user", error);
    res.status(500).json({ message: 'An error occurred. Please try again.' });
  }
});

router.post('/admin/lock-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;

  try {
    await db.query('UPDATE userprofile SET is_locked = TRUE WHERE id = $1', [userId]);
    res.redirect('/admin/users/list');
  } catch (error) {
    console.error("Error locking user", error);;
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/unlock-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query('UPDATE userprofile SET is_locked = FALSE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
  } catch (error) {
    console.error("Error unlocking user", error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

router.post('/admin/delete-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query(`
      DELETE FROM userprofile
      WHERE id = $1 AND email_verified = $2;

      `, [userId, false]);
  res.redirect('/admin/users/list/unverified');
  } catch (error) {
    console.log("Error deleting unverified user:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});;

export default router;