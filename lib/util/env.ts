/* eslint-disable @typescript-eslint/dot-notation */
import _ from 'lodash';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import { IsInt, IsNotEmpty, IsNumber, IsUrl, Matches, Max, Min, ValidateIf, validateSync } from 'class-validator';
import { isFloat, isInteger } from './string';

//
// env module
// Sets up the environment variables used by more than one executable (the harmony server,
// the k8s services, etc.). Each executable can customize to add or override its own env vars
//

if (Object.prototype.hasOwnProperty.call(process.env, 'GDAL_DATA')) {
  winston.warn('Found a GDAL_DATA environment variable.  This is usually from an external GDAL '
    + 'installation and can interfere with CRS parsing in Harmony, so we will ignore it. '
    + 'If you need to override the GDAL_DATA location for Harmony, provide a GDAL_DATA key in '
    + 'your .env file.');
  delete process.env.GDAL_DATA;
}

// Read the env-defaults for this module (relative to this typescript file)
export let envDefaults = {};
try {
  envDefaults = dotenv.parse(fs.readFileSync(path.resolve(__dirname, 'env-defaults')));
} catch (e) {
  winston.warn('Could not parse environment defaults from env-defaults file');
  winston.warn(e.message);
}

export let envOverrides = {};
if (process.env.NODE_ENV !== 'test') {
  try {
    envOverrides = dotenv.parse(fs.readFileSync('.env'));
  } catch (e) {
    winston.warn('Could not parse environment overrides from .env file');
    winston.warn(e.message);
  }
}

export interface IHarmonyEnv {
  artifactBucket: string;
  awsDefaultRegion: string;
  builtInTaskPrefix: string;
  builtInTaskVersion: string;
  callbackUrlRoot: string;
  cmrEndpoint: string;
  cmrMaxPageSize: number;
  databaseType: string;
  defaultPodGracePeriodSecs: number;
  defaultResultPageSize: number;
  harmonyClientId: string;
  largeWorkItemUpdateQueueUrl: string;
  localstackHost: string;
  logLevel: string;
  maxGranuleLimit: number;
  nodeEnv: string;
  port: number;
  queueLongPollingWaitTimeSec: number
  releaseVersion: string;
  sameRegionAccessRole: string;
  serviceQueueUrls: { [key: string]: string };
  servicesYml: string;
  stagingBucket: string;
  useLocalstack: boolean;
  useServiceQueues: boolean;
  workItemSchedulerQueueUrl: string;
  workItemUpdateQueueUrl: string;

  // Allow extension of this interface with new properties. This should only be used for special
  // properties that cannot be captured explicitly like the above properties.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [propName: string]: any;
}

const ipRegex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
const domainHostRegex = /^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
export const hostRegexWhitelist = { host_whitelist: [/localhost/, /localstack/, /harmony/, ipRegex, domainHostRegex] };
export const awsRegionRegex = /(us(-gov)?|ap|ca|cn|eu|sa)-(central|(north|south)?(east|west)?)-\d/;

export class HarmonyEnv implements IHarmonyEnv {

  @IsNotEmpty()
  artifactBucket: string;

  @Matches(awsRegionRegex)
  awsDefaultRegion: string;

  builtInTaskPrefix: string;

  builtInTaskVersion: string;

  @IsUrl(hostRegexWhitelist)
  callbackUrlRoot: string;

  @IsUrl(hostRegexWhitelist)
  cmrEndpoint: string;

  @IsInt()
  @Min(1)
  cmrMaxPageSize: number;

  @IsNotEmpty()
  databaseType: string;

  @IsNumber()
  @Min(0)
  defaultPodGracePeriodSecs: number;

  @IsNumber()
  @Min(1)
  defaultResultPageSize: number;

  @IsNotEmpty()
  harmonyClientId: string;

  @IsUrl(hostRegexWhitelist)
  largeWorkItemUpdateQueueUrl: string;

  @ValidateIf(obj => obj.useLocalStack === true)
  @IsNotEmpty()
  localstackHost: string;

  @IsNotEmpty()
  logLevel: string;

  @IsInt()
  @Min(0)
  maxGranuleLimit: number;

  @IsNotEmpty()
  nodeEnv: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  port: number;

