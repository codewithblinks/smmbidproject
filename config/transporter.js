import express from "express";
import nodemailer from "nodemailer"
import db from "../db/index.js";

// Fetch the email config from PostgreSQL
async function getEmailConfig() {
  try {
      const result = await db.query('SELECT smtp_email, smtp_pass FROM miscellaneous WHERE id = 1');
      if (result.rows.length > 0) {
          return {
              email: result.rows[0].smtp_email,
              pass: result.rows[0].smtp_pass,
          };
      } else {
          throw new Error('No email configuration found.');
      }
  } catch (error) {
      console.error('Error fetching email config:', error);
      throw error;
  }
}

// Set up nodemailer transporter with dynamic config
async function createTransporter() {
  const config = await getEmailConfig();
  return nodemailer.createTransport({
    host: 'zifinvest.com',
    port: 465,
    secure: true, // Use SSL
    auth: {
      user: config.email,
      pass: config.pass, // You can also hardcode the password here or use from config
    },
  });
}


  export async function sendEmail({to, subject, html}) {
    try {

      const transporter = await createTransporter();
  
      const mailOptions = {
        from: 'SMMBIDMEDIA <' + (await getEmailConfig()).email + '>',
        to,
        subject,
        html
      };
      await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${to}`);
    } catch (err) {
      console.error(`Error sending email: ${err.message}`);
    }
  }
  
