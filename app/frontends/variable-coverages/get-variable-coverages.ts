/**
 * Contains routes for variable coverages and related functions
 */

import { Response, NextFunction } from 'express';
import HarmonyRequest from '../../models/harmony-request';
import { RequestValidationError } from '../../util/errors';
import { getCollectionsForVariable, getVariablesByIds } from '../../util/cmr';
import axios from 'axios';

// temporary mapping of variable IDs to concept IDs to act like Chris's service
const variableMap = {
  // 'red_var': 'V1233801695-EEDTEST',
  // 'blue_var': 'V1233801716-EEDTEST',
};


/**
 * Gets the concept ID for a variable
 * @param variableId - ID of the variable. This can be a name concept ID
 * @returns concept ID (same as variable ID for now)
 **/
async function getConceptIdForVariable(variableId: string): Promise<string> {
  // if the variable ID is a concept ID, return it
  if (/^V\d{10}-.*$/.test(variableId)) {
    return variableId;
  }

  let conceptId = variableMap[variableId];
  if (!conceptId) {
    // Use Chris'service to get the concept ID for the variable
    const resp = await axios.get(`http://localhost:3010/variables?search=${variableId}`);
    // eslint-disable-next-line prefer-destructuring
    conceptId = resp.data[0].conceptId;
  }

  return conceptId;
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
    let variableIds: string | string[];
    if (Array.isArray(req.query.variableId)) {
      variableIds = req.query.variableId as string[];
    } else {
      variableIds = [req.query.variableId as string];
    }
    const conceptIds = await Promise.all(variableIds.map((id) => getConceptIdForVariable(id)));

    // get the UMM variable data for the concept IDs
    const variableNames = (await getVariablesByIds(conceptIds, req.accessToken)).map((v) => v.umm.Name);
    const encodedVariableNames = variableNames.map((v) => encodeURIComponent(v));
    const varNameParam = encodedVariableNames.join(',');
    // get the associated collection ID for the variables (this assues they all are part of the same collection)
    const collectionConceptId = (await getCollectionsForVariable(conceptIds[0], req.accessToken))[0].id;

    const searchParams = new URLSearchParams(req.query as Record<string, string>);
    searchParams.delete('variableId');
    const redirectUrl = `/${collectionConceptId}/ogc-api-coverages/1.0.0/collections/${varNameParam}/coverage/rangeset?${searchParams.toString()}`;
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