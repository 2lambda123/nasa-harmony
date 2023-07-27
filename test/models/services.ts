import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { stub } from 'sinon';
import StubService from '../helpers/stub-service';
import { hookRangesetRequest } from '../helpers/ogc-api-coverages';
import hookServersStartStop from '../helpers/servers';
import { getMaxSynchronousGranules } from '../../app/models/services/base-service';
import DataOperation, { CURRENT_SCHEMA_VERSION } from '../../app/models/data-operation';
import { chooseServiceConfig, buildService } from '../../app/models/services';
import { env } from '@harmony/util';
import TurboService from '../../app/models/services/turbo-service';
import { buildOperation } from '../helpers/data-operation';
import _ from 'lodash';

describe('services.chooseServiceConfig and services.buildService', function () {
  describe("when the operation's collection is configured for several services", function () {
    beforeEach(function () {
      const collectionId = 'C123-TEST';
      const shortName = 'harmony_example';
      const versionId = '1';
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId);
      this.operation = operation;
      this.config = [
        {
          name: 'should-never-be-picked',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
          capabilities: {
            output_formats: ['none'],
          },
        },
        {
          name: 'tiff-png-bbox-service',
          type: { name: 'http' },
          collections: [{ id: collectionId }],
          capabilities: {
            output_formats: ['image/tiff', 'image/png'],
            subsetting: {
              bbox: true,
            },
          },
        },
        {
          name: 'tiff-png-reprojection-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
          capabilities: {
            output_formats: ['image/tiff', 'image/png'],
            reprojection: true,
          },
        },
        {
          name: 'dimension-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
          capabilities: {
            subsetting: {
              dimension: true,
            },
          },
        },
        {
          name: 'shapefile-tiff-netcdf-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
          capabilities: {
            output_formats: ['image/tiff', 'application/x-netcdf4'],
            subsetting: {
              shape: true,
            },
          },
        },
        {
          name: 'temporal-netcdf-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
          capabilities: {
            output_formats: ['application/x-netcdf4'],
            subsetting: {
              temporal: true,
            },
          },
        },
        {
          name: 'netcdf-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
          capabilities: {
            output_formats: ['application/x-netcdf4'],
            concatenation: true,
            subsetting: {
              temporal: false,
            },
          },
        },
      ];
    });

    describe('and both can produce the requested output type', function () {
      beforeEach(function () {
        this.operation.outputFormat = 'image/tiff';
      });

      it('returns the first service with tiff support for the collection', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('tiff-png-bbox-service');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        const service = buildService(serviceConfig, this.operation);
        expect(service.constructor.name).to.equal('HttpService');
      });
    });

    describe('and only the second can produce the requested output type', function () {
      beforeEach(function () {
        this.operation.outputFormat = 'image/png';
      });

      it('returns the first service with png support for the collection', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('tiff-png-bbox-service');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        const service = buildService(serviceConfig, this.operation);
        expect(service.constructor.name).to.equal('HttpService');
      });
    });

    describe('and neither can produce the requested output type', function () {
      beforeEach(function () {
        this.operation.outputFormat = 'image/gif';
      });

      it('returns the no-op service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('returns a message indicating that there were no services that could support the provided format', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: reformatting to image/gif on C123-TEST is unsupported');
      });
    });

    describe('and the request needs spatial subsetting', function () {
      beforeEach(function () {
        this.operation.boundingRectangle = [0, 0, 10, 10];
      });

      it('chooses the service that supports spatial subsetting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('tiff-png-bbox-service');
      });
    });

    describe('and the request needs both spatial subsetting and netcdf output, but no service supports that combination', function () {
      beforeEach(function () {
        this.operation.boundingRectangle = [0, 0, 10, 10];
        this.operation.outputFormat = 'application/x-netcdf4';
      });

      it('chooses the service that supports netcdf output, but not spatial subsetting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('shapefile-tiff-netcdf-service');
      });

      it('indicates that it could not clip based on the spatial extent', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('Data in output files may extend outside the spatial and temporal bounds you requested.');
      });
    });

    describe('and the request needs temporal subsetting and netcdf-4 format', function () {
      beforeEach(function () {
        this.operation.temporal = ['2022-01-05T01:00:00Z', '2023-01-05T01:00:00Z'];
        this.operation.outputFormat = 'application/x-netcdf4';
      });

      it('chooses the service that supports temporal subsetting and netcdf-4 format', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('temporal-netcdf-service');
      });
    });

    describe('and the request needs temporal subsetting and tiff format', function () {
      beforeEach(function () {
        this.operation.temporal = ['2022-01-05T01:00:00Z', '2023-01-05T01:00:00Z'];
        this.operation.outputFormat = 'image/tiff';
      });

      it('chooses the first service that supports tiff format, but not temporal subsetting since no service can perform both', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('tiff-png-bbox-service');
      });

      it('indicates that it could not clip based on the spatial extent', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('Data in output files may extend outside the spatial and temporal bounds you requested.');
      });
    });

    describe('and the request needs shapefile subsetting', function () {
      beforeEach(function () {
        this.operation.geojson = { pretend: 'geojson' };
      });

      it('chooses the service that supports shapefile subsetting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('shapefile-tiff-netcdf-service');
      });
    });

    describe('and the request needs dimension subsetting', function () {
      beforeEach(function () {
        this.operation.dimensions = [{ name: 'XDim', min: 10, max: 150 }];
      });

      it('chooses the service that supports dimension subsetting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('dimension-service');
      });
    });

    describe('and the request needs temporal, shapefile subsetting and reprojection, but no service supports that combination', function () {
      beforeEach(function () {
        this.operation.geojson = { pretend: 'geojson' };
        this.operation.temporal = ['2022-01-05T01:00:00Z', '2023-01-05T01:00:00Z'];
        this.operation.crs = 'EPSG:4326';
      });

      it('returns the service that supports reprojection, but not temporal or shapefile subsetting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('tiff-png-reprojection-service');
      });

      it('indicates that it could not clip based on the spatial or temporal extents', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('Data in output files may extend outside the spatial and temporal bounds you requested.');
      });
    });

    describe('and the request needs reprojection', function () {
      beforeEach(function () {
        this.operation.crs = 'EPSG:4326';
      });

      it('chooses the service that supports reprojection', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('tiff-png-reprojection-service');
      });
    });

    describe('and the request needs both reprojection and netcdf output, but no service supports that combination', function () {
      beforeEach(function () {
        this.operation.crs = 'EPSG:4326';
        this.operation.outputFormat = 'application/x-netcdf4';
      });

      it('returns the no-op service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('indicates the reason for choosing the no op service is the combination of reprojection and reformatting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: reprojection and reformatting to application/x-netcdf4 on C123-TEST is unsupported');
      });
    });

    describe('and the request needs spatial subsetting, reprojection, and netcdf output, but no service supports that combination', function () {
      beforeEach(function () {
        this.operation.crs = 'EPSG:4326';
        this.operation.outputFormat = 'application/x-netcdf4';
        this.operation.boundingRectangle = [0, 0, 10, 10];
      });

      it('returns the no-op service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('indicates the reason for choosing the no op service is the combination of reprojection and reformatting', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: reprojection and reformatting to application/x-netcdf4 on C123-TEST is unsupported');
      });
    });

    describe('and the request needs concatenation', function () {
      beforeEach(function () {
        this.operation.temporal = ['2022-01-05T01:00:00Z', '2023-01-05T01:00:00Z'];
        this.operation.boundingRectangle = [0, 0, 10, 10];
        this.operation.outputFormat = 'application/x-netcdf4';
        this.operation.model.concatenate = true;
      });

      it('chooses the service that supports concatenation and netcdf-4 format', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('netcdf-service');
      });
    });
  });

  describe("when the operation's collection has a single configured service", function () {
    beforeEach(function () {
      const collectionId = 'C123-TEST';
      const shortName = 'harmony_example';
      const versionId = '1';
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId);
      this.operation = operation;
      this.config = [
        {
          name: 'non-matching-service',
          type: { name: 'turbo' },
          collections: [{ id: 'C456-NOMATCH' }],
        },
        {
          name: 'matching-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
        },
      ];
    });

    it('returns the service configured for the collection', function () {
      const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
      expect(serviceConfig.name).to.equal('matching-service');
    });

    it('uses the correct service class when building the service', function () {
      const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
      const service = buildService(serviceConfig, this.operation);
      expect(service.constructor.name).to.equal('TurboService');
    });
  });

  describe('when one out of two services support variable subsetting', function () {
    const collectionId = 'C123-TEST';
    const shortName = 'harmony_example';
    const versionId = '1';
    beforeEach(function () {
      this.config = [
        {
          name: 'variable-subsetter',
          type: { name: 'turbo' },
          capabilities: {
            subsetting: { variable: true },
            output_formats: ['image/tiff'],
          },
          collections: [{ id: collectionId }],
        },
        {
          name: 'non-variable-subsetter',
          type: { name: 'turbo' },
          capabilities: {
            subsetting: { variable: false },
            output_formats: ['application/x-zarr'],
          },
          collections: [{ id: collectionId }],
        },
      ];
    });

    describe('requesting variable subsetting with an output format available on the variable subsetter service', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': 'V123-PROV1' }, umm: { Name: 'the-var' } }]);
      operation.outputFormat = 'image/tiff';

      it('returns the service configured for variable subsetting', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('variable-subsetter');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('TurboService');
      });
    });

    describe('requesting variable subsetting with an output format that is not supported by the variable subsetting service, but is supported by other services', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': 'V123-PROV1' }, umm: { Name: 'the-var' } }]);
      operation.outputFormat = 'application/x-zarr';

      it('returns the no op service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('NoOpService');
      });

      it('indicates the reason for choosing the no op service is the combination of variable subsetting and the output format', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: variable subsetting and reformatting to application/x-zarr on C123-TEST is unsupported');
      });
    });

    describe('requesting no variable subsetting and a format supported by the service that does not support variable subsetting', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId);
      operation.outputFormat = 'application/x-zarr';
      it('returns the non-variable subsetter service that does support the format', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('non-variable-subsetter');
      });
    });

    describe('requesting variable subsetting and a format not supported by any services', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': 'V123-PROV1' }, umm: { Name: 'the-var' } }]);
      operation.outputFormat = 'image/foo';

      it('returns the no op service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('NoOpService');
      });

      it('indicates the reason for choosing the no op service is the format', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: variable subsetting and reformatting to image/foo on C123-TEST is unsupported');
      });
    });
  });

  describe("when the operation's collection is not configured for services", function () {
    beforeEach(function () {
      const collectionId = 'C123-TEST';
      const shortName = 'harmony_example';
      const versionId = '1';
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId);
      this.operation = operation;
      this.config = [
        {
          name: 'non-matching-service',
          type: { name: 'turbo' },
          collections: [{ id: 'C456-NOMATCH' }],
        },
      ];
    });

    it('returns the no op service', function () {
      const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
      expect(serviceConfig.name).to.equal('noOpService');
    });

    it('uses the correct service class when building the service', function () {
      const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
      const service = buildService(serviceConfig, this.operation);
      expect(service.constructor.name).to.equal('NoOpService');
      expect(service.operation).to.equal(this.operation);
    });

    it('indicates the reason for choosing the no op service is the collection not being configured for services', function () {
      const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
      expect(serviceConfig.message).to.equal('no operations can be performed on C123-TEST');
    });
  });

  describe('when no services can support spatial or shapefile subsetting for the collection', function () {
    beforeEach(function () {
      const collectionId = 'C123-TEST';
      const shortName = 'harmony_example';
      const versionId = '1';
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId);
      this.operation = operation;
      this.config = [
        {
          name: 'a-service',
          type: { name: 'turbo' },
          collections: [{ id: collectionId }],
        },
      ];
    });

    describe('and the request needs spatial subsetting only', function () {
      beforeEach(function () {
        this.operation.boundingRectangle = [0, 0, 10, 10];
      });

      it('returns the no op service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        const service = buildService(serviceConfig, this.operation);
        expect(service.constructor.name).to.equal('NoOpService');
        expect(service.operation).to.equal(this.operation);
      });

      it('indicates the reason for choosing the no op service is that spatial subsetting can not be performed', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: spatial subsetting on C123-TEST is unsupported');
      });
    });

    describe('and the request needs shapefile subsetting only', function () {
      beforeEach(function () {
        this.operation.geojson = { pretend: 'geojson' };
      });

      it('returns the no op service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        const service = buildService(serviceConfig, this.operation);
        expect(service.constructor.name).to.equal('NoOpService');
        expect(service.operation).to.equal(this.operation);
      });

      it('indicates the reason for choosing the no op service is that shapefile subsetting can not be performed', function () {
        const serviceConfig = chooseServiceConfig(this.operation, {}, this.config);
        expect(serviceConfig.message).to.equal('the requested combination of operations: shapefile subsetting on C123-TEST is unsupported');
      });
    });
  });

  describe('when requesting variable-based service with one variable', function () {
    const collectionId = 'C123-TEST';
    const variableId = 'V123-TEST';
    const shortName = 'harmony_example';
    const versionId = '1';
    beforeEach(function () {
      this.config = [
        {
          name: 'variable-based-service',
          has_granule_limit: false,
          default_sync: true,
          type: { name: 'turbo' },
          capabilities: {
            subsetting: { variable: true },
            output_formats: ['text/csv'],
          },
          collections: [
            { id: collectionId, variables: [variableId] },
          ],
        },
        {
          name: 'variable-based-async-service',
          default_sync: false,
          type: { name: 'turbo' },
          capabilities: {
            output_formats: ['image/tiff'],
          },
          collections: [
            { id: collectionId, variables: [variableId] },
          ],
        },
      ];
    });

    describe('requesting service with variable subsetting', function () {
      let operation;

      it('sets to synchronous for the variable-based-service', function () {
        operation = new DataOperation();
        operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': variableId }, umm: { Name: 'the-var' } }]);
        operation.outputFormat = 'text/csv';
        const service = new TurboService(this.config[0], operation);
        expect(service.isSynchronous).to.equal(true);
      });

      it('sets to asynchronous for the variable-based-async-service', function () {
        operation = new DataOperation();
        operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': variableId }, umm: { Name: 'the-var' } }]);
        operation.outputFormat = 'text/csv';
        const service = new TurboService(this.config[1], operation);
        expect(service.isSynchronous).to.equal(false);
      });

      it('returns the service configured for variable-based service', function () {
        operation = new DataOperation();
        operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': variableId }, umm: { Name: 'the-var' } }]);
        operation.outputFormat = 'text/csv';
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('variable-based-service');
      });

      it('uses the correct service class when building the service', function () {
        operation = new DataOperation();
        operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': variableId }, umm: { Name: 'the-var' } }]);
        operation.outputFormat = 'text/csv';
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('TurboService');
      });
    });

    describe('requesting service without variable subsetting', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId);
      operation.outputFormat = 'text/csv';

      it('does not return the service configured for variable-based service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the NoOp service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('NoOpService');
      });
    });

    describe('requesting service with no variable matches', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': 'wrong-variable-Id' }, umm: { Name: 'wrong-var' } }]);
      operation.outputFormat = 'text/csv';

      it('does not return the service configured for variable-based service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the NoOp service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('NoOpService');
      });
    });
  });

  describe('when requesting variable-based service with multiple variables', function () {
    const collectionId = 'C123-TEST';
    const variableId1 = 'V123-TEST';
    const variableId2 = 'V456-TEST';
    const variableId3 = 'V789-TEST';
    const shortName = 'harmony_example';
    const versionId = '1';
    beforeEach(function () {
      this.config = [
        {
          name: 'variable-based-service',
          type: { name: 'turbo' },
          capabilities: {
            subsetting: { variable: true },
            output_formats: ['text/csv'],
          },
          collections: [
            {
              id: collectionId,
              variables: [variableId1, variableId2],
            },
          ],
        },
      ];
    });

    describe('requesting service with one variable subsetting', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId, [{ meta: { 'concept-id': variableId1 }, umm: { Name: 'the-var' } }]);
      operation.outputFormat = 'text/csv';

      it('returns the service configured for variable-based service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('variable-based-service');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('TurboService');
      });
    });

    describe('requesting service with two variable subsetting and both matches', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId,  [{ meta: { 'concept-id': variableId1 }, umm: { Name: 'the-var-1' } },
        { meta: { 'concept-id': variableId2 }, umm: { Name: 'the-var-2' } }]);
      operation.outputFormat = 'text/csv';

      it('returns the service configured for variable-based service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('variable-based-service');
      });

      it('uses the correct service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('TurboService');
      });
    });

    describe('requesting service with two variable subsetting and only one matches', function () {
      const operation = new DataOperation();
      operation.addSource(collectionId, shortName, versionId,  [{ meta: { 'concept-id': variableId1 }, umm: { Name: 'the-var-1' } },
        { meta: { 'concept-id': variableId3 }, umm: { Name: 'the-var-3' } }]);
      operation.outputFormat = 'text/csv';

      it('does not return the service configured for variable-based service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        expect(serviceConfig.name).to.equal('noOpService');
      });

      it('uses the NoOp service class when building the service', function () {
        const serviceConfig = chooseServiceConfig(operation, {}, this.config);
        const service = buildService(serviceConfig, operation);
        expect(service.constructor.name).to.equal('NoOpService');
      });
    });
  });
});

