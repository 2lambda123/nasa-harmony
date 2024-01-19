import WorkItemUpdate from './work-item-update';

export class WorkflowStepProgress {

  workflowStepId: number; // id of the workflow step, indexed

  jobId: number; // indexed

  // these could get pulled from elsewhere (workflow step) or
  // stored in this table
  // if stored here, would need to ensure they're being updated appropriately
  // if pulled elsewhere would need to update that code for better accuracy

  // cases where totalItemCount won't change
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
  // for other cases, these need to be incremented as items are created and updated

  completeItemCount: number; // (count for this step only)
  
  totalItemCount: number; // (count for this step only)

  isComplete: boolean;

  //
  //

  totalSteps: number;

  percentOfJobComplete: number; // estimated

  // information about the type of step

  isQueryCmr: boolean;

  isBatched: boolean;

  isAggregating: boolean;

}

// getJobProgress()
//   join the Job(s) with WorkflowStepProgress and sum up the percentOfJobComplete

// createWorkflowStepProgress()
//   insert these when the workflow steps are inserted
//   initialize percentOfJobComplete, totalItemCount and completeItemCount to 0,
//   and totalSteps to the total number of workflow steps

/**
 * Get the best estimate for totalItemCount for the current WorkflowStepProgress.
 * Assumes that DB queries that take place for aggregation steps and steps following aggregation steps
 * won't be perfomrmed very frequently since (for now) they'll tend to have a smaller number of work items.
 */
function estimateTotalItemCount(thisStep: WorkflowStepProgress, prevStep: WorkflowStepProgress): number {
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
    return Math.max(prevStep.totalItemCount, thisStep.totalItemCount + 1);
  }
}

/**
 * Called on each work item update, outside of the large update transaction.
 * Updates the WorkflowStepProgress completeItemCount, totalItemCount, percentDone.
 * @param _stepId - the WorkflowStep id that the workItemUpdate belongs to
 */
export function updateProgress(_stepId: number): void {
  let thisStep: WorkflowStepProgress; // retrieve from DB based on stepId
  let prevStep: WorkflowStepProgress; // retrieve from DB based on stepId - 1

  if (thisStep.isComplete) {
    // return;
  }
  
  const estimatedTotalItemCount = estimateTotalItemCount(thisStep, prevStep);

  let fractionOfStepComplete = thisStep.completeItemCount / estimatedTotalItemCount;
  if (fractionOfStepComplete > 1) {
    fractionOfStepComplete = 1;
  }
  thisStep.percentOfJobComplete = 
    ((fractionOfStepComplete) / thisStep.totalSteps) * 100;
  // thisStepProgress.save()  
}


