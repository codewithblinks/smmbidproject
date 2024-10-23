import express from "express";
import db from "../../db/index.js"
import {adminEnsureAuthenticated, adminRole} from "../../authMiddleware/authMiddleware.js"

const router = express.Router();


router.get("/admin/tickets-list", adminEnsureAuthenticated, adminRole, async(req, res) => {
    try {
        
        res.render("admin/admintickets")
    } catch (error) {
        console.log(error)
    }
})




export default router;