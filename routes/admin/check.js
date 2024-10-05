import express from "express";
import db from "../../db/index.js"
const router = express.Router();
import ensureAuthenticated, {adminEnsureAuthenticated} from "../../authMiddleware/authMiddleware.js"

router.post('/admin/suspend-user/:id', async (req, res) => {
  const userId = req.params.id;
  await db.query('UPDATE userprofile SET is_suspended = TRUE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
});

router.post('/admin/unsuspend-user/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query('UPDATE userprofile SET is_suspended = FALSE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/lock-user/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    await db.query('UPDATE userprofile SET is_locked = TRUE WHERE id = $1', [userId]);
    res.redirect('/admin/users/list');
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/unlock-user/:id', async (req, res) => {
  const userId = req.params.id;
  await db.query('UPDATE userprofile SET is_locked = FALSE WHERE id = $1', [userId]);
  res.redirect('/admin/users/list');
});

router.post('/admin/delete-user/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    await db.query(`
      DELETE FROM userprofile
      WHERE id = $1 AND email_verified = $2;

      `, [userId, false]);
  res.redirect('/admin/users/list/unverified');
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});



export default router;