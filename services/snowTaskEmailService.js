var async = require("async");
var appConfig = require("../config/snowconfig");

var vega = require("vega");
var request = require("request");
var fs = require("fs");
var Promise = require("promise");
var csv = require("csvtojson");
var logger = require("../logger/logger").successlog;

var snowtaskEmailService = (module.exports = {});

var username = appConfig.username;
var password = appConfig.password;

var date = new Date();
var from = new Date(date.getFullYear(), date.getMonth(), 1);
var curmonth = date.getMonth();

var auth = "Basic " + Buffer.from(username + ":" + password).toString("base64");

// Set the header

snowtaskEmailService.saveSnowTask = function saveSnowTask(
  startdiff,
  enddiff,
  assignmentgroup,
  callback
) {
  console.log(assignmentgroup);

  var urlfortask =
    `https://scholastic.service-now.com/api/now/table/sc_task?sysparm_query=sys_updated_onBETWEENjavascript:gs.daysAgoStart(` +
    startdiff +
    `)@javascript:gs.daysAgoEnd(` +
    enddiff +
    `)^assignment_group=` +
    assignmentgroup;
  var urlforincident =
    `https://scholastic.service-now.com/api/now/table/incident?sysparm_query=sys_updated_onBETWEENjavascript:gs.daysAgoStart(` +
    startdiff +
    `)@javascript:gs.daysAgoEnd(` +
    enddiff +
    `)^assignment_group=` +
    assignmentgroup;
  var option = "assigned_to";
  var urlBasedonOption = `https://scholastic.service-now.com/api/now/table/sys_user?sysparm_query=sys_idIN`;

  async.waterfall(
    [
      function(next) {
        gettingTheTaskandIncidentHalfyearly(option, assignmentgroup, next);
      },
      function(data, next) {
        readCategoryFromConfig(data, urlfortask, next);
      },
      function(taskandincidentdata, next) {
        creationofObjectforMail(taskandincidentdata, next);
      }
    ],
    function(err, results) {
      if (err) {
        //  logger.error(err);
        callback(err, null);
        return;
      }
      callback(null, results);
      return;
    }
  );
};

// For getting unique value

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

function gettingTheTaskandIncidentHalfyearly(
  option,
  assignmentgroup,
  callback
) {
  async.waterfall(
    [
      function(next) {
        calculateTaskStatisticsForPastSixMOnths(assignmentgroup, next);
      },
      function(taskandincidentData, next) {
        calculateIncidentStatisticsForPastSixMonths(
          taskandincidentData,
          option,
          assignmentgroup,
          next
        );
      },
      function(taskandincidentData, next) {
        calculatethefailedstatusBycallingScholastic(taskandincidentData, next);
      }
    ],
    function(err, results) {
      if (err) {
        // logger.error(err);
        callback(err, null);
        return;
      }
      callback(null, results);
      return;
    }
  );
}

function calculatethefailedstatusBycallingScholastic(
  taskandincidentdata,
  callback
) {
  // Iterate array and make get api call (taskandincidentdata.arrforlastday)

  makepostrequest(appConfig.scholasticApi + "/auth/signin").then(function(
    token
  ) {
    getRequest(appConfig.scholasticApi + "/bot", token).then(function(
      botresult
    ) {
      async.forEach(
        taskandincidentdata.arrforLastdayData,
        function(arritem, cb) {
          console.log("Sys_id" + arritem.sysid);
          console.log(
            appConfig.scholasticApi +
              "/bot/" +
              appConfig[arritem.shortdescription].botid +
              "/bot-history"
          );
          logger.debug(
            appConfig.scholasticApi +
              "/bot/" +
              appConfig[arritem.shortdescription].botid +
              "/bot-history"
          );
          //appConfig[arritem.shortdescription].botid

          var id = "";
          var botobj = JSON.parse(botresult);

          botobj.bots.forEach(function(item) {
            if (item.id === appConfig[arritem.shortdescription].botid) {
              id = item._id;
            }
          });
          logger.debug("id=" + id);
          // logger.debug("bot name" + appConfig[arritem.shortdescription])
          console.log(
            appConfig.scholasticApi +
              "/bot/" +
              id +
              "/bot-history?page=1&pageSize=100&sortBy=startedOn&sortOrder=desc"
          );
          getRequest(
            appConfig.scholasticApi +
              "/bot/" +
              id +
              "/bot-history?page=1&pageSize=100&sortBy=startedOn&sortOrder=desc",
            token
          ).then(function(result) {
            //  logger.debug(appConfig.scholasticApi + "/bot/" + id + "/bot-history?page=1&pageSize=100&sortBy=startedOn&sortOrder=desc")
            var obj = JSON.parse(result);
            var flag = false;

            async.forEach(
              obj.botHistory,
              function(item, cbForReason) {
                logger.debug(
                  "ticket NUmber" +
                    item.auditTrailConfig.serviceNowTicketRefObj.ticketNo
                );

                logger.debug(arritem.sysid);
                if (
                  item.auditTrailConfig.serviceNowTicketRefObj.ticketNo ===
                  arritem.sysid
                ) {
                  logger.debug("success");
                  flag = true;
                }

                cbForReason();
              },
              function(err) {
                if (err) {
                  console.log("error in iteration");
                } else {
                  if (flag) {
                    logger.debug("TRiggered but failed");
                    arritem.reason = "Triggered but failed";
                  } else {
                    logger.debug("Not Triggered");
                    arritem.reason = "Not Triggered";
                  }
                  cb();
                }
              }
            );
          });

          // arritem.push(objforlastday);
        },
        function(err) {
          if (err) {
            callback(err, null);
          } else {
            logger.debug(
              "array last day" +
                JSON.stringify(taskandincidentdata.arrforLastdayData)
            );
            callback(null, taskandincidentdata);
          }
        }
      );
    });
  });
}

//This function is for yearly

