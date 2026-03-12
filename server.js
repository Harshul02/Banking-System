require("dotenv").config();
const {connectToDB} = require("./src/config/db");
const {initializeMailer} = require("./src/services/email.service")
const app = require('./src/app');

connectToDB();
(async ()=> await initializeMailer())();
app.listen(3000, ()=>{
    console.log("Server Running on PORT", 3000);
})