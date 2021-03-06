var async = require('async'),
    events = require('events'),
    util = require('util');

function GameEvent(){
     if(false === (this instanceof GameEvent)) {
        return new GameEvent();
     }
     events.EventEmitter.call(this);
}
util.inherits(GameEvent, events.EventEmitter);

var gameEvent= new GameEvent();


function other_side(side){
    if ( side == 'right' )
        return 'left';
    else if ( side == 'left' )
        return 'right';
    else throw TypeError;
}

function convertToArray(obj){
 var arr = [];

 for (var key in obj) {
     if (obj.hasOwnProperty(key)) {
       arr.push([key, obj[key]]);
     }
 }
 return arr;
}

var StateEnum = {
    SLEEP : 0,
    WORK:1,
    STEAL:2,
    MOVE:3,
};
StateEnum.INIT = StateEnum.WORK;
StateEnum.FIRST = StateEnum.SLEEP;
StateEnum.LAST = StateEnum.MOVE;

function Heap(db, game) {
    this.db = db;
    this.game = game;
    /* May move to DB */
    this.score_coeff=1;

}

Heap.prototype.set_id = function(heap_id, cb) {
    var that = this;
    function update_value(err, res) {
        that.id = res;
        that.prefix = that.game.name +":"+ that.game.id + ":h:"+that.id ;
        cb && cb(err, that.id) ;
    }
    if(heap_id === null) {
        this.db.incr(this.game.name +":"+ this.game.id + ":head_id", update_value);
    } else {
        update_value(null, heap_id);
    }
};


Heap.prototype.get_heap = function(cb){
    this.db.get(this.prefix+":heap", cb);
};
Heap.prototype.set_heap = function(heap, cb){
    this.db.set(this.prefix+":heap", heap, cb);
};
Heap.prototype.add_heap = function(val, reason, cb){
    console.log("heap ",this.id," inc by ", val, ":", reason);
    var h=this;
    h.get_player_ids(function(err, players_id){
        gameEvent.emit('h_heap', val, h.game.id, h.id, players_id, reason);
    });
    this.db.incrby(this.prefix+":heap", val, function (err, res) { cb(err, val, reason) ;});
};
Heap.prototype.sub_heap = function(val, reason, cb){
    console.log("heap ",this.id," dec by ", val, ":", reason);
    var h=this;
    h.get_player_ids(function(err, players_id){
        gameEvent.emit('h_heap', -val, h.game.id, h.id, players_id, reason);
    });
    this.db.decrby(this.prefix+":heap", val, function (err, res) { cb(err, val, reason) ;});
};
Heap.prototype.steal = function(cb){
    var that=this;
    this.get_heap( function(err, heap) {
        var val = Math.min( Math.floor(heap/2), Math.floor(that.game.steal_const + heap * that.game.steal_coeff));
        that.sub_heap(val, "steal", cb);
    });
};

Heap.prototype.turn = function(n, cb) {

    var h = this;
    var workers =[];
    var all_stealer = true;
    var all_worker = true;

    /* update curent heap value due to neigbourough workers */
    function updateDueToWorkers(workers, cb){
	if(workers.length !==0 ) {
            var nb = Object.keys(workers).length;
            var returnCallback = function (err) {
                nb--;
                if(nb<=0) cb(err);
            };
            for (var w in workers) {

                h.add_heap(h.game.gain, "work from player " + w, returnCallback);
            }
        }else{
            cb && cb(null);
	}
    }

    /* update curent heap value if all neigbourough are worker */
    function updateDueToAllWorker(all_workers, cb){
        if(all_workers) {
            h.get_heap( function(err, heap){
                var bonus = Math.floor(h.game.bonus_const + h.game.bonus_coeff * heap);
                h.add_heap(bonus, "bonus", cb);
            });
        }else{
            cb && cb(null);
        }
    }

    /* update curent heap value if all neigbourough are stealer */
    function updateDueToAllStealer(all_stealers, cb) {
       if (all_stealer) {
            h.get_heap( function(err, heap){
                var destruct = Math.min( Math.floor( h.game.malus_const + h.game.malus_coeff * heap), heap );
                h.sub_heap(destruct, "malus", cb);
            });
        } else {
            cb && cb(null);
        }
    }

    /* update curent heap value depending of neigbourough status */
    function updateHeap(workers, all_worker, all_stealer, cb){
        updateDueToWorkers(workers, function(err){
            updateDueToAllWorker(all_worker, function(err){
                updateDueToAllStealer(all_stealer, cb);
            });
        });
    }

    /* prepare neigbourgs players
    for each player in neigbourgough add the action fiels*/
    function managePlayer(player, cb) {
        var s=player[0];
        var p=player[1];
        p.get_actionAndSide( function(err, action) {
            if(err) {
                cb(err);
                return;
            }
            if (   (action.state == StateEnum.WORK)
                && (other_side(s) in action.side) ){
                workers.push(p);
            } else {
                all_worker = false;
            }
            if (  (action.state != StateEnum.STEAL)
                ||!(other_side(s) in action.side) ){
                all_stealer = false;
            }
            cb(null);
        });
    }
    this.get_players(function(err, players) {
        async.each(convertToArray(players), managePlayer, function(err) {
           if (err) { cb(err); return; }
           updateHeap(workers, all_worker, all_stealer, cb);
        });
    });
};