function calculateTaskStatisticsForPastSixMOnths(assignmentgroup, callback) {
  console.log("inside task");
  var diff = 0;
  var urlfortask =
    `https://scholastic.service-now.com/sc_task.do?CSV&sysparm_fields=sys_updated_on,state,assigned_to,short_description,number,closed_by,sys_id,assignment_group,closed_at,u_cat_item,closed_by&sysparm_query=sys_updated_onBETWEENjavascript:gs.daysAgoStart(180)@javascript:gs.daysAgoEnd(0)^assignment_group=` +
    assignmentgroup;
  var options = {
    url: urlfortask,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json"
    }
  };
  var arrforfailedtaskLastDay = [];
  var arrforfailedTaskLastWeek = [];
  var countTask = [];
  var botarr = [];
  var countTaskMonth = new Array(31).fill(0);
  var arrforlastday = [];
  var arrforcurrMOnth = [];
  var arr = [];
  var resourcearraylastday = [];
  var taskandincidentData = {};

  var countfailtask = 0;

  var countCurrentMonthTaskautomated = 0,
    countCurrentMonthTaskmanual = 0,
    countofCurrentMonthInboundTickets = 0;
  var countLastdayTaskautomated = 0,
    countlastdayTaskmanual = 0,
    countoffailtaskLastDay = 0,
    countoflastdayInboundTickets = 0;
  var countLastWeekTaskautomated = 0,
    countlastWeekTaskmanual = 0,
    countoffailtaskLastWeek = 0,
    countoflastweekInboundTickets = 0;

  var promise = new Promise(function(resolve, reject) {
    request
      .get(options, function(error, response, body) {
        if (error) reject(error);
        else resolve(response);
      })
      .pipe(fs.createWriteStream(__dirname + "/../temp/task.csv"));
  });

  promise
    .then(function(value) {
      //  console.log(value);
      csv()
        .fromFile(__dirname + "/../temp/task.csv")
        .then(function(data) {
          //when parse finished, result will be emitted here.

          for (var i = 0; i < data.length; i++) {
            var checkformonth = new Date(data[i]["sys_updated_on"]);
            if (date.getMonth() === checkformonth.getMonth()) {
              if (data[i]["assigned_to"]) {
                arr.push(data[i]["assigned_to"]);
              }
            }
            if (
              appConfig[data[i]["short_description"]] &&
              appConfig[data[i]["short_description"]].automated === true &&
              appConfig[data[i]["short_description"]].botid
            ) {
              botarr.push(appConfig[data[i]["short_description"]].botid);
            }
          }
          // For Termination
          botarr.push("ad_disable_user");
          botarr.push("as400_profile_remove");
          var uniquebots = botarr.filter(onlyUnique);
          console.log("-09-" + uniquebots);
          var botgraph_data = {};

          for (var key of uniquebots) {
            botgraph_data[key] = {
              automatedCount: 0,
              automatedCountHalfyearly: 0,
              failedCount: 0
            };
          }

          var unique = arr.filter(onlyUnique);

          taskandincidentData.unique = unique;
          var graph_data = {};

          // for success and failure runs we can add in the object only

          for (var key of unique) {
            graph_data[key] = {
              countOfCloseTask: 0,
              countOfCloseIncident: 0
            };
          }

          for (var i = 0; i < data.length; i++) {
            var objforlastday = {};
            var objforcurrMonth = {};
            // here we will filter the last day data and week data

            var isTerminate = data[i]["short_description"].split(" ")[0];
            var check = new Date(data[i]["sys_updated_on"]);
            var timeDiff = Math.abs(date.getTime() - check.getTime());
            var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

            var indexformonth = new Date(data[i]["sys_updated_on"]).getDate();

            var index = new Date(data[i]["sys_updated_on"]).getMonth();

            var currentMonth = new Date().getMonth();

            if (
              new Date().getFullYear() ===
              new Date(data[i]["sys_updated_on"]).getFullYear()
            ) {
              diff = currentMonth - index;
            } else {
              diff = 12 + currentMonth - index;
            }

            //&& (date.getDate() - check.getDate() === 1)
            // Last day data
            if (
              diffDays >= 1 &&
              diffDays <= 2 &&
              date.getMonth() === check.getMonth() &&
              date.getDate() - check.getDate() === 1
            ) {
              console.log(check.getDate());
              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] === "TDMS AutoBOT"
              ) {
                countLastdayTaskautomated++;
              } else if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] &&
                data[i]["assigned_to"] != "TDMS AutoBOT"
              ) {
                countlastdayTaskmanual++;
              }
              // checking if assigned to is no one

              if (
                isTerminate === "Security" ||
                isTerminate === "Terminate" ||
                isTerminate === "Delete"
              ) {
                if (
                  data[i]["state"] != "Closed Complete" &&
                  data[i]["assigned_to"] != ""
                ) {
                  objforlastday.name = appConfig[isTerminate].botid;
                  objforlastday.tasknumber = data[i]["number"];
                  objforlastday.shortdescription = isTerminate;
                  objforlastday.sysid = data[i]["sys_id"];

                  if (data[i]["assigned_to"] === "") {
                    objforlastday.assignedto = "Unassigned";
                  } else {
                    objforlastday.assignedto = data[i]["assigned_to"];
                  }

                  arrforlastday.push(objforlastday);
                  countoffailtaskLastDay++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] === "TDMS AutoBOT"
                ) {
                  countLastdayTaskautomated++;
                  countoflastdayInboundTickets++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] &&
                  data[i]["assigned_to"] != "TDMS AutoBOT"
                ) {
                  countlastdayTaskmanual++;

                  countoflastdayInboundTickets++;
                }
              }

              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] != "Closed Complete" &&
                data[i]["assigned_to"] != ""
              ) {
                objforlastday.name =
                  appConfig[data[i]["short_description"]].botid;
                objforlastday.tasknumber = data[i]["number"];
                objforlastday.shortdescription = data[i]["short_description"];
                objforlastday.sysid = data[i]["sys_id"];

                if (data[i]["assigned_to"] === "") {
                  objforlastday.assignedto = "Unassigned";
                } else {
                  objforlastday.assignedto = data[i]["assigned_to"];
                }

                arrforlastday.push(objforlastday);
                countoffailtaskLastDay++;
              }

              //total tickets whoe state is closed complete it can be manual or automated
              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"]
              ) {
                countoflastdayInboundTickets++;
              }
              if (
                data[i]["short_description"].indexOf("AS400/OTC/Salesforce") >
                  -1 &&
                data[i]["state"] === "Closed Complete"
              ) {
                countlastdayTaskmanual++;
                countoflastdayInboundTickets++;
              }
            } else if (
              diffDays >= 1 &&
              diffDays <= 2 &&
              date.getMonth() != check.getMonth() &&
              (check.getDate() === 31 || check.getDate() === 30)
            ) {
              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] === "TDMS AutoBOT"
              ) {
                countLastdayTaskautomated++;
              } else if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === false &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] != "TDMS AutoBOT"
              ) {
                countlastdayTaskmanual++;
              }
              // checking if assigned to is no one

              if (
                isTerminate === "Security" ||
                isTerminate === "Terminate" ||
                isTerminate === "Delete"
              ) {
                if (
                  data[i]["state"] != "Closed Complete" &&
                  data[i]["assigned_to"] != ""
                ) {
                  objforlastday.name = appConfig[isTerminate].botid;
                  objforlastday.tasknumber = data[i]["number"];
                  objforlastday.shortdescription = isTerminate;
                  objforlastday.sysid = data[i]["sys_id"];

                  if (data[i]["assigned_to"] === "") {
                    objforlastday.assignedto = "Unassigned";
                  } else {
                    objforlastday.assignedto = data[i]["assigned_to"];
                  }

                  arrforlastday.push(objforlastday);
                  countoffailtaskLastDay++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] === "TDMS AutoBOT"
                ) {
                  countLastdayTaskautomated++;
                  countoflastdayInboundTickets++;
                }
              }

              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] != "Closed Complete" &&
                data[i]["assigned_to"] != ""
              ) {
                objforlastday.name =
                  appConfig[data[i]["short_description"]].botid;
                objforlastday.tasknumber = data[i]["number"];
                objforlastday.shortdescription = data[i]["short_description"];
                objforlastday.sysid = data[i]["sys_id"];

                if (data[i]["assigned_to"] === "") {
                  objforlastday.assignedto = "Unassigned";
                } else {
                  objforlastday.assignedto = data[i]["assigned_to"];
                }

                arrforlastday.push(objforlastday);
                countoffailtaskLastDay++;
              }

              //total tickets whoe state is closed complete it can be manual or automated
              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"]
              ) {
                countoflastdayInboundTickets++;
              }
              if (
                data[i]["short_description"].indexOf("AS400/OTC/Salesforce") >
                  -1 &&
                data[i]["state"] === "Closed Complete"
              ) {
                countlastdayTaskmanual++;
                countoflastdayInboundTickets++;
              }
            }
            //  calculating automation statistics past week

            if (diffDays >= 1 && diffDays <= 7) {
              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] === "TDMS AutoBOT"
              ) {
                countLastWeekTaskautomated++;
              } else if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] &&
                data[i]["assigned_to"] != "TDMS AutoBOT"
              ) {
                countlastWeekTaskmanual++;
              }
              // Checking for Terminate and Security

              if (
                isTerminate === "Security" ||
                isTerminate === "Terminate" ||
                isTerminate === "Delete"
              ) {
                if (
                  data[i]["state"] != "Closed Complete" &&
                  data[i]["assigned_to"] != ""
                ) {
                  countoffailtaskLastWeek++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] === "TDMS AutoBOT"
                ) {
                  countLastWeekTaskautomated++;
                  countoflastweekInboundTickets++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] &&
                  data[i]["assigned_to"] != "TDMS AutoBOT"
                ) {
                  countlastWeekTaskmanual++;

                  countoflastweekInboundTickets++;
                }
              }

              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] != "Closed Complete" &&
                data[i]["assigned_to"] != ""
              ) {
                countoffailtaskLastWeek++;
              }

              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"]
              ) {
                countoflastweekInboundTickets++;
              }
              if (
                data[i]["short_description"].indexOf("AS400/OTC/Salesforce") >
                  -1 &&
                data[i]["state"] === "Closed Complete"
              ) {
                countlastWeekTaskmanual++;
                countoflastweekInboundTickets++;
              }
            }

            // For current Month
            if (date.getMonth() === check.getMonth()) {
              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["assigned_to"] === "TDMS AutoBOT"
              ) {
                if (
                  countTaskMonth[indexformonth] == null ||
                  countTaskMonth[indexformonth] == undefined
                ) {
                  countTaskMonth[indexformonth] = 1;
                } else {
                  countTaskMonth[indexformonth]++;
                }
              }

              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["assigned_to"] === "TDMS AutoBOT"
              ) {
                //console.log("automated"+data[i]["closed_by"]+"shortdesc"+data[i]["short_description"])
                botgraph_data[
                  appConfig[data[i]["short_description"]].botid
                ].automatedCount += 1;
                graph_data["TDMS AutoBOT"].countOfCloseTask += 1;
              } else if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] &&
                data[i]["assigned_to"] != "TDMS AutoBOT"
              ) {
                //   console.log("manual" + data[i]["closed_by"] + "shortdesc" + data[i]["short_description"])

                graph_data[data[i]["assigned_to"]].countOfCloseTask += 1;
              }

              if (
                isTerminate === "Security" ||
                isTerminate === "Terminate" ||
                isTerminate === "Delete"
              ) {
                // objforlastday.name = appConfig[isTerminate].category
                // objforlastday.tasknumber = data[i]["number"];
                // objforlastday.shortdescription = isTerminate;
                // objforlastday.sysid = data[i]["sys_id"];

                // arrforlastday.push(objforlastday);

                if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["closed_by"] != "TDMS AutoBOT"
                ) {
                  //Here Just the add the filter condition for BOT
                  var res = data[i]["short_description"].substring(0, 28);
                  console.log("abcd" + res);
                  if (res === "Terminate Employee AS400 Acc") {
                    botgraph_data[appConfig[res].botid].failedCount += 1;
                  } else if (res === "Terminate Non-Employee AS400") {
                    botgraph_data[appConfig[res].botid].failedCount += 1;
                  } else if (res === "Terminate Employee Google Acc") {
                    botgraph_data[appConfig[res].botid].failedCount += 1;
                  } else {
                    // console.log(appConfig[isTerminate]);
                    botgraph_data[
                      appConfig[isTerminate].botid
                    ].failedCount += 1;
                  }
                }

                if (
                  data[i]["state"] != "Closed Complete" &&
                  data[i]["assigned_to"] != ""
                ) {
                  // For the additional column which require human intervention add the code here

                  objforcurrMonth.name = appConfig[isTerminate].botid;
                  console.log(data[i]["number"]);
                  objforcurrMonth.tasknumber = data[i]["number"];
                  objforcurrMonth.shortdescription = isTerminate;
                  objforcurrMonth.sysid = data[i]["sys_id"];

                  if (data[i]["assigned_to"] === "") {
                    objforcurrMonth.assignedto = "Unassigned";
                  } else {
                    objforcurrMonth.assignedto = data[i]["assigned_to"];
                  }

                  arrforcurrMOnth.push(objforcurrMonth);
                  countfailtask++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] === "TDMS AutoBOT"
                ) {
                  countCurrentMonthTaskautomated++;
                  graph_data["TDMS AutoBOT"].countOfCloseTask += 1;

                  var res = data[i]["short_description"].substring(0, 28);
                  console.log("abcd" + res);
                  if (res === "Terminate Employee AS400 Acc") {
                    botgraph_data[appConfig[res].botid].automatedCount += 1;
                  } else if (res === "Terminate Non-Employee AS400") {
                    botgraph_data[appConfig[res].botid].automatedCount += 1;
                  } else if (res === "Terminate Employee Google Acc") {
                    botgraph_data[appConfig[res].botid].automatedCount += 1;
                  } else {
                    botgraph_data[
                      appConfig[isTerminate].botid
                    ].automatedCount += 1;
                  }

                  if (
                    countTaskMonth[indexformonth] == null ||
                    countTaskMonth[indexformonth] == undefined
                  ) {
                    countTaskMonth[indexformonth] = 1;
                  } else {
                    countTaskMonth[indexformonth]++;
                  }

                  countofCurrentMonthInboundTickets++;
                } else if (
                  data[i]["state"] === "Closed Complete" &&
                  data[i]["assigned_to"] &&
                  data[i]["assigned_to"] != "TDMS AutoBOT"
                ) {
                  // console.log(data[i]["short_description"] + "------" + data[i]['sys_updated_on'])
                  countCurrentMonthTaskmanual++;
                  graph_data[data[i]["assigned_to"]].countOfCloseTask += 1;
                  countofCurrentMonthInboundTickets++;
                }
              }

              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] != "Closed Complete" &&
                data[i]["assigned_to"] != ""
              ) {
                objforcurrMonth.name =
                  appConfig[data[i]["short_description"]].botid;
                objforcurrMonth.tasknumber = data[i]["number"];
                console.log(data[i]["number"]);
                objforcurrMonth.shortdescription = data[i]["short_description"];
                objforcurrMonth.sysid = data[i]["sys_id"];

                if (data[i]["assigned_to"] === "") {
                  objforcurrMonth.assignedto = "Unassigned";
                } else {
                  objforcurrMonth.assignedto = data[i]["assigned_to"];
                }

                arrforcurrMOnth.push(objforcurrMonth);
                countfailtask++;
              }
              //This is the data where human intervention was required
              if (
                appConfig[data[i]["short_description"]] &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["closed_by"] != "TDMS AutoBOT" &&
                data[i]["closed_by"] != ""
              ) {
                botgraph_data[
                  appConfig[data[i]["short_description"]].botid
                ].failedCount += 1;
              }

              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                appConfig[data[i]["short_description"]].automated === true &&
                data[i]["assigned_to"] === "TDMS AutoBOT"
              ) {
                // per BOT

                // countofindividualBOT[appConfig[item["short_description"]]]++

                countCurrentMonthTaskautomated++;
              } else if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"] &&
                data[i]["assigned_to"] != "TDMS AutoBOT"
              ) {
                //console.log(data[i]["short_description"] + "------" + data[i]['sys_updated_on'])
                countCurrentMonthTaskmanual++;
              }

              if (
                appConfig[data[i]["short_description"]] &&
                data[i]["state"] === "Closed Complete" &&
                data[i]["assigned_to"]
              ) {
                countofCurrentMonthInboundTickets++;
              }
              // special case for manual
              if (
                data[i]["short_description"].indexOf("AS400/OTC/Salesforce") >
                  -1 &&
                data[i]["state"] === "Closed Complete"
              ) {
                countCurrentMonthTaskmanual++;
                graph_data[data[i]["assigned_to"]].countOfCloseTask += 1;
                countofCurrentMonthInboundTickets++;
              }
            }

            // for past six months
            if (
              data[i]["state"] === "Closed Complete" &&
              (isTerminate === "Security" ||
                isTerminate === "Terminate" ||
                isTerminate === "Delete") &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              botgraph_data[
                appConfig[isTerminate].botid
              ].automatedCountHalfyearly += 1;
              //   automatedCountHalfyearly: 0
              // add the condition for individual bot count
              if (countTask[diff] == null || countTask[diff] == undefined) {
                countTask[diff] = 1;
              } else {
                countTask[diff]++;
              }
            }

            if (
              data[i]["state"] === "Closed Complete" &&
              appConfig[data[i]["short_description"]] &&
              appConfig[data[i]["short_description"]].automated === true &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              botgraph_data[
                appConfig[data[i]["short_description"]].botid
              ].automatedCountHalfyearly += 1;
              // add the condition for individual bot count
              if (countTask[diff] == null || countTask[diff] == undefined) {
                countTask[diff] = 1;
              } else {
                countTask[diff]++;
              }
            }
          }

          //Creating array for last day statistics

          //   var uniqueresourcelastday = resourcearraylastday.filter(onlyUnique);

          // console.log("resources" + uniqueresourcelastday)

          // taskandincidentData.uniqueresourcelastday = uniqueresourcelastday;
          taskandincidentData.countTaskHalfYearly = countTask;
          taskandincidentData.arrforLastdayData = arrforlastday;
          taskandincidentData.arrforcurrMOnth = arrforcurrMOnth;

          taskandincidentData.countLastdayTaskautomated = countLastdayTaskautomated;
          taskandincidentData.countlastdayTaskmanual = countlastdayTaskmanual;
          taskandincidentData.countoffailtaskLastDay = countoffailtaskLastDay;
          taskandincidentData.countoflastdayInboundTasks = countoflastdayInboundTickets;

          taskandincidentData.countLastWeekTaskautomated = countLastWeekTaskautomated;
          taskandincidentData.countlastWeekTaskmanual = countlastWeekTaskmanual;
          taskandincidentData.countoffailtaskLastWeek = countoffailtaskLastWeek;
          taskandincidentData.countoflastweekInboundTasks = countoflastweekInboundTickets;

          // taskandincidentData.arrforFailedTaskCurrentMOnth = arrforFailedTaskCurrentMOnth;
          taskandincidentData.graph_data = graph_data;

          taskandincidentData.countTask = countTaskMonth;
          taskandincidentData.countfailtask = countfailtask;

          taskandincidentData.countCurrentMonthTaskautomated = countCurrentMonthTaskautomated;
          taskandincidentData.countCurrentMonthTaskmanual = countCurrentMonthTaskmanual;
          taskandincidentData.countofCurrentMonthInboundTickets = countofCurrentMonthInboundTickets;

          taskandincidentData.botgraph_data = botgraph_data;
          console.log("lastday" + countlastdayTaskmanual);
          console.log("arr curr month" + JSON.stringify(arrforcurrMOnth));
          console.log("graph data" + JSON.stringify(graph_data));
          console.log("array for curr month" + countTaskMonth);
          console.log(
            "curr month task automated" + countCurrentMonthTaskautomated
          );
          console.log("curr month task manual" + countCurrentMonthTaskmanual);
          console.log("fail task last week" + countoffailtaskLastWeek);

          console.log(countTask);
          // console.log(")*&^" + JSON.stringify(taskandincidentData));
          callback(null, taskandincidentData);
        });
    })
    .catch(err => {
      console.log(err);
    });
}

