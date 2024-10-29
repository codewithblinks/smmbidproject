import express from "express";
import nodemailer from "nodemailer"
import db from "../db/index.js";
import { sendEmail } from "./transporter.js";
import path from 'path';
import ejs from "ejs";
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const sendWelcomeEmail = async (email, username) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'welcomeEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Email Verified - Welcome to SMMBIDMEDIA!',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };


  export const resendVericationEmail = async (email, username, verificationCode) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'verifyEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        verificationCode: verificationCode,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Email Verification',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  
  export const forgotPasswordEmail = async (email, username, resetLink) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'forgotPasswordEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        resetLink: resetLink,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Password Reset',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendRestEmail = async (email, username, resetLink) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'resetEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        resetLink: resetLink,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Password Reset',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendResetEmailConfirmation = async (email, username) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'resetConfirmationEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        email: email,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Password Reset',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendChangeEmail = async (newEmail, username, verificationCode) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'changeEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        verificationCode: verificationCode,
        appName: appName
      });
  
      const mailOptions = {
        to: newEmail,
        subject: 'Email Address Change - Verification Code',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendChangeEmailConfirmation = async (newEmail, username) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'changeEmailConfirmation.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        appName: appName
      });
  
      const mailOptions = {
        to: newEmail,
        subject: 'Primary Email Address Changed',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendOrderCompleteEmail = async (email, username, purchaseId) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'orderCompleteEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        email:email,
        name: username,
        purchaseId: purchaseId,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Purchase Alert',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendDeleteAccounEmail = async (email, username) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'userDeleteAccounEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Account Deletion Request',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Verification email sent');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendDepositPendingEmail = async (email, username, transactionReference, bank_amount) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'newPendingDepositEmail.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {
      const html = await ejs.renderFile(templatePath, {
        name: username,
        transactionReference: transactionReference,
        bank_amount: bank_amount,
        appName: appName
      });
  
      const mailOptions = {
        to: email,
        subject: 'Deposit Received and Awaiting Approval',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Deposit pending email sent to user');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };

  export const sendDepositPendingAdminEmail = async (adminEmail, username, transactionReference, bank_amount, adminUsername) => {
    const templatePath = path.join(__dirname, '..', 'views', 'emailTemplates', 'newDepositAdmin.ejs');
  
    const appName = 'SMMBIDMEDIA';
    
    try {

      const html = await ejs.renderFile(templatePath, {
        name: username,
        transactionReference: transactionReference,
        bank_amount: bank_amount,
        adminUsername: adminUsername,
        appName: appName,
      });
  
      const mailOptions = {
        to: adminEmail,
        subject: 'New Deposit Awaiting Approval',
        html: html
      };
  
      await sendEmail(mailOptions);
  
      console.log('Admin email sent with payment proof');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  };