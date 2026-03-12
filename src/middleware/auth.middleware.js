const userModel = require("../models/user.model");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");

async function authMiddleware(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies.token) ||
      req.headers["authorization"].split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access, token is missing",
      });
    }

    const isBlackListed = await tokenBlackListModel.findOne({token});

    if(isBlackListed){
        return res.status(401).json({
            message: "Unauthorized access, token is invalid",
        })
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.userId);
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json(error.message);
  }
}

async function authSystemUserMiddleware(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies.token) ||
      req.headers["authorization"].split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access, token is missing",
      });
    }

    const isBlackListed = await tokenBlackListModel.findOne({token});

    if(isBlackListed){
        return res.status(401).json({
            message: "Unauthorized access, token is invalid",
        })
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById({_id: decoded.userId}).select("+systemUser");

    if (!user.systemUser) {
      return res.status(403).json({
        message: "Forbidden access, not a system user",
      });
    }
    req.user = user;
    next();
  } catch (error) {
    console.log(error.message);
    res.status(500).json(error.message);
  }
}

module.exports = { authMiddleware, authSystemUserMiddleware };
