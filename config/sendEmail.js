import { sendEmail } from "../config/transporter.js";
import db from "../db/index.js";

export async function sendRejectEmailToBuyer(buyerId, productId) {
    try {
      // Get seller email from the database
      const result = await db.query(
        "SELECT email FROM userprofile WHERE id = $1",
        [buyerId]
      );
      const buyerEmail = result.rows[0].email;
  
      // Call the reusable sendEmail function
      await sendEmail({
        to: buyerEmail,
        subject: "Action Required: Prchases Order Rejected By Seller",
        text: `The seller has rejected your request to purchase this product.`,
      });
  
      console.log(`Email sent to ${buyerEmail} about product ${productId}`);
    } catch (err) {
      console.error(`Error sending email to seller: ${err.message}`);
    }
  }
  