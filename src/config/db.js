const mongoose = require("mongoose");

const connectToDB = async () => {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log("DB connected successfully");
    })
    .catch((error) => {
      console.log(error);
      process.exit(1);
    });
};

module.exports = { connectToDB };
