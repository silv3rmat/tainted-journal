# Tainted Grail

A dark-themed web application for managing locations on a dynamic map with decision tree visualization, inspired by Arthurian legends.

## Features

- **Dynamic Map System** - Coordinate-based map that expands automatically as you add locations
- **Location Management** - Upload images, assign numbers, add names and notes
- **Decision Trees** - Visual decision flow graphs with React Flow
- **Notes System** - Collaborative notes with completion tracking and auto-linking
- **Journal** - Generic notes not tied to specific locations
- **Real-time Updates** - Automatic synchronization across multiple users
- **Dark Theme** - Atmospheric Arthurian aesthetic

## Tech Stack

**Backend:**
- Django 4.2.7
- Python 3.11+
- SQLite3

**Frontend:**
- React 18 (via Vite)
- React Flow 11 (decision trees)
- Vanilla JS (map view)

## Quick Start

### Using Docker (Production)

```bash
docker-compose up --build
```

Access at **http://localhost**

### Local Development

#### Prerequisites
- Python 3.11+
- Node.js 18+
- UV (Python package manager)

#### Setup

1. **Install UV** (if not already installed):
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. **Create Python environment**:
```bash
uv venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install django pillow
```

3. **Install Node dependencies**:
```bash
npm install
```

4. **Build React app**:
```bash
npm run build
```

5. **Initialize database**:
```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

6. **Create initial location** (optional):
```bash
python manage.py shell
```
```python
from home.models import Location
Location.objects.create(coord_x=0, coord_y=0)
exit()
```

7. **Run development server**:
```bash
python manage.py runserver
```

Access at **http://localhost:8000**

#### Development Workflow

Run both servers simultaneously:

**Terminal 1 - Django:**
```bash
source .venv/bin/activate
python manage.py runserver
```

**Terminal 2 - React (auto-rebuild):**
```bash
npm run watch
```

## Project Structure

```
tainted/
├── TaintedGrail/          # Django project config
├── home/                  # Main app
│   ├── models.py          # Location, Note, JournalNote
│   ├── views.py           # Views and API endpoints
│   ├── static/home/
│   │   ├── css/           # Stylesheets
│   │   ├── js/            # React components
│   │   └── dist/          # Built assets (generated)
│   └── templates/         # Django templates
├── media/                 # User uploads (not in repo)
├── package.json           # Node dependencies
├── vite.config.js         # Build config
└── requirements.txt       # Python dependencies
```

## Key Concepts

### Map System
- Locations positioned by (x, y) coordinates
- Center at (0, 0)
- Auto-expands when edge locations are filled
- Users see assigned numbers (1-999), not coordinates

### Decision Trees
- Canvas-based graph visualization (React Flow)
- Ephemeral (not saved to database)
- Drag handles to create edges and nodes
- Double-click to edit text
- Checkboxes to mark completion

### Notes
- Support `#123` to link to location number 123
- Support `(Location Name)` to link by name
- Author tracked via cookie
- Completion checkboxes
- Inline editing with double-click

## Environment Variables

Create `.env` file (optional):
```bash
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

## Database

SQLite is used by default. The database file (`db.sqlite3`) is excluded from version control.

To reset database:
```bash
rm db.sqlite3
python manage.py migrate
```

## Build Commands

```bash
# Development build with watch
npm run watch

# Production build
npm run build

# Development server (React)
npm run dev
```

## Admin Interface

Create superuser:
```bash
python manage.py createsuperuser
```

Access admin at **http://localhost:8000/admin/**

## Deployment Notes

### Docker
The Dockerfile includes:
- Node.js for building React app
- Python dependencies
- Automatic frontend build
- Static file collection

### Production Checklist
- [ ] Set `DEBUG=False`
- [ ] Configure `ALLOWED_HOSTS`
- [ ] Set strong `SECRET_KEY`
- [ ] Use PostgreSQL instead of SQLite
- [ ] Configure proper static/media file serving
- [ ] Set up HTTPS

## Troubleshooting

**React changes not visible:**
- Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
- Ensure `npm run build` or `npm run watch` is running
- Run `python manage.py collectstatic --noinput`

**Database errors:**
- Delete `db.sqlite3` and run `python manage.py migrate`
- Check migrations with `python manage.py showmigrations`

**Import errors:**
- Ensure virtual environment is activated
- Run `uv pip install -r requirements.txt`

## License

This project is provided as-is for educational purposes.
