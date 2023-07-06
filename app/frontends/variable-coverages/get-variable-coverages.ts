/**
 * Contains routes for variable coverages and related functions
 */

import queryString from 'querystring';
import { Response, NextFunction } from 'express';
import HarmonyRequest from '../../models/harmony-request';
import { RequestValidationError } from '../../util/errors';
import { getCollectionsForVariable, getVariablesByIds } from '../../util/cmr';

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
    // get the UMM variable data for the concept ID
    const variableName = (await getVariablesByIds([conceptId], req.accessToken))[0].umm.Name;
    // get the associated collection ID for the variable
    const collectionConceptId = (await getCollectionsForVariable(conceptId, req.accessToken))[0].id;

    const searchParams = new URLSearchParams(req.query as Record<string, string>);
    searchParams.delete('variableId');
    const redirectUrl = `/${collectionConceptId}/ogc-api-coverages/1.0.0/collections/${variableName}/coverage/rangeset?${searchParams.toString()}`;
    res.redirect(redirectUrl);
  } catch (e) {
    req.context.logger.error(e);
    if (e instanceof TypeError) {
      next(new RequestValidationError(e.message));
    } else {
      next(e);
    }
  }
}