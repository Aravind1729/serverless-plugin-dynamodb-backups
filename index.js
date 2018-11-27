'use strict';

const isString = require('lodash.isstring');
const clone = require('lodash.clone');
const has = require('lodash.has');
const isPlainObject = require('lodash.isplainobject');
const set = require('lodash.set');
const assign = require('lodash.assign');
const includes = require('lodash.includes');
const uniqWith = require('lodash.uniqwith');
const isEqual = require('lodash.isequal');
const BbPromise = require('bluebird');
const SemVer = require('semver');
const chalk = require('chalk');

/**
 *
 */
class DynamodbAutoBackup {
  constructor(serverless) {
    this.serverless = serverless;
    this.custom = this.serverless.service.custom;

    this.hooks = {
      'before:package:initialize': () => BbPromise.bind(this)
        .then(this.validate),

      'after:package:initialize': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.constructFunctionObject)
        .then(this.populateEnv)
        .then(this.generateBackupFunction),

      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.constructFunctionObject)
        .then(this.populateEnv)
        .then(this.generateBackupFunction)
        .then(this.instrumentFunctions),

      'before:invoke:local:invoke': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.constructFunctionObject)
        .then(this.populateEnv)
        .then(this.generateBackupFunction),

      'before:offline:start': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.constructFunctionObject)
        .then(this.populateEnv)
        .then(this.generateBackupFunction),

      'before:offline:start:init': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.constructFunctionObject)
        .then(this.populateEnv)
        .then(this.generateBackupFunction)
        .then(this.instrumentFunctions),

      'before:remove:remove': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.constructFunctionObject)
        .then(this.populateEnv)
        .then(this.generateBackupFunction)
        .then(this.instrumentFunctions),
    };

    this.configPlugin();
  }

  configPlugin() {
    this.dynamodbAutoBackups = {};
    if (has(this.custom, 'dynamodbAutoBackups') && isPlainObject(this.custom.dynamodbAutoBackups)) {
      assign(this.dynamodbAutoBackups, this.custom.dynamodbAutoBackups);
    }
  }

  validate() {
    if (this.validated) {
      // Already running
      return BbPromise.resolve();
    }

    // Check required serverless version
    if (SemVer.gt('1.12.0', this.serverless.getVersion())) {
      return BbPromise.reject(new this.serverless.classes.Error('Serverless version must be >= 1.12.0'));
    }

    // Set configuration // Set default option values
    this.validated = true;

    this.functionBackup = {
      name: `${this.serverless.service.service}-${this.serverless.service.provider.stage}-dynamodbAutoBackups`,
      handler: this.dynamodbAutoBackups.source,
      events: [],
      environment: {},
    };

    // Validate dynamodbAutoBackups options
    if (!this.dynamodbAutoBackups.source) {
      return BbPromise.reject(new this.serverless.classes.Error('dynamodbAutoBackups source must be set !'));
    }

    if (!this.dynamodbAutoBackups.backupRate) {
      return BbPromise.reject(new this.serverless.classes.Error('dynamodbAutoBackups backupRate must be set !'));
    }

    if (has(this.dynamodbAutoBackups, 'backupRemovalEnabled') && !has(this.dynamodbAutoBackups, 'backupRetentionDays')) {
      return BbPromise.reject(
        new this.serverless.classes.Error('if backupRemovalEnabled, backupRetentionDays must be set !'),
      );
    }

    if (!has(this.dynamodbAutoBackups, 'slackWebhook')) {
      console.log(chalk.yellow.bold('@unly/serverless-plugin-db-backups: -----------------------------------------------------------'));
      console.log('         Warning: slackWebhook is not provide, you will not be notified of errors !');
      console.log();
    }

    return BbPromise.resolve();
  }

  constructFunctionObject() {
    if (isString(this.dynamodbAutoBackups.backupRate)) {
      const cron = {
        schedule: this.dynamodbAutoBackups.backupRate,
      };
      this.functionBackup.events.push(cron);
    }

    if (has(this.dynamodbAutoBackups, 'name') || isString(this.dynamodbAutoBackups.name)) {
      assign(this.functionBackup, this.dynamodbAutoBackups.name);
    }

    if (includes(this.custom, 'development')) {
      this.functionBackup.events.push(
        {
          http: {
            path: '/cron/dynamodbAutoBackups',
            method: 'get',
          },
        },
      );
    }
  }

  populateEnv() {
    // Environment variables have to be a string in order to be processed properly
    if (has(this.dynamodbAutoBackups, 'backupRemovalEnabled') && has(this.dynamodbAutoBackups, 'backupRetentionDays')) {
      set(this.functionBackup, 'environment.BACKUP_REMOVAL_ENABLED', String(this.dynamodbAutoBackups.backupRemovalEnabled));
      set(this.functionBackup, 'environment.BACKUP_RETENTION_DAYS', String(this.dynamodbAutoBackups.backupRetentionDays));
    }
    if (has(this.dynamodbAutoBackups, 'slackWebhook')) {
      set(this.functionBackup, 'environment.SLACK_WEBHOOK', String(this.dynamodbAutoBackups.slackWebhook));
    }
    if (has(this.dynamodbAutoBackups, 'backupType')) {
      set(this.functionBackup, 'environment.BACKUP_TYPE', String(this.dynamodbAutoBackups.backupType).toUpperCase());
    }
    return BbPromise.resolve();
  }

  generateBackupFunction() {
    const dynamodbAutoBackups = clone(this.functionBackup);
    dynamodbAutoBackups.events = uniqWith(this.functionBackup.events, isEqual);

    if (isPlainObject(dynamodbAutoBackups)) {
      assign(this.serverless.service.functions, { dynamodbAutoBackups });
    }

    console.log(chalk.yellow.bold('@unly/serverless-plugin-db-backups:'), ` ${this.functionBackup.name} was created`);
    console.log();
    return BbPromise.resolve();
  }

  instrumentFunctions() {
    const allFunctions = this.serverless.service.getAllFunctionsNames();

    console.log(chalk.yellow.bold('@unly/serverless-plugin-db-backups: -----------------------------------------------------------'));
    return BbPromise.map(allFunctions, (functionName) => DynamodbAutoBackup.consoleLog(functionName));
  }

  static consoleLog(functionName) {
    console.log(chalk.yellow(`     function:        ${functionName}`));
  }
}

module.exports = DynamodbAutoBackup;
