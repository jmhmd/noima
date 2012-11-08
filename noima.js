var express = require('express'),
    pub = __dirname + '/public',
    cheerio = require('cheerio'),
    request = require('request'),
    tidy = require('htmltidy').tidy;
    
// setup middleware

var app = express();
app.use(app.router);
app.use(express.static(pub));
app.use(express.errorHandler());

app.engine('.html', require('ejs').__express);
app.set('view engine', 'html');

app.get('/', function(req, res){
    
    var file = "";
    var onCall = [];
	var pagerList = {};
	
	function refreshFile(){
		request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
            function( error, response, body ){
                var $ = cheerio.load(body);
                    
                // set file, I think this is like a session cookie?
                file = $('input[name="File"]').attr('value');
                                
            });
	}
    
    function getOnCall(){
        request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
            function( error, response, body ){
                //console.log(body);
                
                tidy(body, function(err,html){
                    
                    var $ = cheerio.load(html);
				
					// set file, I think this is like a session cookie?
					file = $('input[name="File"]').attr('value');
					
					// get rows from table
					var rows = $('table').eq(1).find('tr');
					// shift off header row
					[].shift.call(rows);
										
					rows.each(function(index, row) {
						var person = {};
						person.name = $(row).find('a.plain').find('nobr').text();
						person.service = $(row).find('td').eq(0).text();
						person.training = $(row).find('td').eq(4).text();
						var contactTD = $(row).find('td').eq(5);
						person.contact = contactTD.find('a') !== 0 ? {
								number: contactTD.find('a').text(),
								link: contactTD.find('a').attr('href')
							} : {
								number: contactTD.find('a').text(),
								link: false
							};
						onCall.push(person);
					});
					
					/*
					var names = rows.map( function(index,el) {return $(el).find('a.plain').find('nobr').text();});
					var service = rows.map( function(index,el) {return $(el).find('td').eq(0).text();});
					var training = rows.map( function(index,el) {return $(el).find('td').eq(4).text();});
					var contact = rows.map( function(index,el) {
						var td = $(el).find('td').eq(5);
						if (td.find('a') !== 0) {
							return [td.find('a').text(), td.find('a').attr('href')]; 
						} else {
							return [td.find('nobr').text(), false];
						}
					});
					*/
					//names.shift();
					//service.shift();
					
					getPagerList();
                    
                    //res.render('index', {names: names, service: service, training: training, contact: contact});
                
                });
                
            });
    }
    
    function getPagerList(){
    // TODO: figure out if Syr needs to change with calendar or academic year
    
        request.get( 'https://www.amion.com/cgi-bin/ocs?File='+ file +'&Syr=2012&Page=Pgrsel&Rsel=-1',
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
							}
						});
					});
										
					renderPage();
					
				});
				
			});
    }
    
    function renderPage() {
		//console.log(onCall);
		//console.log(pagerList);
		
		res.render('index', { onCall: onCall, pagerList: pagerList });
	}
	
	function init() {
		getOnCall();
	}
	
	init();
});


    
app.listen(6001);
console.log('Express app started on port 6001');