Heap.prototype.attach_player_ids = function(players, cb){
    this.db.hmset(this.prefix+":players", players, cb);
};
Heap.prototype.get_player_ids = function(cb){
        this.db.hgetall(this.prefix+":players", cb);
};
Heap.prototype.get_players = function(cb){
    var that=this;
    this.get_player_ids(function(err, players_ids){
        var players= {};
        var nb = Object.keys(players_ids).length;
        function returnCallback(err, val) {
                nb--;
                if(nb===0) cb(err, players);
        }
        for (var p in players_ids) {
            players[p] = new Player(that.db, that.game);
            players[p].set_id(players_ids[p], returnCallback);

        }
    });
};
Heap.prototype.get_score = function(cb) {
    var h=this;
    this.get_heap(function(err, heap){
        cb(err, heap*h.score_coeff);
    });
};



function Player(db, game) {
    this.db = db;
    this.game = game;
}

Player.prototype.set_id = function(player_id, cb) {
    var that = this;
    function update_value(err, res) {
        that.id = res;
        that.prefix = that.game.name +":"+ that.game.id + ":p:"+that.id ;
        cb && cb(err, that.id) ;
    }
    if(player_id === null) {
        this.db.incr(this.game.name +":"+ this.game.id + ":player_id", update_value);
    } else {
        update_value(null, player_id);
    }
};

Player.prototype.attach_heap_ids= function(heaps_ids, cb){
    var that=this;
    var nb = Object.keys(heaps_ids).length;
    function returnCallback(err, val) {
                nb--;
                if(nb===0) cb(err, heaps_ids);
    }
    function getReverseAttach(side, p_id) {
            var t = {};
            t[other_side(side)] = p_id ;
            return function(err, heaps) {
                heaps[side].attach_player_ids(t, returnCallback);
            };
    }
    this.db.hmset(this.prefix+":heaps", heaps_ids, function(err, res) {
        for (var side in heaps_ids) {
            var reverseAttach=getReverseAttach(side, that.id);
            that.get_heaps(reverseAttach);
        }
    });
};

Player.prototype.get_heap = function(cb){
    this.db.get(this.prefix+":heap", cb);
};
Player.prototype.set_heap = function(heap, cb){
    this.db.set(this.prefix+":heap", heap, cb);
};
Player.prototype.add_heap = function(val, reason, cb){
    console.log("player ",this.id," inc by ", val, ":", reason);
    gameEvent.emit('p_heap', val, this.game.id, this.id, reason);
    this.db.incrby(this.prefix+":heap", val, function (err, res) { cb(err, res, reason) ;} );
};
Player.prototype.sub_heap = function(val, reason, cb){
    console.log("player ",this.id," dec by ", val, ":", reason);
    gameEvent.emit('p_heap', -val,this.game.id, this.id, reason);
    this.db.decrby(this.prefix+":heap", val , function (err, res) { cb(err, res, reason) ;});
};

Player.prototype.get_heaps_ids = function(cb){
        this.db.hgetall(this.prefix+":heaps", cb);
};
Player.prototype.get_heaps = function(cb){
    var that=this;
    this.get_heaps_ids(function(err, heaps_ids){
        var heaps= {};
        var nb = Object.keys(heaps_ids).length;
        function returnCallback(err, val) {
                nb--;
                if(nb===0) cb(err, heaps);
        }
        for (var h in heaps_ids) {
            heaps[h] = new Heap(that.db, that.game);
            heaps[h].set_id(heaps_ids[h], returnCallback);
        }
    });
};

Player.prototype.get_action = function(cb){
    this.db.get(this.prefix+":action", cb);
};
Player.prototype.set_action = function(action, cb) {
    this.db.set(this.prefix+":action", action, cb);
};
Player.prototype.get_side = function(cb){
    this.db.hgetall(this.prefix+":side", cb);
};
Player.prototype.set_side = function(side, cb) {
    this.db.hmset(this.prefix+":side", side, cb);
};

