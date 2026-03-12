const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const {
  sendTransactionFailedEmail,
  sendTransactionSuccessEmail,
} = require("../services/email.service");
const { default: mongoose } = require("mongoose");

/**
 * - Create a new transaction
 * - Transaction Flow:
 * 1. Validate request
 * 2. Validate idempotency key
 * 3. Check account status
 * 4. Derive sender balance from ledger
 * 5. Create transaction (PENDING state)
 * 6. Create DEBIT ledger entry
 * 7. Create CREDIT ledger entry
 * 8. Mark transaction COMPLETED
 * 9. Commit MongoDB session
 * 10. Send email notification
 */

const createTransaction = async (req, res) => {
  /**
   * 1. Validate Request
   */
  //   const session = await mongoose.startSession();
  let tx = null;
  let session = null;
  try {
    // session.startTransaction();
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
      return res.status(400).json({
        message:
          "fromAccount, toAccount, amount and idempotencyKey are required",
      });
    }

    if (fromAccount === toAccount) {
      return res.status(400).json({
        message: "Cannot transfer to same account",
      });
    }

    const fromUserAccount = await accountModel.findOne({ _id: fromAccount });
    //   .session(session);
    const toUserAccount = await accountModel.findOne({ _id: toAccount });
    //   .session(session);

    if (!fromUserAccount || !toUserAccount) {
      return res.status(400).json({
        message: "Invalid fromAccount or toAccount",
      });
    }

    /**
     * 2. Validate idempotency key
     */

    const isTransactionExist = await transactionModel.findOne({
      idempotencyKey: idempotencyKey,
    });
    //   .session(session);

    if (isTransactionExist) {
      if (isTransactionExist.status === "COMPLETED") {
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: isTransactionExist,
        });
      }
      if (isTransactionExist.status === "PENDING") {
        return res.status(200).json({
          message: "Transaction is still processing",
        });
      }
      if (isTransactionExist.status === "FAILED") {
        return res.status(500).json({
          message: "Transaction processing failed. Please retry",
        });
      }
      if (isTransactionExist.status === "REVERSED") {
        return res.status(500).json({
          message: "Transaction processing reversed. Please retry",
        });
      }
    }

    /**
     * 3. Check account status
     */
    if (
      fromUserAccount.status !== "ACTIVE" ||
      toUserAccount.status !== "ACTIVE"
    ) {
      return res.status(400).json({
        message:
          "Both fromAccount and toAccount must be ACTIVE to process transaction",
      });
    }

    /**
     * 4. Derive sender balance from ledger
     */

    const fromUserBalance = await ledgerModel.aggregate([
      { $match: { account: fromUserAccount._id } },
      {
        $group: {
          _id: null,
          totalDebit: {
            $sum: {
              $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0],
            },
          },
          totalCredit: {
            $sum: {
              $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          balance: { $subtract: ["$totalCredit", "$totalDebit"] },
        },
      },
    ]);
    //   .session(session);
    const balance = fromUserBalance[0].balance;

    if (balance < amount) {
      return res.status(400).json({
        message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
      });
    }

    /**
     * 5. Create transaction (PENDING state)
     */

    const transaction = await transactionModel.create(
      [
        {
          fromAccount,
          toAccount,
          amount,
          idempotencyKey,
          status: "PENDING",
        },
      ],
      //   { session },
    );
    tx = transaction[0];
    session = await mongoose.startSession();
    session.startTransaction();
    throw new Error("Testing failed scenario");

    const debitLedgerEntry = await ledgerModel.create(
      [
        {
          account: fromAccount,
          amount: amount,
          transaction: tx._id,
          type: "DEBIT",
        },
      ],
      { session },
    );

    const creditLedgerEntry = await ledgerModel.create(
      [
        {
          account: toAccount,
          amount: amount,
          transaction: tx._id,
          type: "CREDIT",
        },
      ],
      { session },
    );

    tx.status = "COMPLETED";
    await tx.save({ session });

    await session.commitTransaction();
    await session.endSession();

    await sendTransactionSuccessEmail(
      req.user.email,
      req.user.name,
      amount,
      toAccount,
    );

    return res.status(201).json({
      message: "Transaction completed successfully",
      transaction: transaction,
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    if (tx) {
      await transactionModel.findByIdAndUpdate(tx._id, {
        status: "FAILED",
        failureReason: error.message,
      });
      sendTransactionFailedEmail(
        req.user?.email,
        req.user?.name,
        req.body.amount,
        req.body.toAccount,
      );
    }

    return res.status(500).json({
      message: error.message,
    });
  }
};

const createInitialFundsTransaction = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
      return res.status(400).json({
        message: "toAccount, Amount, and idempotency key are required",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than 0",
      });
    }

    const existingTransaction = await transactionModel
      .findOne({
        idempotencyKey,
      })
      .session(session);

    if (existingTransaction) {
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: existingTransaction,
      });
    }

    const toUserAccount = await accountModel
      .findOne({ user: toAccount })
      .session(session);

    if (!toUserAccount) {
      return res.status(400).json({
        message: "Invalid toAccount",
      });
    }

    const fromUserAccount = await accountModel
      .findOne({
        user: req.user._id,
      })
      .session(session);

    if (!fromUserAccount) {
      return res.status(400).json({
        message: "System user account not found",
      });
    }

    const transaction = await transactionModel.create(
      [
        {
          fromAccount: fromUserAccount._id,
          toAccount: toUserAccount._id,
          amount,
          idempotencyKey,
          status: "PENDING",
        },
      ],
      { session },
    );

    const tx = transaction[0];

    const debitLedgerEntry = await ledgerModel.create(
      [
        {
          account: fromUserAccount._id,
          amount: amount,
          transaction: tx._id,
          type: "DEBIT",
        },
      ],
      { session },
    );

    const creditLedgerEntry = await ledgerModel.create(
      [
        {
          account: toUserAccount._id,
          amount: amount,
          transaction: tx._id,
          type: "CREDIT",
        },
      ],
      { session },
    );

    tx.status = "COMPLETED";
    await tx.save({ session });

    await session.commitTransaction();
    await session.endSession();

    return res.status(201).json({
      message: "Initial funds transaction completed successfully",
      transaction: tx,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      message: error.message,
    });
  }
};

const reverseTransactionController = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const { transactionId } = req.params;
    const { reason } = req.body;

    const transaction = await transactionModel
      .findById(transactionId)
      .session(session);

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    if (transaction.status === "REVERSED") {
      return res.status(400).json({
        message: "Transaction already reversed",
      });
    }

    if (transaction.status !== "COMPLETED") {
      return res.status(400).json({
        message: "Only completed transactions can be reversed",
      });
    }

    tx = transaction;

    await ledgerModel.create(
      [
        {
          account: tx.fromAccount,
          amount: tx.amount,
          transaction: tx._id,
          type: "CREDIT",
        },
        {
          account: tx.toAccount,
          amount: tx.amount,
          transaction: tx._id,
          type: "DEBIT",
        },
      ],
      { session, ordered: true },
    );

    tx.status = "REVERSED";
    tx.reversalReason = reason;
    tx.reversedAt = new Date();

    await tx.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Transaction reversed successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createTransaction,
  createInitialFundsTransaction,
  reverseTransactionController,
};
