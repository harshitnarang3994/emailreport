var appConfig = require('./config/snowconfig');
var nodeMailer = require('nodemailer');
var ejs = require('ejs');
var snowTaskEmailService = require('./services/snowTaskEmailService');
//var puppeteer = require('puppeteer');
//var fs = require('fs')





function sendEmail() {
    var date = new Date();
    var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    var starttimeDiff = Math.abs(firstDay.getTime() - date.getTime());
    var startdiffdays = Math.ceil(starttimeDiff / (1000 * 3600 * 24));
    var queryobjfortabularmail = { "startdiff": startdiffdays - 1, "enddiff": "0", "assignmentgroup": appConfig.accessAndCompliance };

    var _browser;
    var _page;

    console.log("difference of days" + startdiffdays)
    // We can add the assignment group here

    console.log("SendEmail job started");
    snowTaskEmailService.saveSnowTask(queryobjfortabularmail.startdiff, queryobjfortabularmail.enddiff, queryobjfortabularmail.assignmentgroup, function (err, result) {

        var transporter = nodeMailer.createTransport({

            service: 'Gmail',
            auth: {
                user: appConfig.SenderEmailAddress,
                pass: appConfig.SenderEmailPassword
            }
        });
        ejs.renderFile('./temp/template.ejs', result, function (err, html) {

            // fs.writeFile("./temp/template.html", html, function (err) {
            //     if (err) {
            //         return console.log(err);
            //     }
            //     console.log("The file was saved!");
            //     puppeteer
            //         .launch({headless: true, args: ['--no-sandbox'] })
            //         .then(browser => (_browser = browser))
            //         .then(browser => (_page = browser.newPage()))
            //         .then(page => page.goto(appConfig.pathTopdf))
            //         .then(() => _page)
            //         .then(page => page.pdf({ path: './temp/emailreport.pdf' }))
            //         .then(() => _browser.close());

            // });

            // For graph section we can append the original html with the graph div 
            // So there will be two html one for email part and other for the pdf part  






            var MailOptions = {
                from: appConfig.SenderEmailAddress,
                to: appConfig.mailList,
                subject: 'Service Now BOT Productivity Report',
                text: 'Service Now Report for the current month',
                html: html,
                attachments: [{
                    filename: 'automationstatisticseverydaystackedBarChart.png',
                    path: __dirname + '/temp/automationstatisticseverydaystackedBarChart.png',
                    cid: 'image1'
                },
                {
                    filename: 'TaskandIncidentpieChart.png',
                    path: __dirname + '/temp/TaskandIncidentpieChart.png',
                    cid: 'image2'
                }, {
                    filename: 'automationstackedBarChart.png',
                    path: __dirname + '/temp/automationstackedBarChart.png',
                    cid: 'image3'
                },
                {
                    filename: 'automationstatisticspastSixmonthsstackedBarChart.png',
                    path: __dirname + '/temp/automationstatisticspastSixmonthsstackedBarChart.png',
                    cid: 'image4'
                }]
            }

            transporter.sendMail(MailOptions, function (error, info) {
                if (error) {
                    console.log('Email Error ' + error);
                }
                else {
                    console.log('Email Sent to user ' + info.response);
                    res.json({ Message: "Email is sent to user" });
                }
            });
        });
    });
}

sendEmail();