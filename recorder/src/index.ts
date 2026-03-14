#!/usr/bin/env node
/**
 * Bondtrace Recorder CLI - runs Postman collections or .http flows and produces tape.json
 */

import newman, { NewmanRunOptions } from 'newman';
import { resolve, dirname, extname } from 'path';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createTapeReporter } from './reporter.js';
import { executeHttpFlow } from './http-flow.js';

const HELP = `
Bondtrace Recorder - Records Postman collections or .http flows to tape.json

Usage:
  bondtrace-record <collection.json | request.http> [options]

Options:
  -e, --environment <path>  Postman environment JSON file (optional)
  --env-file <path>         .env file for .http flow execution (optional)
  -f, --folder <name>       Run specific Postman folder only (optional)
  -o, --output <path>       Output tape file (default: tape.json)
  -h, --help                Show this help

Examples:
  bondtrace-record my-api.json -e env.json -o tape.json
  bondtrace-record requests/create-customer.http --env-file .env.dev -o tape.json
`;

const args = process.argv.slice(2);
let inputPath = '';
let envPath = '';
let envFilePath = '';
let folder = '';
let outputPath = 'tape.json';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-h' || args[i] === '--help') {
    console.log(HELP.trim());
    process.exit(0);
  } else if (args[i] === '-e' || args[i] === '--environment') {
    envPath = args[++i] ?? '';
  } else if (args[i] === '--env-file') {
    envFilePath = args[++i] ?? '';
  } else if (args[i] === '-f' || args[i] === '--folder') {
    folder = args[++i] ?? '';
  } else if (args[i] === '-o' || args[i] === '--output') {
    outputPath = args[++i] ?? 'tape.json';
  } else if (!args[i].startsWith('-')) {
    inputPath = args[i];
  }
}

if (!inputPath) {
  console.error(HELP.trim());
  process.exit(1);
}

const inputResolved = resolve(process.cwd(), inputPath);
const envResolved = envPath ? resolve(process.cwd(), envPath) : undefined;
const outputResolved = resolve(process.cwd(), outputPath);

if (!existsSync(inputResolved)) {
  console.error(`Error: Input not found: ${inputPath}`);
  process.exit(1);
}

try {
  mkdirSync(dirname(outputResolved), { recursive: true });
} catch (err) {
  console.error(`Error: Cannot create output directory for ${outputPath}`, err instanceof Error ? err.message : err);
  process.exit(1);
}

const isHttpFlow = extname(inputResolved).toLowerCase() === '.http';

if (isHttpFlow) {
  try {
    const result = await executeHttpFlow(inputPath, outputPath, envFilePath || undefined);

    if (result.unsetVars.length > 0) {
      console.warn('\nUnset variables (add to .env or ensure they are set):');
      for (const v of result.unsetVars) {
        console.warn(`  - {{${v}}}`);
      }
    }

    for (const warning of result.warnings) {
      if (!warning.startsWith('Unresolved interpolation token:')) {
        console.warn(`Warning: ${warning}`);
      }
    }

    if (result.stepCount > 0) {
      if (result.failedStepDetails.length > 0) {
        console.log('\n--- Failed requests ---');
        for (const f of result.failedStepDetails) {
          console.log(`\n${f.method} ${f.name}: ${f.status}`);
          console.log(`  URL: ${f.url}`);
          if (f.requestBody) {
            console.log(`  Request body: ${f.requestBody}`);
          }
          console.log(`  Response: ${f.responseBody}`);
        }
      }

      console.log('\nSummary:');
      for (const step of result.stepResults) {
        const icon = step.ok ? '\u2713' : '\u2717';
        console.log(`  ${step.method} ${step.name}: ${step.status} ${icon}`);
      }
      const okCount = result.stepResults.filter((s) => s.ok).length;
      const failCount = result.stepResults.length - okCount;
      if (failCount > 0) {
        console.log(`\n${okCount} succeeded, ${failCount} failed.`);
      }
      console.log(`\nTape written to ${result.tapePath} (${result.stepCount} steps). Upload to your Bondtrace player.`);
      process.exit(0);
    }

    console.error('\nNo request steps recorded. Check your .http flow and try again.');
    process.exit(1);
  } catch (err) {
    console.error(`Error: Failed to execute .http flow: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

let collectionJson: { info?: { name?: string }; item?: unknown };
try {
  collectionJson = JSON.parse(readFileSync(inputResolved, 'utf-8'));
  if (!collectionJson || typeof collectionJson !== 'object') {
    throw new Error('Invalid structure');
  }
} catch (err) {
  console.error(`Error: Invalid collection JSON: ${inputPath}`, err instanceof Error ? err.message : err);
  process.exit(1);
}

const collectionName = collectionJson?.info?.name ?? 'Unknown';

let environmentObj: object | undefined;
if (envResolved) {
  if (!existsSync(envResolved)) {
    console.error(`Error: Environment file not found: ${envPath}`);
    process.exit(1);
  }
  try {
    const envJson = readFileSync(envResolved, 'utf-8');
    environmentObj = JSON.parse(envJson);
  } catch (err) {
    console.error(`Error: Invalid environment JSON: ${envPath}`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const reporter = createTapeReporter({ export: outputPath });
reporter.init({ name: collectionName }, { name: folder || 'Root' });

const runOptions: NewmanRunOptions = {
  collection: inputResolved,
  reporters: ['cli'],
  reporter: { cli: { silent: false } },
  workingDir: resolve(inputResolved, '..'),
};

if (environmentObj) {
  runOptions.environment = environmentObj;
}

if (folder) {
  runOptions.folder = folder;
}

const run = newman.run(runOptions);

run.on('console', (_err: Error | null, args: unknown) => {
  reporter.onConsole?.(args as Parameters<NonNullable<typeof reporter.onConsole>>[0]);
});

run.on('request', (err: Error | null, args: unknown) => {
  reporter.onRequest(err, args as Parameters<typeof reporter.onRequest>[1]);
});

run.on('done', (err: Error | null, summary: { error?: unknown; environment?: { toObject?: (excludeDisabled?: boolean, caseSensitive?: boolean) => Record<string, unknown> } }) => {
  const stepCount = reporter.getSteps().length;
  const outPath = reporter.write(summary);

  if (err || summary?.error) {
    console.error('\nRun encountered errors. Tape may be incomplete.');
  }

  if (stepCount > 0) {
    console.log(`\nTape written to ${outPath} (${stepCount} steps). Upload to your Bondtrace player.`);
  } else {
    console.error('\nNo steps recorded. Check your collection and environment, then try again.');
    process.exit(1);
  }
});