describe('granule limits', function () {
  let stubs;
  beforeEach(() => {
    stubs = [
      stub(env, 'maxSynchronousGranules').get(() => 2),
      stub(env, 'maxGranuleLimit').get(() => 30),
    ];
  });
  afterEach(() => {
    stubs.map((s) => s.restore());
  });

  describe('when the service allows more than the granule limit for sync requests', function () {
    it('returns the system granule limit', function () {
      expect(getMaxSynchronousGranules({ maximum_sync_granules: 50 })).to.equal(30);
    });
  });

  describe('when the service allows less than the granule limit for sync requests', function () {
    it('returns the service specific sync granules limit', function () {
      expect(getMaxSynchronousGranules({ maximum_sync_granules: 25 })).to.equal(25);
    });
  });

  describe('when the service allows exactly the granule limit for sync requests', function () {
    it('returns the correct limit', function () {
      expect(getMaxSynchronousGranules({ maximum_sync_granules: 30 })).to.equal(30);
    });
  });

  describe('when the service does not configure a granule limit for sync requests', function () {
    it('returns the default sync granules limit', function () {
      expect(getMaxSynchronousGranules({})).to.equal(2);
    });
  });

  describe('when the service configures a granule limit for sync requests that is less than the default', function () {
    it('returns the service specific limit', function () {
      expect(getMaxSynchronousGranules({ maximum_sync_granules: 1 })).to.equal(1);
    });
  });

  describe('when the service configures a granule limit for sync requests to be zero', function () {
    it('returns zero for the limit', function () {
      expect(getMaxSynchronousGranules({ maximum_sync_granules: 0 })).to.equal(0);
    });
  });
});

