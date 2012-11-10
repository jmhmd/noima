var cheerio = require('cheerio'),
    request = require('request'),
    tidy = require('htmltidy').tidy;
    
var file = "!1a90f1cfhumdm_im";
var pagerList = {};

request.post( 'http://amion.com/cgi-bin/ocs', {form: {Login: 'mercymed'}},
            function( error, response, body ){
                var $ = cheerio.load(body);
                    
                // set file, I think this is like a session cookie?
                file = $('input[name="File"]').attr('value');
                
                getGroups();
                
            });
function getGroups() {
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
									
				//console.log(pagerList);
				
				pageSomeone();
				
			});
			
		});
}

function pageSomeone(){
	request.get({
					url: 'https://www.amion.com/cgi-bin/ocs',
					qs: { 
						File: file,
						Page: 'Alphapg', 
						Rsel: '5', 
						Syr: '2012',
						Apgref: '1',
						From: 'Jasontest',
						Enote: 'Hey buddy'
					}
				},
				function( error, response, body ){
					console.log(response.statusCode);
					console.log(body);
				}
	);
}