Player.prototype.get_actionAndSide = function(cb) {
    var action={};
    var p=this;
    p.get_action(function(err, state){
        action.state = state;
        p.get_side(function(err, side){
            action.side = side;
            cb && cb(err, action);
        });

    });
};

Player.prototype.steal = function(side, cb) {
    /* get heap of this side */
    var h;
    var p=this;
    p.get_heaps(function (err, heaps) {
        h=heaps[side];
        h.steal(function( err, value){
            p.add_heap(value, "stealed by "+p.id, cb);
        });
    });
};
Player.prototype.turn = function(n, cb) {
    var p = this;
    this.get_actionAndSide(function(err, action){
        if (action.state == StateEnum.STEAL) {
            var nb = Object.keys(action.side).length;
            var returnCallback = function (err, val) {
                nb--;
                if(nb===0) cb(err, action.side);
            };
            for (var s in action.side) {
                p.steal(s, returnCallback) ;
            }
        }else{
            cb && cb(null);
        }
    });
};
Player.prototype.get_score = function(cb) {
    var score_self=0;
    var score_heaps=0;
    var p=this;
    this.get_heap( function(err, heap_self) {
        score_self = heap_self* p.game.score_coeff_self ;
        p.get_heaps(function (err, heaps) {
            var nb = Object.keys(heaps).length;
            var h;
            function calculateHeapsScore(err, val) {
                nb--;
                score_heaps+=val;
                if(nb===0)
                    cb(err, score_self + this.game.score_coeff_heaps * score_heaps);
            }
            for (h in heaps) {
                h.get_score(calculateHeapsScore);
            }
        });
    });
};


function Game(db) {
    this.db = db;
    this.name="lutins";
    this.malus_const  = 1;
    this.malus_coeff  = 0.25;
    this.bonus_const  = 4;
    this.bonus_coeff  = 0.1;
    this.gain         = 1;
    this.steal_const  = 0;
    this.steal_coeff  = 0.5;
    this.score_coeff_self=2;
    this.score_coeff_heap=1;

}

Game.prototype.set_id = function(game_id, cb) {
    var that = this;
    function update_value(err, res) {
        that.id = res;
        that.prefix = that.name +":"+ that.id ;
        cb && cb(err, that.id) ;
    }
    if(game_id === null) {
        this.db.incr(this.name + ":game_id", update_value);
    } else {
        update_value(null, game_id);
    }
};

//Game.prototype.Player = Player;
//Game.prototype.Heap = Heap;

Game.prototype.players = function(cb) {
    var players_key = this.prefix + ":players";
    var g=this;
    g.db.llen(players_key, function(err, lplayers){
        cb && cb(err, lplayers);
    });
};

Game.prototype.player_add = function(name, cb) {
    var p, first_p;
    var h;
    var players_key = this.prefix + ":players";
    var heaps_key = this.prefix + ":heaps";
    var g=this;
    var AddInGameLists;
    /* If odd number of player, add new player/heap at the end,
       if even add player/heap at the start
       So all 'old' player are near each other */
    g.db.llen(heaps_key, function(err, lheaps){
        if((lheaps%2) === 0){
            AddInGameLists =function (err, val) {
                /* add player and heap into theirs respective lists */
                g.db.lpush(players_key, p.id, function(err, res) {
                    g.db.lpush(heaps_key, h.id, function(err, res) {
                        cb && cb(err, res);
                    });
                });
            };
        }else{
            AddInGameLists =function (err, val) {
                /* add player and heap into theirs respective lists */
                g.db.rpush(players_key, p.id, function(err, res) {
                    g.db.rpush(heaps_key, h.id, function(err, res) {
                        cb && cb(err, res);
                    });
                });
            };
        }


        /* create new Player and a his/her new R-heap */
        p = new Player(g.db, g);
        h = new Heap(g.db, g);
        p.set_id(null, function(err, p_id) {
            h.set_id(null, function(err,h_id){
                g.db.lindex(heaps_key, -1, function(err, last_h_id) {
                    if (last_h_id !== null) {
                        g.db.lindex(players_key, 0, function(err, first_p_id) {
                            /* attach First player L to new heap
                               attach new player R to new heap, and L to last heap */
                            first_p = new Player(g.db, g);
                            first_p.set_id(first_p_id, function(err, val) {
                                first_p.attach_heap_ids({'left' : h.id}, function () {
                                    p.attach_heap_ids({'left' : last_h_id, 'right' : h.id}, AddInGameLists);
                                });
                            });
                        });
                    } else {
                        /* If first payer/first heap attach player to the heap on both side */
                        last_h_id = h.id;
                        p.attach_heap_ids({'left' : last_h_id, 'right' : h.id}, AddInGameLists);
                    }

                });
            });
        });
    });
};


