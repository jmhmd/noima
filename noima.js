var express = require('express'),
    pub = __dirname + '/public',
    cheerio = require('cheerio'),
    request = require('request'),
    tidy = require('htmltidy').tidy,
	moment = require('moment'),
    EventEmitter = require('events').EventEmitter,
    fs = require('fs');
    
// setup middleware

var app = express();
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ secret: "hello my friend" }));
app.use(app.router);
app.use(express.static(pub));
app.use(express.errorHandler());


app.engine('.html', require('ejs').__express);
app.set('view engine', 'html');


//-----------Functions----------------//

// tidy raw html, strip weird characters, load into cheerio
// cleanHTML( rawHTML, function($) { ... } );
function cleanHTML( rawHTML, callback ) {
	tidy(rawHTML, function(err,html){
			
		if ( err || html === '' ) {
			console.log('Could not parse amion.com content: '+err);
		}
		
		html = html.replace(/(\r\n|\n|\r)/gm," "); // remove carriage returns, line endings
		
		var $ = cheerio.load(html);
		
		callback($);
		
	});
}


// refreshFile( function($) {...} ); $ = amion.com landing page HTML loaded into cheerio
function refreshFile(callback){
	console.log('Refreshing File...');
	
	request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
		function( error, response, body ){
		
			if ( error ) {
                console.log('Could not get amion.com content: '+error);
			}
			
			cleanHTML(body, function($){
				
				// set file, I think this is like a session cookie?
				appData.file = $('input[name="File"]').attr('value');
                
                if (typeof appData.file === 'undefined') {
                // something went wrong, try again
                    console.log('file is empty, retry');
                    console.log('Landing page HTML:');
                    console.log($.html().substr(0,20));
                    refreshFile(callback);
                    return false;
                } else {
                    console.log('refreshFile: '+appData.file);
                    
                    if(typeof callback !== 'undefined') {
                        callback($);
                    }
                }
			
			});
		});
}

// fetch HTML from amion for arbitrary call day by date
// fetchArbCallDay( date, function($){...} );
function fetchArbCallDay( date, callback ) {
	
	var month = date.month + '-' + date.year,
		day = date.day,
		url = 'https://www.amion.com/cgi-bin/ocs?Month='+month+'&Day='+day+'&File='+appData.file+'&Page=OnCall';
	
	request.get( url, function( error, response, body ){
		if ( error ) {
			throw new Error(error);
		}
		
		cleanHTML(body, function($){
			callback($);
		});
	});
}

// extract Call person info for display from cleaned up HTMl
// extractOnCall( $ [cheerio loaded html], function( result ){ result.onCallTeams } );
function extractOnCall( $, callback ) {
// req.date format DD/MM/YY
	
	var onCallTeams,
		onCall = [],
        result = {};
	
	
	// get rows from table
	var rows = $('table').eq(1).find('tr');
	// shift off header row
	[].shift.call(rows);
	
	rows.each(function(index, row) {
		var person = {};
		person.name = $(row).find('a.plain').find('nobr').text().trim();
		person.service = $(row).find('td').eq(0).text().replace(/\s+/g, " "); // remove nbsp;
		person.training = $(row).find('td').eq(4).text();
		var contactTD = $(row).find('td').eq(5);
		person.contact = contactTD.find('a').length !== 0 ? {
				number: contactTD.find('a').text().trim(),
				link: contactTD.find('a').attr('href')
			} : {
				number: contactTD.find('nobr').text(),
				link: false
			};
		onCall.push(person);
	});
	
	// group onCall by service
	function assignService(person, team) {
		if( (person.service.indexOf('Med '+team) > -1 ||
			person.service.indexOf('Resident '+team) > -1) &&
			person.service.indexOf('Med Con') < 0 ) {
			return true;
		}
	}
	
	onCallTeams = {
			MAO: {
				name: "MAO",
				people: onCall.filter(function(person){ if(person.service.indexOf('MAO') !== -1) return true; })
			},
			medA: { 
				name: "Med A",
				people: onCall.filter(function(person){ return assignService(person,'A'); })
			},
			medB: {
				name: "Med B",
				people: onCall.filter(function(person){ return assignService(person,'B'); })
			},
			medC: {
				name: "Med C",
				people: onCall.filter(function(person){ return assignService(person,'C'); })
			},
			medY: {
				name: "Med Y",
				people: onCall.filter(function(person){ return assignService(person,'Y'); })
			},
			medX: {
				name: "Med X",
				people: onCall.filter(function(person){ return assignService(person,'X'); })
			},
			dayFloat: {
				name: "Day Float",
				people: onCall.filter(function(person){ if(person.service.indexOf('Day Float') !== -1) return true; })
			},
			medCon: {
				name: "Med Con",
				people: onCall.filter(function(person){ if(person.service.indexOf('Med Con') !== -1) return true; })
			},
			nightFloat: {
				name: "Night Float",
				people: onCall.filter(function(person){ if(person.service.indexOf('NF Intern') !== -1 || person.service.indexOf('Overnight') !== -1) return true; })
			},
			hospitalist: {
				name: "Daytime Hospitalist",
				people: onCall.filter(function(person){ if(person.service.indexOf('Hospitalist') !== -1) return true; })
			}
		};
		
	//req.onCall = onCall;
	result.onCallTeams = onCallTeams;
					
	callback(result);
}

