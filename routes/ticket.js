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

router.get("/ticket/create", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;

    try {
        const ticketResult = await db.query(`
            SELECT * FROM support_tickets WHERE user_id = $1
            `,
            [userId]
        )

        const tickets = ticketResult.rows;

        res.render("tickets", {messages: req.flash(), tickets, loggedInUserId: userId})
    } catch (error) {
        
    }
})

router.post("/submit-ticket", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
    const {service, priority, orderId, title, description} = req.body;

    const ticketId = generateTransferId();

    try {

        if (!service || !priority || !orderId || !title || !description) {
            req.flash("error", "All fields are required.");
            return res.redirect("/ticket/create");
        }        
        
        const ticketResult = await db.query(`
            INSERT INTO support_tickets (ticket_id, user_id, title, service, order_id, description, status_id, status, priority_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, ticket_id
            `, [ticketId, userId, title, service, orderId, description, 3, 'Pending', priority]);

            const { id: supportTicketId, ticket_id: returnedTicketId } = ticketResult.rows[0];

            
            await db.query(
                `
                INSERT INTO ticket_responses 
                (ticket_id, support_tickets_id, user_id, sender, message, created_at) 
                VALUES ($1, $2, $3, $4, $5, NOW()) 
                RETURNING *
                `,
                [returnedTicketId, supportTicketId, userId, 'User', description]
            );

            req.flash("success", `Ticket submitted successfully with the ticket id : ${ticketId}`);
            return res.redirect("/ticket/create")
    } catch (error) {
        console.error('Error creating ticket:', error)
        res.status(500).send("Server Error");
    }
})

router.get("/api/tickets", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;

    try {
        const ticketResult = await db.query(`
            SELECT 
                st.id AS support_tickets_id, 
                st.ticket_id AS ticket_id, 
                st.user_id AS user_id,
                st.title AS title, 
                st.status AS status,
                st.description AS description, 
                st.created_at AS created_at,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'ticket_responses_id', s.id,
                            'response_ticket_id', s.ticket_id,
                            'response_support_tickets_id', s.support_tickets_id,
                            'response_user_id', s.user_id,
                            'admin_id', s.admin_id,
                            'sender', s.sender,
                            'seen', s.seen,
                            'created_at', s.created_at
                        )
                    ) FILTER (WHERE s.id IS NOT NULL), 
                    '[]'
                ) AS responses
            FROM support_tickets st
            LEFT JOIN ticket_responses s 
            ON st.ticket_id = s.ticket_id
           WHERE st.user_id = $1 AND st.status IN ($2, $3)
            GROUP BY st.id
            `,
            [userId, 'Open', 'Pending']
        );
        

        const tickets = ticketResult.rows.map((ticket) => ({
            ...ticket,
            timeSince: timeSince(new Date(ticket.created_at))
          }));

        res.json(tickets);
    } catch (error) {
        console.error(err.message);
        console.error("Error fetching tickets:", error.message);
    }
})

router.get("/api/solved/tickets", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;

    try {
        const ticketResult = await db.query(`
            SELECT 
                st.id AS support_tickets_id, 
                st.ticket_id AS ticket_id, 
                st.user_id AS user_id,
                st.title AS title, 
                st.status AS status,
                st.description AS description, 
                st.created_at AS created_at,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'ticket_responses_id', s.id,
                            'response_ticket_id', s.ticket_id,
                            'response_support_tickets_id', s.support_tickets_id,
                            'response_user_id', s.user_id,
                            'admin_id', s.admin_id,
                            'sender', s.sender,
                            'seen', s.seen,
                            'created_at', s.created_at
                        )
                    ) FILTER (WHERE s.id IS NOT NULL), 
                    '[]'
                ) AS responses
            FROM support_tickets st
            LEFT JOIN ticket_responses s 
            ON st.ticket_id = s.ticket_id
            WHERE st.user_id = $1 AND st.status NOT IN ($2, $3)
            GROUP BY st.id
            `,
            [userId, 'Open', 'Pending']
        );
        

        const tickets = ticketResult.rows.map((ticket) => ({
            ...ticket,
            timeSince: timeSince(new Date(ticket.created_at))
          }));

        res.json(tickets);
    } catch (error) {
        console.error("Error fetching solved tickets:", error.message);
        res.status(500).send("Server Error");
    }
})

 router.get("/api/tickets/:ticketId/messages", ensureAuthenticated, userRole, async (req, res) => {
    const ticketId = req.params.ticketId;

    try {
        const result = await db.query(
            `SELECT m.id, m.ticket_id, m.message, m.user_id, m.sender, m.created_at,
             st.status
             FROM ticket_responses m
             JOIN support_tickets st
             ON  m.ticket_id = st.ticket_id
             WHERE m.ticket_id = $1 
             ORDER BY m.created_at ASC`,
            [ticketId]
        );

        const messages = result.rows.map((message) => ({
            ...message,
            timeSince: timeSince(new Date(message.created_at))
          }));

          res.json(messages);
    } catch (err) {
        console.error("Error fetching messages:", err.message);
        res.status(500).send("Server Error");
    }
});

router.post("/api/tickets/:ticketId/messages", ensureAuthenticated, userRole, async (req, res) => {
    const ticketId = req.params.ticketId;
    const { message } = req.body;
    const userId = req.user.id;

    try {

        const ticketQuery = await db.query(`
            SELECT id from support_tickets 
            WHERE ticket_id = $1`,
            [ticketId]
        );

        if (ticketQuery.rows.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }

        const currentTicketId = ticketQuery.rows[0].id;

        const result = await db.query(
            `INSERT INTO ticket_responses 
            (ticket_id, support_tickets_id, user_id, sender, message, created_at) 
             VALUES ($1, $2, $3, $4, $5, NOW()) 
             RETURNING *`,
            [ticketId, currentTicketId, userId, 'User', message]
        );

        
        const newMessage = {
            ...result.rows[0],
            timeSince: timeSince(new Date(result.rows[0].created_at)),
        };

          res.status(201).json(newMessage);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

router.post("/api/tickets/:ticketId/read", ensureAuthenticated, userRole, async (req, res) => {
    const ticketId = req.params.ticketId;
    const userId = req.user.id;

    try {

        const result = await db.query(
            `UPDATE ticket_responses 
             SET seen = $1 
             WHERE ticket_id = $2 AND sender = $3
             RETURNING *`,
            [true, ticketId, 'Admin']
        );        

        const newMessage = result.rows.map((ticket) => ({
            ...ticket,
            timeSince: timeSince(new Date(ticket.created_at))
          }));

          res.status(201).json(newMessage);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

export default router;