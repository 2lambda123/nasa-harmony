/**
 * Contains routes for variable coverages and related functions
 */

import { Response, NextFunction } from 'express';
import HarmonyRequest from '../../models/harmony-request';
import { RequestValidationError } from '../../util/errors';

/**
 * Processes a request for variable coverages
 *
 * @param req - Harmony request object
 * @param res - express response object
 * @param next - next function in call chain
 */
export async function getVariableCoverages(
  req: HarmonyRequest,
  res: Response,
  next: NextFunction): Promise<void> {
  try {
    res.send('OK');
  } catch (e) {
    req.context.logger.error(e);
    if (e instanceof TypeError) {
      next(new RequestValidationError(e.message));
    } else {
      next(e);
    }
  }
}