const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const { sendRegisterEmail } = require("../services/email.service");
const tokenBlackListModel = require("../models/blackList.model");

/**
 *
 * - user register controller
 * - POST /api/auth/register
 */
const userRegisterController = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const isExist = await userModel.findOne({ email });
    if (isExist) {
      return res
        .status(422)
        .json({ message: "User already exist with email", status: "failed" });
    }
    const user = await userModel.create({
      email,
      password,
      name,
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    res.status(201).json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
      token,
    });
    await sendRegisterEmail(user.email, user.name);
  } catch (error) {
    res.status(500).json(error.message);
  }
};

/**
 *
 * - user Login Controller
 * - POST /api/auth/login
 */
const userLoginController = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email }).select("+password");
    if (!user) {
      res
        .status(401)
        .json({ message: "User Not Found, Please Register", status: "failed" });
    }
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      res.status(401).json({ message: "Wrong Password", status: "failed" });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

/**
 * - User Logout Controller
 * - POST /api/auth/logout
 */
const userLogoutController = async (req,res)=>{
    try{
    const token = req.cookies.token || req.headers["authorization"].split("Bearer ")[1];

    if(!token){
        return res.status(400).json({
            message: "User logged out successfully",
        });
    }
    await tokenBlackListModel.create({
        token: token,
    });
    res.clearCookie("token", "");
    res.status(200).json({
        message: "User logged out successfully",
    });
}catch(error){
    res.status(500).json(error.message);
}

}

module.exports = { userRegisterController, userLoginController, userLogoutController };
