# Use Python 3.11 slim image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV NODE_VERSION=18.x

# Set work directory
WORKDIR /app

# Install system dependencies for Pillow and Node.js
RUN apt-get update && apt-get install -y \
    gcc \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip && pip install -r requirements.txt

# Install Node dependencies and build React app
COPY package.json package-lock.json* ./
RUN npm install

# Copy project files
COPY . /app/

# Build React application
RUN npm run build

# Collect static files (includes built React assets)
RUN python manage.py collectstatic --noinput

# Run migrations
RUN python manage.py migrate --noinput

# Expose port 8000 (we'll map it to 80 in docker-compose)
EXPOSE 8000

# Run the application
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