function calculateIncidentStatisticsForPastSixMonths(
  datas,
  option,
  assignmentgroup,
  callback
) {
  console.log("inside incident");

  var arrforautomationStatisticsPastsixMonths = [];
  var arrtask = [];
  var diff = 0;
  var arrincident = [];
  var month = [];
  var months = [
    "JAN",
    "FEB",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPT",
    "OCT",
    "NOV",
    "DEC"
  ];
  //    var urlforincident = `https://scholastic.service-now.com/api/now/table/incident?sysparm_query=sys_updated_onBETWEENjavascript:gs.daysAgoStart(180)@javascript:gs.daysAgoEnd(1)^assignment_group=${appConfig.accessAndCompliance}^sysparm_default_exported_fields=all`;
  var downloadincidentCSV = `https://scholastic.service-now.com/incident.do?CSV&sysparm_fields=sys_updated_on,incident_state,assigned_to,short_description,number,sys_id,assignment_group,resolved_by,closed_at,resolved_at&sysparm_query=sys_updated_onBETWEENjavascript:gs.daysAgoStart(180)@javascript:gs.daysAgoEnd(0)^assignment_group=${
    appConfig.accessAndCompliance
  }`;

  var countLastdayIncidentautomated = 0,
    countlastdayIncidentmanual = 0,
    countoffailIncidentLastDay = 0,
    countoflastdayInboundIncident = 0;
  var countLastWeekIncidentautomated = 0,
    countlastWeekIncidentmanual = 0,
    countoffailIncidentLastWeek = 0,
    countoflastweekInboundIncident = 0;

  var countIncidentMonth = Array(31).fill(0);
  var countfailincident = 0;
  var arr = [];
  var arrforbotcount = [];

  var countCurrentMonthIncidentautomated = 0,
    countCurrentMonthIncidentmanual = 0,
    countofCurrentMonthInboundIncident = 0;

  var options = {
    url: downloadincidentCSV,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json"
    }
  };
  var countIncident = [];

  var promise1 = new Promise(function(resolve, reject) {
    request
      .get(options, function(error, response, body) {
        if (error) reject(error);
        else resolve(response);
        // console.log(response.body.length)
      })
      .pipe(fs.createWriteStream(__dirname + "/../temp/incident.csv"));
  });

  promise1.then(function(value) {
    console.log(__dirname + "/../temp/incident.csv");
    csv()
      .fromFile(__dirname + "/../temp/incident.csv")
      .then(function(data) {
        //when parse finished, result will be emitted here.
        // console.log(data);

        for (var i = 0; i < data.length; i++) {
          var checkformonth = new Date(data[i]["resolved_at"]);
          var checkforclosed = new Date(data[i]["closed_at"]);
          if (
            date.getMonth() === checkformonth.getMonth() ||
            date.getMonth() === checkforclosed.getMonth()
          ) {
            if (data[i]["assigned_to"]) {
              arr.push(data[i]["assigned_to"]);
            }
          }
        }
        var uniqueforincident = arr.filter(onlyUnique);

        for (var key of uniqueforincident) {
          if (!datas.graph_data[key]) {
            datas.unique.push(key);
            datas.graph_data[key] = {
              countOfCloseTask: 0,
              countOfCloseIncident: 0
            };
          }
        }

        // Adding taleo bot in the graph data
        datas.botgraph_data["adaccount"] = {
          // for six month put another count as automatedCountsixMonth
          automatedCount: 0,
          automatedCountHalfyearly: 0,
          failedCount: 0
        };

        for (var i = 0; i < data.length; i++) {
          var check = new Date(data[i]["resolved_at"]);

          var checkforclosed = new Date(data[i]["closed_at"]);
          //  console.log(check)
          var timeDiff = Math.abs(date.getTime() - check.getTime());
          var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

          var timeDiffclosed = Math.abs(
            date.getTime() - checkforclosed.getTime()
          );
          var diffDaysclosed = Math.ceil(timeDiffclosed / (1000 * 3600 * 24));

          var isautomated = data[i]["short_description"].split(" ")[0];
          var index = new Date(data[i]["resolved_at"]).getMonth();

          var indexforMonth = new Date(data[i]["resolved_at"]).getDate();
          var closedindexforMonth = new Date(data[i]["closed_at"]).getDate();
          var objforlastday = {};
          var currentMonth = new Date().getMonth();

          if (
            new Date().getFullYear() ===
            new Date(data[i]["resolved_at"]).getFullYear()
          ) {
            diff = currentMonth - index;

            if (!month[diff]) {
              month[diff] = months[index] + " " + new Date().getFullYear();
            }
          } else {
            diff = 12 + currentMonth - index;
            if (!month[diff]) {
              month[diff] =
                months[index] +
                " " +
                new Date(data[i]["resolved_at"]).getFullYear();
            }
          }

          if (
            (data[i]["incident_state"] === "Resolved" ||
              data[i]["incident_state"] === "Closed") &&
            isautomated === "Taleo" &&
            data[i]["assigned_to"] === "TDMS AutoBOT"
          ) {
            datas.botgraph_data["adaccount"].automatedCountHalfyearly += 1;

            if (
              countIncident[diff] == null ||
              countIncident[diff] == undefined
            ) {
              countIncident[diff] = 1;
            } else {
              countIncident[diff]++;
            }
          }

          // Last day data
          if (
            (diffDays >= 1 &&
              diffDays <= 2 &&
              date.getMonth() === check.getMonth() &&
              date.getDate() - check.getDate() === 1) ||
            (diffDaysclosed >= 1 &&
              diffDaysclosed <= 2 &&
              date.getMonth() === checkforclosed.getMonth() &&
              date.getDate() - checkforclosed.getDate() === 1)
          ) {
            if (
              isautomated === "Taleo" &&
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              countLastdayIncidentautomated++;
            } else if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] &&
              data[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              countlastdayIncidentmanual++;
            }
            // checking if assigned to is no one

            if (
              data[i]["incident_state"] != "Resolved" &&
              isautomated === "Taleo" &&
              data[i]["incident_state"] !== "Closed"
            ) {
              objforlastday.name = appConfig[isautomated].botid;
              objforlastday.tasknumber = data[i]["number"];
              objforlastday.shortdescription = "Taleo";
              objforlastday.sysid = data[i]["sys_id"];

              if (data[i]["assigned_to"] === "") {
                objforlastday.assignedto = "Unassigned";
              } else {
                objforlastday.assignedto = data[i]["assigned_to"];
              }
              //here for taleo there will be one bot only

              datas.arrforLastdayData.push(objforlastday);
              countoffailIncidentLastDay++;
            }

            //total tickets whoe state is closed complete it can be manual or automated
            if (
              data[i]["incident_state"] === "Resolved" ||
              (data[i]["incident_state"] === "Closed" && data[i]["assigned_to"])
            ) {
              countoflastdayInboundIncident++;
            }
          } else if (
            diffDays >= 1 &&
            diffDays <= 2 &&
            date.getMonth() != check.getMonth() &&
            (check.getDate() === 31 || check.getDate() === 30)
          ) {
            if (
              isautomated === "Taleo" &&
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              countLastdayIncidentautomated++;
            } else if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] &&
              data[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              countlastdayIncidentmanual++;
            }
            // checking if assigned to is no one

            if (
              data[i]["incident_state"] != "Resolved" &&
              isautomated === "Taleo" &&
              data[i]["incident_state"] !== "Closed"
            ) {
              objforlastday.name = appConfig[isautomated].botid;
              objforlastday.tasknumber = data[i]["number"];
              objforlastday.shortdescription = "Taleo";
              objforlastday.sysid = data[i]["sys_id"];
              if (data[i]["assigned_to"] === "") {
                objforlastday.assignedto = "Unassigned";
              } else {
                objforlastday.assignedto = data[i]["assigned_to"];
              }
              //here for taleo there will be one bot only

              datas.arrforLastdayData.push(objforlastday);
              countoffailIncidentLastDay++;
            }

            //total tickets whoe state is closed complete it can be manual or automated
            if (
              data[i]["incident_state"] === "Resolved" ||
              (data[i]["incident_state"] === "Closed" && data[i]["assigned_to"])
            ) {
              countoflastdayInboundIncident++;
            }
          }
          //  calculating automation statistics past week

          if (
            (diffDays >= 1 && diffDays <= 7) ||
            (diffDaysclosed >= 1 && diffDaysclosed <= 7)
          ) {
            if (
              isautomated === "Taleo" &&
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              countLastWeekIncidentautomated++;
            } else if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] &&
              data[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              countlastWeekIncidentmanual++;
            }
            // Checking for Terminate and Security

            if (
              isautomated === "Taleo" &&
              data[i]["incident_state"] != "Resolved" &&
              data[i]["incident_state"] != "Closed"
            ) {
              countoffailIncidentLastWeek++;
            }

            if (
              data[i]["incident_state"] === "Resolved" ||
              (data[i]["incident_state"] === "Closed" && data[i]["assigned_to"])
            ) {
              countoflastweekInboundIncident++;
            }
          }

          // For current Month
          if (
            date.getMonth() === check.getMonth() ||
            date.getMonth() === checkforclosed.getMonth()
          ) {
            // Here just check for the Taleo condition
            if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              isautomated === "Taleo" &&
              data[i]["assigned_to"] === "TDMS AutoBOT" &&
              date.getMonth() === check.getMonth()
            ) {
              // console.log(index);

              if (
                countIncidentMonth[indexforMonth] === null ||
                countIncidentMonth[indexforMonth] === undefined
              )
                countIncidentMonth[indexforMonth] = 1;
              else countIncidentMonth[indexforMonth]++;
            } else if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              isautomated === "Taleo" &&
              data[i]["assigned_to"] === "TDMS AutoBOT" &&
              date.getMonth() === checkforclosed.getMonth()
            ) {
              // console.log(index);

              if (
                countIncidentMonth[closedindexforMonth] === null ||
                countIncidentMonth[closedindexforMonth] === undefined
              )
                countIncidentMonth[closedindexforMonth] = 1;
              else countIncidentMonth[closedindexforMonth]++;
            }

            if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              isautomated === "Taleo" &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              // console.log("bot"+data[i]["resolved_by"])
              datas.botgraph_data["adaccount"].automatedCount += 1;
              datas.graph_data["TDMS AutoBOT"].countOfCloseIncident += 1;
            } else if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] &&
              data[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              //  console.log("manual"+data[i]["resolved_by"])
              datas.graph_data[
                data[i]["assigned_to"]
              ].countOfCloseIncident += 1;
            }

            if (
              data[i]["incident_state"] !== "Resolved" &&
              data[i]["incident_state"] !== "Closed" &&
              isautomated === "Taleo"
            ) {
              // objforcurrentMOnth.name = appConfig[item["short_description"]].category
              // objforcurrentMOnth.tasknumber = item["number"];
              // arrforFailedTaskCurrentMOnth.push(objforcurrentMOnth);
              datas.botgraph_data["adaccount"].failedCount += 1;
              countfailincident++;
            }

            if (
              isautomated === "Taleo" &&
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              countCurrentMonthIncidentautomated++;
            } else if (
              (data[i]["incident_state"] === "Resolved" ||
                data[i]["incident_state"] === "Closed") &&
              data[i]["assigned_to"] &&
              data[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              countCurrentMonthIncidentmanual++;
            }
            // checking if assigned to is no one

            //total tickets whoe state is closed complete it can be manual or automated
            // if ( data[i]["state"] != "Open" ) {
            if (
              data[i]["incident_state"] === "Resolved" ||
              (data[i]["incident_state"] === "Closed" && data[i]["assigned_to"])
            ) {
              countofCurrentMonthInboundIncident++;
            }
          }
        }
        console.log("CountIncident=-=-=-=-" + countIncident);

        for (var i = 5; i >= 0; i--) {
          arrtask.push({
            x: month[i],
            y: datas.countTaskHalfYearly[i],
            c: "task"
          });
          arrincident.push({
            x: month[i],
            y: countIncident[i],
            c: "incident"
          });
        }
        for (var i = 0; i < arrtask.length; i++) {
          arrforautomationStatisticsPastsixMonths.push(arrtask[i]);
          arrforautomationStatisticsPastsixMonths.push(arrincident[i]);
        }

        writeBarChartToPng(
          arrforautomationStatisticsPastsixMonths,
          "automationstatisticspastSixmonths",
          "taskandincidentYaxisFilter"
        );

        // populating the array for bot individual count
        for (var key in datas.botgraph_data) {
          var objforbotcount = {};
          objforbotcount.name = key;
          objforbotcount.countcurrMonth =
            datas.botgraph_data[key].automatedCount;
          objforbotcount.countpastSixMonths =
            datas.botgraph_data[key].automatedCountHalfyearly;
          objforbotcount.failed = datas.botgraph_data[key].failedCount;
          arrforbotcount.push(objforbotcount);
        }

        datas.countLastdayTicketautomated =
          datas.countLastdayTaskautomated + countLastdayIncidentautomated;
        datas.countlastdayTicketmanual =
          datas.countlastdayTaskmanual + countlastdayIncidentmanual;
        datas.countoffailTicketLastDay =
          datas.countoffailtaskLastDay + countoffailIncidentLastDay;
        datas.countoflastdayInboundTickets =
          datas.countoflastdayInboundTasks + countoflastdayInboundIncident;

        datas.countLastWeekTicketautomated =
          datas.countLastWeekTaskautomated + countLastWeekIncidentautomated;
        datas.countlastWeekTicketmanual =
          datas.countlastWeekTaskmanual + countlastWeekIncidentmanual;
        datas.countoffailTicketsLastWeek =
          datas.countoffailtaskLastWeek + countoffailIncidentLastWeek;
        datas.countoflastweekInboundTickets =
          datas.countoflastweekInboundTasks + countoflastweekInboundIncident;

        datas.failincident = countfailincident;
        datas.countIncident = countIncidentMonth;

        datas.countCurrentMonthIncidentautomated = countCurrentMonthIncidentautomated;
        datas.countCurrentMonthIncidentmanual = countCurrentMonthIncidentmanual;
        datas.countofCurrentMonthInboundIncident = countofCurrentMonthInboundIncident;
        datas.arrforbotcount = arrforbotcount;
        console.log("lastday incidnet" + countlastdayIncidentmanual);
        console.log("fail incident last week" + countoffailIncidentLastWeek);
        console.log("inbound" + countofCurrentMonthInboundIncident);
        console.log("total fail" + datas.countoffailTicketsLastWeek);
        console.log("monthly" + JSON.stringify(datas.botgraph_data));
        //console.log("=======" + JSON.stringify(datas))
        callback(null, datas);
      })
      .on("error", function(err) {
        console.log(err);
        callback(err, null);
      });
  });
}

