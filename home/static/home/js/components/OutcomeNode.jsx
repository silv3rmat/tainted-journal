// OutcomeNode component - editable decision nodes
import React, { useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';

export const OutcomeNode = React.memo(({ data, id }) => {
    // Local state to hold the editing text and cost
    const [editingText, setEditingText] = useState(data.text || '');
    const [editingCost, setEditingCost] = useState(data.cost || '');
    const [isEditingCost, setIsEditingCost] = useState(false);
    
    // Update local state when data.text or data.cost changes
    useEffect(() => {
        if (data.isEditing) {
            setEditingText(data.text || '');
        }
    }, [data.isEditing, data.text]);
    
    useEffect(() => {
        if (isEditingCost) {
            setEditingCost(data.cost || '');
        }
    }, [isEditingCost, data.cost]);
    
    const handleFinishEditing = () => {
        console.log('Finishing edit with text:', editingText);
        // Commit the text before ending edit
        data.onTextChange(id, editingText);
        // Wait to ensure React state update completes
        setTimeout(() => {
            console.log('Calling onEndEdit for node:', id);
            data.onEndEdit(id);
        }, 100);
    };
    
    const handleFinishEditingCost = () => {
        console.log('Finishing cost edit with cost:', editingCost);
        // Commit the cost before ending edit
        data.onCostChange(id, editingCost);
        // Wait to ensure React state update completes
        setTimeout(() => {
            setIsEditingCost(false);
        }, 100);
    };
    
    return (
        <div className={`custom-node outcome ${data.completed ? 'completed' : ''}`}>
            <Handle
                type="target"
                position={Position.Left}
                className="custom-handle-target"
            />
            <div className="node-header">
                <input
                    type="checkbox"
                    className="node-checkbox"
                    checked={data.completed}
                    onChange={() => data.onToggleComplete(id)}
                />
                <button
                    className="delete-node-btn"
                    onClick={() => data.onDelete(id)}
                    title="Delete this node"
                >
                    ✕
                </button>
            </div>
            <div 
                className="node-content"
                onDoubleClick={() => data.onStartEdit(id)}
            >
                {data.isEditing ? (
                    <input
                        type="text"
                        className="node-text-input"
                        value={editingText}
                        onChange={(e) => {
                            setEditingText(e.target.value);
                            data.onTextChange(id, e.target.value);
                        }}
                        onBlur={handleFinishEditing}
                        autoFocus
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                handleFinishEditing();
                            }
                        }}
                        placeholder="Outcome..."
                    />
                ) : (
                    <div className="node-text-display">
                        {data.text || 'Double-click to edit...'}
                    </div>
                )}
            </div>
            <div 
                className="node-cost"
                onDoubleClick={() => setIsEditingCost(true)}
                style={{
                    marginTop: '0.3rem',
                    fontSize: '0.8rem',
                    color: 'rgba(212, 175, 55, 0.7)',
                    fontStyle: 'italic',
                    minHeight: '1.2rem',
                    cursor: 'text'
                }}
            >
                {isEditingCost ? (
                    <input
                        type="text"
                        className="node-cost-input"
                        value={editingCost}
                        onChange={(e) => {
                            setEditingCost(e.target.value);
                            data.onCostChange(id, e.target.value);
                        }}
                        onBlur={handleFinishEditingCost}
                        autoFocus
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                handleFinishEditingCost();
                            }
                        }}
                        placeholder="Cost..."
                        style={{
                            width: '100%',
                            padding: '0.2rem',
                            background: 'rgba(10, 10, 10, 0.6)',
                            border: '1px solid rgba(212, 175, 55, 0.5)',
                            borderRadius: '4px',
                            color: '#d4af37',
                            fontSize: '0.8rem',
                            fontStyle: 'italic'
                        }}
                    />
                ) : (
                    <div style={{ padding: '0.2rem' }}>
                        {data.cost || 'Cost: (double-click to edit)'}
                    </div>
                )}
            </div>
            <Handle
                type="source"
                position={Position.Right}
                className="custom-handle"
            />
        </div>
    );
});

OutcomeNode.displayName = 'OutcomeNode';
