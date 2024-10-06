import { Evaluator, RegistryClient } from '../src/lib';
import { PackageManifest } from 'query-registry';

jest.mock('query-registry', () => ({
  getPackument: jest.fn(({ name }: { name: string }) => {
    if (name === 'foo') {
      return Promise.resolve({
        versions: {
          '3.0.0': {
            dist: {
              unpackedSize: 420,
            },
          },
          '2.0.0': {
            dist: {
              unpackedSize: 380,
            },
          },
          '1.0.0': {
            dist: {
              unpackedSize: 200,
            },
          },
        },
      });
    } else if (name === 'bar') {
      return Promise.resolve({
        versions: {
          '1.1.0': {
            dist: {
              unpackedSize: 500,
            },
          },
          '1.0.0': {
            dist: {
              unpackedSize: 450,
            },
          },
        },
      });
    } else if (name === 'baz') {
      return Promise.resolve({
        versions: {
          '0.2.0': {
            dist: {
              unpackedSize: 270,
            },
          },
          '0.1.0': {
            dist: {
              unpackedSize: 230,
            },
          },
        },
      });
    } else if (name === 'noway') {
      return Promise.resolve({
        versions: {
          '0.0.1': {
            dist: {
              unpackedSize: 123,
            },
          },
        },
      });
    }
    return Promise.reject('package versions not found');
  }),
  getPackageManifest: jest.fn(({ name, version }: { name: string; version: string }) => {
    let details: Partial<PackageManifest>;
    switch (`${name}@${version}`) {
      case 'foo@3.0.0':
        details = {
          name: 'foo',
          version: '3.0.0',
        };
        break;
      case 'foo@2.0.0':
        details = {
          name: 'foo',
          version: '2.0.0',
        };
        break;
      case 'foo@1.0.0':
        details = {
          name: 'foo',
          version: '1.0.0',
        };
        break;
      case 'bar@1.1.0':
        details = {
          name: 'bar',
          version: '1.1.0',
          dependencies: {
            baz: '*',
          },
          peerDependencies: {
            foo: '3.0.0',
          },
        };
        break;
      case 'bar@1.0.0':
        details = {
          name: 'bar',
          version: '1.1.0',
          dependencies: {
            baz: '*',
          },
          peerDependencies: {
            foo: '2.0.0',
          },
        };
        break;
      case 'baz@0.2.0':
        details = {
          name: 'baz',
          version: '0.2.0',
          peerDependencies: {
            foo: '2.0.0',
          },
        };
        break;
      case 'baz@0.1.0':
        details = {
          name: 'baz',
          version: '0.2.0',
          peerDependencies: {
            foo: '1.0.0',
          },
        };
        break;
      case 'noway@0.0.1':
        details = {
          name: 'noway',
          version: '0.0.1',
          peerDependencies: {
            foo: '1.0.0',
          },
        };
        break;
    }
    if (details) {
      return Promise.resolve(details);
    }
    return Promise.reject('package details not found');
  }),
}));

describe('Test Evaluation', () => {
  let client: RegistryClient;
  let evaluator: Evaluator;

  beforeEach(() => {
    client = new RegistryClient(__dirname + '/fixtures');
    evaluator = new Evaluator(2, 10, true, false, false, client);
  });

  test('should evaluate peer dependencies with success', async () => {
    const args = {
      _: ['u'],
      path: __dirname + '/fixtures/success',
    };

    const openRequirements = await evaluator.prepare(args, []);
    const result = await evaluator.evaluate(openRequirements);

    expect(result).toMatchObject({
      conflictState: {
        state: 'OK',
        result: [
          {
            name: 'foo',
            semVerInfo: '2.0.0',
          },
        ],
      },
      metrics: {
        checkedDependencies: 9,
        checkedPeers: 5,
        checkedVersions: 9,
        resolvedPackages: 4,
        resolvedPeers: 1,
      },
    });
  });

  test('should evaluate peer dependencies with conflict', async () => {
    const args = {
      _: ['u'],
      path: __dirname + '/fixtures/conflict',
    };

    const openRequirements = await evaluator.prepare(args, []);
    const result = await evaluator.evaluate(openRequirements);

    expect(result).toMatchObject({
      conflictState: {
        state: 'CONFLICT',
      },
      metrics: {
        checkedDependencies: 11,
        checkedPeers: 6,
        checkedVersions: 10,
        resolvedPackages: 0,
        resolvedPeers: 0,
      },
    });
  });
});
