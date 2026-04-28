# Use Node.js 20 as the base image
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install openssl (used by entrypoint to generate self-signed certs when requested)
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the built frontend from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the server file and any other necessary files
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src ./src

# Install tsx globally to run the TypeScript server
RUN npm install -g tsx

# Copy and prepare the entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Expose the port the app runs on
EXPOSE 3000

# Set environment variable to production
ENV NODE_ENV=production

# Start via entrypoint (handles optional self-signed cert generation)
CMD ["./entrypoint.sh"]
