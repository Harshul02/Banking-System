const nodemailer = require("nodemailer");
let transporter;

const initializeMailer = async () => {
  const account = await nodemailer.createTestAccount();

  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });

  console.log("Mailer initialized");
};

const sendEmail = async (to, subject, text, html) => {
    transporter
      .sendMail({
        from: "Example App <no-reply@example.com>",
        to: to,
        subject: subject,
        text: text,
        // html: body,
      })
      .then((info) => {
        console.log("Message sent: %s", info.messageId);
        // Get a URL to preview the message in Ethereal's web interface
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      })
      .catch((error) => {
        console.log(error);
      });
//   });
};

const sendRegisterEmail = async (userEmail, name) => {
  const subject = `Welcome to MyBanking`;
  const text = `Hello ${name}, \n\nThank you for registering at MyBanking.\nWe are excited to have you on board.\n\nThanks & Regards,\nMyBanking Private Limited`;
  const html = `<h1>Hello ${name}</h1>,<p>Thank you for registering at MyBanking.</p>\n<p>We are excited to have you on board.</p>\n\n<p>Thanks & Regards,</p>\n<p>MyBanking Private Limited<p>`;

  await sendEmail(userEmail, subject, text, html);
};

const sendTransactionSuccessEmail = async (userEmail, name, amount, toAccount)=>{
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\nYour transaction of ${amount} to account ${toAccount} was successful.\n\nBest Regards,\nMyBanking Private Limited`;
    const html = `<h1>Hello ${name},</h1>\n\n<p>Your transaction of ${amount} to account ${toAccount} was successful.</p>\n\n<p>Best Regards,</p>\n<p>MyBanking Private Limited</p>`

    await sendEmail(userEmail, subject, text, html);
}

const sendTransactionFailedEmail = async (userEmail, name, amount, toAccount)=>{
    const subject = 'Transaction Failed!';
    const text = `Hello ${name},\nWe regret to inform you that your transaction of ${amount} to account ${toAccount} was failed.\n\nBest Regards,\nMyBanking Private Limited`;
    const html = `<h1>Hello ${name},</h1>\n\n<p>We regret to inform you that your transaction of ${amount} to account ${toAccount} was failed.</p>\n\n<p>Best Regards,</p>\n<p>MyBanking Private Limited</p>`

    await sendEmail(userEmail, subject, text, html);
}

module.exports = { sendRegisterEmail, initializeMailer, sendTransactionSuccessEmail, sendTransactionFailedEmail };
