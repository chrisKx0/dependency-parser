import 'jest';

import { Evaluator } from './evaluator';
import { createOpenRequirementOutput } from './util';

describe('Test Evaluation', () => {
  test('should evaluate peer dependencies', async () => {
    const args = {
      _: ['u'],
      path: 'E:\\Studium\\Master\\Projekt\\dependency-parser\\examples\\3', // TODO: relative path
      s: true,
      'skip-prompts': true,
      skipPrompts: true,
      c: true,
      'collect-metrics': true,
      collectMetrics: true,
      install: false,
      i: false,
      p: true,
      'pre-release': true,
      preRelease: true,
      // $0: 'C:\\Program Files\\nodejs\\node_modules\\dependency-parser\\src\\main-interactive.js',
    };

    const evaluator = new Evaluator();
    const openRequirements = await evaluator.prepare(args);

    createOpenRequirementOutput(openRequirements);

    const result = await evaluator.evaluate(openRequirements);

    console.debug(result);
  });
});
