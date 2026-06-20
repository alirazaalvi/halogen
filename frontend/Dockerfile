# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_BACKEND_API_URL
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL

ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app (Vite will use VITE_* env vars from above)
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install serve to serve static files
RUN npm install -g serve

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway will set $PORT)
EXPOSE 3000

# Start the server
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
