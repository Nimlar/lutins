var redis = require("redis"),db = redis.createClient();
var u=require('util');
var a = require('./lutins');


db.flushall(function() {
	testCreatePlayers(3);
});


function testCreatePlayers(num) {
    var g = new a.Game(db);
    g.set_id(null, function(err, val) {
        function add_next_player(nb_players, cb) {
            console.log("add "+ nb_players);
            if(nb_players > 1) {
                g.player_add(nb_players, function(err, val) {
                    add_next_player(--nb_players, cb);
                });
            } else {
                g.player_add(nb_players, function(err, val) {
                    cb && cb(err, val);
                });
            }
        }
        add_next_player(num, function(){
            g.displayAllPlayers(function(err) {
                console.log("fini");
            });
        });
    });
}