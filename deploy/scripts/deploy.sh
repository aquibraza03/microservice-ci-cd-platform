#!/usr/bin/env bash
set -Eeuo pipefail

############################################################
# GitHub Actions Deployment Wrapper
#
# Workflow Arguments
#
# $1 -> Service Name
# $2 -> Environment
# $3 -> Image Reference
# $4 -> Deployment Target
#
# Converts GitHub workflow arguments into the
# deploy/deploy.sh dispatcher contract.
############################################################

SERVICE="${1:?Service name required}"
ENVIRONMENT="${2:?Environment required}"
IMAGE_REF="${3:-}"
PROVIDER="${4:?Deployment target required}"

############################################################
# Logging
############################################################

log() {
    echo "[WRAPPER] $*"
}

fail() {
    echo "[WRAPPER] ERROR: $*" >&2
    exit 1
}

############################################################
# Normalize provider names
############################################################

case "$PROVIDER" in
    kubernetes)
        PROVIDER="k8s"
        ;;
    ecs)
        PROVIDER="aws"
        ;;
    aws|k8s|local)
        ;;
    *)
        fail "Unknown deployment provider: $PROVIDER"
        ;;
esac

############################################################
# Export image information
############################################################

if [[ -n "$IMAGE_REF" ]]; then

    export IMAGE_REF

    ########################################################
    # Digest image
    #
    # Example:
    # ghcr.io/org/auth-service@sha256:abcd123
    ########################################################

    if [[ "$IMAGE_REF" == *@sha256:* ]]; then

        log "Digest image detected."
        log "IMAGE_REF exported for provider."

    ########################################################
    # Tagged image
    #
    # Example:
    # ghcr.io/org/auth-service:abc123
    ########################################################

    elif [[ "$IMAGE_REF" == *":"* ]]; then

        IMAGE_TAG="${IMAGE_REF##*:}"
        IMAGE_WITHOUT_TAG="${IMAGE_REF%:*}"

        ####################################################
        # Prevent duplicate service name
        ####################################################

        if [[ "$IMAGE_WITHOUT_TAG" == */"$SERVICE" ]]; then
            IMAGE_REGISTRY="${IMAGE_WITHOUT_TAG%/$SERVICE}"
        else
            IMAGE_REGISTRY="$IMAGE_WITHOUT_TAG"
        fi

        export IMAGE_REGISTRY
        export IMAGE_TAG

        log "IMAGE_REGISTRY=$IMAGE_REGISTRY"
        log "IMAGE_TAG=$IMAGE_TAG"

    else

        log "Unknown image format. Keeping IMAGE_REF only."

    fi

fi

############################################################
# Display deployment information
############################################################

log "--------------------------------------"
log "Service      : $SERVICE"
log "Environment  : $ENVIRONMENT"
log "Provider     : $PROVIDER"
log "--------------------------------------"

############################################################
# Execute Dispatcher
############################################################

exec bash deploy/deploy.sh \
    "$SERVICE" \
    "$PROVIDER" \
    "$ENVIRONMENT"
