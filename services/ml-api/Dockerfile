FROM python:3.11-slim

WORKDIR /app

# psycopg2-binary needs libpq at runtime; gcc for any compiled wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create runtime directories that are gitignored
RUN mkdir -p data mlruns artifacts

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
