const accountModel = require("../models/account.model");
const ledgerModel = require("../models/ledger.model");

const createAccountController = async (req, res) => {
  try {
    const user = req.user;
    const account = await accountModel.create({ user: user._id });
    res
      .status(201)
      .json({
        message: "Account Created Successfully",
        status: "Success",
        account,
      });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const getUserAccountsController = async (req, res) => {
  try {
    const accounts = await accountModel.find({ user: req.user._id });

    res.status(200).json({ accounts });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const getUserAccountBalance = async (req, res) => {
  try {
    const accountId = req.params.accountId;
    const account = await accountModel.findOne({
      _id: accountId,
      user: req.user._id,
    });
    if (!account) {
      return res.status(400).json({
        message: "Account Not Found",
      });
    }
    const balance = await ledgerModel.aggregate([
        {$match: {account : account._id}},
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

    res.status(200).json({
      accountId: account._id,
      balance: balance[0].balance,
    });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

module.exports = {
  createAccountController,
  getUserAccountsController,
  getUserAccountBalance
};
