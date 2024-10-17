import express from "express";
import db from "../db/index.js";
const router = express.Router();
import ensureAuthenticated from "../authMiddleware/authMiddleware.js"




export default router;