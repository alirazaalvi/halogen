# Build stage
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID

# Copy package files and lock file
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the app (Vite will use VITE_* env vars from above)
RUN bun run build

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
