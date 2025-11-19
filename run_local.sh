#!/bin/bash
# Quick setup and run script for Tainted Grail

set -e  # Exit on error

echo "=== Tainted Grail Setup ==="

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    uv venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
uv pip install django pillow

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi

# Build React app
echo "Building React frontend..."
npm run build

# Run migrations
echo "Running database migrations..."
python manage.py migrate

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Check if initial location exists
echo "Checking for initial location..."
python manage.py shell -c "from home.models import Location; Location.objects.get_or_create(coord_x=0, coord_y=0); print('✓ Initial location ready')" 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Starting development server..."
echo "Access the application at: http://localhost:8000"
echo ""
echo "💡 Tip: Run 'npm run watch' in another terminal for auto-rebuild"
echo ""
python manage.py runserver
