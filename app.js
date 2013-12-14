var redis = require("redis"),db = redis.createClient();
var u=require('util');
var a = require('./lutins');

var g = new a.Game(db);

g.set_id(null, function(err, val) {
    function add_next_player(nb_players, cb) {
        console.log("add "+ nb_players);
        if(nb_players > 0) {
            g.player_add(nb_players, function(err, val) {
                add_next_player(--nb_players, add_next_player);
            });
        }
    }
    add_next_player(3);
});