#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
    .command(['install', 'i'], 'resolve and install dependencies', () => {}, (argv) => {
        console.log(argv);
    }).parse();
