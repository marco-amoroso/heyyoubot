var Botkit = require('botkit');
var controller = Botkit.slackbot();
var http = require('http');

require('dotenv').load();

var bot = controller.spawn({
  token: process.env.BOT_TOKEN
});

var heyyou = {
  clientId: CLIENT_ID, // TEMP This should be dynamic
  api: {
    host: API_HOST,
    pathPrefix: API_PATH_PREFIX
  }
};

bot.startRTM(function(err,bot,payload) {
  if (err) {
    throw new Error('Could not connect to Slack');
  }
});

// function you can use:
function getValueFromPattern(str) {
  return str.split('=')[1];
}

function getVenueByPostcode(postcode, callback) {
  // API options
  var options = {
    host: heyyou.api.host,
    headers: {
      'x-btq-client-id': heyyou.clientId
    },
    path: heyyou.api.pathPrefix + '/venues?postcode=' + postcode + '&limit=20',
    method: 'GET'
  };

  // API call
  http.request(options, function(res) {
    var body = '';

    res.on('data', function (chunk) {
      // Get the response data
      body += chunk;
    }).on('end', function(){
      var response = JSON.parse(body);

      callback('List of Venues around ' + postcode + ' are: ' + buildVenueList(response.venues));
    });
  }).on('error', function(e) {
    console.log('problem with request: ' + e.message);
  }).end();
}

function buildVenueList(venues) {
  var result = '';

  venues.forEach(function(venue, index) {
    result += '\n' + venue.id + ' ' + venue.name + ' (Status: ' + venue.status + ')';
  });

  return result;
}

function buildMenu(menu) {
  var categories = menu.categories;
  var result = '';

  categories.forEach(function(category, index) {
    result += '\n*--- ' + category.name.trim() + ' ---*';

    category.items.forEach(function(item, index) {
      result += '\n' + item.id + ' - ' + item.name.trim() + ' ' + item.price.trim();
    });
  });

  return result;
}

function getMenuByVenueId(venueId, callback) {
  // API options
  var options = {
    host: heyyou.api.host,
    headers: {
      'x-btq-client-id': heyyou.clientId
    },
    path: heyyou.api.pathPrefix + '/venues/' + venueId + '/menus',
    method: 'GET'
  };

  // API call
  http.request(options, function(res) {
    var body = '';

    res.on('data', function (chunk) {
      // Get the response data
      body += chunk;
    }).on('end', function(){
      var response = JSON.parse(body);

      callback(response);
    });
  }).on('error', function(e) {
    console.log('problem with request: ' + e.message);
  }).end();
}

// controller.hears(["help","^pattern$"],["direct_message","direct_mention","mention","ambient"],function(bot,message, a, b, c) {
//   bot.reply(message,'Hi');
//   bot.reply(message,'Do you want to order? Ask me `heyyou postcode=` followed by your POSTCODE number to get a list of venues near you');
//   bot.reply(message,'Do you want to see their menus? Ask me `heyyou menu id=` followed by the Venue ID number, for example `heyyou menu id=16`');
// });

// controller.hears(["postcode=","^pattern$"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
//   var postcode = getValueFromPattern(message.text);

//   if (postcode) {
//     getVenueByPostcode(postcode, function(result){
//       bot.reply(message, result);
//     });
//   } else {
//     bot.reply(message, 'Oops - Make sure to add the correct postcode, for example for 2000 type `heyyou postcode=2000`');
//   }
// });

function getMenuMessage(venueId, result) {
  return 'Menu for ' + venueId + ' is: ' + buildMenu(result);
}

controller.hears(["menu id=","^pattern$"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  var venueId = getValueFromPattern(message.text);

  if (venueId) {
    getMenuByVenueId(venueId, function(result){
      bot.reply(message, getMenuMessage(venueId, result));
    });
  } else {
    bot.reply(message, 'Oops - Make sure to add the Venue ID, for example `heyyou menu id=16`');
  }
});

controller.hears(['order start'],['ambient'],function(bot,message) {
  bot.startConversation(message, askWhen);
});

askWhen = function(response, convo) {
  convo.ask("When would you like to order?", function(response, convo) {
    convo.sayFirst('Got it! You want to order ' + response.text);
    askPostcode(response, convo);
    convo.next();
  }, {key:'when'});
}

askPostcode = function(response, convo) {
  convo.ask("What is your Postcode?", function(response, convo) {
    getVenueByPostcode(response.text, function(result){
      convo.sayFirst(result);
    });
    setTimeout(function () {
      askVenueId(response, convo);
      convo.next();
    }, 2000);
  }, {key:'postcode'});
}

askVenueId = function(response, convo) {
  convo.ask("What Venue ID do you want to order from?", function(response, convo) {
    // Print Venue's Menu
    getMenuByVenueId(response.text, function(result){
      convo.sayFirst("Perfect.");
      convo.sayFirst(getMenuMessage(response.text, result));
      convo.sayFirst(result);
    });
    setTimeout(function () {
      askProductId(response, convo);
      convo.next();
    }, 2000);
  }, {key:'venueId'});
}

askProductId = function(response, convo) { 
  convo.ask("So what Product ID do you want?", function(response, convo) {
    convo.say("Ok!");
    convo.say("You want to order " + convo.extractResponse('when') + " from Venue " + convo.extractResponse('venueId'));
    convo.say("I'm ordering: " + convo.extractResponse('productId'));
    convo.next();
    // convo.responses.productId
  }, {key:'productId'});
}
