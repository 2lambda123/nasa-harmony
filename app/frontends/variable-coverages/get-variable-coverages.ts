/**
 * Contains routes for variable coverages and related functions
 */

import { Response, NextFunction } from 'express';
import HarmonyRequest from '../../models/harmony-request';
import { RequestValidationError } from '../../util/errors';
import { getAllVariables, getCollectionsForVariable, getVariablesByIds } from '../../util/cmr';

/**
 * Gets the concept ID for a variable
 * @param variableId - ID of the variable. This can be a name concept ID
 * @returns concept ID (same as variable ID for now)
 **/
async function getConceptIdForVariable(variableId: string): Promise<string> {
  // TODO call Chris's service to get the concept ID
  return variableId;
}

/**
 * Validates a request for variable coverages
 * @param req - Harmony request object
 * @throws TypeError - if variableId is not provided
 **/
export function validateVariableCoverageRequest(req: HarmonyRequest): void {
  const { variableId } = req.query;
  if (!variableId) {
    throw new TypeError('variableId is required');
  }
}

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
    validateVariableCoverageRequest(req);
    const conceptId = await getConceptIdForVariable(req.query.variableId as string);
    // get the UMM variables for the concept ID
    const collectionData = (await getCollectionsForVariable(conceptId, req.accessToken))[0];



    res.send(collectionData.id);
  } catch (e) {
    req.context.logger.error(e);
    if (e instanceof TypeError) {
      next(new RequestValidationError(e.message));
    } else {
      next(e);
    }
  }
}