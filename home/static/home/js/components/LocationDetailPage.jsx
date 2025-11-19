// LocationDetailPage - Main component for location detail view
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactFlow, { 
    Background, 
    Controls, 
    MarkerType, 
    useReactFlow, 
    useNodesState, 
    useEdgesState,
    addEdge 
} from 'reactflow';
import { RootNode } from './RootNode.jsx';
import { OutcomeNode } from './OutcomeNode.jsx';
import { createEdgeLabel } from './EdgeLabel.jsx';
import { fetchLocationData, getCSRFToken, linkifyText } from '../utils/api.js';
import { SNAP_THRESHOLD, getMarkerEnd } from '../utils/graphUtils.js';

export const LocationDetailPage = ({ locationId }) => {
    
    const [location, setLocation] = useState(null);
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editingText, setEditingText] = useState('');
    const [newNoteText, setNewNoteText] = useState('');
    
    // Assignment mode state
    const [assignmentMode, setAssignmentMode] = useState(false);
    const [assigningNoteId, setAssigningNoteId] = useState(null);
    
    // Save status tracking
    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Decision Graph State - Using React Flow's state management
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [nodeCounter, setNodeCounter] = useState(0);
    const [editingEdge, setEditingEdge] = useState(null);
    const [connectingNodeId, setConnectingNodeId] = useState(null);
    const reactFlowWrapper = useRef(null);
    
    // Use React Flow hooks for proper updates
    const { project, screenToFlowPosition, setCenter, fitView } = useReactFlow();
    
    // Stable callback refs
    const callbacksRef = useRef({});
    
    // Track last save time and editing state
    const lastSaveTimeRef = useRef(0);
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);
    const editingNodesRef = useRef(new Set());
    const editingEdgesRef = useRef(new Set());
    const saveQueueRef = useRef([]);
    
    // Track if this is the first load
    const isInitialLoadRef = useRef(true);
    const hasLoadedGraphRef = useRef(false);
    const pollingPausedRef = useRef(false);
    
    // LocalStorage helpers
    const getLocalStorageKey = (locId) => `graph_${locId}`;
    
    const saveGraphToLocalStorage = useCallback((graphData, locData) => {
        try {
            const storageData = {
                location: locData,
                graph: graphData,
                timestamp: Date.now()
            };
            localStorage.setItem(getLocalStorageKey(locationId), JSON.stringify(storageData));
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
        }
    }, [locationId]);
    
    const loadGraphFromLocalStorage = useCallback(() => {
        try {
            const stored = localStorage.getItem(getLocalStorageKey(locationId));
            if (stored) {
                const data = JSON.parse(stored);
                // Check if data is not too old (24 hours)
                const age = Date.now() - data.timestamp;
                if (age < 24 * 60 * 60 * 1000) {
                    return data;
                } else {
                    // Clear old data
                    localStorage.removeItem(getLocalStorageKey(locationId));
                }
            }
        } catch (error) {
            console.warn('Failed to load from localStorage:', error);
        }
        return null;
    }, [locationId]);
    
    // Process and apply graph data (from either localStorage or API)
    const processGraphData = useCallback((graphData, isFromLocalStorage = false) => {
        if (!graphData || !graphData.nodes || !graphData.edges) return;
        
        const loadedNodes = graphData.nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                isEditing: false,
                onTextChange: (nodeId, text) => callbacksRef.current.updateNodeText?.(nodeId, text),
                onToggleComplete: (nodeId) => callbacksRef.current.toggleNodeComplete?.(nodeId),
                onDelete: (nodeId) => callbacksRef.current.deleteNode?.(nodeId),
                onStartEdit: (nodeId) => callbacksRef.current.startEditingNode?.(nodeId),
                onEndEdit: (nodeId) => callbacksRef.current.endEditingNode?.(nodeId),
                onCostChange: (nodeId, cost) => callbacksRef.current.updateNodeCost?.(nodeId, cost)
            }
        }));
        
        const loadedEdges = graphData.edges.map(edge => ({
            ...edge,
            type: 'default',
            animated: false,
            label: <EdgeLabel id={edge.id} data={edge.data} />,
            labelBgPadding: [8, 4],
            labelBgBorderRadius: 4,
            labelBgStyle: { fill: 'rgba(26, 26, 46, 0.9)', fillOpacity: 0.9 },
            markerEnd: getMarkerEnd(MarkerType),
            style: edge.data.completed 
                ? { stroke: 'rgba(212, 175, 55, 0.2)', strokeWidth: 2, strokeDasharray: '5, 5' }
                : { stroke: 'rgba(212, 175, 55, 0.6)', strokeWidth: 2 }
        }));
        
        // Update nodes: Keep root, accept server data, preserve editing nodes
        setNodes(prev => {
            const rootNode = prev.find(n => n.id === 'root');
            
            // If first load, just add everything
            if (prev.length <= 1 || isFromLocalStorage) {
                // Set node counter
                if (loadedNodes.length > 0) {
                    const maxCounter = Math.max(...loadedNodes.map(n => {
                        const match = n.id.match(/node-(\d+)/);
                        return match ? parseInt(match[1]) : 0;
                    }));
                    setNodeCounter(maxCounter + 1);
                }
                
                if (!hasLoadedGraphRef.current && loadedNodes.length > 0) {
                    hasLoadedGraphRef.current = true;
                }
                
                return rootNode ? [rootNode, ...loadedNodes] : loadedNodes;
            }
            
            // For subsequent updates: Server is truth, except for editing nodes
            const editingNodes = prev.filter(n => 
                n.id !== 'root' && editingNodesRef.current.has(n.id)
            );
            
            // Merge: loaded nodes + editing nodes (editing nodes override server)
            const result = [];
            
            // Add server nodes (except those being edited)
            for (const node of loadedNodes) {
                if (!editingNodesRef.current.has(node.id)) {
                    result.push(node);
                }
            }
            
            // Add editing nodes (they override server)
            result.push(...editingNodes);
            
            return rootNode ? [rootNode, ...result] : result;
        });
        
        // Update edges: Accept server data, preserve editing edges
        setEdges(prev => {
            if (prev.length === 0 || isFromLocalStorage) {
                return loadedEdges;
            }
            
            // Server is truth, except for editing edges
            const editingEdges = prev.filter(e => editingEdgesRef.current.has(e.id));
            
            // Merge: loaded edges + editing edges (editing edges override server)
            const result = [];
            
            // Add server edges (except those being edited)
            for (const edge of loadedEdges) {
                if (!editingEdgesRef.current.has(edge.id)) {
                    result.push(edge);
                }
            }
            
            // Add editing edges (they override server)
            result.push(...editingEdges);
            
            return result;
        });
    }, [setNodes, setEdges, setNodeCounter]);

    // Fetch location data - SIMPLIFIED (Server is Source of Truth)
    const fetchData = async () => {
        // Skip if save in progress or polling paused
        if (isSavingRef.current || pollingPausedRef.current) {
            console.log('⏸️ Polling skipped (save in progress or paused)');
            return;
        }
        
        // Skip if user is editing
        if (editingNodesRef.current.size > 0 || editingEdgesRef.current.size > 0) {
            console.log('⏸️ Polling skipped (user is editing)');
            return;
        }
        
        try {
            console.log('🔄 Fetching data from server');
            const data = await fetchLocationData(locationId);
            setLocation(data.location);
            setNotes(data.notes);
            
            // Process graph data - simple replacement (server is truth)
            processGraphData(data.graph, false);
            
            // Update localStorage cache
            saveGraphToLocalStorage(data.graph, data.location);
            
            setLoading(false);
        } catch (error) {
            console.error('❌ Fetch error:', error);
            setLoading(false);
        }
    };

    // Save graph to database - SIMPLIFIED & RELIABLE
    const saveGraph = useCallback(async (immediate = false, retryCount = 0) => {
        // If already saving, queue this save
        if (isSavingRef.current && !immediate) {
            console.log('Save queued - another save in progress');
            saveQueueRef.current.push({ immediate, retryCount });
            return;
        }
        
        // Clear any pending timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Don't save if editing (unless immediate)
        if (!immediate && (editingNodesRef.current.size > 0 || editingEdgesRef.current.size > 0)) {
            console.log('Save deferred - user is editing');
            saveTimeoutRef.current = setTimeout(() => saveGraph(false), 2000);
            return;
        }
        
        // Throttle non-immediate saves (1 second minimum)
        const now = Date.now();
        const timeSinceLastSave = now - lastSaveTimeRef.current;
        if (!immediate && timeSinceLastSave < 1000) {
            saveTimeoutRef.current = setTimeout(() => saveGraph(false), 1000 - timeSinceLastSave);
            return;
        }
        
        isSavingRef.current = true;
        setSaveStatus('saving');
        setHasUnsavedChanges(false);
        
        // Pause polling during save
        pollingPausedRef.current = true;
        
        try {
            console.log('💾 SAVING GRAPH', { immediate, nodeCount: nodes.filter(n => n.id !== 'root').length });
            
            const graphData = {
                nodes: nodes.filter(n => n.id !== 'root').map(node => ({
                    id: node.id,
                    type: node.type,
                    position: node.position,
                    data: {
                        text: node.data.text || '',
                        cost: node.data.cost || '',
                        completed: node.data.completed || false
                    }
                })),
                edges: edges.map(edge => ({
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    data: {
                        text: edge.data?.text || '',
                        completed: edge.data?.completed || false
                    }
                }))
            };
            
            const response = await fetch(`/api/location/${locationId}/save-graph/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify(graphData)
            });
            
            if (!response.ok) {
                throw new Error(`Save failed: ${response.status}`);
            }
            
            console.log('✅ SAVE SUCCESSFUL');
            
            // Save to localStorage as backup
            saveGraphToLocalStorage(graphData, location);
            
            lastSaveTimeRef.current = Date.now();
            setSaveStatus('saved');
            
            // Process any queued saves
            if (saveQueueRef.current.length > 0) {
                const queued = saveQueueRef.current.shift();
                setTimeout(() => saveGraph(queued.immediate, queued.retryCount), 100);
            }
            
        } catch (error) {
            console.error('❌ SAVE FAILED:', error);
            setSaveStatus('error');
            
            // Retry up to 3 times for immediate saves
            if (immediate && retryCount < 3) {
                console.log(`🔄 Retrying save (attempt ${retryCount + 1}/3)`);
                setTimeout(() => saveGraph(true, retryCount + 1), 1000 * (retryCount + 1));
            } else {
                setHasUnsavedChanges(true);
            }
        } finally {
            isSavingRef.current = false;
            // Resume polling after short delay
            setTimeout(() => {
                pollingPausedRef.current = false;
            }, 1000);
        }
    }, [nodes, edges, locationId, location, saveGraphToLocalStorage]);

    // Store saveGraph in ref for stable access (always latest version)
    const saveGraphRef = useRef();
    saveGraphRef.current = saveGraph;
    
    // Trigger save on specific events
    const triggerSave = useCallback(() => {
        saveGraphRef.current?.();
    }, []);
    
    // Trigger immediate save (for critical operations like delete)
    const triggerImmediateSave = useCallback(() => {
        saveGraphRef.current?.(true); // Pass immediate=true
    }, []);

    useEffect(() => {
        // Load from localStorage first for instant display
        const cachedData = loadGraphFromLocalStorage();
        if (cachedData) {
            setLocation(cachedData.location);
            processGraphData(cachedData.graph, true);
            setLoading(false);
        }
        
        // Then fetch from database (will update if different)
        fetchData();
        
        // Poll every 10 seconds for updates
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locationId]);
    
    // Navigation protection - warn if unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasUnsavedChanges || isSavingRef.current) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // Node manipulation functions
    callbacksRef.current.updateNodeText = (nodeId, text) => {
        console.log('updateNodeText called:', { nodeId, text });
        setNodes(prev => {
            const updated = prev.map(node => {
                if (node.id === nodeId) {
                    if (node.id === 'root') {
                        return { ...node, data: { ...node.data, label: text } };
                    }
                    return { ...node, data: { ...node.data, text } };
                }
                return node;
            });
            console.log('Updated nodes:', updated.map(n => ({ id: n.id, text: n.data.text })));
            return updated;
        });
        // Text updates are saved when editing ends (via endEditingNode)
        // No need to save on every keystroke
    };

    callbacksRef.current.updateNodeCost = (nodeId, cost) => {
        console.log('updateNodeCost called:', { nodeId, cost });
        setNodes(prev => {
            const updated = prev.map(node => {
                if (node.id === nodeId) {
                    return { ...node, data: { ...node.data, cost } };
                }
                return node;
            });
            console.log('Updated node costs:', updated.map(n => ({ id: n.id, cost: n.data.cost })));
            return updated;
        });
        // Cost updates trigger save
        setTimeout(() => {
            triggerSave();
        }, 200);
    };

    callbacksRef.current.startEditingNode = (nodeId) => {
        console.log('Started editing node:', nodeId);
        // Cancel any pending saves when editing starts
        if (saveTimeoutRef.current) {
            console.log('Cancelling pending save - editing started');
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        editingNodesRef.current.add(nodeId);
        setNodes(prev => prev.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, isEditing: true } }
                : node
        ));
    };

    callbacksRef.current.endEditingNode = (nodeId) => {
        console.log('Ended editing node:', nodeId);
        editingNodesRef.current.delete(nodeId);
        setNodes(prev => {
            const updated = prev.map(node =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, isEditing: false } }
                    : node
            );
            console.log('After endEdit, nodes:', updated.map(n => ({ id: n.id, text: n.data.text })));
            return updated;
        });
        // Trigger save after editing ends (with delay to ensure all state updates complete)
        setTimeout(() => {
            console.log('Triggering save after edit end');
            triggerSave();
        }, 200);
    };

    callbacksRef.current.toggleNodeComplete = (nodeId) => {
        setNodes(prev => prev.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, completed: !node.data.completed } }
                : node
        ));
        // Trigger save after toggling completion
        triggerSave();
    };

    // Define deleteNode logic - SIMPLIFIED with immediate save
    callbacksRef.current.deleteNode = (nodeId) => {
        // Show confirmation dialog
        if (!window.confirm('Delete this node and all its descendants?')) {
            return;
        }
        
        console.log('🗑️ DELETE NODE:', nodeId);
        
        // Find all descendants recursively
        const getDescendants = (id, currentEdges) => {
            const children = currentEdges.filter(e => e.source === id).map(e => e.target);
            const descendants = [...children];
            children.forEach(childId => {
                descendants.push(...getDescendants(childId, currentEdges));
            });
            return descendants;
        };

        const toDelete = [nodeId, ...getDescendants(nodeId, edges)];
        console.log('🗑️ Deleting nodes:', toDelete);
        console.log('🗑️ Current node count:', nodes.filter(n => n.id !== 'root').length);
        
        // Update state immediately (optimistic update)
        setNodes(prev => {
            const updated = prev.filter(node => !toDelete.includes(node.id));
            console.log('🗑️ After delete, node count:', updated.filter(n => n.id !== 'root').length);
            return updated;
        });
        setEdges(prev => prev.filter(edge => 
            !toDelete.includes(edge.source) && !toDelete.includes(edge.target)
        ));
        
        // Mark as having unsaved changes
        setHasUnsavedChanges(true);
        
        // Wait for React state to propagate before saving
        // Use triggerImmediateSave to ensure we call the LATEST saveGraph with NEW state
        setTimeout(() => {
            console.log('🗑️ Triggering immediate save after delete...');
            triggerImmediateSave();
        }, 300); // Wait for state updates to propagate
    };

    const updateNodeText = useCallback((nodeId, text) => callbacksRef.current.updateNodeText(nodeId, text), []);
    const startEditingNode = useCallback((nodeId) => callbacksRef.current.startEditingNode(nodeId), []);
    const endEditingNode = useCallback((nodeId) => callbacksRef.current.endEditingNode(nodeId), []);
    const toggleNodeComplete = useCallback((nodeId) => callbacksRef.current.toggleNodeComplete(nodeId), []);
    const deleteNode = useCallback((nodeId) => callbacksRef.current.deleteNode(nodeId), []);

    const updateEdgeLabelInternal = (edgeId, text, completed) => {
        setEdges(prev => prev.map(edge => {
            if (edge.id === edgeId) {
                const newData = { ...edge.data, text, completed };
                const EdgeLabel = createEdgeLabel(editingEdge, (id) => {
                    if (id === null) {
                        // Editing ended
                        editingEdgesRef.current.delete(edgeId);
                        triggerSave();
                    }
                    setEditingEdge(id);
                }, updateEdgeLabelInternal);
                const newEdge = { 
                    ...edge,
                    label: <EdgeLabel id={edge.id} data={newData} />,
                    data: newData
                };
                if (completed) {
                    newEdge.style = { 
                        ...newEdge.style,
                        stroke: 'rgba(212, 175, 55, 0.2)',
                        strokeDasharray: '5, 5'
                    };
                    newEdge.className = 'completed';
                } else {
                    newEdge.style = { stroke: 'rgba(212, 175, 55, 0.6)', strokeWidth: 2 };
                    newEdge.className = '';
                }
                return newEdge;
            }
            return edge;
        }));
    };

    // Edge Label component
    const EdgeLabel = useMemo(() => 
        createEdgeLabel(editingEdge, setEditingEdge, updateEdgeLabelInternal),
        [editingEdge]
    );

    // Node types
    const nodeTypes = useMemo(() => ({
        rootNode: RootNode,
        outcomeNode: OutcomeNode
    }), []);

    // Graph event handlers - with snapping support
    const handleNodesChange = useCallback((changes) => {
        // Apply snapping for position changes
        const modifiedChanges = changes.map(change => {
            if (change.type === 'position' && change.position && change.dragging) {
                // Find other nodes to snap to
                for (const node of nodes) {
                    if (node.id !== change.id) {
                        const xDiff = Math.abs(change.position.x - node.position.x);
                        if (xDiff < SNAP_THRESHOLD && xDiff > 0) {
                            return { ...change, position: { ...change.position, x: node.position.x } };
                        }
                    }
                }
            }
            return change;
        });
        
        // Check if dragging just ended (position change without dragging flag)
        const dragEnded = modifiedChanges.some(
            change => change.type === 'position' && !change.dragging
        );
        
        // Use React Flow's built-in handler
        onNodesChange(modifiedChanges);
        
        // Trigger save after drag ends
        if (dragEnded) {
            triggerSave();
        }
    }, [nodes, onNodesChange, triggerSave]);

    // Use React Flow's built-in edge handler
    const handleEdgesChange = useCallback((changes) => {
        onEdgesChange(changes);
    }, [onEdgesChange]);

    const onConnect = useCallback((connection) => {
        const newNodeId = `node-${nodeCounter}`;
        setNodeCounter(prev => prev + 1);

        const sourceNode = nodes.find(n => n.id === connection.source);
        if (!sourceNode) return;

        const childrenCount = edges.filter(e => e.source === connection.source).length;
        const newNode = {
            id: newNodeId,
            type: 'outcomeNode',
            position: {
                x: sourceNode.position.x + (childrenCount * 220) - 100,
                y: sourceNode.position.y + 200
            },
            data: {
                text: '',
                cost: '',
                completed: false,
                isEditing: false,
                onTextChange: (nodeId, text) => callbacksRef.current.updateNodeText?.(nodeId, text),
                onCostChange: (nodeId, cost) => callbacksRef.current.updateNodeCost?.(nodeId, cost),
                onToggleComplete: (nodeId) => callbacksRef.current.toggleNodeComplete?.(nodeId),
                onDelete: (nodeId) => callbacksRef.current.deleteNode?.(nodeId),
                onStartEdit: (nodeId) => callbacksRef.current.startEditingNode?.(nodeId),
                onEndEdit: (nodeId) => callbacksRef.current.endEditingNode?.(nodeId)
            }
        };

        const edgeId = `edge-${connection.source}-${newNodeId}`;
        const edgeData = { text: '', completed: false };
        const newEdge = {
            id: edgeId,
            source: connection.source,
            target: newNodeId,
            type: 'default',
            animated: false,
            label: <EdgeLabel id={edgeId} data={edgeData} />,
            data: edgeData,
            labelBgPadding: [8, 4],
            labelBgBorderRadius: 4,
            labelBgStyle: { fill: 'rgba(26, 26, 46, 0.9)', fillOpacity: 0.9 },
            markerEnd: getMarkerEnd(MarkerType),
            style: { stroke: 'rgba(212, 175, 55, 0.6)', strokeWidth: 2 }
        };

        setNodes(prev => [...prev, newNode]);
        setEdges(prev => [...prev, newEdge]);
    }, [nodeCounter, nodes, edges, EdgeLabel]);

    const onConnectStart = useCallback((event, { nodeId }) => {
        setConnectingNodeId(nodeId);
    }, []);

    const onConnectEnd = useCallback((event) => {
        // Store the connecting node ID before resetting
        const sourceNodeId = connectingNodeId;
        
        // Always reset connecting state to stop the connection line
        setConnectingNodeId(null);
        
        if (!sourceNodeId) {
            console.log('❌ No source node ID');
            return;
        }

        console.log('🎯 Connection end event:', {
            type: event.type,
            target: event.target?.className,
            sourceNodeId
        });

        // Get client coordinates - handle both mouse and touch events
        let clientX, clientY;
        
        if (event.type === 'touchend') {
            // For touch events, use changedTouches (the touch that just ended)
            const touch = event.changedTouches?.[0];
            if (!touch) {
                console.log('❌ No touch data found');
                return;
            }
            clientX = touch.clientX;
            clientY = touch.clientY;
            console.log('📱 Touch end detected:', { clientX, clientY });
        } else {
            // For mouse events, use clientX/clientY directly
            clientX = event.clientX;
            clientY = event.clientY;
            console.log('🖱️ Mouse up detected:', { clientX, clientY });
        }

        // For touch events, check what element is at the touch point
        let targetElement = event.target;
        if (event.type === 'touchend') {
            // Use elementFromPoint to get the actual element at touch coordinates
            targetElement = document.elementFromPoint(clientX, clientY);
            console.log('📍 Element at touch point:', targetElement?.className);
        }

        // Check if target is the pane or background (not a node/handle)
        const targetIsPane = targetElement?.classList?.contains('react-flow__pane') ||
                            targetElement?.classList?.contains('react-flow__renderer') ||
                            targetElement?.classList?.contains('react-flow__background');
        
        // Also check if we're NOT targeting a node or handle
        const targetIsNode = targetElement?.closest('.react-flow__node');
        const targetIsHandle = targetElement?.classList?.contains('react-flow__handle');
        
        console.log('🎯 Target check:', { 
            targetIsPane, 
            targetIsNode: !!targetIsNode, 
            targetIsHandle,
            shouldCreateNode: !targetIsNode && !targetIsHandle
        });
        
        // Create node if we're dropping on the canvas (not on a node or handle)
        if ((!targetIsNode && !targetIsHandle) && reactFlowWrapper.current) {
            console.log('✅ Creating new node...');
            
            // Use React Flow's project method from useReactFlow hook
            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const position = project({
                x: clientX - reactFlowBounds.left,
                y: clientY - reactFlowBounds.top,
            });
            
            console.log('📍 New node position:', position);

            const newNodeId = `node-${nodeCounter}`;
            
            const newNode = {
                id: newNodeId,
                type: 'outcomeNode',
                position,
                data: {
                    text: '',
                    cost: '',
                    completed: false,
                    isEditing: false,
                    onTextChange: (nodeId, text) => callbacksRef.current.updateNodeText?.(nodeId, text),
                    onCostChange: (nodeId, cost) => callbacksRef.current.updateNodeCost?.(nodeId, cost),
                    onToggleComplete: (nodeId) => callbacksRef.current.toggleNodeComplete?.(nodeId),
                    onDelete: (nodeId) => callbacksRef.current.deleteNode?.(nodeId),
                    onStartEdit: (nodeId) => callbacksRef.current.startEditingNode?.(nodeId),
                    onEndEdit: (nodeId) => callbacksRef.current.endEditingNode?.(nodeId)
                }
            };

            const edgeId = `edge-${sourceNodeId}-${newNodeId}`;
            const edgeData = { text: '', completed: false };
            const newEdge = {
                id: edgeId,
                source: sourceNodeId,
                target: newNodeId,
                type: 'default',
                animated: false,
                data: edgeData,
                label: <EdgeLabel id={edgeId} data={edgeData} />,
                labelBgPadding: [8, 4],
                labelBgBorderRadius: 4,
                labelBgStyle: { fill: 'rgba(26, 26, 46, 0.9)', fillOpacity: 0.9 },
                markerEnd: getMarkerEnd(MarkerType),
                style: { stroke: 'rgba(212, 175, 55, 0.6)', strokeWidth: 2 }
            };

            console.log('🎉 Adding new node:', newNodeId, 'at position:', position);
            console.log('🎉 Adding new edge:', edgeId);

            // Update state with new node and edge using React Flow's state setters
            setNodes((nds) => {
                console.log('📊 Current nodes:', nds.length, '→ New nodes:', nds.length + 1);
                return nds.concat(newNode);
            });
            setEdges((eds) => {
                console.log('📊 Current edges:', eds.length, '→ New edges:', eds.length + 1);
                return eds.concat(newEdge);
            });
            setNodeCounter((prev) => prev + 1);
            
            // Trigger save after creating new node
            triggerSave();
        } else {
            console.log('❌ Node creation cancelled - dropped on node or handle');
        }
    }, [connectingNodeId, nodeCounter, project, EdgeLabel, setNodes, setEdges, triggerSave]);

    const onEdgeDoubleClick = useCallback((event, edge) => {
        event.stopPropagation();
        editingEdgesRef.current.add(edge.id);
        setEditingEdge(edge.id);
    }, []);

    // Initialize root node
    const handleClearLocation = async () => {
        if (!confirm('Clear location details? Notes will be preserved.')) return;
        
        try {
            const formData = new FormData();
            formData.append('clear_location', '1');
            formData.append('csrfmiddlewaretoken', getCSRFToken());

            await fetch(`/location/${locationId}/action/`, {
                method: 'POST',
                body: formData,
            });
            
            fetchData();
        } catch (error) {
            console.error('Error clearing location:', error);
        }
    };

    useEffect(() => {
        if (location && (location.number || location.name || location.picture)) {
            // Only add/update root node if it doesn't exist or needs updating
            setNodes(prev => {
                const existingRoot = prev.find(n => n.id === 'root');
                const rootNode = {
                    id: 'root',
                    type: 'rootNode',
                    position: existingRoot?.position || { x: 250, y: 50 },
                    data: { 
                        number: location.number,
                        name: location.name,
                        picture: location.picture,
                        onClearLocation: handleClearLocation
                    }
                };
                
                if (existingRoot) {
                    // Update existing root node
                    return prev.map(n => n.id === 'root' ? rootNode : n);
                } else {
                    // Add root node if it doesn't exist
                    return [rootNode, ...prev];
                }
            });
            
            // Call fitView after root node is added
            setTimeout(() => {
                fitView({ 
                    duration: 800, 
                    padding: 0.2,
                    includeHiddenNodes: false
                });
            }, 300);
        } else {
            setNodes([]);
            setEdges([]);
        }
    }, [location?.number, location?.name, location?.picture, fitView]);

    // Update edge colors based on requirement notes
    useEffect(() => {
        if (!notes || notes.length === 0) return;

        setEdges((currentEdges) => {
            return currentEdges.map((edge) => {
                // Check if any uncompleted note is assigned to this edge
                const assignedNote = notes.find(
                    note => note.assigned_edge_id === edge.id && !note.completed
                );

                const style = assignedNote
                    ? { ...edge.style, stroke: '#8B0000', strokeWidth: 3 } // Red for uncompleted requirements
                    : { ...edge.style, stroke: 'rgba(212, 175, 55, 0.6)', strokeWidth: 2 }; // Default gold

                return {
                    ...edge,
                    style,
                    animated: assignedNote ? true : false, // Animate uncompleted requirement edges
                };
            });
        });
    }, [notes, setEdges]);

    // Note handlers
    const handleToggleNote = async (noteId) => {
        try {
            const formData = new FormData();
            formData.append('toggle_note', '1');
            formData.append('note_id', noteId);
            formData.append('csrfmiddlewaretoken', getCSRFToken());

            await fetch(`/location/${locationId}/action/`, {
                method: 'POST',
                body: formData,
            });
            
            fetchData();
        } catch (error) {
            console.error('Error toggling note:', error);
        }
    };

    const handleEditNote = (noteId, currentText) => {
        setEditingNoteId(noteId);
        setEditingText(currentText);
    };

    const handleSaveEdit = async (noteId) => {
        try {
            const formData = new FormData();
            formData.append('edit_note', '1');
            formData.append('note_id', noteId);
            formData.append('note_text', editingText);
            formData.append('csrfmiddlewaretoken', getCSRFToken());

            await fetch(`/location/${locationId}/action/`, {
                method: 'POST',
                body: formData,
            });
            
            setEditingNoteId(null);
            setEditingText('');
            fetchData();
        } catch (error) {
            console.error('Error editing note:', error);
        }
    };

    const handleCancelEdit = () => {
        setEditingNoteId(null);
        setEditingText('');
    };

    const handleDeleteNote = async (noteId) => {
        if (!confirm('Delete this note?')) return;
        
        try {
            const formData = new FormData();
            formData.append('delete_note', '1');
            formData.append('note_id', noteId);
            formData.append('csrfmiddlewaretoken', getCSRFToken());

            await fetch(`/location/${locationId}/action/`, {
                method: 'POST',
                body: formData,
            });
            
            fetchData();
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!newNoteText.trim()) return;

        try {
            const formData = new FormData();
            formData.append('add_note', '1');
            formData.append('text', newNoteText);
            formData.append('csrfmiddlewaretoken', getCSRFToken());

            await fetch(`/location/${locationId}/action/`, {
                method: 'POST',
                body: formData,
            });
            
            setNewNoteText('');
            fetchData();
        } catch (error) {
            console.error('Error adding note:', error);
        }
    };

    // Assignment mode handlers
    const handleStartAssignment = (noteId) => {
        setAssignmentMode(true);
        setAssigningNoteId(noteId);
    };

    const handleCancelAssignment = () => {
        setAssignmentMode(false);
        setAssigningNoteId(null);
    };

    const handleAssignToEdge = async (edgeId) => {
        if (!assigningNoteId) return;

        try {
            const response = await fetch(`/api/note/${assigningNoteId}/assign-edge/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify({ edge_id: edgeId })
            });

            if (response.ok) {
                setAssignmentMode(false);
                setAssigningNoteId(null);
                fetchData(); // Reload to update note assignment
            } else {
                console.error('Failed to assign note to edge');
            }
        } catch (error) {
            console.error('Error assigning note to edge:', error);
        }
    };

    // Handle edge click for assignment
    const onEdgeClick = (event, edge) => {
        if (assignmentMode && assigningNoteId) {
            event.preventDefault();
            handleAssignToEdge(edge.id);
        }
    };

    // Handle unassignment from edge
    const handleUnassignFromEdge = async (noteId) => {
        try {
            const response = await fetch(`/api/note/${noteId}/assign-edge/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify({ edge_id: null })
            });

            if (response.ok) {
                fetchData(); // Reload to update note assignment
            } else {
                console.error('Failed to unassign note from edge');
            }
        } catch (error) {
            console.error('Error unassigning note from edge:', error);
        }
    };

    // Get edge description from edge_id
    const getEdgeDescription = (edgeId) => {
        const edge = edges.find(e => e.id === edgeId);
        if (!edge) return null;

        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);

        const getNodeText = (node) => {
            if (!node) return 'Unknown';
            if (node.id === 'root') return 'ROOT';
            return node.data?.text || 'Node';
        };

        const sourceText = getNodeText(sourceNode);
        const targetText = getNodeText(targetNode);

        return `${sourceText} → ${targetText}`;
    };

    if (loading) {
        return <div className="container"><div className="loading">Loading...</div></div>;
    }

    const hasLocationData = location.number || location.name || location.picture;

    // Render the main component
    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a href="/home/" className="back-arrow">
                    ← Back to Map
                </a>
                
                {/* Save Status Indicator */}
                <div style={{
                    padding: '0.3rem 0.8rem',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: saveStatus === 'saving' ? 'rgba(255, 193, 7, 0.2)' :
                               saveStatus === 'error' ? 'rgba(220, 53, 69, 0.2)' :
                               hasUnsavedChanges ? 'rgba(255, 193, 7, 0.2)' : 'rgba(40, 167, 69, 0.2)',
                    border: saveStatus === 'saving' ? '1px solid rgba(255, 193, 7, 0.5)' :
                            saveStatus === 'error' ? '1px solid rgba(220, 53, 69, 0.5)' :
                            hasUnsavedChanges ? '1px solid rgba(255, 193, 7, 0.5)' : '1px solid rgba(40, 167, 69, 0.5)',
                    color: saveStatus === 'saving' ? '#ffc107' :
                           saveStatus === 'error' ? '#dc3545' :
                           hasUnsavedChanges ? '#ffc107' : '#28a745'
                }}>
                    {saveStatus === 'saving' && (
                        <>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                            Saving...
                        </>
                    )}
                    {saveStatus === 'error' && (
                        <>
                            ⚠️ Save Failed
                        </>
                    )}
                    {saveStatus === 'saved' && hasUnsavedChanges && (
                        <>
                            ● Unsaved Changes
                        </>
                    )}
                    {saveStatus === 'saved' && !hasUnsavedChanges && (
                        <>
                            ✓ Saved
                        </>
                    )}
                </div>
            </div>

            {!hasLocationData && (
                <div className="empty-state">
                    <h2>Add Location Details</h2>
                    <form action={`/location/${locationId}/action/`} method="post" encType="multipart/form-data">
                        <input type="hidden" name="csrfmiddlewaretoken" value={getCSRFToken()} />
                        <input type="hidden" name="update_location" value="1" />
                        
                        <div className="form-group">
                            <label htmlFor="number">Location Number (1-999)</label>
                            <input type="number" id="number" name="number" min="1" max="999" />
                        </div>

                        <div className="form-group">
                            <label htmlFor="name">Location Name</label>
                            <input type="text" id="name" name="name" maxLength="200" />
                        </div>

                        <div className="form-group">
                            <label htmlFor="picture">Picture</label>
                            <input type="file" id="picture" name="picture" accept="image/*" />
                        </div>

                        <button type="submit" className="btn">Save Location</button>
                    </form>
                </div>
            )}

            {hasLocationData && (
            <div className="graph-section">
                <h2>Decision Tree</h2>
                <div className="graph-container" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={handleEdgesChange}
                        onConnect={onConnect}
                        onConnectStart={onConnectStart}
                        onConnectEnd={onConnectEnd}
                        onEdgeDoubleClick={onEdgeDoubleClick}
                        onEdgeClick={onEdgeClick}
                        nodeTypes={nodeTypes}
                        nodesDraggable={true}
                        nodesConnectable={true}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                        attributionPosition="bottom-left"
                        minZoom={0.5}
                        maxZoom={2}
                        connectionLineStyle={{ stroke: 'rgba(212, 175, 55, 0.6)', strokeWidth: 3 }}
                        connectionMode="loose"
                        snapToGrid={false}
                        panOnScroll={false}
                        panOnDrag={true}
                        zoomOnScroll={true}
                        zoomOnPinch={true}
                        panOnScrollMode="free"
                        selectNodesOnDrag={false}
                        connectionRadius={50}
                    >
                        <Background 
                            color="rgba(212, 175, 55, 0.1)" 
                            gap={16} 
                            style={{ background: 'rgba(10, 10, 10, 0.3)' }}
                        />
                        <Controls />
                    </ReactFlow>
                </div>
            </div>
            )}

            {hasLocationData && (
            <div className="notes-section">
                <h2>Notes</h2>
                
                {assignmentMode && (
                    <div style={{
                        backgroundColor: 'rgba(212, 175, 55, 0.2)',
                        border: '2px solid #D4AF37',
                        padding: '1rem',
                        marginBottom: '1rem',
                        borderRadius: '4px',
                        textAlign: 'center'
                    }}>
                        <strong style={{ color: '#D4AF37' }}>Assignment Mode Active</strong>
                        <p style={{ margin: '0.5rem 0' }}>Click on an edge in the graph to assign this note as a requirement</p>
                        <button 
                            onClick={handleCancelAssignment}
                            style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#8B0000',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel Assignment
                        </button>
                    </div>
                )}
                
                {notes.map(note => (
                    <div key={note.id} className="note-item">
                        <div className="note-header">
                            <span className="note-author">
                                {note.author} - {new Date(note.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                                {note.assigned_edge_id && (
                                    <span style={{ marginLeft: '0.5rem', color: '#D4AF37', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                        📌 Assigned to edge ({getEdgeDescription(note.assigned_edge_id) || 'Unknown'})
                                        <button
                                            onClick={() => handleUnassignFromEdge(note.id)}
                                            title="Remove assignment"
                                            style={{
                                                background: 'rgba(139, 0, 0, 0.8)',
                                                border: '1px solid rgba(220, 20, 60, 0.6)',
                                                borderRadius: '3px',
                                                padding: '0.1rem 0.3rem',
                                                color: '#ff6b6b',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.3s ease',
                                                lineHeight: 1,
                                                fontWeight: 'bold'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.target.style.background = 'rgba(139, 0, 0, 1)';
                                                e.target.style.borderColor = 'rgba(220, 20, 60, 1)';
                                                e.target.style.boxShadow = '0 0 8px rgba(220, 20, 60, 0.5)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.background = 'rgba(139, 0, 0, 0.8)';
                                                e.target.style.borderColor = 'rgba(220, 20, 60, 0.6)';
                                                e.target.style.boxShadow = 'none';
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </span>
                                )}
                            </span>
                            <button 
                                className="note-delete"
                                onClick={() => handleDeleteNote(note.id)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="note-body" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                <button 
                                    onClick={() => handleStartAssignment(note.id)}
                                    title="Assign to edge as requirement"
                                    style={{
                                        background: 'rgba(26, 26, 46, 0.9)',
                                        border: '1px solid rgba(212, 175, 55, 0.5)',
                                        borderRadius: '4px',
                                        padding: '0.2rem 0.3rem',
                                        color: '#d4af37',
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        lineHeight: 1,
                                        width: '24px',
                                        height: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'rgba(26, 26, 46, 1)';
                                        e.target.style.borderColor = 'rgba(212, 175, 55, 0.8)';
                                        e.target.style.boxShadow = '0 2px 8px rgba(255, 153, 51, 0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'rgba(26, 26, 46, 0.9)';
                                        e.target.style.borderColor = 'rgba(212, 175, 55, 0.5)';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                >
                                    ➜
                                </button>
                                
                                <input
                                    type="checkbox"
                                    className="note-checkbox"
                                    checked={note.completed}
                                    onChange={() => handleToggleNote(note.id)}
                                />
                            </div>

                            <div className="note-content">
                                {editingNoteId === note.id ? (
                                    <div className="note-edit-form">
                                        <textarea
                                            className="note-edit-input"
                                            value={editingText}
                                            onChange={(e) => setEditingText(e.target.value)}
                                            rows={2}
                                            autoFocus
                                        />
                                        <div className="note-edit-actions">
                                            <button 
                                                className="note-edit-btn note-edit-accept"
                                                onClick={() => handleSaveEdit(note.id)}
                                                title="Save changes"
                                            >
                                                ✓
                                            </button>
                                            <button 
                                                className="note-edit-btn note-edit-discard"
                                                onClick={handleCancelEdit}
                                                title="Cancel"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div 
                                        className={`note-text ${note.completed ? 'completed' : ''}`}
                                        onDoubleClick={() => handleEditNote(note.id, note.text)}
                                        dangerouslySetInnerHTML={{ __html: linkifyText(note.text) }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                <form onSubmit={handleAddNote} style={{ marginTop: '1.5rem' }}>
                    <textarea
                        className="note-input"
                        placeholder="Add a note... (Use #123 to link to location 123, or (Location Name) to link by name)"
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        rows={1}
                    />
                    <button type="submit" className="btn" style={{ marginTop: '0.5rem' }}>
                        Add Note
                    </button>
                </form>
            </div>
            )}
        </div>
    );
};

