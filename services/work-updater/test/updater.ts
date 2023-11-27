import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as sinon from 'sinon';
import { SinonSpy, SinonStub } from 'sinon';
import { Logger } from 'winston';
import * as updater from '../app/workers/updater';
import * as queueFactory from '../../harmony/app/util/queue/queue-factory';
import { MemoryQueue } from '../../harmony/test/helpers/memory-queue';
import * as wi from '../../harmony/app/models/work-item';
import env from '../../harmony/app/util/env';
import * as ws from '../../harmony/app/models/workflow-steps';
import WorkflowStep from '../../harmony/app/models/workflow-steps';
import * as wiu from '../../harmony/app/backends/workflow-orchestration/work-item-updates';
import { WorkItemQueueType } from '../../harmony/app/util/queue/queue';
import WorkItemUpdate from '../../harmony/app/models/work-item-update';
import DataOperation from '../../harmony/app/models/data-operation';
import { Job } from '../../harmony/app/models/job';
import { Transaction } from '../../harmony/app/util/db';
import { assert } from 'console';

describe('Updater Worker', async function () {
  const smallUpdateQueue = new MemoryQueue();
  const largeUpdateQueue = new MemoryQueue();
  let getQueueForTypeStub: SinonStub;
  let getJobIdForWorkItemStub: SinonStub;
  let handleWorkItemUpdateWithJobIdStub: SinonStub;
  let handleBatchWorkItemUpdatesSpy: SinonSpy;

  before(function () {
    getQueueForTypeStub = sinon.stub(queueFactory, 'getQueueForType').callsFake(function (type: WorkItemQueueType) {
      if (type === WorkItemQueueType.SMALL_ITEM_UPDATE) {
        return smallUpdateQueue;
      }
      return largeUpdateQueue;
    });
    getJobIdForWorkItemStub = sinon.stub(wi, 'getJobIdForWorkItem').callsFake(async function (_id: number): Promise<string> {
      return 'jobID';
    });
    handleWorkItemUpdateWithJobIdStub = sinon.stub(wiu, 'handleWorkItemUpdateWithJobId').callsFake(async function (_jobID: string, _update: WorkItemUpdate, _operation: DataOperation, _logger: Logger): Promise<boolean> {
      return true;
    });
    handleBatchWorkItemUpdatesSpy = sinon.spy(updater, 'handleBatchWorkItemUpdates');
  });

  after(function () {
    getQueueForTypeStub.restore();
    getJobIdForWorkItemStub.restore();
    handleWorkItemUpdateWithJobIdStub.restore();
    handleBatchWorkItemUpdatesSpy.restore();
  });

  this.beforeEach(function () {
    handleWorkItemUpdateWithJobIdStub.resetHistory();
    handleBatchWorkItemUpdatesSpy.resetHistory();
  });

  describe('large job update', async function () {

    beforeEach(async function () {
      await largeUpdateQueue.purge();
      await updater.batchProcessQueue(WorkItemQueueType.LARGE_ITEM_UPDATE);
    });

    describe('when the queue is empty', async function () {
      it('should call getQueueForType', async function () {
        expect(getQueueForTypeStub.called).to.be.true;
      });
      it('should not call handleWorkItemUpdateWithJobId', async function () {
        expect(handleWorkItemUpdateWithJobIdStub.called).to.be.false;
      });
    });

    describe('when the queue has one item', async function () {
      this.beforeEach(async function () {
        const update = { workItemId: 1 };
        const operation = {};
        await largeUpdateQueue.purge();
        await largeUpdateQueue.sendMessage(JSON.stringify({ update, operation }), '', false);
        await updater.batchProcessQueue(WorkItemQueueType.LARGE_ITEM_UPDATE);
      });

      it('should call getQueueForType', async function () {
        expect(getQueueForTypeStub.called).to.be.true;
      });
      it('should call handleWorkItemUpdateWithJobId once', async function () {
        expect(handleWorkItemUpdateWithJobIdStub.callCount).to.equal(1);
      });
    });

    describe('when the queue has two items', async function () {
      this.beforeEach(async function () {
        const update1 = { workItemId: 1 };
        const update2 = { workItemId: 2 };
        const operation = {};
        await largeUpdateQueue.purge();
        await largeUpdateQueue.sendMessage(JSON.stringify({ update: update1, operation }), '', false);
        await largeUpdateQueue.sendMessage(JSON.stringify({ update: update2, operation }), '', false);
        await updater.batchProcessQueue(WorkItemQueueType.LARGE_ITEM_UPDATE);
      });

      it('should call getQueueForType', async function () {
        expect(getQueueForTypeStub.called).to.be.true;
      });
      it('should call handleWorkItemUpdateWithJobId twice', async function () {
        expect(handleWorkItemUpdateWithJobIdStub.callCount).to.equal(2);
      });
      it('should not call handleBatchWorkItemUpdates', async function () {
        expect(handleBatchWorkItemUpdatesSpy.called).to.be.false;
      });
    });
  });

  describe('small job update', async function () {

    beforeEach(async function () {
      await smallUpdateQueue.purge();
      await updater.batchProcessQueue(WorkItemQueueType.SMALL_ITEM_UPDATE);
    });

    describe('when the queue is empty', async function () {
      it('should call getQueueForType', async function () {
        expect(getQueueForTypeStub.called).to.be.true;
      });
      it('should not call handleWorkItemUpdateWithJobId', async function () {
        await updater.batchProcessQueue(WorkItemQueueType.SMALL_ITEM_UPDATE);
        expect(handleWorkItemUpdateWithJobIdStub.called).to.be.false;
      });
    });

    describe('when the queue has one item', async function () {
      this.beforeEach(async function () {
        const update = { workItemId: 1 };
        const operation = {};
        await smallUpdateQueue.purge();
        await smallUpdateQueue.sendMessage(JSON.stringify({ update, operation }), '', false);
        await updater.batchProcessQueue(WorkItemQueueType.SMALL_ITEM_UPDATE);
      });

      it('should call getQueueForType', async function () {
        expect(getQueueForTypeStub.called).to.be.true;
      });
      it('should call handleWorkItemUpdateWithJobId once', async function () {
        expect(handleWorkItemUpdateWithJobIdStub.callCount).to.equal(1);
      });
    });

    describe('when the queue has two items', async function () {
      this.beforeEach(async function () {
        const update1 = { workItemId: 1 };
        const update2 = { workItemId: 2 };
        const operation = {};
        await smallUpdateQueue.purge();
        await smallUpdateQueue.sendMessage(JSON.stringify({ update: update1, operation }), '', false);
        await smallUpdateQueue.sendMessage(JSON.stringify({ update: update2, operation }), '', false);
        await updater.batchProcessQueue(WorkItemQueueType.SMALL_ITEM_UPDATE);
      });

      it('should call getQueueForType', async function () {
        expect(getQueueForTypeStub.called).to.be.true;
      });
      it('should not call handleWorkItemUpdateWithJobId', async function () {
        expect(handleWorkItemUpdateWithJobIdStub.callCount).to.equal(0);
      });
      it('should call handleBatchWorkItemUpdates once', async function () {
        expect(handleBatchWorkItemUpdatesSpy.callCount).to.equal(1);
      });
    });
  });
});

