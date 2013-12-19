var redis = require("redis"),db = redis.createClient();
var u=require('util');
var a = require('./lutins');
var restify = require('restify');
// https://github.com/micha/resty
var server = restify.createServer();

function new_game(req, res, next) {
    var g=new a.Game(db);
    g.set_id(null, function(err, val) {
        res.send('{"game_id" : '+val+'}');
        next();
    });
}

function new_player(req, res, next) {
    var g = new a.Game(db);
    g.set_id(req.params.game_id, function(err, val) {
        g.player_add("name no yet saved", function(err, val) {
            res.send('{"game_id" : '+g.id+', "p_id" :'+val+'  }');
            next();
	});
    });
}

var next_turn = function() {
	var n=0;
	return function (req, res, next) {
	    var g = new a.Game(db);
	    g.set_id(req.params.game_id, function(err, val) {
		    g.turn(n++, function() { 
                        res.send("new turn " + n);
                        next();
                    });
	    });
	};
}();


function player_move(req, res, next) {
    var g = new a.Game(db);
    load=JSON.parse(req.body)
    g.set_id(req.params.game_id, function(err, val) {
        g.setPlayerState(req.params.p_id, load.state, load.side, function(){
            console.log("La -> ", req.params.p_id, load.state, load.side);
            res.send('{"game_id" : '+g.id+', "p_id" :'+req.params.p_id +'  }');
            next();
	});
    });
}

function player_status(req, res, next) {
    var g = new a.Game(db);
    g.set_id(req.params.game_id, function(err, val) {
        g.getInfoPlayer(req.params.p_id, function(err, p_info){
            res.send('{"game_id" : '+g.id+', "p_id" :'+req.params.p_id +",\n"+
                      "info:"+ JSON.stringify(p_info) +  ' }');
            next();
	});
    });
}



server.use(restify.fullResponse())
       .use(restify.bodyParser());
server.get('/game/new', new_game);
server.get('/game/:game_id/p/new', new_player);
server.get('/game/:game_id/p/:p_id', player_status);
server.post('/game/:game_id/p/:p_id/move', player_move);



server.get('/game/:game_id/next', next_turn);

server.listen(8080, function() {
  console.log('listening: %s', server.url);
});

a.gameEvent.on('h_heap', function(val, game_id, h_id, players_id, reason) {
	console.log('on h_heap add=', val,  
                     ' g.id=',game_id, ' h_id=',h_id, 
                     ' ps_id=', players_id, ' due to', reason);
});
a.gameEvent.on('p_heap', function(val, game_id, p_id, reason) {
	console.log('on p_heap add=', val,  
                     ' g.id=',game_id, ' p_id=',p_id, 
                     ' due to', reason );
});


/*
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
            console.log("add player cb");
            g.getInfoPlayer(1, function(err, info) {
              console.log(info.id);
              g.displayAllPlayers(function() {
                g.setPlayerState(2, 1, {'left':1, 'right':1}, function(){
                  g.turn(1, function() {
                    g.displayAllPlayers(function() {
                      g.setPlayerState(1, 1, {'left':1, 'right':1}, function(){
                      g.setPlayerState(3,2,{'left':1}, function() {
                        g.turn(2, function() {
                          g.displayAllPlayers(function() {
                            console.log("fini");
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
        });
    });
});
}

*/
