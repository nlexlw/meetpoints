FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build


FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /frontend/dist ./static

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]