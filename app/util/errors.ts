/* eslint-disable max-classes-per-file */ // This file creates multiple tag classes
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Class for errors returned by the CMR
export class CmrError extends HttpError {}

// Tag class for backend errors
export class ServiceError extends HttpError {}

export class NotFoundError extends HttpError {
  constructor(message = 'The requested resource could not be found') {
    super(404, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'You are not authorized to access the requested resource') {
    super(403, message);
  }
}

export class ServerError extends HttpError {
  constructor(message = 'An unexpected error occurred') {
    super(500, message);
  }
}

export class RequestValidationError extends HttpError {
  constructor(message = 'Invalid request') {
    super(400, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict error') {
    super(409, message);
  }
}

interface HttpErrorResponse {
  code: string;
  description: string;
}

/**
 * Sanitizes the error message that gets returned to an end user.
 *
 * @param error - the error object
 * @returns the sanitized error message
 */
export function getEndUserErrorMessage(error: HttpError): string {
  if (!error.statusCode) {
    // The error was not generated by harmony so we want to sanitize the message
    return 'Internal server error';
  }
  const message = error.message || error.toString();
  return message;
}

/**
 * Returns the appropriate http status code for the provided error
 * @param error - The error that occured
 * @returns the http status code
 */
export function getHttpStatusCode(error: HttpError): number {
  let statusCode = (+error.statusCode) || 500;
  if (statusCode < 400 || statusCode >= 600) {
    // Need to check that the provided statusCode is in a valid range due to some errors
    // providing a non-http statusCode.
    statusCode = 500;
  }
  return statusCode;
}

/**
 * Returns the appropriate string code to use for the JSON response to indicate a type of error
 * @param error - The error that occured
 * @returns a string indicating the class of error that occurred
 */
export function getCodeForError(error: HttpError): string {
  if (!(error instanceof HttpError)) {
    return 'harmony.ServerError';
  }
  const code = `harmony.${error.constructor ? error.constructor.name : 'UnknownError'}`;
  return code;
}

/**
 * Builds an error response to return based on the provided error
 * @param code - The class of error that occurred
 * @param message - The error message to use as the description
 * @returns the JSON representing the error that occurred
 */
export function buildJsonErrorResponse(code: string, message: string): HttpErrorResponse {
  return { code, description: `Error: ${message}` };
}