Game.prototype.turn = function(n, cb) {
console.log("Game ", this.id, " turn ", n);
    var g = this;
    function oneHeapTurn(h_id, cb) {
        var h = new Heap(g.db, g);
        h.set_id(h_id, function(err) {
            h.turn(n, cb);
        });
    }
    function onePlayerTurn(p_id, cb) {
        var p = new Player(g.db, g);
        p.set_id(p_id, function(err) {
            p.turn(n, cb);
        });
    }

    function heapTurn(cb) {
        g.db.lrange(g.prefix + ":heaps", 0, -1, function(err, res) {
            async.each(res, oneHeapTurn, cb);
        });
    }

    function playerTurn(cb) {
        g.db.lrange(g.prefix + ":players", 0, -1, function(err, res) {
            async.each(res,onePlayerTurn,cb);
        });
    }
    heapTurn(function(err) {
        playerTurn(cb);
    });
    /* calculate score ??!! */
};

Game.prototype.setPlayerState = function(p_id, state, side, cb) {
    var state_id=StateEnum.SLEEP;
    var s = {};
    var p = new Player(this.db, this);
    /* verification input */
    if (typeof state === "string") {
        switch(state.toLowerCase()) {
            case "work":
                state_id =StateEnum.WORK;
                break;
            case "steal":
                /* no able to steal both side */
                if (!(side.right && side.left)) {
                    state_id =StateEnum.STEAL;
                } /* else stay in idle state */
                break;
            /* case "idle": included in default*/
            default:
                /* nothing to update,
                default state_id and s are already correct */
                break;
        }
    } /* else
        nothing to update,
        default state_id and s are already correct */
    side.right && (s.right = side.right) ;
    side.left && (s.left = side.left) ;

    /* set input */
    p.set_id(p_id, function(err) {
        p.set_action( state_id, function(err) {
            p.set_side(s, cb);
        });
    });
};

Game.prototype.getInfoPlayer = function(p_id, cb) {
    var p = new Player(this.db, this);
    var p_info={};
    p.set_id(p_id, function(err) {
        p_info.id=p_id;
        if(err) { cb(err); return;}
        p.get_heap(function (err, heap){
            if(err) { cb(err); return;}
            p_info.heap=heap;
            p.get_heaps(function (err, heaps){
                if(err) { cb(err); return;}
                p_info.right={};
                p_info.left={};
                p_info.right.id =heaps.right.id;
                p_info.left.id =heaps.left.id;
                var nb = Object.keys(heaps).length;
                function getAddHeapsHeapfct(h){
                    return function addHeapsHeap(err, heap) {
                        if(err) { cb(err); return;}
                        nb--;
                        p_info[h].heap = heap;
                        if(nb===0){
                                cb(err, p_info);
                        }
                    };
                }
                for (var h in heaps) {
                    heaps[h].get_heap(getAddHeapsHeapfct(h));
                }
            });
        });
    });
};

Game.prototype.displayPlayer = function(p_id, cb){
    var g= this;
    g.getInfoPlayer(p_id, function(err, p) {
        if(err) { cb(err); return;}
        console.log("player", p.id, " with h=", p.heap,
        "\n    L=", p.left.id,  " with h=", p.left.heap,
        "\n    R=",p.right.id,  " with h=", p.right.heap);
        cb(null);
    });
};

Game.prototype.getStatus = function(cb) {
    var status = [];
    var g=this;
    function push_one_player(p_id, cb2) {
        g.getInfoPlayer(p_id, function(err, p_info) {
                if(err) { cb2(err); return;}
                status.push(p_info);
                cb(null);
        });
    }

    this.db.lrange(this.prefix + ":players", 0, -1, function(err, res) {
        async.each(res, push_one_player, cb);
    });

};
Game.prototype.displayAllPlayers = function(cb) {
    var g = this;
    function display_one_player(p_id, cb2) {
        g.displayPlayer(p_id, cb2 );
    }
    this.db.lrange(this.prefix + ":players", 0, -1, function(err, res) {
        async.eachSeries(res, display_one_player, cb);
    });
};


exports.Game=Game;
exports.gameEvent=gameEvent;
exports.Player=StateEnum;

