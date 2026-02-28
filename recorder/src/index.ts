#!/usr/bin/env node
/**
 * Bondtrace Recorder CLI - runs Postman collection via Newman and produces tape.json
 *
 * Usage:
 *   bondtrace-record collection.json [-e environment.json] [-f folder] [-o tape.json]
 */

import newman, { NewmanRunOptions } from 'newman';
import { resolve, dirname } from 'path';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createTapeReporter } from './reporter.js';

const HELP = `
Bondtrace Recorder - Records Postman collection runs to tape.json

Usage:
  bondtrace-record <collection.json> [options]

Options:
  -e, --environment <path>  Environment file (optional)
  -f, --folder <name>       Run specific folder only (optional)
  -o, --output <path>       Output tape file (default: tape.json)
  -h, --help                Show this help

Examples:
  bondtrace-record my-api.json -e env.json -o tape.json
  bondtrace-record my-api.json -e env.json -f "Demo Flow" -o tape.json
`;

const args = process.argv.slice(2);
let collectionPath = '';
let envPath = '';
let folder = '';
let outputPath = 'tape.json';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-h' || args[i] === '--help') {
    console.log(HELP.trim());
    process.exit(0);
  } else if (args[i] === '-e' || args[i] === '--environment') {
    envPath = args[++i] ?? '';
  } else if (args[i] === '-f' || args[i] === '--folder') {
    folder = args[++i] ?? '';
  } else if (args[i] === '-o' || args[i] === '--output') {
    outputPath = args[++i] ?? 'tape.json';
  } else if (!args[i].startsWith('-')) {
    collectionPath = args[i];
  }
}

if (!collectionPath) {
  console.error(HELP.trim());
  process.exit(1);
}

const collectionResolved = resolve(process.cwd(), collectionPath);
const envResolved = envPath ? resolve(process.cwd(), envPath) : undefined;
const outputResolved = resolve(process.cwd(), outputPath);
const workingDir = resolve(collectionResolved, '..');

// Early validation
if (!existsSync(collectionResolved)) {
  console.error(`Error: Collection file not found: ${collectionPath}`);
  process.exit(1);
}

let collectionJson: { info?: { name?: string }; item?: unknown };
try {
  collectionJson = JSON.parse(readFileSync(collectionResolved, 'utf-8'));
  if (!collectionJson || (typeof collectionJson !== 'object')) {
    throw new Error('Invalid structure');
  }
} catch (err) {
  console.error(`Error: Invalid collection JSON: ${collectionPath}`, err instanceof Error ? err.message : err);
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

// Ensure output directory exists
try {
  mkdirSync(dirname(outputResolved), { recursive: true });
} catch (err) {
  console.error(`Error: Cannot create output directory for ${outputPath}`, err instanceof Error ? err.message : err);
  process.exit(1);
}

const reporter = createTapeReporter({ export: outputPath });
reporter.init({ name: collectionName }, { name: folder || 'Root' });

const runOptions: NewmanRunOptions = {
  collection: collectionResolved,
  reporters: ['cli'],
  reporter: { cli: { silent: false } },
  workingDir,
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
