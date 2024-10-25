import express from "express";
import db from "../db/index.js";
import formatDate from "../controller/formatDate.js";
import { io } from "../script.js";
import { sendEmail } from "../config/transporter.js";
import moment from "moment";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import timeSince from "../controller/timeSince.js";
import { sendRejectEmailToBuyer } from "../config/sendEmail.js";
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

function generateTransferId() {
  const prefix = "pur_ref";
  const uniqueId = uuidv4(); // Generate a unique UUID
  const buffer = Buffer.from(uniqueId.replace(/-/g, ''), 'hex'); // Remove dashes and convert to hex
  const base64Id = buffer.toString('base64').replace(/=/g, '').slice(0, 6);
  return `${prefix}_${base64Id}`;
}


router.post("/submit-review", ensureAuthenticated, async (req, res) => {
  const writer_id = req.user.id;
  const { userId, ratingValue, review } = req.body;

  try {
    const reviewResult = await db.query(
      "SELECT * FROM userprofile WHERE id = $1",
      [writer_id]
    );
    const writer_username = reviewResult.rows[0];

    const result = await db.query(
      "INSERT INTO ratings_reviews (user_id, rating, review, writer_id, writer_username) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [userId, ratingValue, review, writer_id, writer_username.username]
    );
    req.flash("success", `Review submited`);
    res.redirect("/p2p");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});


export default router;
