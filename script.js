import express from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import session from "express-session";
import flash from "connect-flash"
import db from "./db/index.js";
import passport from "./config/passportConfig.js";
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import connectPgSimple from 'connect-pg-simple';
import { expressCspHeader, SELF, INLINE } from "express-csp-header";

const PgStore = connectPgSimple(session);

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

env.config();

app.set('trust proxy', true);


app.use(session({
  store: new PgStore({
      pool: db,
      tableName: 'session' 
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { secure: false, maxAge: 1000 * 60 * 30 } 
}));

app.use(expressCspHeader({
  policies: {
    'default-src': [SELF], 
    'script-src': [SELF],
    'style-src': [SELF],
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.use(flash());

// Routes

import loginRoute from "./routes/login.js"
import registerRoute from "./routes/register.js"
import forgotRoute from "./routes/sendEmailAuth/forgotAuth.js"
import resetRoute from "./routes/sendEmailAuth/reset.js"
import p2pRoute from "./routes/p2p.js"
import loginOutRoute from "./routes/logout.js"
import userDashboardRoute from "./routes/dashboard/userDashboard.js"
import adminDashboardRoute from "./routes/dashboard/adminDashboard.js"
import profileRoute from "./routes/profile.js"
import accountsettingsRoute from "./routes/accountsettings.js"
import depositRoute from "./routes/payment/deposit.js"
import smmRoute from "./routes/smm.js"
import orderhistoryRoute from "./routes/orderhistory.js"
import verificationRoute from "./routes/verification.js"
import usersRoute from "./routes/admin/users.js"
import checkRoute from "./routes/admin/check.js"
import set2faRoute from "./routes/admin/2fa.js"
import smsorderhistoryRoute from './routes/smsorderhistory.js'
import transactionsRoute from './routes/payment/transactions.js'
import smmOrdersRoute from './routes/admin/smmorders.js'
import smsOrdersRoute from './routes/admin/smsorders.js'
import adminTransactionsRoutes from './routes/admin/admintransactions.js'
import adminListProductsRoute from './routes/admin/adminlistproducts.js'
import weeklyChaRoute from './routes/weekly_challenges.js'
import imageUploadRoute from './routes/imageUpload.js'
import adminsettingsRoute from './routes/admin/adminsettings.js'
import knowledgebaseRoute from './routes/knowledgebase.js'
import settingsAdminRoute from './routes/admin/settings.js'
import adminTickets from './routes/admin/admintickets.js'
import tickets from './routes/ticket.js'

app.use(loginRoute)
app.use(registerRoute)
app.use('/', forgotRoute);
app.use('/', resetRoute);
app.use("/", loginOutRoute)
app.use("/", userDashboardRoute)
app.use("/", adminDashboardRoute)
app.use("/", p2pRoute)
app.use("/", profileRoute)
app.use('/', accountsettingsRoute)
app.use("/", depositRoute)
app.use('/', smmRoute)
app.use('/', orderhistoryRoute)
app.use('/', verificationRoute)
app.use(usersRoute)
app.use(checkRoute)
app.use(set2faRoute)
app.use(smsorderhistoryRoute)
app.use(transactionsRoute)
app.use(smmOrdersRoute)
app.use(smsOrdersRoute)
app.use(adminTransactionsRoutes)
app.use(adminListProductsRoute)
app.use(weeklyChaRoute)
app.use(imageUploadRoute)
app.use(adminsettingsRoute)
app.use(knowledgebaseRoute)
app.use(settingsAdminRoute)
app.use(adminTickets)
app.use(tickets)

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const paystackCreateRecipientUrl = process.env.PAYSTACK_RECIPIENT_URL;


app.get("/", (req, res) => {
  try {
    res.render("index");
  } catch (error) {
    console.error('Error getting home page:', error);
    res.sendStatus(500);
  }
});

// Real-time communication
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('joinRoom', ({ roomId }) => {
    socket.join(roomId);
    console.log(`User joined room: ${roomId}`);
  });

  socket.on('joinUserRoom', ({ userId }) => {
    socket.join(`user_${userId}`);
    console.log(`User joined personal room: user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});


app.post('/notifications/mark-as-read/:id', async (req, res) => {
  const notificationId = req.params.id;
  
  try {
      // Update the notification in the database
      await db.query('UPDATE notifications SET read = true WHERE id = $1', [notificationId]);

      res.sendStatus(200); // Respond with a success status
  } catch (error) {
      console.error('Error marking notification as read:', error);
      res.sendStatus(500); // Respond with an error status
  }
});


server.listen(port, () => {
  console.log("Server is running on port 3000");
});

export { io };
