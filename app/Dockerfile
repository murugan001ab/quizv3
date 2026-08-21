FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# --ws websockets  → explicitly use the websockets library for WS transport
# --workers 1      → single worker so in-memory WS connections are shared
# --proxy-headers  → trust X-Forwarded-* headers from the reverse proxy (needed for wss://)
# --forwarded-allow-ips '*' → accept forwarded IPs from the proxy
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--ws", "websockets", \
     "--workers", "1", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
