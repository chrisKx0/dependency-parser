import 'jest';

import { Evaluator } from './evaluator';
import { RegistryClient } from './util';

// TODO: define test case with adequate duration and maybe with mocked endpoints
describe('Test Evaluation', () => {
  test('should evaluate peer dependencies', async () => {
    const args = {
      _: ['u'],
      path: __dirname + '/../../examples/1',
    };

    const client = new RegistryClient(__dirname + '/../../data');
    const evaluator = new Evaluator(2, 10, true, false, false, client);

    const openRequirements = await evaluator.prepare(args);
    const result = await evaluator.evaluate(openRequirements);

    console.debug(result);
  });
});
