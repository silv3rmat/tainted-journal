// EdgeLabel component - editable edge labels
import React from 'react';

export const createEdgeLabel = (editingEdge, setEditingEdge, updateEdgeLabel) => {
    return function EdgeLabel({ id, data }) {
        const isEditing = editingEdge === id;
        
        return (
            <div
                style={{
                    position: 'absolute',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'all'
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingEdge(id);
                }}
            >
                {isEditing ? (
                    <input
                        className="edge-label-input"
                        value={data?.text || ''}
                        onChange={(e) => {
                            updateEdgeLabel(id, e.target.value, data?.completed || false);
                        }}
                        onBlur={() => setEditingEdge(null)}
                        onKeyPress={(e) => e.key === 'Enter' && setEditingEdge(null)}
                        autoFocus
                        placeholder="Choice..."
                    />
                ) : (
                    <div style={{
                        background: 'rgba(26, 26, 46, 0.9)',
                        border: '1px solid rgba(212, 175, 55, 0.3)',
                        borderRadius: '6px',
                        padding: '0.3rem 0.5rem',
                        color: '#c9b896',
                        fontSize: '12px',
                        cursor: 'pointer',
                        minWidth: data?.text ? 'auto' : '80px',
                        textAlign: 'center'
                    }}>
                        {data?.text || 'Double-click'}
                    </div>
                )}
            </div>
        );
    };
};
