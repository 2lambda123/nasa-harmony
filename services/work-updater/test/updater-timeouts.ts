// import { expect } from 'chai';
// import { describe, it } from 'mocha';
// import * as sinon from 'sinon';
// import * as updater from '../app/workers/updater';
// import * as queueFactory from '../../harmony/app/util/queue/queue-factory';
// import { MemoryQueue } from '../../harmony/test/helpers/memory-queue';
// import WorkItem from '../../harmony/app/models/work-item';
// import harmonyEnv from '../../harmony/app/util/env';
// import workUpdaterEnv from '../app/util/env';
// import WorkflowStep from '../../harmony/app/models/workflow-steps';
// import * as wiu from '../../harmony/app/backends/workflow-orchestration/work-item-updates';
// import { WorkItemQueueType } from '../../harmony/app/util/queue/queue';
// import WorkItemUpdate from '../../harmony/app/models/work-item-update';
// import { Job } from '../../harmony/app/models/job';
// import * as db from '../../harmony/app/util/db';
// import { hookTransaction } from './helpers/db';
// import { WorkItemStatus } from '../../harmony/app/models/work-item-interface';
// import { SinonStub } from 'sinon';


// describe('Updater Worker timeouts', async function () {
//   const smallItemUpdateQueue = new MemoryQueue();
//   const largeItemUpdateQueue = new MemoryQueue();

//   const update1Step1 = { workItemID: 1, workflowStepIndex: 1 };
//   const update2Step1 = { workItemID: 2, workflowStepIndex: 1 };
//   const update3Step2 = { workItemID: 3, workflowStepIndex: 2 };
//   const update5Step1 = { workItemID: 5, workflowStepIndex: 1 };
//   const update7Step1 = { workItemID: 7, workflowStepIndex: 1 };
//   const update9Step1 = { workItemID: 9, workflowStepIndex: 1 };
//   const update10Step2 = { workItemID: 10, workflowStepIndex: 2 };

//   const buildProcessWorkItemStub = (timeoutItemIds: number[]): SinonStub =>
//     sinon.stub(wiu, 'processWorkItem').callsFake(async function (tx: db.Transaction,
//       preprocessResult: wiu.WorkItemPreprocessInfo,
//       job: Job,
//       update: WorkItemUpdate): Promise<void> {
//       if (timeoutItemIds.indexOf(update.workItemID) > -1) {
//         await new Promise<void>(async (resolve) => {
//           const timer = setTimeout(async () => {
//             resolve();
//             clearTimeout(timer);
//             // should time out
//           }, 10); // greater than env.workItemUpdateTimeoutMs
//         });
//       } else { // fast process
//         return;
//       }
//     });

//   hookTransaction();

//   before(async function () {
//     const jobA = new Job({ jobID: 'job-a', request: 'http://localhost:3000/req', requestId: '', username: '', numInputGranules: 10, collectionIds: [] });
//     await jobA.save(this.trx);
//     await ((new WorkflowStep({ jobID: 'job-a', serviceID: 'x', stepIndex: 1, workItemCount: 10, operation: '{}' })).save(this.trx));
//     await ((new WorkflowStep({ jobID: 'job-a', serviceID: 'x', stepIndex: 2, workItemCount: 10, operation: '{}' })).save(this.trx));
//     await (new WorkItem({ jobID: 'job-a', workflowStepIndex: 1, id: 1, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));
//     await (new WorkItem({ jobID: 'job-a', workflowStepIndex: 1, id: 2, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));
//     await (new WorkItem({ jobID: 'job-a', workflowStepIndex: 2, id: 3, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));

//     const jobB = new Job({ jobID: 'job-b', request: 'http://localhost:3000/req', requestId: '', username: '', numInputGranules: 10, collectionIds: [] });
//     await jobB.save(this.trx);
//     await ((new WorkflowStep({ jobID: 'job-b', serviceID: 'x', stepIndex: 1, workItemCount: 10, operation: '{}' })).save(this.trx));
//     await (new WorkItem({ jobID: 'job-b', workflowStepIndex: 1, id: 5, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));

//     const jobC = new Job({ jobID: 'job-c', request: 'http://localhost:3000/req', requestId: '', username: '', numInputGranules: 10, collectionIds: [] });
//     await jobC.save(this.trx);
//     await ((new WorkflowStep({ jobID: 'job-c', serviceID: 'x', stepIndex: 1, workItemCount: 10, operation: '{}' })).save(this.trx));
//     await (new WorkItem({ jobID: 'job-c', workflowStepIndex: 1, id: 7, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));

