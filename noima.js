var express = require('express'),
    pub = __dirname + '/public',
    cheerio = require('cheerio'),
    request = require('request'),
    tidy = require('htmltidy').tidy;
    
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

//-----------Application logic --------------//

//var file = "";
var onCall = [];
var pagerList = {};
var nameList = [];


//-----------Functions----------------//
function refreshFile(req, callback){
	request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
		function( error, response, body ){
			var $ = cheerio.load(body);
				
			// set file, I think this is like a session cookie?
			req.session.file = $('input[name="File"]').attr('value');
			
			callback();
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
			Note = req.param('Note'),
			retry = 0;
		
		request.get({
					url: 'https://www.amion.com/cgi-bin/ocs',
					qs: { 
						File: req.session.file,
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
							if ( req.session.retry === 1 ) {
								req.session.retry = 0;
								res.send({ success: false, msg: 'Page could not be sent.' });
							} else {
								console.log('Page not sent. Refreshing file...');
								req.session.retry = 1;
								refreshFile(req, sendPage);
							}
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

app.get('/', function(req, res){
	
	var onCallTeams;
    
    function getOnCall(){
		
		onCall = []; // clear list if any loaded already
		req.session.file = "";
		
        request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
            function( error, response, body ){
                //console.log(body);
                
                tidy(body, function(err,html){
				
					html = html.replace(/(\r\n|\n|\r)/gm," "); // remove carriage returns, line endings
                    
                    var $ = cheerio.load(html);
				
					// set file, I think this is like a session cookie?
					req.session.file = $('input[name="File"]').attr('value');
					
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
					
					function assignService(person, team) {
						if( person.service.indexOf('Med '+team) > -1 ||
							person.service.indexOf('Resident '+team) > -1 ) {
							return true;
						};
					};
					
					// group onCall by service
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
							nightFloat: {
								name: "Night Float",
								people: onCall.filter(function(person){ if(person.service.indexOf('NF Intern') !== -1 || person.service.indexOf('Overnight') !== -1) return true; })
							},
							hospitalist: {
								name: "Daytime Hospitalist",
								people: onCall.filter(function(person){ if(person.service.indexOf('Hospitalist') !== -1) return true; })
							}
						};
					
					getPagerList();
                    
                    //res.render('index', {names: names, service: service, training: training, contact: contact});
                
                });
                
            });
    }
    
    function getPagerList(){
    // TODO: figure out if Syr needs to change with calendar or academic year
	// can eventually skip this step for long running server as long as year is the same
    
		pagerList = {}; // clear list if any loaded
		nameList = [];
		
        request.get( 'https://www.amion.com/cgi-bin/ocs?File='+ req.session.file +'&Syr=2012&Page=Pgrsel&Rsel=-1',
			function( error, response, body ){
				//console.log(body);
				
				tidy(body, function(err,html){
									
					var $ = cheerio.load(html);
					
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
										
					renderPage();
					
				});
				
			});
    }
    
    function renderPage() {
		console.log(onCall);
		//console.log(pagerList);
		//console.log(onCallTeams);
		
		res.render('index', { onCall: onCall, onCallTeams: onCallTeams, pagerList: pagerList, nameList: nameList });
	}
	
	function init() {
		getOnCall();
	}
	
	init();
});


var port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log("Listening on " + port);
});