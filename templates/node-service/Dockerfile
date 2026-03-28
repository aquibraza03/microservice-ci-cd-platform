# Base image configurable
ARG BASE_IMAGE=node:lts-alpine
FROM ${BASE_IMAGE}

# Metadata (enterprise practice)
ARG SERVICE_NAME
ARG SERVICE_VERSION=dev

LABEL service.name=${SERVICE_NAME}
LABEL service.version=${SERVICE_VERSION}

# Working directory configurable
ENV APP_HOME=/app
WORKDIR ${APP_HOME}

# Copy application source
COPY src ./src

# Runtime environment variables
ENV SERVICE_NAME=${SERVICE_NAME}
ENV SERVICE_PORT=${SERVICE_PORT:-3000}

# Expose port dynamically
EXPOSE ${SERVICE_PORT}

# Health-friendly startup
CMD ["node", "src/server.js"]