// get all the pagers by name and role for typeahead
// getPagerList( function( result ){ result.pagerList, result.nameList } );
function getPagerList( callback ){
// TODO: figure out if Syr needs to change with calendar or academic year
// can eventually skip this step for long running server as long as year is the same

	var result = {},
		pagerList = {},
		nameList = [];
        
    //console.log('file before pager req: '+appData.file);
	
	request.get( 'https://www.amion.com/cgi-bin/ocs?File='+ appData.file +'&Syr=2012&Page=Pgrsel&Rsel=-1',
		function( error, response, body ){
			//console.log('body: '+body);
			
			cleanHTML(body, function($){				
				var selects = [];
				
				for (var i = 1; i < 10; i++) {
					selects.push($('[name="Rsel'+i+'"]').find('option'));
				}
														
				// loop through selects, get names and numbers
				$(selects).each( function(index, options){
					var label = '';
					options.each( function(index, option){
						if (index === 0) {
							label = $(option).text();
							pagerList[label] = [];
						} else {
							var s = $(option).attr('value').split('*');
							pagerList[label].push({url:s[0],num:s[1],name:s[2]});
							if ( typeof s[2] !== 'undefined' ) {
								nameList.push( s[2] );
							}
						}
					});
				});
				
				result.pagerList = pagerList;
				result.nameList = nameList;
									
				callback(result);
				
			});
			
		});
}

// build date string from request parameters
function buildDate(req, res, next) {
	//req.date = req.params.day+'/'+req.params.month+'/'+req.params.year.toString().substr(-2);
	req.date = {
        day: req.params.day,
        month: req.params.month,
        year: req.params.year
	};
    console.log('Get Date:'+req.day+'/'+req.month+'/'+req.year);
	next();
}

function refreshPagerList() {
// pager list should stay relatively static. May only need to recheck daily or monthly
    getPagerList(function(result) {
        appData.pagerList = result.pagerList;
        appData.nameList = result.nameList;
        console.log('got pager list and name list.');
    });
}

//-----------Routing ------------------------//

app.post('/sendPage', function(req, res){
	// To: takes valid name in "last, first" format, last 4 digits, or full pager number with or without hyphens
	// From: free text, spaces replaced by periods
	// Note: maxlength 240?
	console.log(req.body);
	
	function sendPage() {
		var To = req.param('To'),
			From = req.param('From'),
			Note = req.param('Note');
			
		request.get({
					url: 'https://www.amion.com/cgi-bin/ocs',
					qs: { 
						File: appData.file,
						Page: 'Alphapg', 
						//Rsel: '5', 
						Syr: '2012',
						Apgref: '1',
						ApgNmNum: To,
						From: From,
						Enote: Note
					}
				},
				function( error, response, body ){
					if ( response.statusCode !== 200 ) {
						console.log( error );
						res.send({ success: false, msg: error });
					} else {
						if ( typeof body === 'undefined' || body.indexOf('Accepted') === -1 ) {
							res.send({ success: false, msg: 'Page could not be sent.' });
						} else { // all's well, page sent
							console.log( 'Page sent to '+To+'.' );
							res.send({ success: true, msg: 'Page sent to '+To+'.' });
						}
					}
				}
		);
	}
	
	sendPage();
});

app.get('/onCall/:day/:month/:year', buildDate, function(req, res) {
    // need to get oncall for arbitrary day
    
    fetchArbCallDay(req.date, function($){
        extractOnCall($, function(result){
            res.send({
                onCallTeams: result.onCallTeams
            });
        });
    });
});

app.get('/', function(req, res) {
// Basic info for index page should be cached. Serve it up
	
	
	//console.log(pagerList);
	//console.log(onCallTeams);
	
	res.render('index', { 
            onCallTeams: appData.onCallTeams, 
            pagerList: appData.pagerList, 
            nameList: appData.nameList 
        });

});

//-----------Application logic --------------//

// things to cache in the app
var appData = {
        onCallTeams: false,
        pagerList: {},
        nameList: [],
        file: "",
        timeToRefresh: 9.75 * 60 * 1000, // time to wait before refreshing file in milliseconds
        appInitTime: moment(),
        lastRefresh: false
    },
    emitter = new EventEmitter();
	//timeSinceRefresh = false; // time in seconds since last file refresh
	
// on app init, get file def, start amion.com connection loop

function appRefresh(callback) {
    console.log('calling refreshFile...');
    refreshFile(function($) {
        console.log('calling extractOnCall, file: '+appData.file);
        extractOnCall($, function(result) {
            console.log('got onCallTeams.');
			appData.onCallTeams = result.onCallTeams;
            
            // call callback function
            if (typeof callback !== 'undefined'){
                callback();
            }
		});
	});
}

emitter.on('new_day', refreshPagerList);

(function loopFunction() {
// this will fetch the main amion site, extract the oncall info,
// and cache the file and oncall peeps
    console.log("Refresh app");
	appRefresh(function(){
	// placing logic in callback will ensure new "file" has been found and loaded
	// prior to placing new requests for data from amion.com
	
		// check if it's a new day
		if ( appData.lastRefresh === false || moment().format('D') !== appData.lastRefresh.format('D') ) {
			console.log("It's a new day! Refresh stuff");
			emitter.emit('new_day');
		}
		
		appData.lastRefresh = moment();
		
		setTimeout( loopFunction, appData.timeToRefresh );
	});
}());

//-----------Init App ---------//

var port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log("Listening on " + port);
});