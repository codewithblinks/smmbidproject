import db from "../db/index.js";

export async function calculateUserTotalDeposit(userId) {
  
    const query = `
      WITH successful_transactions AS (
          SELECT user_id, amount
          FROM sms_order
          WHERE status = 'complete' AND user_id = $1
  
          UNION ALL
  
          SELECT purchases_admin_product.buyer_id AS user_id, admin_products.amount AS amount
          FROM purchases_admin_product
          JOIN admin_products ON purchases_admin_product.product_id = admin_products.id
          WHERE purchases_admin_product.status = 'confirmed' 
          AND purchases_admin_product.buyer_id = $1
          AND admin_products.payment_status = 'sold'
  
          UNION ALL
  
          SELECT user_id, purchase_history.charge AS amount
          FROM purchase_history
          WHERE status = 'Completed' AND user_id = $1

          UNION ALL
  
          SELECT user_id, purchase_history.refund_amount AS amount
          FROM purchase_history
          WHERE status = 'Partial' AND user_id = $1
      )
      SELECT COALESCE(SUM(amount), 0) AS total_transactions
      FROM successful_transactions
      WHERE user_id = $1 
    `;
  
    try {
      const result = await db.query(query, [userId]);

      const totalSuccessfulTransaction = result.rows[0].total_transactions;
  
      return { totalSuccessfulTransaction};
      
    } catch (error) {
      console.error('Error calculating user total spent:', error);
    }
  }