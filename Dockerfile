FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend /app/backend
COPY research /app/research
COPY data/scenarios /app/data/scenarios
COPY data/results/sensitivity.json /app/data/results/sensitivity.json
ENV PYTHONPATH=/app/backend
ENV FRESHFLOW_ENV=production
ENV FRESHFLOW_DB=/data/freshflow.sqlite
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
