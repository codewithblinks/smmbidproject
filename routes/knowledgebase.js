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
    const base64Id = buffer.toString('base64').replace(/=/g, '').slice(0, 6);
    return `${prefix}${base64Id}`;
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


router.get("/ticket/create", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;

    try {
        const ticketResult = await db.query(`
            SELECT * FROM support_tickets WHERE user_id = $1
            `,
            [userId]
        )

        const tickets = ticketResult.rows;

        res.render("tickets", {messages: req.flash(), tickets})
    } catch (error) {
        
    }
})

router.post("/submit-ticket", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
    const {service, priority, orderId, title, description} = req.body;

    const ticketId = generateTransferId();
    try {
        
        await db.query(`
            INSERT INTO support_tickets (ticket_id, user_id, title, service, order_id, description, status_id, priority_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [ticketId, userId, title, service, orderId, description, 3, priority])

            req.flash("success", `Ticket submitted successfully with the ticket id : ${ticketId}`);
            return res.redirect("/ticket/create")
    } catch (error) {
        console.log(error)
    }
})

router.get('/support-tickets/:ticketId', ensureAuthenticated, userRole, async (req, res) => {
    const userId = req.user.id;
    const ticketId = req.params.ticketId;
    try {
      const ticket = await db.query('SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2', [ticketId, userId]);
      
      res.json(ticket.rows[0]);
    } catch (error) {
      console.error(error);
      res.sendStatus(500);
    }
  });

export default router;