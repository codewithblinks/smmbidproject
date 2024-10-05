import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated from "../authMiddleware/authMiddleware.js"




router.get('/messages/:userId/:chatUserId', ensureAuthenticated, async (req, res) => {
  const { userId, chatUserId } = req.params;
  const { rows } = await db.query(
    'SELECT * FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY created_at ASC',
    [userId, chatUserId]
  );
  res.json(rows);
});
  
  
  // Send a message
  router.post('/messages', ensureAuthenticated, async (req, res) => {
    const { senderId, receiverId, productId, content } = req.body;
    try {
      await db.query(
        'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3)',
        [senderId, receiverId, productId, content]
      );
      res.redirect(`/product/${productId}`);
    } catch (error) {
      res.status(500).send('Error fetching messages');
    }
   });


 router.get('/notifications/:userId', ensureAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const { rows } = await db.query('SELECT * FROM notifications WHERE user_id = $1', [userId]);
    res.json(rows);
  });


export default router;