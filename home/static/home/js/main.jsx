// Main entry point for Location Detail React app
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from 'reactflow';
import { LocationDetailPage } from './components/LocationDetailPage.jsx';
import 'reactflow/dist/style.css';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.getElementById('react-root');
    if (!rootElement) {
        console.error('React root element not found');
        return;
    }

    const locationId = rootElement.dataset.locationId;
    if (!locationId) {
        console.error('Location ID not found');
        return;
    }

    // Render the main app
    const root = createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ReactFlowProvider>
                <LocationDetailPage locationId={locationId} />
            </ReactFlowProvider>
        </React.StrictMode>
    );
});
