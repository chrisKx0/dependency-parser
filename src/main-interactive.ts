#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Evaluator } from './lib';

const evaluator = new Evaluator();

yargs(hideBin(process.argv))
  .command(
    ['update', 'u'],
    'resolve and update all peer dependencies',
      {},
    (args) => {
      evaluator.evaluate(args);
    },
  )
    .option('path', {
        alias: 'p',
        type: 'string',
        description: 'Path of the package.json file',
    })
  .parse();