describe('Services by association', function () {
  const conversionCollection = 'C1233800302-EEDTEST';
  const reprojectCollection = 'C1234088182-EEDTEST';
  const tiff = 'image/tiff';
  const zarr = 'application/x-zarr';
  const granuleId = 'G1233800352-EEDTEST';
  const granuleQuery = { granuleId };
  const reprojectQuery = { outputCrs: 'EPSG:4326' };
  const version = '1.0.0';

  hookServersStartStop();

  describe('when choosing a service', function () {
    const headers = { accept: `${zarr}, ${tiff}` };

    describe('when a matching service is provided through a UMM-S association', function () {
      StubService.hook({ params: { redirect: 'http://example.com' } });
      hookRangesetRequest(version, conversionCollection, 'all', { headers, query: granuleQuery });
      it('uses the backend service from the association', function () {
        expect(this.service.config.name).to.equal('harmony/netcdf-to-zarr');
      });
    });

    describe('when matching services are provided directly and through associations', function () {
      StubService.hook({ params: { redirect: 'http://example.com' } });
      hookRangesetRequest(version, reprojectCollection, 'all', { headers, query: reprojectQuery });
      it('it uses the first matching service', function () {
        expect(this.service.config.name).to.equal('nasa/harmony-gdal-adapter');
      });
    });
  });
});

