import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated from "../authMiddleware/authMiddleware.js"


  router.get('/chat/:productId/:receiverId', ensureAuthenticated, async (req, res) => {
    const { productId, receiverId } = req.params;
    const senderId = req.user.id; // Assuming the user is logged in
    const messagesResult = await db.query(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND receiver_id = $2 AND product_id = $3) 
          OR (sender_id = $2 AND receiver_id = $1 AND product_id = $3) 
       ORDER BY created_at`,
      [senderId, receiverId, productId]
    );
    res.render('chatpage', { messages: messagesResult.rows, senderId, receiverId, productId });
  });
  
  router.get('/chat', ensureAuthenticated, async (req, res) => {
    const { productId, receiverId } = req.params;
    const senderId = req.user.id; // Assuming the user is logged in
    const messagesResult = await db.query(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND receiver_id = $2 AND product_id = $3) 
          OR (sender_id = $2 AND receiver_id = $1 AND product_id = $3) 
       ORDER BY created_at`,
      [senderId, receiverId, productId]
    );
    res.render('chatpage', { messages: messagesResult.rows, senderId, receiverId, productId });
  });
  



export default router;