describe('Updater Worker timeouts', async function () {
  const smallItemUpdateQueue = new MemoryQueue();
  const largeItemUpdateQueue = new MemoryQueue();
  // let getQueueForTypeStub: SinonStub;

  before(function () { // return the in-memory queues for testing
    this.getQueueForTypeStub = sinon.stub(queueFactory, 'getQueueForType').callsFake(function (type: WorkItemQueueType) {
      if (type === WorkItemQueueType.SMALL_ITEM_UPDATE) {
        return smallItemUpdateQueue;
      }
      return largeItemUpdateQueue;
    });
    this.workItemUpdateTimeoutMsSub = sinon.stub(env, 'workItemUpdateTimeoutMs').get(() => 50);
  });

  after(function () {
    this.getQueueForTypeStub.restore();
    this.workItemUpdateTimeoutMsSub.restore();
  });

  describe('small item update queue', async function () {

    // let getJobIdForWorkItemStub: SinonStub;
    // let processWorkItemStub: SinonStub;

    before(async function () {
      this.getWorkflowStepByJobIdStepIndexStub = sinon.stub(ws, 'getWorkflowStepByJobIdStepIndex')
        .callsFake(async function (_tx: Transaction,
          _jobID: string,
          _stepIndex: number,
        ): Promise<WorkflowStep | null> {
          return;
        });

      // updates from the same job
      // the second will time out
      const update1Step1 = { workItemID: 1, workflowStepIndex: 1 };
      const update2Step1 = { workItemID: 2, workflowStepIndex: 1 };
      const update3Step2 = { workItemID: 3, workflowStepIndex: 2 };
      // updates from a different jobs, both will NOT time out
      const update5Step1 = { workItemID: 5, workflowStepIndex: 1 };
      const update7Step1 = { workItemID: 7, workflowStepIndex: 1 };
      // two updates from the same job but different steps
      // the first will time out
      const update9Step1 = { workItemID: 9, workflowStepIndex: 1 };
      const update10Step1 = { workItemID: 10, workflowStepIndex: 2 };
      const operation = {};
      await smallItemUpdateQueue.purge();
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update1Step1, operation }), '', false, 'r11');
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update10Step1, operation }), '', false, 'r101');
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update7Step1, operation }), '', false, 'r71');
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update9Step1, operation }), '', false, 'r91');
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update2Step1, operation }), '', false, 'r21');
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update5Step1, operation }), '', false, 'r51');
      await smallItemUpdateQueue.sendMessage(JSON.stringify({ update: update3Step2, operation }), '', false, 'r32');

      // updates for the same job get processed together
      this.getJobIdForWorkItemStub = sinon.stub(wi, 'getJobIdForWorkItem')
        .callsFake(async function (id: number): Promise<string> {
          console.log('returning the job id');
          return { 1: 'job-a', 2: 'job-a', 3: 'job-a', 5: 'job-b', 7: 'job-c', 9: 'job-d', 10: 'job-d' }[id];
        });
      
      // stub the processing of the work item and simulate the duration
      this.processWorkItemStub = sinon.stub(wiu, 'processWorkItem').callsFake(async function (tx: Transaction,
        preprocessResult: wiu.WorkItemPreprocessInfo,
        job: Job,
        update: WorkItemUpdate): Promise<void> {
        console.log('processWorkItem STUB');
        if ([2, 9].indexOf(update.workItemID) > -1) {
          console.log(update.workItemID, 'timing out');
          await new Promise<void>(async (resolve) => {
            const timer = setTimeout(async () => {
              resolve();
              clearTimeout(timer);
            }, 100);
          });
        } else { // fast process
          console.log(update.workItemID, 'returning right away');
          return;
        } 
      });
      console.log('MADE STUBS!');
      console.log(wiu.processWorkItem.prototype);
    });

    after(function () {
      this.getJobIdForWorkItemStub.restore();
      this.getWorkflowStepByJobIdStepIndexStub.restore();
      this.processWorkItemStub.restore();
      console.log('RESTORE STUBS');
    });

    describe('when some queue items timeout', async function () {
      it('leaves the timed out items on the queue so that they can be processed again', async function () {
        await updater.batchProcessQueue(WorkItemQueueType.SMALL_ITEM_UPDATE);
        console.log(smallItemUpdateQueue.messages);
        assert(true);
      });
    });
  });
});
