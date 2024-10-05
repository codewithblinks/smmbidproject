import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated, {userRole} from "../authMiddleware/authMiddleware.js";


router.get("/knowledgebase", ensureAuthenticated, userRole, async(req, res) => {
    try {
        res.render("knowledgebase")
    } catch (error) {
        
    }
})


router.get("/ticket/create", ensureAuthenticated, userRole, async(req, res) => {
    try {
        res.render("tickets")
    } catch (error) {
        
    }
})

export default router;