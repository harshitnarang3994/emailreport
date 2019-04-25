var appConfig = require('./config/snowconfig');
var nodeMailer = require('nodemailer');
var ejs = require('ejs');
var snowTaskEmailService = require('./services/snowTaskEmailService');
var logger = require('./logger/logger').successlog;


var puppeteer = require('puppeteer');
var fs = require('fs')

const readline = require('readline');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

const id = "173vOy3dsxoGq4FqrcBd7IaIDvv6a4M0j";

var fileMetadata = {
    'name': 'EmailReport'
};






/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

/**
 * Upload files 
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function uploadfiles(auth) {
    const drive = google.drive({ version: 'v3', auth });


    var media = {
        mimeType: 'application/pdf',
        body: fs.createReadStream('temp/emailreport.pdf')
    };

    drive.files.update({
        resource: fileMetadata,
        fileId: id,
        media: media,
    }, (err, res) => {
        if (err) {
            console.log(err);
            return;
        }
        console.log("+++", res.data);

    });
}
//1kzSgbYwHT4ZEOV6sEIqFgkCBmFqLKRkB
function sendEmail() {
    var date = new Date();
    var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    var starttimeDiff = Math.abs(firstDay.getTime() - date.getTime());
    var startdiffdays = Math.ceil(starttimeDiff / (1000 * 3600 * 24));
    var queryobjfortabularmail = { "startdiff": startdiffdays - 1, "enddiff": "0", "assignmentgroup": appConfig.all[0] + '^ORassignment_group=' + appConfig.all[1] + '^ORassignment_group=' + appConfig.all[2] }
    var date = new Date();
    var _browser;
    var _page;


    logger.debug("difference of days" + startdiffdays)
    console.log("difference of days" + startdiffdays)
    // We can add the assignment group here
    logger.debug("SendEmail job started")
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

            var html2 = html + '<div>' +
                '<div class="col-md-6 col-lg-6 col-sm-12 col-xs-12">' +
                '<div style="background-color:aqua;   border-bottom-left-radius:50%;border-bottom-right-radius:50%;">' +
                '<h3 class="font-family" style="text-align: center;"><u>Automation Statistics For Current Month</u></h3>' +
                '</div>' +
                '<img style="background-color: antiquewhite;width: 450px;" src="automationstatisticseverydaystackedBarChart.png">' +
                '</div>' +
                '<div class="col-md-5 col-lg-5 col-sm-12 col-xs-12">' +
                '<div style="background-color:aqua;   border-bottom-left-radius:50%; border-bottom-right-radius:50%;">' +
                '<h3 class="font-family" style="text-align: center;"><u>Processed Task and Incident</u></h3>' +
                '</div>' +
                '<img src="TaskandIncidentpieChart.png" style="width: 370px;background-color: antiquewhite;">' +
                '</div>' +
                '<div class="w-100"></div>' +
                '<div class="col-md-6 col-lg-6 col-sm-12 col-xs-12">' +
                '<div style="background-color:aqua;   border-bottom-left-radius:50%;border-bottom-right-radius:50%;">' +
                '<h3 class="font-family" style="text-align: center;"><u>Automation Statistics Past Six Months</u></h3>' +
                '</div>' +
                '<img src="automationstatisticspastSixmonthsstackedBarChart.png" style="background-color: antiquewhite;width: 450px;">' +
                '</div>' +
                '<div class="col-md-5 col-lg-5 col-sm-12 col-xs-12">' +
                '<div style="background-color:aqua;   border-bottom-left-radius:50%;border-bottom-right-radius:50%;">' +
                '<h3 class="font-family" style="text-align: center;"><u>Tickets Automated Category Based</u></h3>' +
                '</div>' +
                '<img src="automationstackedBarChart.png" style="background-color: antiquewhite;width: 430px;">' +
                '</div>' +

                '</div>'




            fs.writeFile("./temp/template.html", html2, function (err) {
                if (err) {
                    return console.log(err);
                }
                console.log("The file was saved!");
                puppeteer
                    .launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
                    .then(browser => (_browser = browser))
                    .then(browser => (_page = browser.newPage()))
                    .then(page => page.goto(appConfig.pathTopdf))
                    .then(() => _page)
                    .then(page => page.pdf({ path: './temp/emailreport.pdf', format: 'A4' }))
                    .then(() => _browser.close())





            });

            // For graph section we can append the original html with the graph div 
            // So there will be two html one for email part and other for the pdf part  







            var MailOptions = {
                from: appConfig.SenderEmailAddress,
                to: appConfig.mailList,
                subject: 'Service Now BOT Productivity Report',
                text: 'Service Now Report for the current month',
                html: html + '<div>' +
                    '<div class="col-md-6 col-lg-6 col-sm-12 col-xs-12">' +
                    '<div style="background-color:aqua;   border-bottom-left-radius:50%;border-bottom-right-radius:50%;">' +
                    '<h3 class="font-family" style="text-align: center;"><u>Automation Statistics For Current Month</u></h3>' +
                    '</div>' +
                    '<img style="background-color: antiquewhite;width: 450px;" src="cid:image1">' +
                    '</div>' +
                    '<div class="col-md-5 col-lg-5 col-sm-12 col-xs-12">' +
                    '<div style="background-color:aqua;   border-bottom-left-radius:50%; border-bottom-right-radius:50%;">' +
                    '<h3 class="font-family" style="text-align: center;"><u>Processed Task and Incident</u></h3>' +
                    '</div>' +
                    '<img src="cid:image2" style="width: 370px;background-color: antiquewhite;">' +
                    '</div>' +
                    '<div class="w-100"></div>' +
                    '<div class="col-md-6 col-lg-6 col-sm-12 col-xs-12">' +
                    '<div style="background-color:aqua;   border-bottom-left-radius:50%;border-bottom-right-radius:50%;">' +
                    '<h3 class="font-family" style="text-align: center;"><u>Automation Statistics Past Six Months</u></h3>' +
                    '</div>' +
                    '<img src="cid:image4" style="background-color: antiquewhite;width: 450px;">' +
                    '</div>' +
                    '<div class="col-md-5 col-lg-5 col-sm-12 col-xs-12">' +
                    '<div style="background-color:aqua;   border-bottom-left-radius:50%;border-bottom-right-radius:50%;">' +
                    '<h3 class="font-family" style="text-align: center;"><u>Tickets Automated Category Based</u></h3>' +
                    '</div>' +
                    '<img src="cid:image3" style="background-color: antiquewhite;width: 430px;">' +
                    '</div>' +

                    '</div>',
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

                    // Uploading pdf to google drive
                    fs.readFile('credentials.json', (err, content) => {
                        if (err) return console.log('Error loading client secret file:', err);
                        // Authorize a client with credentials, then call the Google Drive API.
                        authorize(JSON.parse(content), uploadfiles);
                    })
                    res.json({ Message: "Email is sent to user" });
                }
            });
        });
    });
}

sendEmail();