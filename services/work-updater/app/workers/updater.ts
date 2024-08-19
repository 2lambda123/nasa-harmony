import { Logger } from 'winston';
import {
  WorkItemUpdateQueueItem,
  handleWorkItemUpdate,
  preprocessWorkItem,
  processWorkItems } from '../../../harmony/app/backends/workflow-orchestration/work-item-updates';
import { getJobIdForWorkItem } from '../../../harmony/app/models/work-item';
import { default as defaultLogger } from '../../../harmony/app/util/log';
import { WorkItemQueueType } from '../../../harmony/app/util/queue/queue';
import { getQueueForType } from '../../../harmony/app/util/queue/queue-factory';
import sleep from '../../../harmony/app/util/sleep';
import { Worker } from '../../../harmony/app/workers/worker';
import env from '../util/env';
import { logAsyncExecutionTime } from '../../../harmony/app/util/log-execution';
import WorkflowStep, { getWorkflowStepById, getWorkflowStepByJobIdStepIndex } from '../../../harmony/app/models/workflow-steps';
import db from '../../../harmony/app/util/db';
import { Job } from '../../../harmony/app/models/job';

/**
 * Group work item updates by its workflow step and return the grouped work item updates
 * as a map of workflow step to a list of work item updates on that workflow step.
 * @param updates - List of work item updates
 *
 * @returns a map of workflow step to a list of work item updates on that workflow step.
 */
function groupByWorkflowStepIndex(
  updates: WorkItemUpdateQueueItem[]): Record<number, WorkItemUpdateQueueItem[]> {

  return updates.reduce((result, currentUpdate) => {
    const { workflowStepIndex } = currentUpdate.update;

    // Initialize an array for the step if it doesn't exist
    if (!result[workflowStepIndex]) {
      result[workflowStepIndex] = [];
    }

    result[workflowStepIndex].push(currentUpdate);

    return result;
  }, {} as Record<number, WorkItemUpdateQueueItem[]>);
}

/**
 * Updates the batch of work items.
 * It is assumed that all the work items belong to the same job.
 * It processes the work item updates in groups by the workflow step.
 * @param jobID - ID of the job that the work item updates belong to
 * @param updates - List of work item updates
 * @param logger - Logger to use
 */
async function handleBatchWorkItemUpdatesWithJobId(
  jobID: string,
  updates: WorkItemUpdateQueueItem[],
  logger: Logger): Promise<void> {
  const startTime = new Date().getTime();
  logger.debug(`Processing ${updates.length} work item updates for job ${jobID}`);
  // group updates by workflow step index to make sure at least one completion check is performed for each step
  const groups = groupByWorkflowStepIndex(updates);
  for (const workflowStepIndex of Object.keys(groups)) {
    const nextWorkflowStep = await (await logAsyncExecutionTime(
      getWorkflowStepByJobIdStepIndex,
      'HWIUWJI.getWorkflowStepByJobIdStepIndex',
      logger))(db, jobID, parseInt(workflowStepIndex) + 1);

    const preprocessedWorkItems: WorkItemUpdateQueueItem[] = await Promise.all(
      groups[workflowStepIndex].map(async (item: WorkItemUpdateQueueItem) => {
        const { update, operation } = item;
        const result = await preprocessWorkItem(update, operation, logger, nextWorkflowStep);
        item.preprocessResult = result;
        return item;
      }));
    await processWorkItems(jobID, parseInt(workflowStepIndex), preprocessedWorkItems, logger);
  }
  const durationMs = new Date().getTime() - startTime;
  logger.info('timing.HWIUWJI.batch.end', { durationMs });
}

/**
 * This function processes a batch of work item updates.
 * It first creates a map of jobIDs to updates, then it processes each job's updates.
 * It calls the function handleBatchWorkItemUpdatesWithJobId to handle the updates.
 * @param updates - List of work item updates read from the queue
 * @param logger - Logger to use
 */
