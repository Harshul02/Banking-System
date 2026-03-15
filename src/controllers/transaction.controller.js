const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const {
  sendTransactionFailedEmail,
  sendTransactionSuccessEmail,
} = require("../services/email.service");
const mongoose = require("mongoose");

const safeAbort = async (session) => {
  try {
    if (session?.inTransaction()) {
      await session.abortTransaction();
    }
  } catch (err) {
    console.error("Abort transaction error:", err.message);
  }
};

const safeEndSession = async (session) => {
  try {
    if (session) {
      await session.endSession();
    }
  } catch (err) {
    console.error("End session error:", err.message);
  }
};

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
  const session = await mongoose.startSession();
  let tx = null;

  try {
    session.startTransaction();

    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    /**
     * 1. Validate request
     */
    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
      await safeAbort(session);
      return res.status(400).json({
        message:
          "fromAccount, toAccount, amount and idempotencyKey are required",
      });
    }

    if (Number(amount) <= 0) {
      await safeAbort(session);
      return res.status(400).json({
        message: "Amount must be greater than 0",
      });
    }

    if (fromAccount === toAccount) {
      await safeAbort(session);
      return res.status(400).json({
        message: "Cannot transfer to same account",
      });
    }

    const fromUserAccount = await accountModel
      .findOne({ _id: fromAccount, user: req.user._id })
      .session(session);

    const toUserAccount = await accountModel.findById(toAccount).session(session);

    if (!fromUserAccount || !toUserAccount) {
      await safeAbort(session);
      return res.status(400).json({
        message: "Invalid fromAccount or toAccount",
      });
    }

    /**
     * 2. Validate idempotency key
     */
    const existingTransaction = await transactionModel
      .findOne({ idempotencyKey })
      .session(session);

    if (existingTransaction) {
      await safeAbort(session);

      if (existingTransaction.status === "COMPLETED") {
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: existingTransaction,
        });
      }

      if (existingTransaction.status === "PENDING") {
        return res.status(202).json({
          message: "Transaction is still processing",
          transaction: existingTransaction,
        });
      }

      if (existingTransaction.status === "FAILED") {
        return res.status(409).json({
          message: "Previous transaction attempt failed. Please retry with a new idempotency key",
          transaction: existingTransaction,
        });
      }

      if (existingTransaction.status === "REVERSED") {
        return res.status(409).json({
          message: "Transaction was reversed. Please retry with a new idempotency key",
          transaction: existingTransaction,
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
      await safeAbort(session);
      return res.status(400).json({
        message:
          "Both fromAccount and toAccount must be ACTIVE to process transaction",
      });
    }

    /**
     * 4. Derive sender balance from ledger
     */
    const fromUserBalance = await ledgerModel
      .aggregate([
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
      ])
      .session(session);

    const balance = fromUserBalance.length > 0 ? fromUserBalance[0].balance : 0;

    if (balance < Number(amount)) {
      await safeAbort(session);
      return res.status(400).json({
        message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
      });
    }

    /**
     * 5. Create transaction (PENDING state)
     */
    const transactionDocs = await transactionModel.create(
      [
        {
          fromAccount,
          toAccount,
          amount: Number(amount),
          idempotencyKey,
          status: "PENDING",
        },
      ],
      { session }
    );

    tx = transactionDocs[0];

    /**
     * 6 & 7. Create ledger entries
     */
    await ledgerModel.create(
      [
        {
          account: fromAccount,
          amount: Number(amount),
          transaction: tx._id,
          type: "DEBIT",
        },
        {
          account: toAccount,
          amount: Number(amount),
          transaction: tx._id,
          type: "CREDIT",
        },
      ],
      { session, ordered: true }
    );

    /**
     * 8. Mark transaction COMPLETED
     */
    tx.status = "COMPLETED";
    await tx.save({ session });

    /**
     * 9. Commit transaction
     */
    await session.commitTransaction();

    /**
     * 10. Send email after commit
     */
    try {
      await sendTransactionSuccessEmail(
        req.user.email,
        req.user.name,
        amount,
        toAccount
      );
    } catch (emailError) {
      console.error("Success email failed:", emailError.message);
    }

    return res.status(201).json({
      message: "Transaction completed successfully",
      transaction: tx,
    });
  } catch (error) {
    await safeAbort(session);

    if (tx?._id) {
      try {
        await transactionModel.findByIdAndUpdate(tx._id, {
          status: "FAILED",
          failureReason: error.message,
        });
      } catch (updateError) {
        console.error("Failed to update transaction status:", updateError.message);
      }

      try {
        await sendTransactionFailedEmail(
          req.user?.email,
          req.user?.name,
          req.body?.amount,
          req.body?.toAccount
        );
      } catch (emailError) {
        console.error("Failure email failed:", emailError.message);
      }
    }

    return res.status(500).json({
      message: error.message,
    });
  } finally {
    await safeEndSession(session);
  }
};

