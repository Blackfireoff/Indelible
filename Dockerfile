# Indelible - RAG dApp on 0G Storage & Compute
# Multi-stage Dockerfile for Next.js + RAG pipeline

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20 AS deps
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm i

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:20 AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma generate (if needed)
# RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =============================================================================
# Stage 3: Runner
# =============================================================================
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Set permissions for Next.js cache and static files
RUN mkdir .next && chown nextjs:nodejs .next

# Copy necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for embeddings (populated at runtime via volume mount or fetched from 0G)
RUN mkdir -p ./data && chown nextjs:nodejs ./data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]

