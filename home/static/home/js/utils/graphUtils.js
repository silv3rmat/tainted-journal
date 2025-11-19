// Graph utility functions and constants

export const SNAP_THRESHOLD = 20; // pixels
export const GRID_SIZE = 50;

export const createNodeCallbacks = (callbacks) => {
    const {
        updateNodeText,
        toggleNodeComplete,
        startEditingNode,
        endEditingNode,
        deleteNode,
        isRoot
    } = callbacks;

    return {
        onTextChange: updateNodeText,
        onToggleComplete: toggleNodeComplete,
        onStartEdit: startEditingNode,
        onEndEdit: endEditingNode,
        onDelete: isRoot ? undefined : deleteNode
    };
};

export const createEdgeStyle = (completed) => {
    if (completed) {
        return {
            stroke: 'rgba(212, 175, 55, 0.2)',
            strokeWidth: 2,
            strokeDasharray: '5, 5'
        };
    }
    return {
        stroke: 'rgba(212, 175, 55, 0.6)',
        strokeWidth: 2
    };
};

export const getMarkerEnd = (MarkerType) => ({
    type: MarkerType.ArrowClosed,
    color: 'rgba(212, 175, 55, 0.6)'
});

