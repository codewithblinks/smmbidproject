import express from "express";
import db from "../db/index.js";
import { v4 as uuidv4 } from 'uuid';
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";

const router = express.Router();

function generateTransferId() {
    const prefix = "ticket";
    const uniqueId = uuidv4();
    const buffer = Buffer.from(uniqueId.replace(/-/g, ''), 'hex');
    const base36Id = buffer.toString('hex').slice(0, 6);
    return `${prefix}${base36Id}`;
  }


router.get("/knowledgebase", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;

    try {
        const userResult = await db.query(`
            SELECT * FROM userprofile 
            WHERE id = $1
            `, [userId]);

            const user = userResult.rows[0];

            const notificationsResult = await db.query(
                'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
                [userId, false]
            );
          
            const notifications = notificationsResult.rows;

        res.render("knowledgebase", {user, notifications, timeSince})
    } catch (error) {
        
    }
})


export default router;