(function(d3, $, _, undefined){

  // underscore mixins
  _.mixin({

    // if value is not present in array, then add it
    shouldContain: function(array, value){
      if(array.indexOf(value) == -1)
        array.push(value);
      return array;
    }
  });

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
  var Node = (function(){

    // Nodes are d3 data objects, wrappers on each object in the
    // object tree visualized
    var Node = function(key, value, parent){
      this.valueType = type(value);
      this.valueTypeClass = typeClass[this.valueType];
      this.value = value;
      this.adopt(value);
      this.parent = parent;
      this.name = nodeName(key, this.value);
      if(_.isFunction(this.value)){
        this.value.src = this.value.toString().replace(/function[ ]?/,'');
      };
    };

    // We want to cache the d3 tree node objects (instances of Node)
    // mostly to save state (opened/unopened, future features). So,
    // hey, why not cache them on the objects they wrap? Also, since
    // we lazy-load the tree, we can allow circular references to occur
    // without busting stacks or getting stuck in loops. This means
    // that each value might occur multiple times in the
    // tree, and thus have multiple Node instance wrappers stored in
    // _d3Parents.
    Node.prototype.adopt = function(value){
      if(!_.isObject(value)) return;
      if(!ownProp(value, '_d3Parents')) value._d3Parents = [];
      value._d3Parents.push(this);
    };

    // Do this when the values in the tree change.
    Node.prototype.refresh = function(){
      this.hidden = this.isHidden();
      this.keys = this.genKeys();

      // Don't recurse into unopened nodes.
      // See showChildren for the positive sense of lazy loading.
      (this.children || this._children) && this.formBabbies();
    }

    // Inspect the _d3Parents cache on the value at key, return
    // the Node instance that is this node's child, or create a new one.
    // See note at `adopt` above for context.
    Node.prototype.getChild = function(key){
      var child;
      if(_.isObject(this.value) && ownProp(this.value[key], '_d3Parents'))
        child = _.findWhere(this.value[key]._d3Parents, {'parent': this});
      return child || new Node(key, this.value[key], this);
    }

    // Create/update Node instances for each property on this.value.
    Node.prototype.formBabbies = function(){
      var children = this.children ? 'children' : '_children';
      this[children] = _.filter(_.map(this.keys, _.bind(function(k, i){
        var child = this.getChild(k, this.value[k]);
        child.refresh();
        return child;
      }, this)), function(c){ return !c.hidden; });
    }

    // Print this to the right of the tree node.
    Node.prototype.valueStr = function(){
      var that = this;
      return (({
        string: function(v){ return '"' + v + '"'},
        object: function(v){ return '{ ' + that.keys.length + ' }'},
        array: function(v){ return '[ ' + v.length + ' ]'},
        undefined: function(v){ return "undefined"; }
      })[this.valueType] || function(v){ return v })(this.value);
    };

    Node.prototype.isHidden = function(){
      return _.isFunction(this.value);
    };

    // Decide which keys we care to include as children.
    Node.prototype.genKeys = function(){
      if(!_.isObject(this.value)) return [];

      // TODO: do this without modifying `value` directly.
      // Add child $scopes as properties.
      if(this.value && this.value.$$childHead){
        var key, child = this.value.$$childHead;
        do{
          if(child.__proto__.$id){ // only want non isolated scopes
            key = "scope-" + child.$id;
            this.value[key] = child;
          }
          child = child.$$nextSibling;
        } while(child);
      };

      return _.isObject(this.value) ?
        filterKeys(_.keys(this.value), this.value, this.timestamp) : [];
    };

    Node.prototype.showChildren = function(show){
      if(!this.children && !this._children) this.formBabbies();
      show = show === undefined ? !this.children : show;
      if (show) {
        this.children = this._children;
        this._children = null;
      } else if(this.children){
        this._children = this.children;
        this.children = null;
      }
      update(this, true);
    };

    Node.prototype.open = function(){
      this.showChildren(true);
    };

    Node.prototype.close = function(){
      this.showChildren(false);
    };

    Node.prototype.toggleChildren = function(){
      this.showChildren();
    };

    // Walk up the tree looking for a $scope, then apply `value`
    // to the walked path.
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
      return expr;
    };

    // Show an inline primitive editor
    Node.prototype.editValue = function(){
      if(this.valueTypeClass != PRIMITIVE) return;
      var loc = $(d3.event.target).position();
      var offset = $("body").offset(); // loc does not return coords relative to the window :( chrome bug?
      var input = $('<input/>', {
        type: 'text',
        class: 'periscope-value-editor',
        value: this.valueType == 'undefined' ? '' : this.valueStr(),
        css: {
          'top': loc.top - offset.top,
          'left': loc.left - offset.left
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

    var nodeName = function(key, value){
      if(!_.isFunction(value)) return key;
      return key + value.toString().replace(/function[ ]*/,'').replace(/{(.|\n)*/gm,'');
    };

    var hidden = ['this', '_d3Parents'];
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

    var ownProp = function(obj, key){
      if(obj && obj.hasOwnProperty(key)){
        return obj[key];
      }
    }

    return Node;
  })();


  // Thanks to:
  // http://bl.ocks.org/robschmuecker/7880033
  // http://bl.ocks.org/mbostock/4339083

  // d3 globals
  var scope,
      i = 0,
      root,
      svg,
      svgContainer,
      tree,
      totalNodes = 0,
      maxLabelLength = 0,

      // variables for drag/drop
      selectedNode = null,
      draggingNode = null,
      translateCoords,
      translateX,
      translateY,
      scale,

      // panning variables
      panTimer,
      panSpeed = 200,
      panBoundary = 20, // Within 20px from edges will pan when dragging.

      width,
      height;

  // d3 helpers
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

  var pan = function(domNode, direction) {
    var speed = panSpeed;
    if (panTimer) {
      clearTimeout(panTimer);
      translateCoords = d3.transform(svg.attr("transform"));
      if (direction == 'left' || direction == 'right') {
        translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
        translateY = translateCoords.translate[1];
      } else if (direction == 'up' || direction == 'down') {
        translateX = translateCoords.translate[0];
        translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
      }
      scale = zoomListener.scale();
      svg.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
      d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
      zoomListener.scale(zoomListener.scale());
      zoomListener.translate([translateX, translateY]);
      panTimer = setTimeout(function() {
        pan(domNode, speed, direction);
      }, 50);
    }
  }

  var zoom = function() {
    svg.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
  }

  var zoomListener = d3.behavior.zoom()
                     .scaleExtent([0.1, 3])
                     .on("zoom", zoom);

  var centerNode = function(source) {
    scale = zoomListener.scale();
    var x = -source.y0;
    var y = -source.x0;
    x = x * scale + width / 2;
    y = y * scale + height / 2;
    d3.select('g').transition()
    .attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
    zoomListener.scale(scale);
    zoomListener.translate([x, y]);
  }

  var diagonal = d3.svg.diagonal()
                 .projection(function(d) { return [d.y, d.x]; });


  var nodeClass = function(d){
    return ['node', d.valueType, d.valueTypeClass].join(" ");
  };

  d3.behavior.drag()
  .on('drag', function(d) {
    var relCoords = d3.mouse($('svg').get(0));
    if (relCoords[0] < panBoundary) {
      panTimer = true;
      pan(this, 'left');
    } else if (relCoords[0] > ($('svg').width() - panBoundary)) {

      panTimer = true;
      pan(this, 'right');
    } else if (relCoords[1] < panBoundary) {
      panTimer = true;
      pan(this, 'up');
    } else if (relCoords[1] > ($('svg').height() - panBoundary)) {
      panTimer = true;
      pan(this, 'down');
    } else {
      try {
        clearTimeout(panTimer);
      } catch (e) {

      }
    }
  });

  var update = function(source, animate) {
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
                      if(d.valueTypeClass == COLLECTION)
                        d.toggleChildren(), centerNode(d);
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
    .text(function (d){ return d.valueStr() });

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


  var centerOnce = _.once(function(root){
    centerNode(root);
    root.showChildren(true);
  });
  var updateTree = _.throttle(function(){
    root.refresh("root", new Date().getTime());

    root.x0 = height / 2;
    root.y0 = 0;

    update(root);
    centerOnce(root);
  }, 500);

  var zoom = function() {
    svg.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
  };

  var keyHandlers = {};
  var keyUp = function(key, func){
    keyHandlers[key] = func;
  };

  var onKeyUp = function(evt){
    // Thanks john! github.com/jeresig/jquery.hotkeys
    // Don't fire in text-accepting inputs that we ddin't directly bind to
    var textAcceptingInputTypes = ["text", "password", "number", "email", "url", "range", "date", "month", "week", "time", "datetime", "datetime-local", "search", "color", "tel"];
    if ( this !== evt.target && (/textarea|select/i.test( evt.target.nodeName ) ||
        jQuery.inArray(evt.target.type, textAcceptingInputTypes) > -1 ) ) {
      return;
    }
    keyHandlers[evt.keyCode] && keyHandlers[evt.keyCode](evt);
  }

  var redrawAfter = function(fn){
    return function(){
      fn();

      // boosh
      $("body").css({'display':'none'});
      setTimeout(function(){$("body").css({'display':'block'})}, 0);
    }
  };

  var hideOverlay = redrawAfter(function(){
    svgContainer.attr('display', 'none');
    $(document).unbind('keyup', onKeyUp);
  });

  var showOverlay = redrawAfter(function(){
    svgContainer.attr('display', 'inline');
    $(document).keyup(onKeyUp);
  });

  var addPeriscope = function(){

    var ps = $("<div id='periscope-toggle'>periscope</div>");
    $("body").append(ps);
    ps.click(function(){
      if(svgContainer.attr('display') != 'none'){
        hideOverlay();
      } else {
        showOverlay();
      }
    });
  };

  // esc key
  keyUp(27, hideOverlay);

  var makeTree = function(){
    width = $(document).width();
    height = $(document).height();

    tree = d3.layout.tree()
             .size([height, width])
             .sort(sortByValueTypeClassThenAlpha);

    svgContainer = d3.select("body").append("svg")
          .attr('id', 'periscope')
          .attr('display', 'none')
          .attr("width", width)
          .attr("height", height)
          .call(zoomListener);

    svg = svgContainer
          .append("g")
          .attr("width", width)
          .attr("height", height);

  };

  $(function(){
    addPeriscope();
    makeTree();
    scope = angular.element($("[ng-app]")[0]).scope();
    root = new Node("root", scope);
    root.formBabbies();
    root.refresh();
    scope.$watch(updateTree);
    updateTree();
  });
}).call(window, d3, $, _);
