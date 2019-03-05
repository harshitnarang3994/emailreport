var appConfig = require('./config/snowconfig');
var nodeMailer = require('nodemailer');
var ejs = require('ejs');
var snowTaskEmailService = require('./services/snowTaskEmailService');


function sendEmail() {
    var date = new Date();
    var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    var starttimeDiff = Math.abs(firstDay.getTime() - date.getTime());
    var startdiffdays = Math.ceil(starttimeDiff / (1000 * 3600 * 24));
    var queryobjfortabularmail = { "startdiff": startdiffdays - 1, "enddiff": "0", "assignmentgroup": appConfig.accessAndCompliance };

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




            //     // puppeteer.launch().then(browser => {
            //     //     // some processing
            //     //     return browser.newPage();
            //     // }).then(page => {
            //     //     return page.goto('file:///home/harshit/core/server/temp/template.html');

            //     // }).then(page =>{page.pdf({
            //     //     path: './test.pdf',
            //     //     format: 'A4',
            //     //     margin: {
            //     //         top: "20px",
            //     //         left: "20px",
            //     //         right: "20px",
            //     //         bottom: "20px"
            //     //     }
            //     // })}).then(browser.close());

            // });








            var MailOptions = {
                from: 'harshit.narang@relevancelab.com',
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