const createInitialFundsTransaction = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
      await safeAbort(session);
      return res.status(400).json({
        message: "toAccount, amount, and idempotencyKey are required",
      });
    }

    if (Number(amount) <= 0) {
      await safeAbort(session);
      return res.status(400).json({
        message: "Amount must be greater than 0",
      });
    }

    const existingTransaction = await transactionModel
      .findOne({ idempotencyKey })
      .session(session);

    if (existingTransaction) {
      await safeAbort(session);
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: existingTransaction,
      });
    }

    const toUserAccount = await accountModel.findById(toAccount).session(session);

    if (!toUserAccount) {
      await safeAbort(session);
      return res.status(400).json({
        message: "Invalid toAccount",
      });
    }

    if (toUserAccount.status !== "ACTIVE") {
      await safeAbort(session);
      return res.status(400).json({
        message: "toAccount must be ACTIVE",
      });
    }

    const fromUserAccount = await accountModel
      .findOne({ user: req.user._id })
      .session(session);

    if (!fromUserAccount) {
      await safeAbort(session);
      return res.status(400).json({
        message: "System user account not found",
      });
    }

    if (fromUserAccount.status !== "ACTIVE") {
      await safeAbort(session);
      return res.status(400).json({
        message: "System user account must be ACTIVE",
      });
    }

    const transactionDocs = await transactionModel.create(
      [
        {
          fromAccount: fromUserAccount._id,
          toAccount: toUserAccount._id,
          amount: Number(amount),
          idempotencyKey,
          status: "PENDING",
        },
      ],
      { session }
    );

    const tx = transactionDocs[0];

    await ledgerModel.create(
      [
        {
          account: fromUserAccount._id,
          amount: Number(amount),
          transaction: tx._id,
          type: "DEBIT",
        },
        {
          account: toUserAccount._id,
          amount: Number(amount),
          transaction: tx._id,
          type: "CREDIT",
        },
      ],
      { session, ordered: true }
    );

    tx.status = "COMPLETED";
    await tx.save({ session });

    await session.commitTransaction();

    return res.status(201).json({
      message: "Initial funds transaction completed successfully",
      transaction: tx,
    });
  } catch (error) {
    await safeAbort(session);

    return res.status(500).json({
      message: error.message,
    });
  } finally {
    await safeEndSession(session);
  }
};

const reverseTransactionController = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { transactionId } = req.params;
    const { reason } = req.body;

    const tx = await transactionModel.findById(transactionId).session(session);

    if (!tx) {
      await safeAbort(session);
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    if (tx.status === "REVERSED") {
      await safeAbort(session);
      return res.status(400).json({
        message: "Transaction already reversed",
      });
    }

    if (tx.status !== "COMPLETED") {
      await safeAbort(session);
      return res.status(400).json({
        message: "Only completed transactions can be reversed",
      });
    }

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
      { session, ordered: true }
    );

    tx.status = "REVERSED";
    tx.reversalReason = reason || "Reversed by system user";
    tx.reversedAt = new Date();

    await tx.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      message: "Transaction reversed successfully",
      transaction: tx,
    });
  } catch (error) {
    await safeAbort(session);

    return res.status(500).json({
      message: error.message,
    });
  } finally {
    await safeEndSession(session);
  }
};

module.exports = {
  createTransaction,
  createInitialFundsTransaction,
  reverseTransactionController,
};