function creationofObjectforMail(taskandincidentData, callback) {
  var jsonobjectForMail = {};
  var countofResolvedIncident = 0;
  var countofResolvedTask = 0;

  var arrforUserTemplateTable = [];
  var arrforLastDaytableStatistics = [];
  var arrforLastWeektableStatistics = [];

  // we will use this array to populate the upper table in template
  var arrforCurrentMonthtableStatistics = [];
  var countofresources = 0;
  var automationtotal = 0;
  var botfteforLastDay = 0;

  // var date = new Date();

  // var curmonth = date.getMonth();
  var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);

  var startdiffdays = calcBusinessDays(firstDay, date);

  var month = [
    "JAN",
    "FEB",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPT",
    "OCT",
    "NOV",
    "DEC"
  ];

  deleteUsersNotNeededInReport(taskandincidentData.graph_data);

  for (var key in taskandincidentData.graph_data) {
    countofResolvedIncident =
      countofResolvedIncident +
      taskandincidentData.graph_data[key].countOfCloseIncident;
    countofResolvedTask =
      countofResolvedTask +
      taskandincidentData.graph_data[key].countOfCloseTask;

    arrforUserTemplateTable.push({
      name: key,
      incidents: taskandincidentData.graph_data[key].countOfCloseIncident,
      tasks: taskandincidentData.graph_data[key].countOfCloseTask,
      total:
        taskandincidentData.graph_data[key].countOfCloseTask +
        taskandincidentData.graph_data[key].countOfCloseIncident,
      avgperday: Math.round(
        (taskandincidentData.graph_data[key].countOfCloseTask +
          taskandincidentData.graph_data[key].countOfCloseIncident) /
          startdiffdays,
        1
      )
    });

    countofresources++;
  }

  automationtotal =
    taskandincidentData.countCurrentMonthIncidentautomated +
    taskandincidentData.countCurrentMonthTaskautomated;

  var manualForCurrentMOnth =
    taskandincidentData.countCurrentMonthTaskmanual +
    taskandincidentData.countCurrentMonthIncidentmanual;
  // added 1 in resources
  var botvsfteForcurrentMonth =
    automationtotal / (manualForCurrentMOnth / countofresources);
  //  console.log("fte" + botvsfteForcurrentMonth);
  arrforCurrentMonthtableStatistics.push({
    manual: manualForCurrentMOnth,
    BOTvsFTE: botvsfteForcurrentMonth.toFixed(0),
    failtaskandincident:
      taskandincidentData.failincident + taskandincidentData.countfailtask,
    automatedTickets: automationtotal,
    inboundTickets:
      taskandincidentData.countofCurrentMonthInboundTickets +
      taskandincidentData.countofCurrentMonthInboundIncident
  });

  // Here we are creating two arr for creating multi bar chart for tickets resolved each day
  creatingMultibarChartforCurrentmonthStatistics(taskandincidentData);

  // add condition for bot vs fte if countlastday task manual is not equal to zero (infinity)
  if (taskandincidentData.countlastdayTicketmanual == 0) {
    botfteforLastDay = taskandincidentData.countLastdayTicketautomated;
  } else {
    botfteforLastDay = (
      taskandincidentData.countLastdayTicketautomated /
      (taskandincidentData.countlastdayTicketmanual / countofresources)
    ).toFixed(0);
  }

  arrforLastDaytableStatistics.push({
    manual: taskandincidentData.countlastdayTicketmanual,
    BOTvsFTE: botfteforLastDay,
    failtaskandincident: taskandincidentData.countoffailTicketLastDay,
    automatedTickets: taskandincidentData.countLastdayTicketautomated,
    inboundTickets: taskandincidentData.countoflastdayInboundTickets
  });

  // Look for Bot vs Fte
  arrforLastWeektableStatistics.push({
    manual: taskandincidentData.countlastWeekTicketmanual,
    BOTvsFTE: (
      taskandincidentData.countLastWeekTicketautomated /
      (taskandincidentData.countlastWeekTicketmanual / countofresources)
    ).toFixed(0),
    failtaskandincident: taskandincidentData.countoffailTicketsLastWeek,
    automatedTickets: taskandincidentData.countLastWeekTicketautomated,
    inboundTickets: taskandincidentData.countoflastweekInboundTickets
  });

  jsonobjectForMail = {
    userTable: arrforUserTemplateTable,
    currentmonth: month[curmonth],
    todaydate:
      date.getDate() + "-" + (date.getMonth() + 1) + "-" + date.getFullYear(),
    groupname: "Access and Compliance",
    resourcecount: countofresources,
    currentMonthstatisticstable: arrforCurrentMonthtableStatistics,
    failedTasksAndIncidentLastday: taskandincidentData.arrforLastdayData,
    lastdayTableStatistics: arrforLastDaytableStatistics,
    lastWeekTableStatistics: arrforLastWeektableStatistics,
    arrforindividualBOTcount: taskandincidentData.arrforbotcount,
    arrforageingtask: taskandincidentData.arrforageingTask
    // failedTasksandINcidentCurrentMonth: taskandincidentData.arrforFailedTaskCurrentMOnth
  };

  // Function for Creating Pie Chart for task and incident Inbound Statistics
  console.log(jsonobjectForMail);
  createPieChartForInboundTaskandIncident(taskandincidentData);

  callback(null, jsonobjectForMail);
}

