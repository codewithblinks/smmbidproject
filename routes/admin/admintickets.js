import express from "express";
import db from "../../db/index.js";
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js";
import timeSince from "../../controller/timeSince.js";

const router = express.Router();


router.get("/admin/tickets-list", adminEnsureAuthenticated, adminRole, async(req, res) => {
    const userId = req.user.id;

    try {

        const ticketQuery = await db.query(`
            SELECT * FROM ticket_statuses`);

            const ticketStatus = ticketQuery.rows;
        
        res.render("admin/admintickets", {messages: req.flash(), loggedInUserId: userId, ticketStatus})
    } catch (error) {
        console.log(error)
    }
})

router.get("/api/admin/tickets", adminEnsureAuthenticated, adminRole, async(req, res) => {
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
           WHERE st.status IN ($1, $2)
            GROUP BY st.id
            `,
            ['Open', 'Pending']
        );
        

        const tickets = ticketResult.rows.map((ticket) => ({
            ...ticket,
            timeSince: timeSince(new Date(ticket.created_at))
          }));

        res.json(tickets);
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Server Error");
    }
})

router.get("/api/admin/tickets/:ticketId/messages", adminEnsureAuthenticated, adminRole, async (req, res) => {
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


router.post("/api/tickets/admin/:ticketId/messages", adminEnsureAuthenticated, adminRole, async (req, res) => {
    const ticketId = req.params.ticketId;
    const { message } = req.body;
    const userId = req.user.id;

    try {

        const ticketQuery = await db.query(`
            SELECT id, status from support_tickets 
            WHERE ticket_id = $1`,
            [ticketId]
        );

        if (ticketQuery.rows.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }

        const {id: currentTicketId, status} = ticketQuery.rows[0];

        const result = await db.query(
            `INSERT INTO ticket_responses 
            (ticket_id, support_tickets_id, admin_id, sender, message, created_at) 
             VALUES ($1, $2, $3, $4, $5, NOW()) 
             RETURNING *`,
            [ticketId, currentTicketId, userId, 'Admin', message]
        );

        const returnedTicketId = result.rows[0].ticket_id;

        const newMessage = {
            ...result.rows[0],
            timeSince: timeSince(new Date(result.rows[0].created_at)),
        }; 

        if (status === "Pending") {
               await db.query(`
            UPDATE support_tickets 
            SET status_id = $1, status = $2 
            WHERE ticket_id = $3
            `, [1, 'Open', returnedTicketId])
        }

         res.status(201).json(newMessage);
    } catch (err) {
        console.error("Error creating message:", err.message);
        res.status(500).send("Server Error");
    }
});

router.get("/api/admin/solved/tickets", adminEnsureAuthenticated, adminRole, async(req, res) => {
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
            WHERE st.status NOT IN ($1, $2)
            GROUP BY st.id
            `,
            ['Open', 'Pending']
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

router.post("/api/tickets/admin/:ticketId/read", adminEnsureAuthenticated, adminRole, async (req, res) => {
    const ticketId = req.params.ticketId;

    try {

        const result = await db.query(
            `UPDATE ticket_responses 
             SET seen = $1 
             WHERE ticket_id = $2 AND sender = $3
             RETURNING *`,
            [true, ticketId, 'User']
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

router.post("/api/tickets/close/:ticketId", adminEnsureAuthenticated, adminRole, async (req, res) => {
    const ticketId = req.params.ticketId;
    const statusid = Number(req.body.statusId);

    console.log(ticketId);
    console.log(typeof ticketId);

    try {
        // Check if the status ID exists in the `ticket_statuses` table
        const statusQuery = await db.query(
            `SELECT id, status_name FROM ticket_statuses WHERE id = $1`,
            [statusid]
        );

        if (statusQuery.rowCount === 0) {
            return res.status(404).json({ message: "Invalid status ID" });
        }

        const resolvedStatusId = 4;

        const status = statusQuery.rows[0].status_name;

        // Update the ticket based on the status ID
        let result;
        if (statusid === resolvedStatusId) {
            result = await db.query(
                `UPDATE support_tickets
                 SET status_id = $1, status = $2, updated_at = NOW(), resolved_at = NOW()
                 WHERE ticket_id = $3
                 RETURNING *`,
                [statusid, status, ticketId]
            );
        } else {
            result = await db.query(
                `UPDATE support_tickets
                 SET status_id = $1, status = $2, updated_at = NOW()
                 WHERE ticket_id = $3
                 RETURNING *`,
                [statusid, status, ticketId]
            );
        }

        // Return the updated ticket data
        const data = result.rows[0];
        res.status(200).json(data);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});



export default router;