export async function handleBatchWorkItemUpdates(
  updates: WorkItemUpdateQueueItem[],
  logger: Logger): Promise<void> {
  logger.debug(`Processing ${updates.length} work item updates`);
  // create a map of jobIDs to updates
  const jobUpdates: Record<string, WorkItemUpdateQueueItem[]> =
    await updates.reduce(async (acc, item) => {
      const { workItemID } = item.update;
      const jobID = await getJobIdForWorkItem(workItemID);
      if (!jobID) {
        logger.error(`Received a message to process a work item that could not be found in the jobs table ${workItemID}.`, item);
      } else {
        logger.debug(`Processing work item update for job ${jobID}`);
        const accValue = await acc;
        if (accValue[jobID]) {
          accValue[jobID].push(item);
        } else {
          accValue[jobID] = [item];
        }
        return accValue;
      }
    }, {});
  // process each job's updates
  for (const jobID in jobUpdates) {
    const startTime = Date.now();
    logger.debug(`Processing ${jobUpdates[jobID].length} work item updates for job ${jobID}`);
    await handleBatchWorkItemUpdatesWithJobId(jobID, jobUpdates[jobID], logger);
    const endTime = Date.now();
    logger.debug(`Processing ${jobUpdates[jobID].length} work item updates for job ${jobID} took ${endTime - startTime} ms`);
  }
}

/**
 * This function processes a batch of work item updates from the queue.
 * @param queueType - Type of the queue to read from
 */
export async function batchProcessQueue(queueType: WorkItemQueueType): Promise<number> {
  const queue = getQueueForType(queueType);
  const startTime = Date.now();
  // use a smaller batch size for the large item update queue otherwise use the SQS max batch size
  // of 10
  const largeItemQueueBatchSize = Math.min(env.largeWorkItemUpdateQueueMaxBatchSize, 10);
  const otherQueueBatchSize = 10; // the SQS max batch size
  const queueBatchSize = queueType === WorkItemQueueType.LARGE_ITEM_UPDATE
    ? largeItemQueueBatchSize : otherQueueBatchSize;
  defaultLogger.debug(`Polling queue ${queueType} for ${queueBatchSize} messages`);
  const messages = await queue.getMessages(queueBatchSize);
  if (messages.length < 1) {
    return messages.length;
  }

  defaultLogger.debug(`Processing ${messages.length} work item updates from queue`);

  if (queueType === WorkItemQueueType.LARGE_ITEM_UPDATE) {
    // process each message individually
    for (const msg of messages) {
      try {
        const updateItem: WorkItemUpdateQueueItem = JSON.parse(msg.body);
        const { update, operation } = updateItem;
        defaultLogger.debug(`Processing work item update from queue for work item ${update.workItemID} and status ${update.status}`);
        await handleWorkItemUpdate(update, operation, defaultLogger);
      } catch (e) {
        defaultLogger.error(`Error processing work item update from queue: ${e}`);
      }
      try {
        // delete the message from the queue even if there was an error updating the work-item
        // so that we don't keep processing the same message over and over
        await queue.deleteMessage(msg.receipt);
      } catch (e) {
        defaultLogger.error(`Error deleting work item update from queue: ${e}`);
      }
    }
  } else {
    // potentially process all the messages at once. this actually calls `handleBatchWorkItemUpdates`,
    // which processes each job's updates individually right now. this just leaves the possibility
    // open for that function to be updated to process all the updates at once in a more efficient
    // manner. It also allows us to delete all the messages from the queue at once, which is more
    // efficient than deleting them one at a time.
    const updates: WorkItemUpdateQueueItem[] = messages.map((msg) => JSON.parse(msg.body));
    try {
      await exports.handleBatchWorkItemUpdates(updates, defaultLogger);
    } catch (e) {
      defaultLogger.error(`Error processing work item updates from queue: ${e}`);
    }
    // delete all the messages from the queue at once (slightly more efficient)
    try {
      await queue.deleteMessages(messages.map((msg) => msg.receipt));
    } catch (e) {
      defaultLogger.error(`Error deleting work item updates from queue: ${e}`);
    }
  }
  const endTime = Date.now();
  defaultLogger.debug(`Processed ${messages.length} work item updates from queue in ${endTime - startTime} ms`);
  return messages.length;
}

/**
 * Update any jobs that have have updatedAt older than their most recently updated
 * work-item
 * TODO - this is a good candidate to be moved to a separate service
 */