function calcBusinessDays(dDate1, dDate2) {
  // input given as Date objects
  var iWeeks,
    iDateDiff,
    iAdjust = 0;
  if (dDate2 < dDate1) return -1; // error code if dates transposed
  var iWeekday1 = dDate1.getDay(); // day of week
  var iWeekday2 = dDate2.getDay();
  iWeekday1 = iWeekday1 == 0 ? 7 : iWeekday1; // change Sunday from 0 to 7
  iWeekday2 = iWeekday2 == 0 ? 7 : iWeekday2;
  if (iWeekday1 > 5 && iWeekday2 > 5) iAdjust = 1; // adjustment if both days on weekend
  iWeekday1 = iWeekday1 > 5 ? 5 : iWeekday1; // only count weekdays
  iWeekday2 = iWeekday2 > 5 ? 5 : iWeekday2;

  // calculate differnece in weeks (1000mS * 60sec * 60min * 24hrs * 7 days = 604800000)
  iWeeks = Math.floor((dDate2.getTime() - dDate1.getTime()) / 604800000);

  if (iWeekday1 <= iWeekday2) {
    iDateDiff = iWeeks * 5 + (iWeekday2 - iWeekday1);
  } else {
    iDateDiff = (iWeeks + 1) * 5 - (iWeekday1 - iWeekday2);
  }

  iDateDiff -= iAdjust; // take into account both days on weekend

  return iDateDiff + 1; // add 1 because dates are inclusive
}

