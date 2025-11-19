// RootNode component - displays location information
import React from 'react';
import { Handle, Position } from 'reactflow';

export const RootNode = React.memo(({ data, id }) => {
    return (
        <div className="custom-node root location-root">
            <Handle
                type="target"
                position={Position.Left}
                style={{ opacity: 0 }}
            />
            <button
                className="clear-root-btn"
                onClick={() => data.onClearLocation && data.onClearLocation()}
                title="Clear location details"
            >
                ✕
            </button>
            {data.picture && (
                <div className="root-node-image">
                    <img src={data.picture} alt={data.name || 'Location'} />
                    {data.number && (
                        <div className="root-node-number-overlay">
                            {data.number}
                        </div>
                    )}
                    {data.name && (
                        <div className="root-node-name-overlay">
                            {data.name}
                        </div>
                    )}
                </div>
            )}
            <Handle
                type="source"
                position={Position.Right}
                className="custom-handle"
            />
        </div>
    );
});

RootNode.displayName = 'RootNode';
