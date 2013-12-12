(function(d3, $, _, undefined){

  // shared by d3 and Node code
  var PRIMITIVE = 'primitive',
      METHOD = 'method',
      COLLECTION = 'collection';

  var typeClass = {
    string: PRIMITIVE,
    number: PRIMITIVE,
    boolean: PRIMITIVE,
    null: PRIMITIVE,
    undefined: PRIMITIVE,
    function: METHOD,
    object: COLLECTION,
    array: COLLECTION
  };


  // closure organizing the Node class and helpers
  var getTreeNode = (function(){

    var Node = function(value){
      this.valueType = type(value);
      this.valueTypeClass = typeClass[this.valueType];
      this.value = value;
    };

    Node.getTreeNode = function(value, timestamp){
      var make = function(){ return new Node(value); }
      if(!_.isObject(value))
        return make()
      return value && ownProp(value, '$$$d3data') || make();
    }

    Node.prototype.refresh = function(key, timestamp, parent){
      if(_.isObject(this.value) && !ownProp(this.value, '$$$d3data'))
        this.value.$$$d3data = this;

      if(this.visited == timestamp) return;
      this.visited = timestamp;

      this.name = nodeName(key, this.value);
      this.parent = parent;
      var keys  = nodeKeys(this.value, this.visited);
      this.valueStr = nodeValue(this.valueType, this.value, keys);
      this.hidden = nodeHidden(this);

      if(!_.isObject(this.value)){
        delete this.children;
        delete this._children;
      }

      if(_.isFunction(this.value)){
        this.value.src = this.value.toString().replace(/function[ ]?/,'');
      };

      var children = this.children ? 'children' : '_children';
      this[children] = _.filter(_.map(keys, _.bind(function(k, i){
        var n = Node.getTreeNode(this.value[k], this.visited);
        n.refresh(k, this.visited, this);
        return n;
      }, this)), function(c){ return !c.hidden; });
    }

    Node.prototype.showChildren = function(show){
      show = show === undefined ? !this.children : show;
      if (show) {
        this.children = this._children;
        this._children = null;
      } else if(this.children){
        this._children = this.children;
        this.children = null;
      }
      //    _.invoke(show ? this._children : this.children, 'showChildren', show);
      update(this, true);
    };

    Node.prototype.hide = function(){
      //    this.
    }

    Node.prototype.open = function(){
      this.showChildren(true);
    };

    Node.prototype.close = function(){
      this.showChildren(false);
    };

    Node.prototype.toggleChildren = function(){
      this.showChildren();
    };


    Node.prototype.assignOnNearestScope = function(keys, value){
      if(!this.parent) return;

      keys = typeof keys == 'string' ? [keys] : keys;

      if(this.parent.value instanceof scope.constructor)
        return this.parent.value.$apply(assignExpr(keys, value));

      keys.unshift(this.parent.name);
      return this.parent.assignOnNearestScope(keys, value);
    };

    // helper for assignOnNearestScope
    var assignExpr = function(keys, value){
      var expr = 'this["' + keys.join('"]["') + '"] = ' + (value || undefined);
      console.log(expr);
      return expr;
    };

    Node.prototype.editValue = function(){
      if(this.valueTypeClass != PRIMITIVE) return;
      var loc = $(d3.event.target).position()
      var input = $('<input/>', {
        type: 'text',
        class: 'periscope-value-editor',
        value: this.valueType == 'undefined' ? '' : this.valueStr,
        css: {
          'top': loc.top,
          'left': loc.left
        }
      });

      var that = this;
      input.keyup(function(e){
        if(e.keyCode != 13) return;
        that.assignOnNearestScope(that.name, input.val());
        input.off();
        input.remove();
      });

      $("body").append(input);
    };

    // helpers
    var nodeValue = function(type, value, keys){
      return (({
        string: function(v){ return '"' + v + '"'},
        object: function(v){ return '{ ' + keys.length + ' }'},
        array: function(v){ return '[ ' + v.length + ' ]'},
        undefined: function(v){ return "undefined"; }
      })[type] || function(v){ return v })(value);
    };

    var nodeName = function(key, value){
      if(!_.isFunction(value)) return key;
      return key + value.toString().replace(/function[ ]*/,'').replace(/{(.|\n)*/gm,'');
    };

    var hidden = ['this'];
    var filterKeys = function(keys, obj, timestamp){
      return _.filter(keys, function(k){
        var v = obj[k];
        if(!obj.hasOwnProperty(k)) return;
        if(_.contains(hidden, k)) return;
        if(k.indexOf('$') == 0) return;
        return k;
      });
    };

    var isPrimitive = function(v){
      return _.isBoolean(v) ||
        _.isString(v) ||
        _.isNumber(v) ||
        _.isDate(v) ||
        _.isUndefined(v) ||
        _.isNull(v);
    };

    // return values are strings:
    // 'number', 'boolean', 'string', 'object', 'array', 'null', 'undefined'
    var type = function(value){
      return _.isArray(value) || _.isArguments(value) ? "array" :
        _.isNull(value) ? "null" :
        typeof value;
    };

    var nodeKeys = function(value, timestamp){
      if(!_.isObject(value)) return [];

      // TODO: do this without modifying `value` directly.
      // Add child $scopes as properties.
      if(value && value.$$childHead){
        var key, child = value.$$childHead;
        do{
          if(child.__proto__.$id){ // only want non isolated scopes
            key = "scope-" + child.$id;
            value[key] = child;
          }
          child = child.$$nextSibling;
        } while(child);
      };

      return _.isObject(value) ? filterKeys(_.keys(value), value, timestamp) : [];
    };

    var nodeHidden = function(node){
      return _.isFunction(node.value);
    };

    var ownProp = function(obj, key){
      if(obj && obj.hasOwnProperty(key)){
        return obj[key];
      }
    }

    return Node.getTreeNode;
  })();


  var scope;

  var i = 0,
      root,
      svg;

  var margin = {top: 20, right: 120, bottom: 20, left: 120},
      width = 100000 - margin.right - margin.left,
      height = 800 - margin.top - margin.bottom;

  var PRIMITIVE = 'primitive',
      METHOD = 'method',
      COLLECTION = 'collection';

  var typeClass = {
    string: PRIMITIVE,
    number: PRIMITIVE,
    boolean: PRIMITIVE,
    null: PRIMITIVE,
    undefined: PRIMITIVE,
    function: METHOD,
    object: COLLECTION,
    array: COLLECTION
  };

  var typeClassPriority = {};
  typeClassPriority[PRIMITIVE] = 0;
  typeClassPriority[COLLECTION] = 1;
  typeClassPriority[METHOD] = 2;

  var sortByValueTypeClassThenAlpha = function(a,b){
    var d = typeClassPriority[a.valueTypeClass] -
      typeClassPriority[b.valueTypeClass];
    if(d == 0)
      d = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    return d;
  }

  var tree = d3.layout.tree()
             .size([height, width])
             .sort(sortByValueTypeClassThenAlpha);

  var diagonal = d3.svg.diagonal()
                 .projection(function(d) { return [d.y, d.x]; });


  var nodeClass = function(d){
    return ['node', d.valueType, d.valueTypeClass].join(" ");
  };

  window.update = function(source, animate) {
    var duration = animate ? 750 : 0;

    // Compute the new tree layout.
    var nodes = tree.nodes(root).reverse(),
        links = tree.links(nodes);

    // Normalize for fixed-depth.
    nodes.forEach(function(d) { d.y = d.depth * 180; });

    // Update the nodes…
    var node = svg.selectAll("g.node")
               .data(nodes, function(d){ return d.id || (d.id = ++i)});

    // Enter any new nodes at the parent's previous position.
    var nodeEnter = node.enter().append("g")
                    .attr("class", nodeClass)
                    .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
                    .on("click", function(d){
                      if(d.valueTypeClass == COLLECTION) d.toggleChildren();
                      if(d.valueTypeClass == PRIMITIVE) d.editValue();
                    });


    nodeEnter.append("circle")
    .attr("r", 1e-6)
    .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

    nodeEnter.append("text")
    .attr("x", -10)
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .attr("class", "key")
    .style("fill-opacity", 1e-6);

    nodeEnter.append("text")
    .attr("x", function(d){ return 10; })
    .attr("dy", ".35em")
    .attr("text-anchor", 'start')
    .attr("class", "value")
    .style("fill-opacity", 1e-6)

    // Transition nodes to their new position.
    var nodeUpdate = node.transition()
                     .duration(duration)
                     .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

    nodeUpdate.select("circle")
    .attr("r", 4.5)
    .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

    nodeUpdate.selectAll("text")
    .style('fill-opacity', 1);

    nodeUpdate.select("text.key")
    .text(function(d) { return d.name; });

    nodeUpdate.select("text.value")
    .text(function (d){ return d.valueStr });

    // Transition exiting nodes to the parent's new position.
    var nodeExit = node.exit().transition()
                   .duration(duration)
                   .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
                   .remove();

    nodeExit.select("circle")
    .attr("r", 1e-6);

    nodeExit.select("text")
    .style("fill-opacity", 1e-6);

    // Update the links…
    var link = svg.selectAll("path.link")
               .data(links, function(d) { return d.target.id; });

    // Enter any new links at the parent's previous position.
    link.enter().insert("path", "g")
    .attr("class", "link")
    .attr("d", function(d) {
      var o = {x: source.x0, y: source.y0};
      return diagonal({source: o, target: o});
    });

    // Transition links to their new position.
    link.transition()
    .duration(duration)
    .attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit().transition()
    .duration(duration)
    .attr("d", function(d) {
      var o = {x: source.x, y: source.y};
      return diagonal({source: o, target: o});
    })
    .remove();

    // Stash the old positions for transition.
    nodes.forEach(function(d) {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }


  // get/create the d3 data object from a scopetree object

  var updateTree = _.throttle(function(){
    root = getTreeNode(scope);
    root.refresh("root", new Date().getTime());

    root.x0 = height / 2;
    root.y0 = 0;

    update(root);
  }, 500);


  window.periscope = function(_scope){
    scope = _scope;
  };

  var zoom = function() {
    svg.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
  };

  var makeTree = function(){
    svg = d3.select("body").append("svg")
          .attr('id', 'microscope')
          .attr("width", width + margin.right + margin.left)
          .attr("height", height + margin.top + margin.bottom)
          .append("g")
          .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    d3.select(self.frameElement).style("height", "800px");
  };

  var setupKeyboard = function(){
    var handleKeystroke = function(e){

    }
    $('body').keyup(handleKeystroke);
  };

  $(function(){
    setupKeyboard();
    makeTree();
    scope.$watch(updateTree);
  });
}).call(window, d3, $, _);
