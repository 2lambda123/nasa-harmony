import { Logger } from 'winston';
import {
  WorkItemUpdateQueueItem,
  handleWorkItemUpdate,
  handleWorkItemUpdateWithJobId,
  preprocessWorkItem,
  processWorkItems } from '../../../harmony/app/backends/workflow-orchestration/work-item-updates';
import { getJobIdForWorkItem } from '../../../harmony/app/models/work-item';
import { default as defaultLogger } from '../../../harmony/app/util/log';
import { WorkItemQueueType } from '../../../harmony/app/util/queue/queue';
import { getQueueForType } from '../../../harmony/app/util/queue/queue-factory';
import sleep from '../../../harmony/app/util/sleep';
import { Worker } from '../../../harmony/app/workers/worker';
import env from '../util/env';

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
 * @returns an array of receipts for the updates that did not time out
 */
async function handleBatchWorkItemUpdatesWithJobId(
  jobID: string,
  updates: WorkItemUpdateQueueItem[],
  logger: Logger): Promise<string[]> {
  const startTime = new Date().getTime();
  const receipts = [];
  logger.debug(`Processing ${updates.length} work item updates for job ${jobID}`);
  // group updates by workflow step index to make sure at least one completion check is performed for each step
  const groups = groupByWorkflowStepIndex(updates);
  for (const workflowStepIndex of Object.keys(groups)) {
    if (groups[workflowStepIndex].length == 1) {
      const queueItem: WorkItemUpdateQueueItem = groups[workflowStepIndex][0];
      const { update, operation } = queueItem;
      const didNotTimeOut = await handleWorkItemUpdateWithJobId(jobID, update, operation, logger);
      if (didNotTimeOut) {
        receipts.push(queueItem.receipt);
      }
    } else {
      const workItems: WorkItemUpdateQueueItem[] = groups[workflowStepIndex];
      const preprocessedWorkItems: WorkItemUpdateQueueItem[] = await Promise.all(
        workItems.map(async (item: WorkItemUpdateQueueItem) => {
          const { update, operation } = item;
          const result = await preprocessWorkItem(update, operation, logger);
          item.preprocessResult = result;
          return item;
        }));
      const didNotTimeOut = await processWorkItems(jobID, parseInt(workflowStepIndex), preprocessedWorkItems, logger);
      if (didNotTimeOut) {
        for (const item of workItems) {
          receipts.push(item.receipt);
        }
      }
    }
  }
  const durationMs = new Date().getTime() - startTime;
  logger.debug('timing.HWIUWJI.batch.end', { durationMs });
  return receipts;
}

/**
 * This function processes a batch of work item updates.
 * It first creates a map of jobIDs to updates, then it processes each job's updates.
 * It calls the function handleBatchWorkItemUpdatesWithJobId to handle the updates.
 * @param updates - List of work item updates read from the queue
 * @param logger - Logger to use
 * @returns an array of receipts for the updates that did not time out
 */
export async function handleBatchWorkItemUpdates(
  updates: WorkItemUpdateQueueItem[],
  logger: Logger): Promise<string[]> {
  logger.debug(`Processing ${updates.length} work item updates`);
  const receipts = [];
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
    const jobReceipts = await handleBatchWorkItemUpdatesWithJobId(jobID, jobUpdates[jobID], logger);
    console.log(jobReceipts);
    receipts.push(...jobReceipts);
    const endTime = Date.now();
    logger.debug(`Processing ${jobUpdates[jobID].length} work item updates for job ${jobID} took ${endTime - startTime} ms`);
  }
  return receipts;
}

/**
 * This function processes a batch of work item updates from the queue.
 * @param queueType - Type of the queue to read from
 */
export async function batchProcessQueue(queueType: WorkItemQueueType): Promise<void> {
  const queue = getQueueForType(queueType);
  const startTime = Date.now();
  // use a smaller batch size for the large item update queue otherwise use the SQS max batch size
  // of 10
  console.log(env.largeWorkItemUpdateQueueMaxBatchSize);
  const largeItemQueueBatchSize = Math.min(env.largeWorkItemUpdateQueueMaxBatchSize, 10);
  const otherQueueBatchSize = 10; // the SQS max batch size
  const queueBatchSize = queueType === WorkItemQueueType.LARGE_ITEM_UPDATE
    ? largeItemQueueBatchSize : otherQueueBatchSize;
  defaultLogger.debug(`Polling queue ${queueType} for ${queueBatchSize} messages`);
  const messages = await queue.getMessages(queueBatchSize);
  if (messages.length < 1) {
    return;
  }
  console.log(`Processing ${messages.length} work item updates from queue`);
  defaultLogger.debug(`Processing ${messages.length} work item updates from queue`);
  console.log(queueType);
  if (queueType === WorkItemQueueType.LARGE_ITEM_UPDATE) {
    // process each message individually
    for (const msg of messages) {
      let didNotTimeOut: boolean;
      try {
        const updateItem: WorkItemUpdateQueueItem = new WorkItemUpdateQueueItem(msg);
        const { update, operation } = updateItem;
        defaultLogger.debug(`Processing work item update from queue for work item ${update.workItemID} and status ${update.status}`);
        console.log(`Processing work item update from queue for work item ${update.workItemID} and status ${update.status}`)
        const workItemLogger = defaultLogger.child({ workItemId: update.workItemID });
        didNotTimeOut = await handleWorkItemUpdate(update, operation, workItemLogger);
      } catch (e) {
        console.log(`Error processing work item update from queue: ${e}`);
        defaultLogger.error(`Error processing work item update from queue: ${e}`);
      }
      try {
        if (didNotTimeOut) {
          // delete the message from the queue even if there was a non-timeout-related
          // error updating the work-item so that we don't keep processing the same message over and over
          await queue.deleteMessage(msg.receipt);
        }
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
    const updates: WorkItemUpdateQueueItem[] = messages.map((msg) => new WorkItemUpdateQueueItem(msg));
    let receipts: string[] = messages.map((msg) => msg.receipt);
    try {
      // all the receipts for the updates that did not time out
      receipts = await exports.handleBatchWorkItemUpdates(updates, defaultLogger);
      console.log(receipts);
    } catch (e) {
      defaultLogger.error(`Error processing work item updates from queue: ${e}`);
    }
    // delete all the messages from the queue at once (slightly more efficient)
    try {
      await queue.deleteMessages(receipts);
    } catch (e) {
      defaultLogger.error(`Error deleting work item updates from queue: ${e}`);
    }
  }
  const endTime = Date.now();
  defaultLogger.debug(`Processed ${messages.length} work item updates from queue in ${endTime - startTime} ms`);
}


export default class Updater implements Worker {
  async start(repeat = true): Promise<void> {
    defaultLogger.debug('Starting updater');
    while (repeat) {
      try {
        await batchProcessQueue(env.workItemUpdateQueueType);
      } catch (e) {
        defaultLogger.error(e);
        await sleep(env.workItemUpdateQueueProcessorDelayAfterErrorSec * 1000);
      }
    }
  }
}
