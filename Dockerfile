FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including devDependencies for vite build)
RUN npm install

# Copy source code
COPY . .

# Create data directory for persistent volume mount
RUN mkdir -p /data

# Build the Vite frontend
RUN npm run build

# Expose port (Railway sets PORT env var)
EXPOSE ${PORT:-3001}

# Start the server
CMD ["npm", "start"]
