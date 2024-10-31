import express from "express";
import db from "../../db/index.js"
import qrcode from 'qrcode'
import speakeasy from 'speakeasy'
import ensureAuthenticated from "../../authMiddleware/authMiddleware.js"
import flash from "connect-flash";

const router = express.Router();


router.get('/auth/2fa/setup', ensureAuthenticated, (req, res) => {
    const {userId, email} = req.user;

    try {
        const secret = speakeasy.generateSecret({ length: 10 });
        const tempSecret = secret.base32;
    
        db.query('UPDATE userprofile SET temp_2fa_secret = $1 WHERE id = $2', [tempSecret, userId]);
    
        const otpAuthUrl = speakeasy.otpauthURL({ secret: tempSecret, label: `SMMBIDMEDIA ${email}`, encoding: 'base32' });
 
       qrcode.toDataURL(otpAuthUrl, (err, qr) => {
            if (err) {
                return res.send('Error generating QR code');
            }
            res.json({ qr, secret: tempSecret });
        });
    } catch (error) {
        console.error("error getting 2fa", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
  
router.post('/auth/2fa/verify', ensureAuthenticated, async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;

    const result = await db.query('SELECT temp_2fa_secret FROM userprofile WHERE id = $1', [userId]);
    const tempSecret = result.rows[0].temp_2fa_secret;

    try {
    const verified = speakeasy.totp.verify({
        secret: tempSecret,
        encoding: 'base32',
        token
    });

    if (verified) {
        await db.query("UPDATE userprofile SET two_factor_secret = temp_2fa_secret, two_factor_enabled = 'true', temp_2fa_secret = NULL WHERE id = $1", [userId]);
        return res.json({ success: true, message: '2FA has been enabled' });
    } else {
        return res.json({ success: false, message: 'Invalid token, please try again' });
    }
    } catch (error) {
        console.error("error setting up 2fa", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post('/auth/2fa/disable', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id
    const { token } = req.body;
    const result = await db.query("SELECT two_factor_secret FROM userprofile WHERE id = $1", [userId]);

    try {
        if (result.rows.length > 0) {
            const secret = result.rows[0].two_factor_secret;
            const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token });
            if (verified) {
              await db.query("UPDATE userprofile SET two_factor_enabled = FALSE, two_factor_secret = NULL WHERE id = $1", [userId]);
              return res.json({ success: true });
            } else {
                return res.json({ success: false, message: 'Invalid token, please try again' });
            }
          } else {
            return res.json({ success: false, message: 'No 2FA setup found, please try again' });
          }
    } catch (error) {
        console.error("error disbled 2fa", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get('/2fa', (req, res) => {
    try {
        if (!req.session.userIdFor2FA) {
        return res.redirect('/login');
    } else {
        res.render('2fa', {messages: req.flash(), userId: req.session.userIdFor2FA });    
    }
    } catch (error) {
        console.error("error with 2fa", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
  
  router.post('/auth/2fa', async (req, res) => {
    const { token, userId } = req.body;

    try {
        const result = await db.query("SELECT two_factor_secret FROM userprofile WHERE id = $1", [userId]);

        if (result.rows.length > 0) {
            const secret = result.rows[0].two_factor_secret;
            const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token });
            if (verified) {
                const userResult = await db.query("SELECT * FROM userprofile WHERE id = $1", [userId]);
                const user = userResult.rows[0];
    
                user.role = 'user';
    
                req.logIn(user, (err) => {
                    if (err) {
                        req.flash('error', '2FA verification failed');
                        return res.redirect('/login');
                    }
                    return res.redirect('/dashboard');
                });
            } else {
                req.flash("error", "Invalid token");
                return res.redirect('/2fa');
            }
        } else {
            req.flash('error', '2FA setup not found');
            return res.redirect('/login');
        }
    } catch (error) {
        console.error("error with auth 2fa", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


export default router;