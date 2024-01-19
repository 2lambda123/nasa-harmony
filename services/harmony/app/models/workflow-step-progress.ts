
// in some cases totalItemCount won't change
// only need to set WorkflowStep.totalItemCount once in these cases
//
// if (thisStep.isQueryCmr) {
//   return Math.ceil(this.numInputGranules / env.cmrMaxPageSize);
// } else if (prevStep.isQueryCmr) {
//   return jobInputGranules;
// } else if (thisStepIsNonBatchedAggregating) {
//   return 1;
// } else if (prevStepIsNonBatchedAggregating) {
//   return workItemCountForStep(thisStep)
//
// }
// for other cases totalItemCount, needs to be incremented as items are created

// when the workflow steps are inserted
// initialize percentOfJobComplete, totalItemCount and completeItemCount,
// and totalSteps. totalItemCount may be 0 or can be predicted upfront in some cases.

export class WorkflowStep {
  
  // see top of file comment
  totalItemCount: number;

  isComplete: boolean;

  // information about the type of step

  isQueryCmr: boolean;

  isBatched: boolean;

  isAggregating: boolean;

  //
  // NEW fields
  //
  
  completeItemCount: number; // count for this step only, incremented in main item update transaction

  percentOfJobComplete: number; // estimated
}

/**
 * Get the best estimate for totalItemCount for the current WorkflowStepProgress.
 * Assumes that DB queries that take place for aggregation steps and steps following aggregation steps
 * won't be perfomrmed very frequently since (for now) they'll tend to have a smaller number of work items.
 */
function estimateTotalItemCount(thisStep: WorkflowStep, prevStep: WorkflowStep): number {
  if (prevStep.isComplete) {
    return thisStep.totalItemCount;
  }
  const thisStepIsNonBatchedAggregating = thisStep.isAggregating && !thisStep.isBatched;
  const thisStepIsBatchedAggregating = thisStep.isAggregating && thisStep.isBatched;
  const prevStepIsNonBatchedAggregating = prevStep.isAggregating && !prevStep.isBatched;
  if (thisStep.isQueryCmr || thisStepIsNonBatchedAggregating || prevStepIsNonBatchedAggregating) {
    return thisStep.totalItemCount; // shouldn't change
  }
  // following are cases where totalItemCount for thisStep may continue to grow,
  // and (if we reached this point) the previous step is not yet complete.
  // (below can be tweaked as better heuristics are developed)
  if (thisStepIsBatchedAggregating) {
    return thisStep.totalItemCount + 1;
  } else {
    // return estimate ~= closest parent step that has all its work items
  }
}

/**
 * Called on each work item update.
 * @param _stepId - the WorkflowStep id that the workItemUpdate belongs to
 */
export function calculateProgress(): void {
  let allSteps: WorkflowStep[];
  let thisStep: WorkflowStep;
  let prevStep: WorkflowStep;

  if (thisStep.isComplete) {
    // return;
  }
  
  const estimatedTotalItemCount = estimateTotalItemCount(thisStep, prevStep);

  let fractionOfStepComplete = thisStep.completeItemCount / estimatedTotalItemCount;
  if (fractionOfStepComplete > 1) {
    fractionOfStepComplete = 1;
  }
  thisStep.percentOfJobComplete = 
    ((fractionOfStepComplete) / allSteps.length) * 100;
  // thisStepProgress.save()  
  // if (sum(steps.percentOfJobComplete) - job.progress > someDelta) update job progress 
}


