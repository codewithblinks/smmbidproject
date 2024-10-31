import express from "express";

const router = express.Router();

router.get("/logout", (req, res) => {
    req.logout((err) =>{
      if (err) {
        return next(err);
      }
      req.flash('success', 'You are logged out');

      res.redirect("/login");
    });
  });

  router.get("/admin/logout", (req, res) => {
    req.logout((err) =>{
      if (err) {
        return next(err);
      }
      req.flash('success', 'You are logged out');

      res.redirect("/login/admin");
    });
  });

  export default router;