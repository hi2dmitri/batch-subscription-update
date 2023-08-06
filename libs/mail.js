let nodemailer = require("nodemailer");
let aws = require("@aws-sdk/client-ses");

const REGION = "us-east-1";

let transporter;

function data() {
  if (!transporter) {
    // create reusable transporter object using SMTP transport

    let instanceName = process.env.INSTANCE_NAME;

    if (instanceName === "localhost") {
      transporter = {
        sendMail: function (mailOptions, callBack) {
          mailOptions.attachments = "";
          console.log("NOT Sending email for localhost.");
          console.log(JSON.stringify(mailOptions));
          callBack(null, {
            response: "Local Instance: Wrote the mail to local output",
          });
        },
      };
    } else {
      const ses = new aws.SES({
        region: REGION,
        credentials: {
          accessKeyId: process.env.EMAIL_SES_ACCESS_KEY_ID,
          secretAccessKey: process.env.EMAIL_SES_SECRET_ACCESS_KEY,
        },
      });

      // create Nodemailer SES transporter
      transporter = nodemailer.createTransport({
        SES: { ses, aws },
      });
    }
  }

  var sendMail = function (
    toEmail,
    subject,
    plainText,
    htmlText  ) {
    // setup e-mail data with unicode symbols
    let mailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME;
    
    const mailOptions = {
      from: mailFrom, // sender address
      to: toEmail, // list of receivers
      subject: subject, // Subject line
      html: htmlText ? htmlText : plainText, // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log("Error in sending email.");
        console.log(error);
      } else {
        console.log("Message sent: " + info.response + " to : " + toEmail);
      }
    });
  };

  return {
    SendMail: sendMail,
  };
}

module.exports = data;
