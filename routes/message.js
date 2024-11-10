import express from "express";
import db from "../db/index.js";
import ensureAuthenticated from "../authMiddleware/authMiddleware.js";

const router = express.Router();

 router.get('/notifications/:userId', ensureAuthenticated, async (req, res) => {
    const { userId } = req.params;
    try {
          const { rows } = await db.query('SELECT * FROM notifications WHERE user_id = $1', [userId]);
          res.json(rows);
    } catch (error) {
      console.error("error getting user notifications", error);
    }
  });


export default router;