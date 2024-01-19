import env from '../util/env';
import { COMPLETED_WORK_ITEM_STATUSES } from './work-item-interface';
import WorkItemUpdate from './work-item-update';

export class WorkflowStepProgress {

  workflowStepId: number; // id of the workflow step, indexed

  jobId: number; // indexed

  // numbers for progress/progress calculation

  completeItemCount: number; // (count for this step only)

  totalItemCount: number; // estimated (count for this step only)

  gotFinalTotalItemCount: boolean;

  totalSteps: number;

  percentOfJobComplete: number; // estimated

  // information about the type of step

  isQueryCmr: boolean;

  isBatched: boolean;

  isAggregating: boolean;

  // should get set by other sections of the code that already check for this
  isComplete: boolean; 
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
function estimateTotalItemCount(thisStep: WorkflowStepProgress, prevStep: WorkflowStepProgress, jobInputGranules: number): number {
  const thisStepIsNonBatchedAggregating = thisStep.isAggregating && !thisStep.isBatched;
  const thisStepIsBatchedAggregating = thisStep.isAggregating && thisStep.isBatched;
  const prevStepIsNonBatchedAggregating = prevStep.isAggregating && !prevStep.isBatched;
  if (thisStep.totalItemCount && (thisStep.isQueryCmr || thisStepIsNonBatchedAggregating || prevStepIsNonBatchedAggregating)) {
    return; // the totalItemCount won't change and is already set
  }
  // cases where totalItemCount won't change but is not already set
  if (thisStep.isQueryCmr) {
    return Math.ceil(this.numInputGranules / env.cmrMaxPageSize);
  } else if (prevStep.isQueryCmr) {
    return jobInputGranules;
  } else if (thisStepIsNonBatchedAggregating) {
    return 1;
  } else if (prevStepIsNonBatchedAggregating) {
  // return workItemCountForStep(thisStep)
  //
  }
  // first, provide a short circuit for when the totalItemCount for thisStep should stop changing.
  if (prevStep.isComplete) {
    if (thisStep.gotFinalTotalItemCount) {
      return;
    } else {
      // will only need to do this once
      // return workItemCountForStep(thisStep)
    }
  }
  // following are cases where totalItemCount for thisStep may continue to grow,
  // and (if we reached this point) the previous step is not yet complete.
  // (below can be tweaked as better heuristics are developed)
  if (thisStepIsBatchedAggregating) {
    // return workItemCountForStep(thisStep) + 1;
  } else {
    return Math.max(prevStep.totalItemCount, thisStep.totalItemCount + 1);
  }
}

/**
 * Called on each work item update, outside of the large update transaction.
 * Updates the WorkflowStepProgress completeItemCount, totalItemCount, percentDone.
 * @param workItemUpdate - the incoming work item update
 * @param _stepId - the WorkflowStep id that the workItemUpdate belongs to
 */
export function updateProgress(workItemUpdate: WorkItemUpdate, _stepId: number, jobInputGranules: number): void {
  let thisStep: WorkflowStepProgress; // retrieve from DB based on stepId
  let prevStep: WorkflowStepProgress; // retrieve from DB based on stepId - 1
  let mutatedThisStepProgress = false;
  
  // possibly update completeItemCount
  if (COMPLETED_WORK_ITEM_STATUSES.includes(workItemUpdate.status)) {
    thisStep.completeItemCount += 1;
    mutatedThisStepProgress = true;
  }
  
  // possibly update totalItemCount
  const totalItemCount = estimateTotalItemCount(thisStep, prevStep, jobInputGranules);
  if (totalItemCount && totalItemCount !== thisStep.totalItemCount) {
    thisStep.totalItemCount = totalItemCount;
    mutatedThisStepProgress = true;
  }

  // possibly update percentOfJobComplete
  if (mutatedThisStepProgress) {
    let fractionOfStepComplete = thisStep.completeItemCount / thisStep.totalItemCount;
    if (fractionOfStepComplete > 1) {
      fractionOfStepComplete = 1;
    }
    thisStep.percentOfJobComplete = 
      ((fractionOfStepComplete) / thisStep.totalSteps) * 100;
    // thisStepProgress.save()
  }
}