export async function updateJobs(): Promise<void> {
  // get all the jobIDs for jobs that have not been updated since before
  // their latest work-item update
  // stream the results as this list might be very large
  console.log('UPDATING JOBS ========================================');
  const stream = db('jobs as j')
    .distinct('j.jobID')
    .join('work_items as w', 'j.jobID', 'w.jobID')
    .where('j.updatedAt', '<', db.ref('w.updatedAt'))
    .stream();

  for await (const row of stream) {
    console.log(row);
    // await db.transaction(async (tx) => {
    //   const { job } = await Job.byJobID(tx, row.jobID, false, true);

    //   // The number of 'hits' returned by a query-cmr could be less than when CMR was first
    //   // queried by harmony due to metadata deletions from CMR, so we update the job to reflect
    //   // that there are fewer items and to know when no more query-cmr jobs should be created.
    //   if (hits && job.numInputGranules > hits) {
    //     job.numInputGranules = hits;

    //     jobSaveStartTime = new Date().getTime();
    //     await job.save(tx);
    //     durationMs = new Date().getTime() - jobSaveStartTime;
    //     logger.info('timing.HWIUWJI.job.save.end', { durationMs });

    //     await (await logAsyncExecutionTime(
    //       updateCmrWorkItemCount,
    //       'HWIUWJI.updateCmrWorkItemCount',
    //       logger))(tx, job);
    //   }

    //   await job.updateProgress(tx);

    //   await job.save(tx);
    // });
  }
}


/**
   * Update any workflow steps that have work-items that were updated more recently than the
   * workflow step
   */
export async function updateWorkflowSteps(): Promise<void> {
  // get the workflow steps that have work-items that have been updated more recently than the
  // step, along with the range of updatedAt values for the newer work-items for each step
  const stream = db('workflow_steps as ws')
    .column(['ws.id'])
    .min('w.updatedAt')
    .max('w.updatedAt')
    .join('work_items as w', function () {
      this
        .on('ws.jobID', 'w.jobID')
        .on('ws.stepIndex', 'w.workflowStepIndex');
    })
    .where('ws.updatedAt', '<', db.ref('w.updatedAt'))
    .whereIn('w.status', ['successful', 'failed'])
    .groupBy('ws.id')
    .stream();


  console.log('UPDATING WORKFLOW STEPS ================================');

  for await (const row of stream) {
    console.log(row);
    await db.transaction(async (tx) => {
      try {

        const workflowStep = await getWorkflowStepById(tx, row.id);
        // TEST CODE
        console.log(JSON.stringify(workflowStep.updatedAt));
        workflowStep.updatedAt = new Date(row.max);
        // console.log(JSON.stringify(workflowStep));
        // TODO why does this not save the timestamp?
        // await workflowStep.save(tx);
        await tx('workflow_steps').update({ updatedAt: row.max }).where('id', row.id);

      } catch (e) {
        console.log(e);
      }

    });
  }

}

// If this job is complete then delete all the work for it from the user_work table

// if (job.hasTerminalStatus() && status !== WorkItemStatus.CANCELED) {
//   logger.warn(`Job was already ${job.status}.`);
//   const numRowsDeleted = await (await logAsyncExecutionTime(
//     deleteUserWorkForJob,
//     'HWIUWJI.deleteUserWorkForJob',
//     logger))(tx, jobID);
//   logger.warn(`Removed ${numRowsDeleted} from user_work table for job ${jobID}.`);
//   // Note work item will stay in the running state, but the reaper will clean it up
//   return;
// }

// update user_work_table

// await (await logAsyncExecutionTime(
//   incrementReadyAndDecrementRunningCounts,
//   'HWIUWJI.incrementReadyAndDecrementRunningCounts',
//   logger))(tx, jobID, workItem.serviceID);




export default class Updater implements Worker {
  async start(repeat = true): Promise<void> {
    defaultLogger.debug('Starting updater');
    while (repeat) {
      try {
        // console.log('SLEEPING');
        // await sleep(5000);
        // console.log('DONE SLEEPING');
        console.log('PROCESSING QUEUE');
        const messageCount = await batchProcessQueue(env.workItemUpdateQueueType);
        console.log(`FOUND ${messageCount} MESSAGES ON QUEUE`);
        if (messageCount > 0) {
          await updateWorkflowSteps();
          await updateJobs();
        }
      } catch (e) {
        defaultLogger.error(e);
        await sleep(env.workItemUpdateQueueProcessorDelayAfterErrorSec * 1000);
      }
    }
  }
}