describe('createWorkflowSteps', function () {
  const collectionId = 'C123-TEST';
  const shortName = 'harmony_example';
  const versionId = '1';
  const operation = buildOperation('foo');
  operation.addSource(collectionId, shortName, versionId);
  // the existence of conditional umm_c in config guarantees that ummCollections is set
  operation.ummCollections = [{
    'meta': {
      'concept-id': 'C1234-TEST',
    },
    'umm': {},
  }];
  const config = {
    name: 'shapefile-tiff-netcdf-service',
    data_operation_version: CURRENT_SCHEMA_VERSION,
    type: { name: 'turbo' },
    capabilities: {
      output_formats: ['image/tiff', 'application/x-netcdf4'],
      subsetting: {
        shape: true,
        variable: true,
      },
    },
    steps: [{
      image: 'query cmr',
    }, {
      image: 'format transformer',
      operations: ['formatTransform'],
      conditional: {
        umm_c: {
          native_format: ['netcdf-4'],
        },
      },
    }, {
      image: 'temporal subsetter',
      operations: ['temporalSubset'],
      conditional: { exists: ['temporalSubset'] },
    }, {
      image: 'var and bbox subsetter',
      operations: ['variableSubset', 'spatialSubset', 'dimensionSubset'],
      conditional: { exists: ['variableSubset', 'spatialSubset', 'dimensionSubset'] },
    }, {
      image: 'shapefile subsetter',
      operations: ['shapefileSubset'],
      conditional: { exists: ['shapefileSubset'] },
    }],
  };

  describe('when an operation has only shapefile subsetting', function () {
    const shapefile_operation = _.cloneDeep(operation);
    shapefile_operation.geojson = 'interesting shape';
    const service = new StubService(config, {}, shapefile_operation);
    const steps = service.createWorkflowSteps();

    it('creates two workflow steps', function () {
      expect(steps.length).to.equal(2);
    });

    it('creates a first workflow step for query cmr', function () {
      expect(steps[0].serviceID).to.equal('query cmr');
    });

    it('creates a second and final workflow step for the shapefile subsetter', function () {
      expect(steps[1].serviceID).to.equal('shapefile subsetter');
    });

    it('uses the artifact bucket as the staging location for the first step', function () {
      const { stagingLocation } = JSON.parse(steps[0].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the staging bucket as the staging location for the second (last) step', function () {
      const { stagingLocation } = JSON.parse(steps[1].operation);
      expect(stagingLocation).to.include('local-staging-bucket');
    });
  });

  describe('when an operation has only bbox subsetting', function () {
    const bbox_operation = _.cloneDeep(operation);
    bbox_operation.boundingRectangle = [1, 2, 3, 4];
    const service = new StubService(config, {}, bbox_operation);
    const steps = service.createWorkflowSteps();

    it('creates two workflow steps', function () {
      expect(steps.length).to.equal(2);
    });

    it('creates a first workflow step for query cmr', function () {
      expect(steps[0].serviceID).to.equal('query cmr');
    });

    it('creates a second and final workflow step for the var and bbox subsetter', function () {
      expect(steps[1].serviceID).to.equal('var and bbox subsetter');
    });

    it('uses the artifact bucket as the staging location for the first step', function () {
      const { stagingLocation } = JSON.parse(steps[0].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the staging bucket as the staging location for the second (last) step', function () {
      const { stagingLocation } = JSON.parse(steps[1].operation);
      expect(stagingLocation).to.include('local-staging-bucket');
    });
  });

  describe('when an operation has temporal and bbox subsetting', function () {
    const temporal_and_bbox_operation = _.cloneDeep(operation);
    temporal_and_bbox_operation.boundingRectangle = [1, 2, 3, 4];
    temporal_and_bbox_operation.temporal = { start: '2022-01-03T02:04:00Z', end: '2022-01-03T02:04:00Z' };
    const service = new StubService(config, {}, temporal_and_bbox_operation);
    const steps = service.createWorkflowSteps();

    it('creates three workflow steps', function () {
      expect(steps.length).to.equal(3);
    });

    it('creates a first workflow step for query cmr', function () {
      expect(steps[0].serviceID).to.equal('query cmr');
    });

    it('creates a second workflow step for the temporal subsetter', function () {
      expect(steps[1].serviceID).to.equal('temporal subsetter');
    });

    it('creates a third and final workflow step for the var and bbox subsetter', function () {
      expect(steps[2].serviceID).to.equal('var and bbox subsetter');
    });

    it('uses the artifact bucket as the staging location for the first step', function () {
      const { stagingLocation } = JSON.parse(steps[0].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the staging bucket as the staging location for the last step', function () {
      const { stagingLocation } = JSON.parse(steps[2].operation);
      expect(stagingLocation).to.include('local-staging-bucket');
    });
  });

  describe('when an operation has both bbox and shapefile subsetting', function () {
    const both_operation = _.cloneDeep(operation);
    both_operation.boundingRectangle = [1, 2, 3, 4];
    both_operation.geojson = 'interesting shape';
    const service = new StubService(config, {}, both_operation);
    const steps = service.createWorkflowSteps();

    it('creates three workflow steps', function () {
      expect(steps.length).to.equal(3);
    });

    it('creates a first workflow step for query cmr', function () {
      expect(steps[0].serviceID).to.equal('query cmr');
    });

    it('creates a second workflow step for the var and bbox subsetter', function () {
      expect(steps[1].serviceID).to.equal('var and bbox subsetter');
    });

    it('creates a third and final workflow step for the shapefile subsetter', function () {
      expect(steps[2].serviceID).to.equal('shapefile subsetter');
    });

    it('uses the artifact bucket as the staging location for the first step', function () {
      const { stagingLocation } = JSON.parse(steps[0].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the artifact bucket as the staging location for the second step', function () {
      const { stagingLocation } = JSON.parse(steps[1].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the staging bucket as the staging location for the last step', function () {
      const { stagingLocation } = JSON.parse(steps[2].operation);
      expect(stagingLocation).to.include('local-staging-bucket');
    });
  });

  describe('when an operation has a destinationUrl and optional step', function () {
    const destUrlOperation = _.cloneDeep(operation);
    destUrlOperation.boundingRectangle = [1, 2, 3, 4];
    destUrlOperation.destinationUrl = 's3://dummy/p1';
    const service = new StubService(config, {}, destUrlOperation);
    const steps = service.createWorkflowSteps();

    it('creates two workflow steps', function () {
      expect(steps.length).to.equal(2);
    });

    it('creates a first workflow step for query cmr', function () {
      expect(steps[0].serviceID).to.equal('query cmr');
    });

    it('creates a second and final workflow step for the var and bbox subsetter', function () {
      expect(steps[1].serviceID).to.equal('var and bbox subsetter');
    });

    it('uses the artifact bucket as the staging location for the first step', function () {
      const { stagingLocation } = JSON.parse(steps[0].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the staging bucket as the staging location for the second (last) step', function () {
      const { stagingLocation } = JSON.parse(steps[1].operation);
      expect(stagingLocation).to.include('dummy/p1');
    });
  });

  describe('when an operation has a destinationUrl', function () {
    const destUrlOperation = _.cloneDeep(operation);
    destUrlOperation.boundingRectangle = [1, 2, 3, 4];
    destUrlOperation.geojson = 'interesting shape';
    destUrlOperation.destinationUrl = 's3://dummy/p1';
    const service = new StubService(config, {}, destUrlOperation);
    const steps = service.createWorkflowSteps();

    it('is not synchronous', function () {
      expect(service.isSynchronous).to.equal(false);
      expect(service.operation.isSynchronous).to.equal(false);
    });

    it('creates three workflow steps', function () {
      expect(steps.length).to.equal(3);
    });

    it('uses the artifact bucket as the staging location for the first step', function () {
      const { stagingLocation } = JSON.parse(steps[0].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the artifact bucket as the staging location for the second step', function () {
      const { stagingLocation } = JSON.parse(steps[1].operation);
      expect(stagingLocation).to.include('local-artifact-bucket');
    });

    it('uses the destinationUrl as the staging location for the last step', function () {
      const { stagingLocation } = JSON.parse(steps[2].operation);
      expect(stagingLocation).to.include('dummy/p1');
    });
  });

  describe('when a collection has matching umm-c conditional native_format', function () {
    const ummOperation = _.cloneDeep(operation);
    ummOperation.geojson = 'interesting shape';
    ummOperation.ummCollections = [{
      'meta': {
        'concept-id': 'C1234-TEST',
      },
      'umm': {
        'ArchiveAndDistributionInformation': {
          'FileArchiveInformation': [ {
            'Format': 'netCDF-4',
            'FormatType': 'Native',
          } ],
        },
      },
    }];
    const service = new StubService(config, {}, ummOperation);
    const steps = service.createWorkflowSteps();

    it('is not synchronous', function () {
      expect(service.isSynchronous).to.equal(false);
      expect(service.operation.isSynchronous).to.equal(false);
    });

    it('creates three workflow steps', function () {
      expect(steps.length).to.equal(3);
    });

    it('creates a first workflow step for query cmr', function () {
      expect(steps[0].serviceID).to.equal('query cmr');
    });

    it('creates a second step for conditional umm_c native_format', function () {
      expect(steps[1].serviceID).to.equal('format transformer');
    });

    it('creates a third and final workflow step for the shapefile subsetter', function () {
      expect(steps[2].serviceID).to.equal('shapefile subsetter');
    });
  });
});
