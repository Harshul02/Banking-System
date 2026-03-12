const express = require("express");
const { userRegisterController, userLoginController, userLogoutController } = require("../controllers/user.controller");
const router = express.Router();

/**
 * - POST /api/auth/register
 */
router.post("/register", userRegisterController);

/**
 * - POST /api/auth/login
 */

router.post("/login", userLoginController);

/**
 * - POST /api/auth/logout
 */
router.post("/logout", userLogoutController);

module.exports = router;