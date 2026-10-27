class ControlPlaneError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ControlPlaneError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function errorBody(error, requestId) {
  const known = error instanceof ControlPlaneError;
  return {
    error: {
      code: known ? error.code : "INTERNAL_SERVER_ERROR",
      message: known ? error.message : "An unexpected error occurred.",
      requestId,
      ...(known && error.details ? { details: error.details } : {}),
    },
  };
}

module.exports = { ControlPlaneError, errorBody };
