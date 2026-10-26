FROM node:20.20.2-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

# Install OpenSSL and the CI-pinned pnpm version
RUN apk add --no-cache openssl ca-certificates && \
    npm install -g pnpm@10.24.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma:generate

# Build the application
RUN pnpm build

EXPOSE 3003

# Start the application
CMD ["pnpm", "start:prod"]
