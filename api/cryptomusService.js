import express from "express";
import db from "../db/index.js";
import axios from "axios";
import crypto from "crypto";



const { CRYPTOMUS_API_KEY, CRYPTOMUS_MERCHANT_ID, CRYPTOMUS_SECRET_KEY } = process.env;

// Base URL for Cryptomus API
const CRYPTOMUS_BASE_URL = "https://api.cryptomus.com/v1";

export const cryptomusService = {
  // Create a new payment
  createPayment: async (amount, currency, orderId, successUrl, cancelUrl) => {
    const data = {
      amount,
      currency,
      order_id: orderId,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    
    try {
      const response = await axios.post(
        `${CRYPTOMUS_BASE_URL}/payment`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': CRYPTOMUS_API_KEY,
            'Merchant-ID': CRYPTOMUS_MERCHANT_ID,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating payment:', error.message);
      throw error;
    }
  },

  // Verify webhook signature
  verifyWebhookSignature: (data, receivedSignature) => {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', CRYPTOMUS_SECRET_KEY);
    hmac.update(JSON.stringify(data));
    const generatedSignature = hmac.digest('hex');
    return generatedSignature === receivedSignature;
  },
};

