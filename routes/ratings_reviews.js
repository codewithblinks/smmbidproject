import express from "express";
const router = express.Router();
import db from "../db/index.js";
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";
import moment from "moment";
import cron from "node-cron";
import timeSince from "../controller/timeSince.js";

const getDaysSinceRegistration = (registrationDate) => {
  const registrationMoment = moment(registrationDate);
  const now = moment();
  const diffDays = now.diff(registrationMoment, 'days');
  return diffDays;
};

  router.get("/review/profile/:id", ensureAuthenticated, userRole, async(req, res) => {
    const userId = req.user.id;
    const id = req.params.id
  
    try {
      const usersResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [userId]);
      const user = usersResult.rows[0]

      const notificationsResult = await db.query(
        'SELECT * FROM notifications WHERE user_id = $1 AND read = $2 ORDER BY timestamp DESC LIMIT 5',
        [userId, false]
    );
  
    const notifications = notificationsResult.rows;

         const badReviewResult = await db.query("SELECT * FROM ratings_reviews WHERE user_id = $1 AND rating IN (1, 3)", [id])
         const badReview = badReviewResult.rows

         const goodReviewResult = await db.query("SELECT * FROM ratings_reviews WHERE user_id = $1 AND rating IN (4, 5)", [id])
         const goodReview = goodReviewResult.rows

         const userResult = await db.query("SELECT created_at FROM userprofile WHERE id = $1", [id])
         const registrationDate = userResult.rows[0].created_at

         const daysSinceRegistration = getDaysSinceRegistration(registrationDate);

         goodReview.forEach(review => {
          review.formattedDate = moment(review.created_at).format('D MMM h:mmA');
      });

      badReview.forEach(review => {
        review.badReviewformattedDate = moment(review.created_at).format('D MMM h:mmA');
    });

      const othersResult = await db.query("SELECT email_verified, firstname, lastname FROM userprofile WHERE id = $1", [id])
      const other = othersResult.rows[0]

      res.render('reviewProfile', {
        daysSinceRegistration, other, user,
        timeSince, notifications,
        badReview, goodReview
      })
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
  });


  export default router;