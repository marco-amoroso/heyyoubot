var Botkit = require('botkit');
var controller = Botkit.slackbot();
var http = require('http');

// Env
require('dotenv').load();

var bot = controller.spawn({
  token: process.env.BOT_TOKEN
});

var heyyou = {
  clientId: process.env.CLIENT_ID, // TEMP This should be dynamic
  api: {
    host: process.env.API_HOST,
    pathPrefix: process.env.API_PATH_PREFIX
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

function getMenuMessage(venueId, result) {
  return 'Menu for ' + venueId + ' is: ' + buildMenu(result);
}

function order(venueId, productId, callback) {
  // API options
  var postData = {
    "nonce": process.env.NONCE,
    "venueId": parseInt(venueId),
    "serviceType": "takeaway",
    "items": [{"id": parseInt(productId)}],
    "orderNote": "Submitted with HEYYOU Slack BOT"
  };

  var options = {
    host: heyyou.api.host,
    headers: {
      'x-btq-client-id': heyyou.clientId,
      Authorization: process.env.AUTH_CODE,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    path: heyyou.api.pathPrefix + '/orders/submit',
    method: 'POST'
  };

  // API call
  var req = http.request(options, function(res) {
    var body = '';

    res.on('data', function (chunk) {
      // Get the response data
      body += chunk;
    }).on('end', function(){
      var response = JSON.parse(body);
      callback(response);
    });
  });

  req.on('error', function(e) {
    console.log('problem with request: ' + e.message);
  })

  postData = JSON.stringify(postData, null, 4);

  req.write(postData);
  req.end();
}

controller.hears(['hi', 'hello', 'hey', '^pattern$'],['direct_message', 'mention'],function(bot,message) {
  bot.reply(message, '\nHi, I\'m the HeyYouBOT\n\nTo get started type *order start*\n');
});

controller.hears(['order start'],['direct_message', 'ambient'],function(bot,message) {
  bot.startConversation(message, askWhen);
});

askWhen = function(response, convo) {
  convo.ask("\n_*When* would you like to order?_ For example type *now* or *in 10 minutes*\n", function(response, convo) {
    askVenueIdPrePostcode(response, convo);
    convo.next();
  }, {key:'when'});
}

askVenueIdPrePostcode = function(response, convo) {
  convo.ask("\n_Do you already know the *ID* of the *Venue* you want to order from?_\n", [
    {
      pattern: bot.utterances.yes,
      callback: function(response,convo) {
        askVenueId(response, convo);
        convo.next();
      }
    },
    {
      pattern: bot.utterances.no,
      callback: function(response,convo) {
        // No
        askPostcode(response, convo);
        convo.next();
      }
    },
    {
      default: true,
      callback: function(response,convo) {
        // just repeat the question
        convo.repeat();
        convo.sayFirst('Sorry, I didn\' get that. Please say *yes* or *no* :smile:');
        convo.next();
      }
    }
  ]);
}

askPostcode = function(response, convo) {
  convo.ask("\n_What is your *Postcode*?_\n", function(response, convo) {
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
  convo.ask("\n_What *Venue ID* do you want to order from?_\n", function(response, convo) {
    // Print Venue's Menu
    getMenuByVenueId(response.text, function(result){
      convo.sayFirst(getMenuMessage(response.text, result));
    });
    setTimeout(function () {
      askProductId(response, convo);
      convo.next();
    }, 2000);
  }, {key:'venueId'});
}

askProductId = function(response, convo) { 
  convo.ask("\n\n_What *Product ID* do you want to order?_\n", function(response, convo) {
    var venueId = convo.extractResponse('venueId');
    var productId = convo.extractResponse('productId');
    var when = convo.extractResponse('when');

    var venueName = 'Venue ID ' + venueId;
    convo.say("\nI'm ordering Product ID " + productId + ", " + when + ", from " + venueName);

    // Order
    order(venueId, productId, function(result){
      convo.say('\nYou order has been successfully submitted and it will be ready soon.');
      convo.say('\nYou order ID is ' + result.orderId);
      convo.say('\nBye :wave:');
      convo.next();
    });
  }, {key:'productId'});
}
