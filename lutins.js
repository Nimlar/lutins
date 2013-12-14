

function other_side(side){
    if ( side == 'right' )
        return 'left';
    else if ( side == 'left' )
        return 'right';
    else throw TypeError;
}

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
    this.db.incrby(this.prefix+":heap", val, function (err, res) { cb(err, val, reason) ;});
};
Heap.prototype.sub_heap = function(val, reason, cb){
    this.db.decrby(this.prefix+":heap", val, function (err, res) { cb(err, val, reason) ;});
};
Heap.prototype.steal = function(cb){
    var that=this;
    this.get_heap( function(err, heap) {
        var val = Math.min( Math.floor(heap/2), Math.floor(that.game.steal_const + heap * that.game.steal_coeff))
        that.sub_heap(val, "steal", cb);
    });
};
Heap.prototype.turn = function(n, cb) {
    var all_worker = true ;
    var all_stealer = true;
    var players= this.get_players();
    for (var s in players) {
        var action = players[s].get_action();
        if (other_side(s) in action.side) /* TODO */ {
            if (action.state === StateEnum.WORK) {
                this.add_heap(this.game.gain, "work from player " + players[s].get_name() );
            } else {
                all_worker = false;
            }
            if (action.state !== StateEnum.STEAL) {
                all_stealer = false;
            }
        }
    }
    if (all_worker) {
        var bonus = Math.floor(this.game.bonus_const +
                this.game.bonus_coeff * this.get_heap() );
        this.add_heap(bonus);
    }
    if (all_stealer) {
        var heap=this.get_heap();
        var destruct = Math.min( Math.floor( this.game.malus_const, +
                this.game.malus_coeff * heap), heap );
        this.sub_heap(destruct, "malus");
    }
};


Heap.prototype.attach_player_ids = function(players, cb){
    this.db.hmset(this.prefix+":players", players, cb);
};
Heap.prototype.get_player_ids = function(cb){
        this.db.hgetall(this.prefix+":players", function(err, player_ids) {
            cb(err, player_ids);
        });
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

var StateEnum = {
    SLEEP : 0,
    WORK:1,
    STEAL:2,
    MOVE:3,
};
StateEnum.INIT = StateEnum.WORK;

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

    this.db.hmset(this.prefix+":heaps", heaps_ids, function(err, res) {
        for (var side in heaps_ids) {
            var t = {};
            t[other_side(side)] = that.id ;
            function reverseAttach(err, heaps) {
                heaps[side].attach_player_ids(t, returnCallback);
            }
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
    this.db.incrby(this.prefix+":heap", val, function (err, res) { cb(err, res, reason) ;} );
};
Player.prototype.sub_heap = function(val, reason, cb){
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
Player.prototype.steal = function(heap_id, cb) {
    /* get heap of this side */
    var h;
    h = new Heap(this.db, this.game);
    h.set_id(heap_id, InformHeapAboutStealer);
    var that=this;
    function InformHeapAboutStealer(err, res) {
        h.steal(function( err, value){
            that.add_heap(value, "stealed", cb)
        });
    }
};
Player.prototype.turn = function(cb) {
    var that = this;
    this.get_action(function(err, action){
        if (action == StateEnum.STEAL) {
            that.get_side( function(err, side) {
                var nb = Object.keys(side).length;
                function returnCallback(err, val) {
                    nb--;
                    if(nb===0) cb(err, side);
                }
                for (var s in side) {
                    that.steal(side[s], returnCallback) ;
                }
            });

        }
    });
};
Player.prototype.get_score = function(cb) {
    var score_self=0;
    var score_heaps=0;
    this.get_heaps();
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
}


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

Game.prototype.Player = Player;
Game.prototype.Heap = Heap;

Game.prototype.player_add = function(name, cb) {
    var p, first_p;
    var h;
    var players_key = this.prefix + ":players";
    var heaps_key = this.prefix + ":heaps";
    var g=this;

    /* create new Player and a his/her new R-heap */
    p = new Player(this.db, this);
    h = new Heap(this.db, this);
    p.set_id(null, function(err, p_id) {
        h.set_id(null, function(err,h_id){
            g.db.lrange(heaps_key, -1, -1, function(err, last_h_id) {
                if (last_h_id.length === 1) {
                    g.db.lrange(players_key, 0, 0, function(err, first_p_id) {

                        /* attach First player L to new heap
                           attach new player R to new heap, and L to last heap */
                        console.log("last_h_id" + JSON.stringify(last_h_id));
                        first_p = new Player(g.db, g);
                        first_p.set_id(first_p_id, function(err, val) {
                            console.log("first_p_id" + last_h_id);
                            first_p.attach_heap_ids({'left' : h.id}, function () {
                                p.attach_heap_ids({'left' : last_h_id, 'right' : h.id}, AddInGameLists);
                            });
                        });
                    });
                } else {
                    console.log("ICI");
                    /* If first payer/first heap attach player to the heap on both side */
                    last_h_id = h.id;
                    p.attach_heap_ids({'left' : last_h_id, 'right' : h.id}, AddInGameLists);
                }

            });
        });
    });
    function AddInGameLists(err, val) {
        console.log("just added P="+p.id+" H="+h.id)
        /* add player and heap into theirs respective lists */
        g.db.rpush(players_key, p.id, function(err, res) {
            g.db.rpush(heaps_key, h.id, function(err, res) {
                cb && cb(err, res);
            });
        });
    }
};


Game.prototype.turn = function(n) {
    var that = this;
    this.db.lget(this.prefix + ":heaps", function(err, res) {
        res.forEach(function (heap, pos) {
            var h = new Heap(that.db, that.game, that.id, heap);
            h.turn(n);
        });
    });
    this.db.lget(this.prefix + ":players", function(err, res) {
        res.forEach(function (player, pos) {
            var p = new Player(that.db, that.game, that.id, player);
            p.turn(n);
        });
    });

    /* display score ??!! */
};

exports.Game=Game;
exports.Player=Player;
exports.Heap=Heap;

