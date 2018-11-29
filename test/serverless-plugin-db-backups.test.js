const serverless = require('./__mocks__/serverlessMock');

const DynamodbBackups = require('../serverless-plugin-db-backups');

describe('@unly/serverless-plugin-db-backups init', () => {
  // disable console
  console.warn = jest.fn();
  console.log = jest.fn();

  let slsPlugin;
  let step = 0;

  beforeEach(() => {
    slsPlugin = new DynamodbBackups(serverless(step));
    step += 1;
  });

  test('check if the plugin is already validate', () => {
    slsPlugin.validate();
    expect(slsPlugin.validated).toEqual(true);
    expect(slsPlugin.dynamodbAutoBackups).toEqual({
      backupRate: 'rate(5 minutes)',
      source: 'src/backups.handler',
    });
  });

  test('custom config with no key source should throw error', () => {
    try {
      slsPlugin.validate();
    } catch (err) {
      expect(err.message).toEqual('dynamodbAutoBackups source must be set !');
    }
  });

  test('custom config with no key backupRate should throw error', () => {
    try {
      slsPlugin.validate();
    } catch (err) {
      expect(err.message).toEqual('dynamodbAutoBackups backupRate must be set !');
    }
  });

  test('custom config with key backupRemovalEnabled === true and no key backupRetentionDays should throw error', () => {
    try {
      slsPlugin.validate();
    } catch (err) {
      expect(err.message).toEqual('if backupRemovalEnabled, backupRetentionDays must be set !');
    }
  });

  test('should provide function dynamodbAutoBackups', async () => {

    const beforePackageInit = slsPlugin.hooks['before:package:initialize'];
    const afterPackageInit = slsPlugin.hooks['after:package:initialize'];

    expect(slsPlugin.validated).toBeFalsy();

    await beforePackageInit();

    expect(slsPlugin.validated).toEqual(true);
    expect(slsPlugin.functionBackup).toHaveProperty('name');
    expect(slsPlugin.functionBackup).toHaveProperty('events');
    expect(slsPlugin.functionBackup).toHaveProperty('handler');
    expect(slsPlugin.functionBackup).toHaveProperty('environment');

    await afterPackageInit();

    expect(slsPlugin.serverless.service.functions.dynamodbAutoBackups).toMatchObject(slsPlugin.functionBackup);

  });
});
