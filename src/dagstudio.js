// (c) Tim Zaman 2016
// Licence: MIT
// Sources:
//   https://bl.ocks.org/cjrd/6863459 -- original [MIT]
//   trash.png icon by Madebyoliver [Free]

document.onload = (function(d3, saveAs, Blob, undefined){
    "use strict";

    // define DagStudio object
    var DagStudio = function(svg, nodes, edges){
        var thisGraph = this;
        
        thisGraph.nodes = nodes || [];
        thisGraph.edges = edges || [];

        // Define constants from constants
        thisGraph.consts.nodeWidth =  thisGraph.consts.containerWidth - (thisGraph.consts.nodeXpad * 2) - thisGraph.consts.scrollbarWidth;
        thisGraph.consts.offsetConnIn = [thisGraph.consts.nodeWidth / 2, thisGraph.consts.nodeYpad / 2];
        thisGraph.consts.offsetConnOut = [thisGraph.consts.nodeWidth / 2, thisGraph.consts.nodeHeight + thisGraph.consts.nodeYpad / 2],
        thisGraph.consts.nodeAspectRatio = thisGraph.consts.nodeWidth / thisGraph.consts.nodeHeight;

        thisGraph.state = {
            selectedNode: null,
            selectedEdge: null,
            mouseDownNode: null,
            mouseDownLink: null,
            justDragged: false,
            justScaleTransGraph: false,
            lastKeyDown: -1,
            shiftNodeDrag: false,
            selectedText: null,

            metadataboxExpand: false,
            metaboxWidth: 150, //[collapsed, default expanded]
            trashzoneActive: false,
            mouseStartDragPos: null,
            draggingNewNode: false,
            draggingNodeId : 0,
            draggingNodeEl: null,
            dragnode : null, // contains the group for dragging
            zoomer: null, // zoom handle
            layerlistdata: null // array of all possible layers and their info
        };

        thisGraph.svg = svg;
        thisGraph.svgG = svg.append("g")
            .classed(thisGraph.consts.graphClass, true);
        var svgG = thisGraph.svgG;

        // define arrow markers for graph links
        var defs = svg.append('svg:defs');
        defs.append('svg:marker')
            .attr('id', 'end-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 12)
            .attr('markerWidth', 3.5)
            .attr('markerHeight', 3.5)
            .attr('orient', 'auto')
            .append('svg:path')
            .attr('d', 'M0,-5 L10,0 L0,5');

        // define arrow markers for leading arrow
        defs.append('svg:marker')
            .attr('id', 'mark-end-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 7)
            .attr('markerWidth', 3.5)
            .attr('markerHeight', 3.5)
            .attr('orient', 'auto')
            .append('svg:path')
            .attr('d', 'M0,-5 L10,0 L0,5');

        defs.append('rect')
            .attr('id','node-rect')
            .classed('node-rect', true)
            .attr('width', thisGraph.consts.nodeWidth)
            .attr('height', thisGraph.consts.nodeHeight)
            .attr('x', thisGraph.consts.nodeXpad)
            .attr('y', thisGraph.consts.nodeYpad*0.5)
            .attr('rx', 6)
            .attr('ry', 6);
              
        var connGroup = defs.append('g')
            .attr('id','node-conn');
        
        connGroup.append('circle')
            .classed('node-conn-extended', true)
            .attr('r', thisGraph.consts.nodeConnRadiusExtended);

        connGroup.append('circle')
            .classed('node-conn', true)
            .attr('r', thisGraph.consts.nodeConnRadius);

        var dragsvg = d3.select("div#container")
            .append("svg")
            .classed("list-node-svg", true)
            .attr("width",1).attr("height",1)

        thisGraph.state.dragnode = dragsvg.append("g")
            .attr("id","dragnode");

        thisGraph.state.dragnode.append("use")
            .attr("xlink:href","#node-rect")
            .classed('node-rect-normal', true);

        thisGraph.state.dragnode.append("text")
            .classed("node-text", true)
            .attr("x", thisGraph.consts.nodeXpad + 10)
            .attr("y", thisGraph.consts.nodeHeight/2 + this.consts.nodeYpad*0.5)
            .text("?");
        


        d3.select("#container")
            .on("mousemove", function(d){
                //console.log("#container's mousemove");
                if (thisGraph.state.draggingNewNode) {
                    thisGraph.drawDragnode();
                }
            })
            .on("mouseup", function(d){
                console.log("#container's mouseup");
                if (thisGraph.state.draggingNewNode) {
                    thisGraph.state.draggingNewNode = false;
                    d3.select('#dragnode').style('visibility', 'hidden');
                    //console.log("mouseOverChart:"+thisGraph.state.mouseOverChart);
                    //if (thisGraph.state.mouseOverChart){
                    if (thisGraph.mouseIsOverElementId('#chart')) {
                        // we have dragged and dropped a new node on the chart
                        // so add the node to the chart.
                        console.log("Adding new node.");

                        var layerId = thisGraph.state.draggingNodeId,
                            nodeInfo = thisGraph.state.layerlistdata[layerId],
                            placeholderName = genUniqueSequenceIdFromObjs(thisGraph.nodes, 'L'),
                            xsub = d3.select("#dragnode").node().getBBox().width / 2,
                            ysub = d3.select("#dragnode").node().getBBox().height / 2;

                        var xycoords = d3.mouse(thisGraph.svgG.node()),
                            d = {
                                type: nodeInfo.type,
                                id: placeholderName,
                                param: '',
                                type_param: '',
                                x: xycoords[0] - xsub,
                                y: xycoords[1] - ysub};
                        thisGraph.nodes.push(d);
                        thisGraph.updateGraph();

                    }
                }

                if (thisGraph.state.trashzoneActive) {
                    console.log('dumping');
                    var selectedNode = thisGraph.state.selectedNode;
                    thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
                    thisGraph.removeLinksOfNode(selectedNode);
                    thisGraph.state.selectedNode = null;
                    thisGraph.updateGraph();
                    thisGraph.state.mouseDownNode = false;
                    thisGraph.drawTrashZone(false);
                }
            
                thisGraph.state.draggingNodeEl = null;
            });










        thisGraph.drawTrashZone(false);

        // displayed when dragging between nodes
        thisGraph.dragLine = svgG.append('svg:path')
              .attr('class', 'link dragline hidden')
              .attr('d', 'M0,0L0,0')
              .style('marker-end', 'url(#mark-end-arrow)');

        // svg nodes and edges 
        thisGraph.paths = svgG.append("g").selectAll("g");
        thisGraph.drawnnodes = svgG.append("g").selectAll("g");

        thisGraph.drag = d3.behavior.drag()
              //.origin(function(d){
              //  return {x:0, y:0}; // FIX ME
              //  //return {x: d.x, y: d.y};
              //})
              .on("drag", function(args){
                  //console.log(args);
                  thisGraph.state.justDragged = true;
                  thisGraph.dragmove.call(thisGraph, args);
              });
              //.on("dragend", function() {
              //  // todo check if edge-mode is selected
              //});

        // listen for key events
        d3.select(window).on("keydown", function(){
            thisGraph.svgKeyDown.call(thisGraph);
        })
        .on("keyup", function(){
            thisGraph.svgKeyUp.call(thisGraph);
        });

        svg.on("mousedown", function(d){thisGraph.svgMouseDown.call(thisGraph, d);})
            .on("mouseup", function(d){thisGraph.svgMouseUp.call(thisGraph, d);});


        // listen for global dragging (and zooming?)
        thisGraph.state.zoomer = d3.behavior.zoom()
              .on("zoom", function(){
                  if (d3.event.sourceEvent.shiftKey){
                      // TODO  the internal d3 state is still changing
                      return false;
                  } else{
                      thisGraph.zoomed.call(thisGraph);
                  }
                  return true;
              })
              .on("zoomstart", function(){
                  console.log("zoomstart");
                  var ael = d3.select("#" + thisGraph.consts.activeEditId).node();
                  if (ael){
                     ael.blur();
                  }
                if (!d3.event.sourceEvent.shiftKey) d3.select('body').style("cursor", "move");
              })
              .on("zoomend", function(){
                  console.log("zoomend");
                  d3.select('body').style("cursor", "auto");
              });
        
        svg.call(thisGraph.state.zoomer).on("dblclick.zoom", null);

        // listen for resize
        window.onresize = function(){thisGraph.updateWindow(svg);};

        // handle download data
        d3.select("#download-input").on("click", function(){
            var saveEdges = [];
            thisGraph.edges.forEach(function(val, i){
               saveEdges.push({source: val.source.id, target: val.target.id, id:val.id});
            });
            var blob = new Blob([window.JSON.stringify({"nodes": thisGraph.nodes, "edges": saveEdges})], {type: "text/plain;charset=utf-8"});
            saveAs(blob, "mydag.json");
        });


        // handle uploaded data
        d3.select("#upload-input").on("click", function(){
            document.getElementById("hidden-file-upload").click();
        });
        d3.select("#hidden-file-upload").on("change", function(){
            if (window.File && window.FileReader && window.FileList && window.Blob) {
                var uploadFile = this.files[0];
                var filereader = new window.FileReader();
                
                filereader.onload = function(){
                    var txtRes = filereader.result;
                    // @TODO(?) better error handling
                    try {
                        var jsonObj = JSON.parse(txtRes);
                        thisGraph.deleteGraph(true);
                        thisGraph.nodes = jsonObj.nodes;
                        var newEdges = jsonObj.edges;
                        newEdges.forEach(function(e, i){
                            newEdges[i] = {source: thisGraph.nodes.filter(function(n){ return n.id == e.source; })[0],
                                           target: thisGraph.nodes.filter(function(n){ return n.id == e.target; })[0],
                                           id: e.id
                                      };
                        });
                        thisGraph.edges = newEdges;
                        thisGraph.updateGraph();
                    } catch(err) {
                        window.alert("Error parsing uploaded file\nerror message: " + err.message);
                        return;
                    }
                };
                filereader.readAsText(uploadFile);
            } else {
                alert("Your browser won't let you save this graph -- try upgrading your browser to IE 10+ or Chrome or Firefox.");
            }
        });

        // handle download data
        d3.select("#toggle-metadata").on("click", function(){
            // Invert state and update
            thisGraph.state.metadataboxExpand = !thisGraph.state.metadataboxExpand;
            thisGraph.toggleMetadataBox(thisGraph.state.metadataboxExpand);
        });

        // handle delete graph
        d3.select("#delete-graph").on("click", function(){
            thisGraph.deleteGraph(false);
        });

        // handle clean graph
        d3.select("#cleanup-input").on("click", function(){
            // Reformat edges to refer to id only
            var edgeRefs = [];
            thisGraph.edges.forEach(function(val, i){
               edgeRefs.push({source: val.source.id, target: val.target.id, id:val.id});
            });

            var graph = {
              "id": "root",
              "properties": {
                  direction: "DOWN", spacing: 50
              },
              "children": thisGraph.nodes,
              "edges": edgeRefs 
            };

            $klay.layout({
                graph: graph,
                /*options: { spacing : 300},*/
                success: function(layouted) {
                    // Finally expand the widths with aspect ratio (widen)
                    //  [workaround since klay's AR doesnt work, and I dont want to bloat my objs with height and width attrs]
                    thisGraph.nodes.forEach(function(val, i){
                       val.x = val.x * thisGraph.consts.nodeAspectRatio/1.5;
                    });
                    thisGraph.updateGraph();
                    console.log(layouted);
                },
                error: function(error) { console.log(error); }
            });


            
        });

        thisGraph.toggleMetadataBox(thisGraph.state.metadataboxExpand);
    };

    function genUniqueSequenceIdFromObjs(arr, prefix) {
        // Generates a unique sequence id from an object list with id keys
        console.log('genUniqueSequenceIdFromObjs');
        console.log(arr);
        var i;
        var idlist = [];
        for (i in arr) {
            idlist.push(arr[i].id);
        }
        var idCandidate = prefix + 0; // Template
        for (i in arr) {
            idCandidate = prefix + (1+parseInt(i)); // Template
            if (!idlist.includes(idCandidate)){
                break;
            }
        }
        return idCandidate;
    }

    DagStudio.prototype.toggleMetadataBox = function(expand) {
        var vis = expand ? 'visible' : 'hidden'
        var mboxWidth = expand ? this.state.metaboxWidth : 0;
        var src = expand ? 'icons/collapse-icon.png' : 'icons/expand-icon.png';
        d3.select("#floater").attr('style', 'width: ' + mboxWidth + 'px');
        d3.select("#toggle-metadata").property('src', src);
        d3.select("#metadata").attr('style', 'visibility: ' + vis);

    }

    DagStudio.prototype.consts =  {
        selectedClass: "selected",
        connectClass: "connect-node",
        circleGClass: "conceptG",
        graphClass: "graph",
        nodeClass: "node",
        activeEditId: "active-editing",
        BACKSPACE_KEY: 8,
        DELETE_KEY: 46,
        ENTER_KEY: 13,
        nodeRadius: 50,
        containerWidth : 200,
        nodeHeight : 30,
        nodeYpad : 10,
        nodeXpad : 10,
        nodeConnRadius : 4,
        nodeConnRadiusExtended: 8, // transparent to extend selectable area
        scrollbarWidth : 15,
        nodeWidth : null,     // computed from other constants in ctor
        offsetConnIn : null,  // computed from other constants in ctor
        offsetConnOut : null, // computed from other constants in ctor
        nodeAspectRatio: null
    };

    // PROTOTYPES

    DagStudio.prototype.dragmove = function(d) {
        console.log("prototype.dragmove()");

        var thisGraph = this;
        if (thisGraph.state.shiftNodeDrag) {
            thisGraph.dragLine.attr('d', 'M' + (d.x + thisGraph.consts.offsetConnOut[0]) + ',' + (d.y + thisGraph.consts.offsetConnOut[1])
                + 'L' + d3.mouse(thisGraph.svgG.node())[0] + ',' + d3.mouse(this.svgG.node())[1]);
        } else{
            d.x += d3.event.dx;
            d.y += d3.event.dy;
            thisGraph.updateGraph();
        }
    };

    DagStudio.prototype.deleteGraph = function(skipPrompt) {
      var thisGraph = this,
          doDelete = true;
      if (!skipPrompt) {
          doDelete = window.confirm("Press OK to delete this graph");
      }
      if (doDelete) {
          thisGraph.nodes = [];
          thisGraph.edges = [];
          thisGraph.updateGraph();
      }
    };

    // remove edges associated with a node
    DagStudio.prototype.removeLinksOfNode = function(node) {
        var thisGraph = this,
        toSplice = thisGraph.edges.filter(function(l) {
            return (l.source === node || l.target === node);
        });

        toSplice.map(function(l) {
            thisGraph.edges.splice(thisGraph.edges.indexOf(l), 1);
        });
    };

    DagStudio.prototype.setupMetadata = function() {
        // Fill static parts of the metadata box
        var metadatabox = d3.select("div#metadata")
            .classed("metadatabox", true);

        // Type
        metadatabox.append("p").append("label").text("Type");
        metadatabox.append("p").append("label").attr("id","type").text("?");

        metadatabox.append("p").append("label").text("Name");
        metadatabox.append("p").append("input").attr("id","name").attr("placeholder","name");

        metadatabox.append("p").append("label").text("param");
        metadatabox.append("p").append("textarea").attr("id","param").attr("placeholder","name");

        metadatabox.append("p").append("label").text("type_param");
        metadatabox.append("p").append("textarea").attr("id","type_param").attr("placeholder","name");

    }

    function makeNodeTitle(d) {
        return d.type + "(" + d.id + ")";
    }

    DagStudio.prototype.fillMetadata = function(d3Node, d) {
        console.log('fillMetadata()');

        console.log(d);
        var metadatabox = d3.select("div#metadata");
        metadatabox.select("#type").text(d.type);

        metadatabox.select("#name")
            .property("value", d.id)
            .on("input", function() {
                d.id = this.value;
                d3Node.select("text").text(makeNodeTitle(d));
            });

        metadatabox.select("#param")
            .property("value", d.param)
            .on("input", function() {
                d.param = this.value;
            });

        metadatabox.select("#type_param")
            .property("value", d.type_param)
            .on("input", function() {
                d.type_param = this.value;
            });

    }

    DagStudio.prototype.replaceSelectEdge = function(d3Path, edgeData) {
        var thisGraph = this;
        d3Path.classed(thisGraph.consts.selectedClass, true);
        if (thisGraph.state.selectedEdge) {
            thisGraph.removeSelectFromEdge();
        }
        thisGraph.state.selectedEdge = edgeData;
    };

    DagStudio.prototype.replaceSelectNode = function(d3Node, nodeData) {
        console.log("replaceSelectNode()");
        var thisGraph = this;
        d3Node.classed(this.consts.selectedClass, true);
        d3Node.classed('node-rect-normal', false);
        d3Node.classed('node-rect-selected', true);
        if (thisGraph.state.selectedNode) {
            thisGraph.removeSelectFromNode();
        }
        thisGraph.state.selectedNode = nodeData;
        thisGraph.fillMetadata(d3Node, nodeData);
    };
    
    DagStudio.prototype.removeSelectFromNode = function() {
        console.log("removeSelectFromNode()");
        var thisGraph = this;
        if (thisGraph.state.selectedNode == null) {
            return;
        }
        thisGraph.drawnnodes.filter(function(d) {
                return d.id === thisGraph.state.selectedNode.id;
            })
            .classed(thisGraph.consts.selectedClass, false)
            .classed('node-rect-normal', true)
            .classed('node-rect-selected', false);

        thisGraph.state.selectedNode = null;
    };

    DagStudio.prototype.removeSelectFromEdge = function() {
        var thisGraph = this;
        if (thisGraph.state.selectedEdge == null) {
            return;
        }
        thisGraph.paths.filter(function(cd) {
                return cd === thisGraph.state.selectedEdge;
            }).classed(thisGraph.consts.selectedClass, false);
        thisGraph.state.selectedEdge = null;
    };



    DagStudio.prototype.pathMouseDown = function(d3path, d){ // when clicked on path
        console.log("prototype.pathMouseDown()");
        var thisGraph = this,
            state = thisGraph.state;
        d3.event.stopPropagation();
        state.mouseDownLink = d;

        if (state.selectedNode) {
            thisGraph.removeSelectFromNode();
        }
        
        var prevEdge = state.selectedEdge;  
        if (!prevEdge || prevEdge !== d){
            thisGraph.replaceSelectEdge(d3path, d);
        } else{
            thisGraph.removeSelectFromEdge();
        }
    };

    // mousedown on node
    DagStudio.prototype.drawnNodeMouseDown = function(d3node, d) { // when down on node
        console.log("prototype.drawnNodeMouseDown()");
        var thisGraph = this,
            state = thisGraph.state;
        d3.event.stopPropagation();
        state.mouseDownNode = d;
        if (d3.event.shiftKey){
            state.shiftNodeDrag = d3.event.shiftKey;
            // reposition dragged directed edge
            thisGraph.dragLine.classed('hidden', false)
                .attr('d', 'M' + d.x + ',' + d.y + 'L' + d.x + ',' + d.y);
            return;
        }
        // Select this node
        thisGraph.replaceSelectNode(d3node, d);
    };

    // mouseup on nodes
    DagStudio.prototype.drawnNodeMouseUp = function(d3node, d) { // when lifted from node
        console.log("prototype.drawnNodeMouseUp()");
        var thisGraph = this,
            state = thisGraph.state,
            consts = thisGraph.consts;
        // reset the states
        state.shiftNodeDrag = false;    
        d3node.classed(consts.connectClass, false);
        
        var mouseDownNode = state.mouseDownNode;

        if (!mouseDownNode) return;

        thisGraph.dragLine.classed("hidden", true);

        if (mouseDownNode !== d){
            // we're in a different node: create new edge for mousedown edge and add to graph
            console.log('current edges:');
            console.log(thisGraph.edges);
            var newEdge = {source: mouseDownNode, target: d, id: genUniqueSequenceIdFromObjs(thisGraph.edges, 'E')};
            console.log('newEdge:');
            console.log(newEdge);
            var filtRes = thisGraph.paths.filter(function(d) {
                if ( (d.source === newEdge.target) && (d.target === newEdge.source) ){
                    // Cyclical reference:
                    //thisGraph.edges.splice(thisGraph.edges.indexOf(d), 1); // Removes existing one
                    // @TODO(tzaman) Check if a bottom refence and top reference refer to the same object
                }
                return ((d.source === newEdge.source) && (d.target === newEdge.target));
            });
            if (!filtRes[0].length) {
                thisGraph.edges.push(newEdge);
                thisGraph.updateGraph();
            }
        } else {
            // we're in the same node
            if (state.justDragged) {
                // dragged, not clicked
                state.justDragged = false;
            } else {
                // clicked, not dragged
                //if (d3.event.shiftKey){
                //    // shift-clicked node: edit text content
                //    var d3txt = thisGraph.changeTextOfNode(d3node, d);
                //    var txtNode = d3txt.node();
                //    thisGraph.selectElementContents(txtNode);
                //    txtNode.focus();
                //} else{
                    if (state.selectedEdge){
                        thisGraph.removeSelectFromEdge();
                    }

                    var prevNode = state.selectedNode;            
                    
                    console.log(d);

                    if (!prevNode || prevNode.id !== d.id){
                        thisGraph.replaceSelectNode(d3node, d);
                    } else {
                        //thisGraph.removeSelectFromNode();
                    }
                //}
            }
        }
        state.mouseDownNode = null;
        return;
    }; // end of drawnnodes mouseup

    // mousedown on main svg
    DagStudio.prototype.svgMouseDown = function(){
        this.state.graphMouseDown = true;
        this.clearSelections();
    };

    // mouseup on main svg
    DagStudio.prototype.svgMouseUp = function(){
        var thisGraph = this,
          state = thisGraph.state;
        if (state.justScaleTransGraph) {
          // dragged not clicked
          state.justScaleTransGraph = false;
        } else if (state.shiftNodeDrag) {
            // dragged from node
            state.shiftNodeDrag = false;
            thisGraph.dragLine.classed("hidden", true);
        }
        state.graphMouseDown = false;
    };

    // keydown on main svg
    DagStudio.prototype.svgKeyDown = function() {
        var thisGraph = this,
            state = thisGraph.state,
            consts = thisGraph.consts;
        // make sure repeated key presses don't register for each keydown
        if (state.lastKeyDown !== -1) return;

        state.lastKeyDown = d3.event.keyCode;
        var selectedNode = state.selectedNode,
            selectedEdge = state.selectedEdge;

        switch(d3.event.keyCode) {
        case consts.BACKSPACE_KEY:
        case consts.DELETE_KEY:
            d3.event.preventDefault(); //@TODO(tzaman) : figure out what this does.
            if (selectedNode) {
                thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
                thisGraph.removeLinksOfNode(selectedNode);
                state.selectedNode = null;
                thisGraph.updateGraph();
            } else if (selectedEdge) {
                thisGraph.edges.splice(thisGraph.edges.indexOf(selectedEdge), 1);
                state.selectedEdge = null;
                thisGraph.updateGraph();
            }
            break;
        }
    };

    DagStudio.prototype.svgKeyUp = function() {
        this.state.lastKeyDown = -1;
    };

    // call to propagate changes to graph
    DagStudio.prototype.updateGraph = function() {
        
        var thisGraph = this,
            consts = thisGraph.consts,
            state = thisGraph.state;
        
        thisGraph.paths = thisGraph.paths.data(thisGraph.edges, function(d) {
            return String(d.source.id) + "+" + String(d.target.id);
        });
        var paths = thisGraph.paths;

        // update existing paths
        paths.style('marker-end', 'url(#end-arrow)')
            .classed(consts.selectedClass, function(d) {
                return d === state.selectedEdge;
            })
            .attr('d', function(d) {
                return 'M' + (d.source.x + consts.offsetConnOut[0]) + ',' + (d.source.y + consts.offsetConnOut[1])
                    + 'L' + (d.target.x + consts.offsetConnIn[0]) + ',' + (d.target.y + consts.offsetConnIn[1]);
            });

        // add new paths
        paths.enter()
            .append("path")
            .style('marker-end','url(#end-arrow)')
            .classed('link', true)
            .attr('d', function(d) {
                return 'M' + (d.source.x + consts.offsetConnOut[0]) + ',' + (d.source.y + consts.offsetConnOut[1])
                    + 'L' + (d.target.x + consts.offsetConnIn[0]) + ',' + (d.target.y + consts.offsetConnIn[1]);
            })
            .on('mousedown', function(d) {
                thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
            })
            .on('mouseup', function(d) {
                state.mouseDownLink = null;
            });

        // remove old links
        paths.exit().remove();
        
        // update existing nodes
        thisGraph.drawnnodes = thisGraph.drawnnodes.data(thisGraph.nodes, function(d){ return d.id;});
        thisGraph.drawnnodes.attr('transform', function(d){return 'translate(' + d.x + ',' + d.y + ')';});

        // add new nodes
        var newGs = thisGraph.drawnnodes.enter()
              .append('g')
              .classed('node-rect-normal', true);

        newGs.classed(consts.circleGClass, true)
            .attr('transform', function(d) {return "translate(" + d.x + "," + d.y + ")";})
            .on('mouseover', function(d) {
                if (state.shiftNodeDrag) {
                    d3.select(this).classed(consts.connectClass, true);
                }
            })
            .on('mouseout', function(d) {
                d3.select(this).classed(consts.connectClass, false);
            })
            .on('mousedown', function(d) {
                thisGraph.drawnNodeMouseDown.call(thisGraph, d3.select(this), d);
            })
            .on('mouseup', function(d) {
                thisGraph.drawnNodeMouseUp.call(thisGraph, d3.select(this), d);
            })
            //.on("dblclick", function(d,i) {
            //    console.log('doubleclick');
            //})
            .call(thisGraph.drag);
            
        // background rectangle
        newGs.append('use')
            .attr('xlink:href', '#node-rect');

        // input connector
        newGs.append('g')
            .append("use")
            .attr("xlink:href","#node-conn")
            .attr("transform", "translate(" + consts.offsetConnIn[0] + "," + consts.offsetConnIn[1] + ")");

        // output connector
        newGs.append("g")
            .append("use")
            .attr("xlink:href","#node-conn")
            .attr("transform", "translate(" + consts.offsetConnOut[0] + "," + consts.offsetConnOut[1] + ")")
            .on("mousedown", function(d){
                console.log("node-conn's mousedown");
                state.shiftNodeDrag = true;
                state.mouseDownNode = d;
                thisGraph.clearSelections();
                d3.event.stopPropagation();

                thisGraph.dragLine.classed('hidden', false)
                    .attr('d', 'M' + (d.x + consts.offsetConnOut[0]) + ',' + (d.y + consts.offsetConnOut[1])
                        + 'L' + (d.x + consts.offsetConnOut[0]) + ',' + (d.y + consts.offsetConnOut[1]) );
            })
            .call(thisGraph.drag);

        var txt = newGs.append("text")
            .classed("node-text", true)
            .attr("x", consts.nodeXpad + 10)
            .attr("y", consts.nodeHeight/2 + consts.nodeYpad*0.5)
            .text(function (d) {
                return makeNodeTitle(d);
            });
 


        // remove old nodes
        thisGraph.drawnnodes.exit().remove();
    };

    DagStudio.prototype.clearSelections = function() {
        this.removeSelectFromNode();
        this.removeSelectFromEdge();
    }

    DagStudio.prototype.zoomed = function() {
        console.log("prototype.zoomed" + " d3.event.scale=" + d3.event.scale);
        this.state.justScaleTransGraph = true;
        d3.select("." + this.consts.graphClass)
            .attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")"); 
        if (this.state.draggingNewNode) {
            console.log("zooming during drag");
            this.drawDragnode();
        }
    };

    DagStudio.prototype.updateWindow = function(svg) {
        var divEl = document.getElementById('chart');
        var x = divEl.offsetWidth;
        var y = divEl.offsetHeight;
        svg.attr("width", x).attr("height", y);
    };

    DagStudio.prototype.mouseIsOverElementId = function(elementId) {
        // This function is needed because 'mouseover' and 'mouseout' callbacks
        // can be unreliable due to overlap and their respective z-index.
        var theNode = d3.select(elementId).node();
        var mouseCoords = d3.mouse(theNode)
        if (mouseCoords[0] < 1 || mouseCoords[1] < 1 ) {
            return false;
        }
        var bbox = theNode.getBoundingClientRect();
        if (mouseCoords[0] > bbox.width || mouseCoords[1] > bbox.height) {
            return false;
        }
        return true;
    }

    DagStudio.prototype.drawDragnode = function() {
        var mouseCoords = d3.mouse(d3.select('#dragnode').node().parentElement);

        var dn = d3.select('#dragnode');

        var scale = 1;
        if (this.mouseIsOverElementId('#chart')) {
           scale = this.state.zoomer.scale();
           // change mousestart drag pos to center
           this.state.mouseStartDragPos[0] = dn.node().getBBox().width / 2 * scale;
           this.state.mouseStartDragPos[1] = dn.node().getBBox().height / 2 * scale;
        }

        dn.attr('transform', 
            'translate(' +(mouseCoords[0] - this.state.mouseStartDragPos[0])
            + ',' + (mouseCoords[1] - this.state.mouseStartDragPos[1]) + ') '
            + 'scale(' + scale + ')');
    }


    DagStudio.prototype.drawTrashZone = function(draw) {
        this.state.trashzoneActive = draw;
        var layerlist = d3.select('#layerlist');
        if (draw) {
            layerlist.selectAll('svg').style("opacity", 0);
            layerlist.classed('layerlist-trash', true);
            layerlist.classed('layerlist-normal', false);
        } else {
            layerlist.selectAll('svg').style("opacity", 1);
            layerlist.classed('layerlist-trash', false);
            layerlist.classed('layerlist-normal', true);
        }
    }


    DagStudio.prototype.setLayerlistData = function(data) {
        var thisGraph = this,
            state = thisGraph.state;
        thisGraph.state.layerlistdata = data;

        var svg = d3.select('#layerlist')
            .on("mouseout", function (d,i) {
                // moving a drawn node back inside the svg
                if (thisGraph.state.mouseDownNode) { 
                    //@TODO(tzaman) remove the trashbin overlay
                    console.log("removing overlay");
                    thisGraph.drawTrashZone(false);
                }
            })
            .on("mouseover", function(d,i) {
                // moving a drawn node outside svg
                if (thisGraph.state.mouseDownNode) { 
                    //@TODO(tzaman) remove the trashbin overlay
                    console.log("drawing overlay");
                    thisGraph.drawTrashZone(true);
                }
            })
            .selectAll('svg')
            .data(thisGraph.state.layerlistdata)
            .enter()
            .append('svg')
            .classed('list-node-svg', true);
            
            

        var group = svg.append('g')
            .attr('id', function (d, i) { return 'nl-' + i})
            .on('mousedown', function(d, i){
                console.log("nodelayer's mousedown");
                thisGraph.clearSelections();
                state.draggingNewNode = true;
                state.draggingNodeId = i;
                var dn = d3.select('#dragnode').style('visibility', 'visible');

                state.dragnode.select('text').text(d.type);

                state.mouseStartDragPos = d3.mouse(d3.select('#nl-' + i).node());
                
                thisGraph.drawDragnode();
            });
            
        group.append('use')
            .attr('xlink:href', '#node-rect')
            .classed('node-rect-normal', true);

        group.append('text')
            .classed('node-text', true)
            .attr('x', this.consts.nodeXpad + 10)
            .attr('y', this.consts.nodeHeight/2 + this.consts.nodeYpad*0.5)
            .text(function (d) { return d.type;});
    }


    
    // MAIN

    // warn the user when leaving
    //window.onbeforeunload = function(){
    //  return "Make sure to save your graph locally before leaving :-)";
    //};      

    var divEl = document.getElementById("chart");
    var width = divEl.offsetWidth,
        height =  divEl.offsetHeight;

    // initial node data
    var nodes = [{type: 'Convolution', id: 'conv1', param: '', type_param: '', x: 0, y: 0},
                 {type: 'Pooling',     id: 'pool1', param: '', type_param: '', x: 0, y: 200},
                 {type: 'Fooling',     id: 'fool1', param: '', type_param: '', x: 100, y: 100}];
    var edges = [{id: 'E0', source: nodes[0], target: nodes[1]},
                 {id: 'E1', source: nodes[0], target: nodes[2]},
                 {id: 'E2', source: nodes[2], target: nodes[1]}];

    // Chart SVG

    var svg = d3.select("div#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);
    var graph = new DagStudio(svg, nodes, edges);
    graph.updateGraph();


    $.getJSON('./tests/caffe-all-layers.json', function(data) {         
        graph.setLayerlistData(data);
    });

    graph.setupMetadata();

})(window.d3, window.saveAs, window.Blob);
