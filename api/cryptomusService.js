import express from "express";
import db from "../db/index.js";

export const createTransaction = async (transaction) => {
  const { userId, amount, status, order_id, type, currency } = transaction;
  const query = `
    INSERT INTO transactions (user_id, type, amount, reference, status, currency)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [userId, type, amount, order_id, status, currency];
  const result = await db.query(query, values);
  return result.rows[0];
};

export const updateTransactionStatus = async (order_id, status) => {
  const query = `
    UPDATE transactions SET status = $1 WHERE reference = $2 AND status != 'paid' RETURNING status;
  `;
  const values = [status, order_id];
  const result = await db.query(query, values);

  if (result.rows.length === 0) {
    return 'already_paid';
}

  return result.rows[0].status;
};

export const creditUserBalance = async (amount, order_id, userCurrency, rate) => {
  const transactionQuery = `
  SELECT * FROM transactions WHERE reference = $1 AND status = 'paid';
`;
const transactionResult = await db.query(transactionQuery, [order_id]);

  if (transactionResult.rows.length === 0) {
    console.log('Transaction already credited, skipping.');
    return;
  }

  const transaction = transactionResult.rows[0];
  const userId = transaction.user_id;

  let depositAmount = Number(amount)
  let exchangeRate = Number(rate)

  if (userCurrency === 'USD') {
    
    if (!rate) {
      throw new Error('Exchange rate not found in Miscellaneous table.');
    }
    
    depositAmount *= exchangeRate;
  }

  const updateUserBalanceQuery = `
  UPDATE userprofile 
  SET balance = balance + $1 
  WHERE id = $2 
  RETURNING username, email, balance;
`;

   const userValues = [depositAmount, userId];
   const userResult = await db.query(updateUserBalanceQuery, userValues);

   if (userResult.rows.length === 0) {
    throw new Error(`User not found for User ID: ${userId}`);
  }

  return userResult.rows[0];
};

