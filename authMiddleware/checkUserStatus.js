import express from "express";
import db from "../db";

// middleware/checkUserStatus.js
async function checkUserStatus(req, res, next) {
  try {
    const result = await db.query('SELECT is_suspended, is_locked FROM userprofile WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    
    if (user.is_suspended) {
      req.logout(() => {
        res.status(403).send('Your account has been suspended.');
      });
    } else {
      if (user.is_locked) {
        req.is_locked = true; // Set a flag to be used in other middleware/routes
      }
      next();
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export default checkUserStatus;
