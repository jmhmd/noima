var cheerio = require('cheerio'),
    request = require('request'),
    tidy = require('htmltidy').tidy;
    
var file = "!1a90f1cfhumdm_im";
var pagerList = {};
var onCall = [];

	function getOnCall(){
		
		onCall = []; // clear list if any loaded already
		file = "";
		
        request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
            function( error, response, body ){
                //console.log(body);
                
                tidy(body, function(err,html){
					
					html = html.replace(/(\r\n|\n|\r)/gm," "); // remove carriage returns, line endings
					                    
                    var $ = cheerio.load(html);
				
					// set file, I think this is like a session cookie?
					file = $('input[name="File"]').attr('value');
					
					// get rows from table
					var rows = $('table').eq(1).find('tr');
					// shift off header row
					[].shift.call(rows);
										
					rows.each(function(index, row) {
						var person = {};
						person.name = $(row).find('a.plain').find('nobr').text().trim();
						person.service = $(row).find('td').eq(0).text().replace(/\s+/g, " "); // remove nbsp
						person.training = $(row).find('td').eq(4).text();
						var contactTD = $(row).find('td').eq(5);
						person.contact = contactTD.find('a') !== 0 ? {
								number: contactTD.find('a').text().trim(),
								link: contactTD.find('a').attr('href')
							} : {
								number: contactTD.find('a').text(),
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
					var onCallTeams = {
							MAO: onCall.filter(function(person){ if(person.service.indexOf('MAO') !== -1) return true; }),
							medA: onCall.filter(function(person){ return assignService(person,'A'); }),
							medB: onCall.filter(function(person){ return assignService(person,'B'); }),
							medC: onCall.filter(function(person){ return assignService(person,'C'); }),
							medY: onCall.filter(function(person){ return assignService(person,'Y'); }),
							medX: onCall.filter(function(person){ return assignService(person,'X'); }),
							dayFloat: onCall.filter(function(person){ if(person.service.indexOf('Day Float') !== -1) return true; }),
							nightFloat: onCall.filter(function(person){ if(person.service.indexOf('NF Intern') !== -1) return true; }),
							hospitalist: onCall.filter(function(person){ if(person.service.indexOf('Hospitalist') !== -1) return true; })
						};
					
					console.log(onCallTeams);
					
					//getPagerList();
                    
                    //res.render('index', {names: names, service: service, training: training, contact: contact});
                
                });
                
            });
    }
getOnCall();
    
    function getPagerList(){
    // TODO: figure out if Syr needs to change with calendar or academic year
	// can eventually skip this step for long running server as long as year is the same
    
		pagerList = {}; // clear list if any loaded
		nameList = [];
		
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
    