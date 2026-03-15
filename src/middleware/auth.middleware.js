const userModel = require("../models/user.model");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");

function extractToken(req) {
  const cookieToken = req.cookies?.token;
  const authHeader = req.headers.authorization;

  if (cookieToken) return cookieToken;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split("Bearer ")[1];
  }

  return null;
}

async function authMiddleware(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access, token is missing",
      });
    }

    const isBlackListed = await tokenBlackListModel.findOne({ token });

    if (isBlackListed) {
      return res.status(401).json({
        message: "Unauthorized access, token is invalid",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized access, user not found",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized access",
      error: error.message,
    });
  }
}

async function authSystemUserMiddleware(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access, token is missing",
      });
    }

    const isBlackListed = await tokenBlackListModel.findOne({ token });

    if (isBlackListed) {
      return res.status(401).json({
        message: "Unauthorized access, token is invalid",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel
      .findById(decoded.userId)
      .select("+systemUser");

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized access, user not found",
      });
    }

    if (!user.systemUser) {
      return res.status(403).json({
        message: "Forbidden access, not a system user",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized access",
      error: error.message,
    });
  }
}

module.exports = { authMiddleware, authSystemUserMiddleware };