import mustache from 'mustache';
import fs from 'fs';
import path from 'path';
import { HttpError, RequestValidationError } from 'util/errors';
import { Response, NextFunction } from 'express';
import HarmonyRequest from '../models/harmony-request';

const errorTemplate = fs.readFileSync(path.join(__dirname, '../templates/server-error.mustache.html'), { encoding: 'utf8' });
const jsonErrorRoutesRegex = /jobs|ogc-api-coverages/;

/**
 * Returns true if the provided error should be returned as JSON.
 * @param {Error} err The error that occurred
 * @param {http.IncomingMessage} req The client request
 */
function shouldReturnJson(err: Error, req: HarmonyRequest): boolean {
  // This logic may not make a lot of sense right now, initially this
  // function was added to keep behavior the same as much as possible.
  // With later content-negotiation type tickets we'll change this.
  if (err instanceof RequestValidationError || req.path.match(jsonErrorRoutesRegex)) {
    return true;
  }
  return false;
}

/**
 * Returns the appropriate http status code for the provided error
 * @param err The error that occured
 */
function getHttpStatusCode(err: HttpError): number {
  let code = (+err.code) || 500;
  if (code < 400 || code >= 600) {
    // Need to check that the provided code is in a valid range due to some errors
    // providing a non-http code.
    code = 500;
  }
  return code;
}
/**
 * Express.js middleware catching errors that escape service protocol handling and sending them
 * to users
 *
 * @param {Error} err The error that occurred
 * @param {http.IncomingMessage} req The client request
 * @param {http.ServerResponse} res The client response
 * @param {Function} next The next function in the middleware chain
 * @returns {void}
 */
export default function errorHandler(
  err: HttpError, req: HarmonyRequest, res: Response, next: NextFunction,
): void {
  if (res.headersSent) {
    // If the server has started writing the response, delegate to the
    // default error handler, which closes the connection and fails the
    // request
    next(err);
    return;
  }
  const statusCode = getHttpStatusCode(err);

  if (shouldReturnJson(err, req)) {
    req.context.logger.error(err.message);
    let code = `harmony.${err.constructor ? err.constructor.name : 'UnknownError'}`;
    let message = err.message || err.toString();
    if (!err.code) {
      // if the status code has not been set then assume an internal server error
      code = 'harmony.ServerError';
      message = 'Internal server error.';
    }
    res.status(statusCode).json({
      code,
      description: `Error: ${message}`,
    });
  } else {
    const message = err.message || err.toString();
    const response = mustache.render(errorTemplate, { message });
    res.status(statusCode).type('html').send(response);
  }
}
