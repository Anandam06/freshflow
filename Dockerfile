# FreshFlow: one service that serves the API and the built frontend from the same URL.

# --- 1. build the React frontend (calls the API on the same origin)
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_API_BASE_URL=/ VITE_USE_MOCK=false
RUN npx vite build

# --- 2. Python backend + static frontend
FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY research research
COPY data/network data/network
COPY data/scenarios data/scenarios
COPY data/results/sensitivity.json data/results/sensitivity.json
COPY --from=web /web/dist frontend/dist
ENV PYTHONPATH=/app/backend \
    FRESHFLOW_DB=/app/data/freshflow.sqlite \
    FRESHFLOW_STATIC_DIR=/app/frontend/dist \
    FRESHFLOW_ENV=public-demo
# Precompute the default fleet simulation so the first visitor does not wait for it.
RUN python backend/warm_cache.py
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
