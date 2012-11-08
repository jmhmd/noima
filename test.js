var cheerio = require('cheerio'),
    request = require('request'),
    tidy = require('htmltidy').tidy;
    
var file = "!1a90f1cfhumdm_im";

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
                        selects.push($('[name="Rsel'+i+'"]'));
                    }
                                        
                    var groups = {};
                                        
                    // loop through selects, get names and numbers
                    $.each( selects, function(index, select){
                        var options = select.find('option');
                        var group = options.map( function(index,el){ var s = $(el).attr('value').split('*'); return {url:s[0],num:s[1],name:s[2]}; } );
                        var label = options.label;
                        groups[label] = group;
                    });
                    
                    console.log(groups);
                    
                });
                
            });
}