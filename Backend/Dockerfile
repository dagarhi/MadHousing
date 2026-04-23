FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app
USER app

ENV PORT=8080

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
