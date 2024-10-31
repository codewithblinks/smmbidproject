import db from "../db/index.js";
import cron from "node-cron";

cron.schedule('0 0 * * *', async () => {
    try {
      const deleteQuery = 'DELETE FROM notifications WHERE read = $1';
      await db.query(deleteQuery, [true]);
      console.log('Deleted read notifications successfully.');
    } catch (error) {
      console.error('Error deleting read notifications:', error);
    }
  });
