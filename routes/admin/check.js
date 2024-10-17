import express from "express";
import db from "../../db/index.js"
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js";

const router = express.Router();

router.post('/admin/suspend-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query('UPDATE userprofile SET is_suspended = TRUE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/unsuspend-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query('UPDATE userprofile SET is_suspended = FALSE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/lock-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;

  try {
    await db.query('UPDATE userprofile SET is_locked = TRUE WHERE id = $1', [userId]);
    res.redirect('/admin/users/list');
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/unlock-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query('UPDATE userprofile SET is_locked = FALSE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/delete-user/:id', adminEnsureAuthenticated, adminRole, async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query(`
      DELETE FROM userprofile
      WHERE id = $1 AND email_verified = $2;

      `, [userId, false]);
  res.redirect('/admin/users/list/unverified');
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;