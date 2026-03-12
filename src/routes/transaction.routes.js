const {Router} = require("express");
const { authMiddleware, authSystemUserMiddleware } = require("../middleware/auth.middleware");
const { createTransaction, createInitialFundsTransaction, reverseTransactionController } = require("../controllers/transaction.controller");
const router = Router();

/**
 * - POST /api/transactions/
 * - Create a new transaction
 */
router.post("/", authMiddleware, createTransaction);

/**
 * - POST /api/transactions/system/initial-funds
 * - Create initial funds from system user
 */
router.post("/system/initial-funds", authSystemUserMiddleware, createInitialFundsTransaction);

/**
 * - POST /api/transactions/:transactionId/reverse
 * - Reverse the transaction
 */

router.post("/:transactionId/reverse", authSystemUserMiddleware, reverseTransactionController);

module.exports = router;