function createPieChartForInboundTaskandIncident(taskandincidentData) {
  var arrforpiechart = [];

  arrforpiechart.push({
    category: "Incident",
    position: "Total Processed Tickets",
    value: taskandincidentData.countofCurrentMonthInboundIncident
  });
  arrforpiechart.push({
    category: "Incident",
    position: "Automated",
    value: taskandincidentData.countCurrentMonthIncidentautomated
  });

  arrforpiechart.push({
    category: "Task",
    position: "Total Processed Tickets",
    value: taskandincidentData.countofCurrentMonthInboundTickets
  });
  arrforpiechart.push({
    category: "Task",
    position: "Automated",
    value: taskandincidentData.countCurrentMonthTaskautomated
  });

  writeGroupedBarChartToPng(arrforpiechart, "TaskandIncident");
}

function creatingMultibarChartforCurrentmonthStatistics(taskandincidentData) {
  var arrtask = [];
  var arrincident = [];
  var month = [
    "JAN",
    "FEB",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPT",
    "OCT",
    "NOV",
    "DEC"
  ];
  var arrforautomationStatisticsEachDay = [];

  for (var i = 1; i <= date.getDate(); i++) {
    arrtask.push({
      x: i + "-" + month[curmonth],
      y: taskandincidentData.countTask[i],
      c: "task"
    });
    arrincident.push({
      x: i + "-" + month[curmonth],
      y: taskandincidentData.countIncident[i],
      c: "incident"
    });
  }

  // preparing this array for  the automation bar chart for every single day
  for (var i = 0; i < arrtask.length; i++) {
    arrforautomationStatisticsEachDay.push(arrtask[i]);
    arrforautomationStatisticsEachDay.push(arrincident[i]);
  }
  writeBarChartToPng(
    arrforautomationStatisticsEachDay,
    "automationstatisticseveryday",
    "taskandincidentYaxisFilter"
  );
}

