/* Magic Mirror
 * Module: MMM-Traffic
 *
 * By Sam Lewis https://github.com/SamLewis0602
 * MIT Licensed.
 */

var NodeHelper = require('node_helper');
var request = require('request');
var showWeekend = true;
var allTime = true;

module.exports = NodeHelper.create({
  start: function () {
    console.log('MMM-Traffic helper started ...');
  },

  getCommute: function(api_url) {
    var self = this;

    if (this.showWeekend && this.allTime) {
        request({url: api_url + "&departure_time=now", method: 'GET'}, function(error, response, body) {
          if (!error && response.statusCode == 200) {
            var trafficComparison = 0;
    	    if((JSON.parse(body).status)=='OVER_QUERY_LIMIT')
    	      {
    	  	  console.log("Google Maps API-Call Quota reached for today -> no more calls until 0:00 PST");
    	      }
    	    else
    	      {
              if (JSON.parse(body).hasOwnProperty('error_message')) {
                console.log('ERROR: Google Maps API returned an error message:')
                console.log(JSON.parse(body))
                return
              } else {
                console.log('nope')
              }
              if (JSON.parse(body).routes[0].legs[0].duration_in_traffic) {
                var commute = JSON.parse(body).routes[0].legs[0].duration_in_traffic.text;
                var noTrafficValue = JSON.parse(body).routes[0].legs[0].duration.value;
                var withTrafficValue = JSON.parse(body).routes[0].legs[0].duration_in_traffic.value;
                trafficComparison = parseInt(withTrafficValue)/parseInt(noTrafficValue);
              } else {
                var commute = JSON.parse(body).routes[0].legs[0].duration.text;
              }
              var summary = JSON.parse(body).routes[0].summary;
              var detailedSummary = self.getDetailedSummary(body);
              self.sendSocketNotification('TRAFFIC_COMMUTE', {'commute':commute, 'url':api_url, 'trafficComparison': trafficComparison, 'summary':summary, 'detailedSummary':detailedSummary});
            }
    	  }
      });
    } else {
      self.sendSocketNotification('TRAFFIC_COMMUTE', {'commute':'--', 'url':api_url, 'trafficComparison': 0.0, 'summary': '--'});
    }
  },

  getTiming: function(api_url, arrivalTime) {
    var self = this;
    var newTiming = 0;
    if (this.showWeekend && this.allTime) {
      request({url: api_url + "&departure_time=now", method: 'GET'}, function(error, response, body) {
        if (JSON.parse(body).hasOwnProperty('error_message')) {
          console.log('ERROR: Google Maps API returned an error message:')
          console.log(JSON.parse(body))
          return
        }
        if (!error && response.statusCode == 200) {
          var durationValue = JSON.parse(body).routes[0].legs[0].duration.value;
          newTiming = self.timeSub(arrivalTime, durationValue, 0);
	      self.getTimingFinal(api_url, newTiming, arrivalTime);
        }
      });
  } else {
    self.sendSocketNotification('TRAFFIC_TIMING', {'commute':'--','summary':'--', 'url':api_url});
  }
  },

  getTimingFinal: function(api_url, newTiming, arrivalTime) {
    var self = this;
    request({url: api_url + "&departure_time=" + newTiming, method: 'GET'}, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        if (JSON.parse(body).routes[0].legs[0].duration_in_traffic) {
          var trafficValue = JSON.parse(body).routes[0].legs[0].duration_in_traffic.value;
        } else {
          var trafficValue = JSON.parse(body).routes[0].legs[0].duration.value;
        }
        var summary = JSON.parse(body).routes[0].summary;
        var detailedSummary = self.getDetailedSummary(body);
        var finalTime = self.timeSub(arrivalTime, trafficValue, 1);
        self.sendSocketNotification('TRAFFIC_TIMING', {'commute':finalTime,'summary':summary,'detailedSummary':detailedSummary,'url':api_url});
      }
    });

  },

  getDetailedSummary: function(body) {
    steps = JSON.parse(body).routes[0].legs[0].steps;
    summaryString = '<table id="detailedSummary">';
    for (var i = 0; i < steps.length; i++) {
      var html_instructions = steps[i].html_instructions.replace(/<div(.*?)<\/div>/g,'').replace(/<\/?b>/g,'');
      summaryString += '<tr><td>';
      summaryString += steps[i].duration.text + '</td><td>' + steps[i].distance.text + '</td><td>' + html_instructions;
      summaryString += '</td></tr>';
    }
    summaryString += '</table>';
    return summaryString;
  },

  timeSub: function(arrivalTime, durationValue, lookPretty) {
    var currentDate = new Date();
    var nowY = currentDate.getFullYear();
    var nowM = (currentDate.getMonth() + 1).toString();
    if (nowM.length == 1) {
      nowM = "0" + nowM;
    }
    var nowD = currentDate.getDate();
    nowD = nowD.toString();
    if (nowD.length == 1) {
      nowD = "0" + nowD;
    }
    var nowH = arrivalTime.substr(0,2);
    var nowMin = arrivalTime.substring(2,4);
    var testDate = new Date(nowY + "-" + nowM + "-" + nowD + " " + nowH + ":" + nowMin + ":00");
    if (lookPretty == 0) {
      if (currentDate >= testDate) {
        var goodDate = new Date (testDate.getTime() + 86400000 - (durationValue*1000)); // Next day minus uncalibrated duration
        return Math.floor(goodDate / 1000);
      } else {
	      var goodDate = new Date (testDate.getTime() - (durationValue*1000)); // Minus uncalibrated duration
        return Math.floor(testDate / 1000);
      }
    } else {
      var finalDate = new Date (testDate.getTime() - (durationValue * 1000));
      var finalHours = finalDate.getHours();
      finalHours = finalHours.toString();
      if (finalHours.length == 1) {
        finalHours = "0" + finalHours;
      }
      var finalMins = finalDate.getMinutes();
      finalMins = finalMins.toString();
      if (finalMins.length == 1) {
        finalMins = "0" + finalMins;
      }
      return finalHours + ":" + finalMins;
    }
  },

  setTimeConfig: function(timeConfig) {
    var date = new Date;

    this.showWeekend = timeConfig.showWeekend;
    this.allTime = timeConfig.allTime;

    if (!this.showWeekend) {
      var day = date.getDay();
      this.showWeekend = (day > 0 && day < 6);
    }

    if (!this.allTime) {
      var hour = date.getHours();
      this.allTime = (hour >= timeConfig.startHr && hour <= timeConfig.endHr);
    }
  },

  getURLParamter: function(param, url) {
    return decodeURIComponent((new RegExp('[?|&]' + param + '=' + '([^&;]+?)(&|#|;|$)').exec(url) || [null, ''])[1].replace(/\+/g, '%20')) || null;
  },

  //Subclass socketNotificationReceived received.
  socketNotificationReceived: function(notification, payload) {
    this.setTimeConfig(payload.timeConfig);
    this.mode = this.getURLParamter('mode', payload.url);

    if (notification === 'TRAFFIC_URL') {
      this.getCommute(payload.url);
    } else if (notification === 'LEAVE_BY') {
      this.getTiming(payload.url, payload.arrival);
    }
  }

});
