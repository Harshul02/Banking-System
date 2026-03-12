const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const { createAccountController, getUserAccountsController, getUserAccountBalance } = require("../controllers/account.controller");

const router = express.Router();

/**
 * - POST /api/accounts/
 * - Create a new account
 * - Protected Route
 */
router.post("/", authMiddleware, createAccountController);

/**
 * - GET /api/accounts/
 * - Get all accounts of the logged-in User
 * - Protected Route
 */
router.get("/", authMiddleware, getUserAccountsController);

/**
 * - GET /api/accounts/balance/:accountId
 * - Get Balance of accounts of the logged-in User
 * - Protected Route
 */
router.get("/balance/:accountId", authMiddleware, getUserAccountBalance);

module.exports = router;