  @IsInt()
  @Min(1)
  queueLongPollingWaitTimeSec: number;

  releaseVersion: string;

  @IsNotEmpty()
  sameRegionAccessRole: string;

  servicesYml: string;

  stagingBucket: string;

  serviceQueueUrls: { [key: string]: string; };

  useLocalstack: boolean;

  useServiceQueues: boolean;

  @IsUrl(hostRegexWhitelist)
  workItemSchedulerQueueUrl: string;

  @IsUrl(hostRegexWhitelist)
  workItemUpdateQueueUrl: string;

  constructor(env: IHarmonyEnv) {
    for (const key of Object.keys(env)) {
      this[key] = env[key];
    }
  }

}

const envVars: IHarmonyEnv = {} as IHarmonyEnv;

/**
 * Add a symbol to an env variable map with an appropriate value. The exported symbol will be in
 * camel case, e.g., `maxPostFileSize`. This approach has the drawback that these
 * config variables don't show up in VS Code autocomplete, but the reduction in repeated
 * boilerplate code is probably worth it.
 *
 * @param envMap - The object to which the variable should be added
 * @param envName - The environment variable corresponding to the config variable in
 *   CONSTANT_CASE form
 * @param defaultValue - The value to use if the environment variable is not set. Only strings
 *   and integers are supported
 */
export function makeConfigVar(env: object, envName: string, defaultValue?: string): void {
  const stringValue = process.env[envName] || defaultValue;
  let val: number | string = stringValue;
  if (isInteger(stringValue)) {
    val = parseInt(stringValue, 10);
  } else if (isFloat(stringValue)) {
    val = parseFloat(stringValue);
  }
  env[_.camelCase(envName)] = val;
  // for existing env vars this is redundant (but doesn't hurt), but this allows us
  // to add new env vars to the process as needed
  process.env[envName] = stringValue;
}

const allEnv = { ...envDefaults, ...envOverrides, ...process.env };

for (const k of Object.keys(allEnv)) {
  makeConfigVar(envVars, k, allEnv[k]);
}

// special cases

envVars.databaseType = process.env.DATABASE_TYPE || 'postgres';
envVars.harmonyClientId = process.env.CLIENT_ID || 'harmony-unknown';
envVars.uploadBucket = process.env.UPLOAD_BUCKET || process.env.STAGING_BUCKET || 'local-staging-bucket';
envVars.useLocalstack = process.env.USE_LOCALSTACK === 'true';
envVars.useServiceQueues = process.env.USE_SERVICE_QUEUES === 'true';
envVars.workItemUpdateQueueUrl = process.env.WORK_ITEM_UPDATE_QUEUE_URL?.replace('localstack', envVars.localstackHost);
envVars.largeWorkItemUpdateQueueUrl = process.env.LARGE_WORK_ITEM_UPDATE_QUEUE_URL?.replace('localstack', envVars.localstackHost);
envVars.workItemSchedulerQueueUrl = process.env.WORK_ITEM_SCHEDULER_QUEUE_URL?.replace('localstack', envVars.localstackHost);

envVars.serviceQueueUrls = {};
// process all environment variables ending in _QUEUE_URLS to add image/url pairs to
// the `serviceQueueUrls` map
for (const k of Object.keys(process.env)) {
  if (/^.*_QUEUE_URLS$/.test(k)) {
    const value = process.env[k];
    try {
      const imageQueueUrls = JSON.parse(value);
      for (const imageQueueUrl of imageQueueUrls) {
        const [image, url] = imageQueueUrl.split(',');
        if (image && url) {
          // replace 'localstack' with `env.localstackHost` to allow for harmony to be run in a
          // container
          envVars.serviceQueueUrls[image] = url.replace('localstack', envVars.localstackHost);
        }
      }
    } catch (e) {
      winston.error(`Could not parse value ${value} for ${k} as JSON`);
    }
  }
}

// validate the env vars
const envVarsObj = new HarmonyEnv(envVars);
const errors = validateSync(envVarsObj,  { validationError: { target: false } });
if (errors.length > 0) {
  for (const err of errors) {
    winston.error(err);
  }
  throw (new Error('BAD BASE ENVIRONMENT'));
}

export default envVars;