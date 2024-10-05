import express from "express";
import db from "../db/index.js";
import passport from "passport";
import bcrypt from "bcrypt";
import { Strategy } from "passport-local";
const router = express.Router();


passport.use('user-local',
    new Strategy(async function (username, password, cb) {
      try {
        const result = await db.query("SELECT * FROM userprofile WHERE email = $1", [
          username.toLowerCase(),
        ]);
        
        if (result.rows.length > 0) {
          const user = result.rows[0];

          if (user.is_suspended) {
            return cb(null, false, { message: "Your account has been suspended." });
          }

          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              return cb(err);
            } else if (valid) {

              if (user.two_factor_enabled) {
                return cb(null, false, { message: "2FA required", userId: user.id });
              } else {
                user.role = 'user';
              return cb(null, user);
              }
            } else {
              return cb(null, false, { message: "Incorrect password" });
            }
          });
        } else {
          return cb(null, false, {
            message: "Email does not exist, please register!",
          });
        }
      } catch (err) {
        console.log(err);
        return cb(err);
      }
    })
  );

  passport.use('admin-local',
    new Strategy(async (username, password, cb) =>{
      try {
        const result = await db.query("SELECT * FROM admins WHERE email = $1", [
          username.toLowerCase(),
        ]);
        if (result.rows.length > 0) {
          const admin = result.rows[0];
          const storedHashedPassword = admin.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              return cb(err);
            } else if (valid) {
                admin.role = 'admin';
              return cb(null, admin);
            } else {
              return cb(null, false, { message: "Incorrect password" });
            }
          });
        } else {
          return cb(null, false, {
            message: "Email does not exist, please register!",
          });
        }
      } catch (err) {
        console.log(err);
        return cb(err);
      }
    })
  );
  


passport.serializeUser((user, cb) => {
  cb(null, { id: user.id, role: user.role });
  
});


passport.deserializeUser(async (obj, cb) => {
  try {
      if (obj.role === 'user') {
          const res = await db.query('SELECT * FROM userprofile WHERE id = $1', [obj.id]);
          const user = res.rows[0];
            user.role = 'user';  // Ensure role is set
            cb(null, user);
          
      } else if (obj.role === 'admin') {
          const res = await db.query('SELECT * FROM admins WHERE id = $1', [obj.id]);
          const admin = res.rows[0];
          admin.role = 'admin';  // Ensure role is set
          cb(null, admin);
         
      } else {
        cb(new Error('Invalid role'));
    }
  } catch (err) {
      cb(err);
  }
});

export default passport;