//     const jobD = new Job({ jobID: 'job-d', request: 'http://localhost:3000/req', requestId: '', username: '', numInputGranules: 10, collectionIds: [] });
//     await jobD.save(this.trx);
//     await ((new WorkflowStep({ jobID: 'job-d', serviceID: 'x', stepIndex: 1, workItemCount: 10, operation: '{}' })).save(this.trx));
//     await ((new WorkflowStep({ jobID: 'job-d', serviceID: 'x', stepIndex: 2, workItemCount: 10, operation: '{}' })).save(this.trx));
//     await (new WorkItem({ jobID: 'job-d', workflowStepIndex: 1, id: 9, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));
//     await (new WorkItem({ jobID: 'job-d', workflowStepIndex: 2, id: 10, serviceID: 'x', status: WorkItemStatus.SUCCESSFUL }).save(this.trx));

//     await this.trx.commit();

//     this.getQueueForTypeStub = sinon.stub(queueFactory, 'getQueueForType').callsFake(function (type: WorkItemQueueType) {
//       if (type === WorkItemQueueType.SMALL_ITEM_UPDATE) {
//         return smallItemUpdateQueue;
//       }
//       return largeItemUpdateQueue;
//     });
//     this.workItemUpdateTimeoutMsSub = sinon.stub(harmonyEnv, 'workItemUpdateTimeoutMs').get(() => 9);
//     this.largeWorkItemUpdateQueueMaxBatchSizeStub = sinon.stub(workUpdaterEnv, 'largeWorkItemUpdateQueueMaxBatchSize').get(() => 10);
//   });

//   after(function () {
//     this.getQueueForTypeStub.restore();
//     this.workItemUpdateTimeoutMsSub.restore();
//     this.largeWorkItemUpdateQueueMaxBatchSizeStub.restore();
//   });

//   describe('small item update queue', async function () {

//     before(async function () {
//       this.processWorkItemStub = buildProcessWorkItemStub([2, 9]);

//       const operation = {};
//       await smallItemUpdateQueue.purge();
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update1Step1, operation }), '', false, 'r11');
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update10Step2, operation }), '', false, 'r102');
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update7Step1, operation }), '', false, 'r71');
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update9Step1, operation }), '', false, 'r91');
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update2Step1, operation }), '', false, 'r21');
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update5Step1, operation }), '', false, 'r51');
//       await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update3Step2, operation }), '', false, 'r32');
//     });

//     after(function () {
//       this.processWorkItemStub.restore();
//     });

//     describe('when some queue items timeout', async function () {
//       it('leaves the timed out items on the queue so that they can be processed again', async function () {
//         await updater.batchProcessQueue(WorkItemQueueType.SMALL_ITEM_UPDATE);
//         expect(smallItemUpdateQueue.messages).deep.equal([
//           { // times out along with workItem 2 since they belong to the same job and step, and thus get processed together
//             receipt: 'r11',
//             body: '{"update":{"workItemID":1,"workflowStepIndex":1},"operation":{}}',
//             isVisible: false,
//           },
//           {
//             receipt: 'r91',
//             body: '{"update":{"workItemID":9,"workflowStepIndex":1},"operation":{}}',
//             isVisible: false,
//           },
//           {
//             receipt: 'r21',
//             body: '{"update":{"workItemID":2,"workflowStepIndex":1},"operation":{}}',
//             isVisible: false,
//           },
//         ],
//         );
//       });
//     });
//   });

//   describe('large item update queue', async function () {

//     before(async function () {
//       this.processWorkItemStub = buildProcessWorkItemStub([1, 7, 10]);

//       const operation = {};
//       await largeItemUpdateQueue.purge();
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update1Step1, operation }), '', false, 'r11');
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update10Step2, operation }), '', false, 'r102');
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update7Step1, operation }), '', false, 'r71');
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update9Step1, operation }), '', false, 'r91');
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update2Step1, operation }), '', false, 'r21');
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update5Step1, operation }), '', false, 'r51');
//       await largeItemUpdateQueue.sendMessage(JSON.stringify({ update: update3Step2, operation }), '', false, 'r32');
//     });

//     after(function () {
//       this.processWorkItemStub.restore();
//     });

//     describe('when some queue items timeout', async function () {
//       it('leaves the timed out items on the queue so that they can be processed again', async function () {
//         await updater.batchProcessQueue(WorkItemQueueType.LARGE_ITEM_UPDATE);
//         expect(largeItemUpdateQueue.messages).deep.equal([
//           {
//             receipt: 'r11',
//             body: '{"update":{"workItemID":1,"workflowStepIndex":1},"operation":{}}',
//             isVisible: false,
//           },
//           {
//             receipt: 'r102',
//             body: '{"update":{"workItemID":10,"workflowStepIndex":2},"operation":{}}',
//             isVisible: false,
//           },
//           {
//             receipt: 'r71',
//             body: '{"update":{"workItemID":7,"workflowStepIndex":1},"operation":{}}',
//             isVisible: false,
//           },
//         ],
//         );
//       });
//     });
//   });
// });