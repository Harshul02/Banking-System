# Banking Backend System

A secure backend banking system built with **Node.js, Express.js, MongoDB, and JWT authentication**.  
This project supports **user authentication**, **account management**, **secure fund transfers**, **ledger-based transaction tracking**, **transaction reversal**, and **email notifications**.

---

## Features

- **User Authentication**
  - User registration
  - User login
  - User logout
  - JWT-based authentication
  - Token blacklist support for logout security

- **Role-Based Access Control**
  - Normal users can manage their own accounts and transactions
  - System users can perform privileged operations such as **initial fund transfers** and **transaction reversal**

- **Account Management**
  - Create bank accounts
  - Retrieve all accounts for a logged-in user
  - Fetch balance for a specific account

- **Secure Fund Transfers**
  - Transfer money between accounts
  - Prevent duplicate transfers using **idempotency keys**
  - MongoDB **session-based transactions** for consistency

- **Ledger-Based Transaction Tracking**
  - Each transfer creates:
    - **DEBIT** entry for sender
    - **CREDIT** entry for receiver
  - Enables balance derivation and transaction audit trail

- **Transaction Reversal**
  - Reverse only completed transactions
  - Creates compensating ledger entries for rollback

- **Email Notifications**
  - Welcome email on registration
  - Transaction success email
  - Transaction failure email

---

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Authentication:** JWT, Cookies
- **Email Service:** Nodemailer
- **Authorization:** Role-based middleware
- **Database Consistency:** MongoDB Sessions / Transactions

---

## API Endpoints

#### Auth Routes
###### POST /api/auth/register
Register a new user.
```Bash
{
  "name": "Harshul",
  "email": "harshul@example.com",
  "password": "password123"
}
```
###### POST /api/auth/login
Login a user and issue JWT token.
```Bash
{
  "email": "harshul@example.com",
  "password": "password123"
}
```
###### POST /api/auth/logout
Logout user and blacklist the JWT token.


#### Account Routes
###### POST /api/accounts/
Create a new bank account for the logged-in user.
###### GET /api/accounts/
Get all bank accounts of the logged-in user.
###### GET /api/accounts/balance/:accountId
Get balance of a specific account.


#### Transaction Routes
###### POST /api/transactions/
Create a fund transfer between two accounts.
```Bash
{
  "fromAccount": "ACCOUNT_ID_1",
  "toAccount": "ACCOUNT_ID_2",
  "amount": 500,
  "idempotencyKey": "txn-123456"
}
```
###### POST /api/transactions/system/initial-funds
System user only.
Used to provide initial funds to a user account.
```Bash
{
  "toAccount": "ACCOUNT_ID_2",
  "amount": 1000,
  "idempotencyKey": "init-123456"
}
```
###### POST /api/transactions/:transactionId/reverse
System user only.
Reverses a completed transaction.
```Bash
{
  "reason": "Manual correction"
}
```
---
#### How to Run Locally
1. Clone the repository
```Bash
git clone https://github.com/Harshul02/Banking-System.git
cd Banking-System
```
2. Install dependencies
```Bash
npm install
```
3. Create .env file
```Bash
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```
4. Start the server
```Bash
npm run dev
```
OR
```Bash
npm start
```
