import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated from "../authMiddleware/authMiddleware.js"



 router.get('/notifications/:userId', ensureAuthenticated, async (req, res) => {
    const { userId } = req.params;
    try {
          const { rows } = await db.query('SELECT * FROM notifications WHERE user_id = $1', [userId]);
          res.json(rows);
    } catch (error) {
      console.log(error);
    }
  });


export default router;