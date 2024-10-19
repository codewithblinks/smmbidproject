import express from "express";

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/login');
  }

 export function adminEnsureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/login/admin');
  }

  export function userRole(req, res, next) {
    if (req.user.role === 'user') {
      return next();
    } else {
      res.redirect('/login');
    }
  }
  
  export function adminRole(req, res, next) {
    if (req.user.role === 'admin') {
      return next();
    } else {
      res.redirect('/login/admin');
    }
  }


export function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
      return res.redirect('/dashboard'); 
  }
  next();
}

export function checkAdminAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
      return res.redirect('/admin/dashboard'); 
  }
  next();
}


 
export default ensureAuthenticated;