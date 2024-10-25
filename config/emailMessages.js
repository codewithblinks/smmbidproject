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