function deleteUsersNotNeededInReport(filteredMappeddata) {
  // Removing users which are not needed in the report
  for (var key in filteredMappeddata) {
    for (var i in appConfig.filterNames) {
      if (key === appConfig.filterNames[i]) {
        delete filteredMappeddata[key];
      }
    }
  }
}

// add unique in the url

function readCategoryFromConfig(data, url, callback) {
  var arrAutomated = [];
  var arrforTemplateTable = [];
  var arrManual = [];
  var arrclosed = [];
  var arrinprogress = [];
  var arrforageingTask = [];

  var categoryPngGraph = {};

  var arrofobject = [];
  var arrforAutomatedAndManual = [];

  var options = {
    url: url,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json"
    }
  };

  var arr = [];

  csv()
    .fromFile(__dirname + "/../temp/task.csv")
    .then(function(jsonArrayObj) {
      //when parse finished, result will be emitted here.
      for (var i = 0; i < jsonArrayObj.length; i++) {
        var checkformonth = new Date(jsonArrayObj[i]["sys_updated_on"]);
        if (date.getMonth() === checkformonth.getMonth()) {
          if (appConfig[jsonArrayObj[i]["short_description"]]) {
            var short_des = appConfig[jsonArrayObj[i]["short_description"]];

            arr.push(short_des.category);
          }
        }
      }

      arr.push("Add user to Security Group");
      arr.push("Termination");

      var unique = arr.filter(onlyUnique);
      console.log("+++++" + unique);
      var graph_data = {};

      // in future if we want for closed or in progress state
      for (var key of unique) {
        graph_data[key] = {
          automated: 0,
          manual: 0
        };
      }
      for (var i = 0; i < jsonArrayObj.length; i++) {
        var objforcurrMonth = {};
        var check = new Date(jsonArrayObj[i]["sys_updated_on"]);
        var hours = Math.abs(date - check) / 36e5;
        var starttimeDiff = Math.abs(date.getTime() - check.getTime());
        var startdiffdays = Math.ceil(starttimeDiff / (1000 * 3600 * 24));

        if (date.getMonth() === check.getMonth()) {
          var isTerminate = jsonArrayObj[i]["short_description"].split(" ")[0];

          // For Task Ageing

          if (
            isTerminate === "Security" ||
            isTerminate === "Terminate" ||
            isTerminate === "Delete"
          ) {
            if (
              jsonArrayObj[i]["state"] != "Closed Complete" &&
              jsonArrayObj[i]["state"] != "Closed Incomplete" &&
              hours > 24
            ) {
              var res = jsonArrayObj[i]["short_description"].substring(0, 28);

              if (res === "Terminate Employee AS400 Acc") {
                objforcurrMonth.botname = appConfig[res].botid;
              } else if (res === "Terminate Non-Employee AS400") {
                objforcurrMonth.botname = appConfig[res].botid;
              } else if (res === "Terminate Employee Google Acc") {
                objforcurrMonth.botname = appConfig[res].botid;
              } else {
                // console.log(appConfig[isTerminate]);
                objforcurrMonth.botname = appConfig[isTerminate].botid;
              }

              console.log("-----0" + jsonArrayObj[i]["sys_updated_on"]);

              objforcurrMonth.tasknumber = jsonArrayObj[i]["number"];
              objforcurrMonth.shortdescription =
                jsonArrayObj[i]["short_description"];
              objforcurrMonth.sysid = jsonArrayObj[i]["sys_id"];
              objforcurrMonth.age_of_task = startdiffdays;
              objforcurrMonth.assignment_group =
                jsonArrayObj[i]["assignment_group"];
              objforcurrMonth.catitem = jsonArrayObj[i]["u_cat_item"];

              if (jsonArrayObj[i]["assigned_to"] === "") {
                objforcurrMonth.assignedto = "Unassigned";
              } else {
                objforcurrMonth.assignedto = jsonArrayObj[i]["assigned_to"];
              }

              arrforageingTask.push(objforcurrMonth);
            }
          }

          if (
            appConfig[jsonArrayObj[i]["short_description"]] &&
            appConfig[jsonArrayObj[i]["short_description"]].automated ===
              true &&
            jsonArrayObj[i]["state"] != "Closed Complete" &&
            jsonArrayObj[i]["state"] != "Closed Incomplete" &&
            hours > 24
          ) {
            console.log(jsonArrayObj[i]["number"]);
            objforcurrMonth.botname =
              appConfig[jsonArrayObj[i]["short_description"]].botid;
            objforcurrMonth.tasknumber = jsonArrayObj[i]["number"];
            objforcurrMonth.shortdescription =
              jsonArrayObj[i]["short_description"];
            objforcurrMonth.sysid = jsonArrayObj[i]["sys_id"];
            objforcurrMonth.age_of_task = startdiffdays;
            objforcurrMonth.assignment_group =
              jsonArrayObj[i]["assignment_group"];
            objforcurrMonth.catitem = jsonArrayObj[i]["u_cat_item"];

            if (jsonArrayObj[i]["assigned_to"] === "") {
              objforcurrMonth.assignedto = "Unassigned";
            } else {
              objforcurrMonth.assignedto = jsonArrayObj[i]["assigned_to"];
            }

            arrforageingTask.push(objforcurrMonth);
          }

          // For graph

          if (isTerminate === "Terminate" || isTerminate === "Delete") {
            if (
              jsonArrayObj[i]["state"] === "Closed Complete" &&
              appConfig[isTerminate].automated === true &&
              jsonArrayObj[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              graph_data["Termination"].automated += 1;
            } else if (
              jsonArrayObj[i]["state"] === "Closed Complete" &&
              jsonArrayObj[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              graph_data["Termination"].manual += 1;
            }
          } else if (isTerminate === "Security") {
            if (
              jsonArrayObj[i]["state"] === "Closed Complete" &&
              appConfig[isTerminate].automated === true &&
              jsonArrayObj[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              graph_data["Add user to Security Group"].automated += 1;
            } else if (
              jsonArrayObj[i]["state"] === "Closed Complete" &&
              jsonArrayObj[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              graph_data["Add user to Security Group"].manual += 1;
            }
          } else if (appConfig[jsonArrayObj[i]["short_description"]]) {
            var value = appConfig[jsonArrayObj[i]["short_description"]];
            if (
              jsonArrayObj[i]["state"] === "Closed Complete" &&
              value.automated === true &&
              jsonArrayObj[i]["assigned_to"] === "TDMS AutoBOT"
            ) {
              graph_data[value.category].automated += 1;
            } else if (
              jsonArrayObj[i]["state"] === "Closed Complete" &&
              jsonArrayObj[i]["assigned_to"] != "TDMS AutoBOT"
            ) {
              graph_data[value.category].manual += 1;
            }
          }
        }
      }

      for (var key in graph_data) {
        arrAutomated.push({
          x: key,
          y: graph_data[key].automated,
          key: "automated"
        });

        arrManual.push({
          x: key,
          y: graph_data[key].manual,
          key: "manual"
        });
      }
      // creating object for png graph
      categoryPngGraph = {
        automated: arrAutomated,
        manual: arrManual
      };

      console.log("json" + JSON.stringify(categoryPngGraph));

      for (var i = 0; i < categoryPngGraph.automated.length; i++) {
        categoryPngGraph.automated[i]["c"] = "automated";
        categoryPngGraph.manual[i]["c"] = "manual";

        if (categoryPngGraph.automated[i].y != 0) {
          arrforAutomatedAndManual.push(categoryPngGraph.automated[i]);
        }
        if (categoryPngGraph.manual[i].y != 0) {
          arrforAutomatedAndManual.push(categoryPngGraph.manual[i]);
        }
      }
      // writeToPng(arrofobject, filter);
      // For Automation Report
      writeBarChartToPng(arrforAutomatedAndManual, "automation", "category");

      data.arrforageingTask = arrforageingTask;

      callback(null, data);
    })
    .catch(err);
  {
    callback(err, null);
  }
}

function writeBarChartToPng(arrofobject, filter, yaxisfilter) {
  var stackedBarChartSpec = require(__dirname +
    "/../temp/stacked-bar-chart.spec.json");
  delete stackedBarChartSpec.data[0].values;
  stackedBarChartSpec.data[0]["values"] = arrofobject;
  if (yaxisfilter === "category")
    stackedBarChartSpec.axes[0]["title"] = "Automation";
  // Later we can change that
  else stackedBarChartSpec.axes[0]["title"] = "Automation";

  // create a new view instance for a given Vega JSON spec
  var view = new vega.View(vega.parse(stackedBarChartSpec))
    .renderer("none")
    .initialize();

  // generate static PNG file from chart
  view
    .toCanvas()
    .then(function(canvas) {
      // process node-canvas instance for example, generate a PNG stream to write var
      // stream = canvas.createPNGStream();
      console.log("Writing PNG to file...");
      fs.writeFile(
        "./temp/" + filter + "stackedBarChart.png",
        canvas.toBuffer()
      );
      console.log("./temp/" + filter + "stackedBarChart.png");
    })
    .catch(function(err) {
      console.log("Error writing PNG to file:");
      console.error(err);
    });
}

// we can remove this function later and the condition in the upper function to classify on
// basis of pie chart and bar charts

function writeGroupedBarChartToPng(arrofobject, filter) {
  var stackedPieChartSpec = require(__dirname +
    "/../temp/group-bar-chart.spec.json");
  // delete stackedPieChartSpec.data[0].values;
  console.log("-=-=" + JSON.stringify(arrofobject));
  stackedPieChartSpec.data[0].values = arrofobject;

  // create a new view instance for a given Vega JSON spec
  var view = new vega.View(vega.parse(stackedPieChartSpec))
    .renderer("none")
    .initialize();

  // generate static PNG file from chart
  view
    .toCanvas()
    .then(function(canvas) {
      // process node-canvas instance for example, generate a PNG stream to write var
      // stream = canvas.createPNGStream();
      console.log("Writing PNG to file...");
      fs.writeFile("./temp/" + filter + "pieChart.png", canvas.toBuffer());
      console.log("./temp/" + filter + "pieChart.png");
    })
    .catch(function(err) {
      console.log("Error writing PNG to file:");
      console.error(err);
    });
}

function makepostrequest(url) {
  return new Promise((resolve, reject) => {
    var options = {
      method: "POST",
      url: url,
      headers: {
        "content-type": "application/json"
      },
      body: {
        username: appConfig.catalystUsername,
        pass: appConfig.catalystPassword,
        authType: "token"
      },
      json: true
    };

    request(options, function(error, response, body) {
      if (error) {
        reject(error);
      } else {
        console.log(body);
        resolve(body.token);
      }
    });
  });
}

function getRequest(url, token) {
  return new Promise((resolve, reject) => {
    var options = {
      method: "GET",
      url: url,
      headers: {
        "content-type": "application/json",
        "x-catalyst-auth": token
      }
    };

    request(options, function(error, response, body) {
      if (error) {
        throw new Error(error);
        reject(error);
      } else {
        //    console.log(body);
        resolve(body);
      }
    });
  });
}
