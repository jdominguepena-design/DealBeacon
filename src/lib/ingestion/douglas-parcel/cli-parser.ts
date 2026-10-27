export interface ParsedCliArgs {
  execute: boolean;
  dryRun: boolean;
  limit: number;
  batchSize: number;
  pageSize: number;
  startAfterObjectId?: number;
  resume: boolean;
  strategy: 'SEQUENTIAL' | 'BULK_EXPERIMENTAL';
  confirmEndpoint?: string;
}

const KNOWN_FLAGS = new Set([
  '--execute',
  '--dry-run',
  '--limit',
  '--batch-size',
  '--page-size',
  '--start-after-object-id',
  '--after-object-id',
  '--start-after-oid',
  '--resume',
  '--strategy',
  '--confirm-endpoint',
  '--help',
  '-h',
]);

/**
 * Parses and validates CLI arguments for Douglas County parcel importer.
 * 
 * Guarantees:
 * 1. Both `--flag value` and `--flag=value` forms are supported.
 * 2. Unknown flags are rejected with a nonzero error.
 * 3. Missing or non-numeric/invalid values cause an immediate throw.
 * 4. Explicitly supplied arguments NEVER silently fall back to defaults.
 * 5. If `--execute` is supplied, all parameters must be validated without ambiguity.
 */
export function parseParcelCliArgs(rawArgs: string[]): ParsedCliArgs {
  const flags = new Map<string, string | true>();

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (!arg.startsWith('-')) {
      throw new Error(`Unexpected positional argument: "${arg}". All options must be flags.`);
    }

    if (arg.includes('=')) {
      const [key, ...rest] = arg.split('=');
      const val = rest.join('=');
      if (!KNOWN_FLAGS.has(key)) {
        throw new Error(`Unknown flag: "${key}". See --help for valid options.`);
      }
      if (val === '') {
        throw new Error(`Flag "${key}" was provided with an empty value.`);
      }
      flags.set(key, val);
    } else {
      const key = arg;
      if (!KNOWN_FLAGS.has(key)) {
        throw new Error(`Unknown flag: "${key}". See --help for valid options.`);
      }

      // Check if it's a boolean flag
      if (key === '--execute' || key === '--dry-run' || key === '--resume' || key === '--help' || key === '-h') {
        flags.set(key, true);
      } else {
        // Valued flag requires next arg
        if (i + 1 >= rawArgs.length || rawArgs[i + 1].startsWith('-')) {
          throw new Error(`Missing value for flag "${key}".`);
        }
        flags.set(key, rawArgs[i + 1]);
        i++; // skip next arg
      }
    }
  }

  const hasExecute = flags.get('--execute') === true;
  const hasDryRun = flags.get('--dry-run') === true;
  const dryRun = !hasExecute || hasDryRun;

  // Validate limit
  let limit = 50;
  if (flags.has('--limit')) {
    const rawVal = flags.get('--limit');
    const n = Number(rawVal);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid --limit value: "${rawVal}". Must be a positive integer.`);
    }
    limit = n;
  }

  // Validate batchSize
  let batchSize = 25;
  if (flags.has('--batch-size')) {
    const rawVal = flags.get('--batch-size');
    const n = Number(rawVal);
    if (!Number.isInteger(n) || n <= 0 || n > 250) {
      throw new Error(`Invalid --batch-size value: "${rawVal}". Must be an integer between 1 and 250.`);
    }
    batchSize = n;
  }

  // Validate pageSize
  let pageSize = Math.min(limit, 250);
  if (flags.has('--page-size')) {
    const rawVal = flags.get('--page-size');
    const n = Number(rawVal);
    if (!Number.isInteger(n) || n <= 0 || n > 250) {
      throw new Error(`Invalid --page-size value: "${rawVal}". Must be an integer between 1 and 250.`);
    }
    pageSize = n;
  }

  // Validate startAfterObjectId
  let startAfterObjectId: number | undefined = undefined;
  const oidKey = ['--start-after-object-id', '--after-object-id', '--start-after-oid'].find((k) => flags.has(k));
  if (oidKey) {
    const rawVal = flags.get(oidKey);
    const n = Number(rawVal);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Invalid ${oidKey} value: "${rawVal}". Must be a non-negative integer.`);
    }
    startAfterObjectId = n;
  }

  const resume = flags.get('--resume') === true;

  // Validate strategy
  let strategy: 'SEQUENTIAL' | 'BULK_EXPERIMENTAL' = 'SEQUENTIAL';
  if (flags.has('--strategy')) {
    const rawVal = flags.get('--strategy');
    if (rawVal === 'BULK_EXPERIMENTAL' || rawVal === 'bulk') {
      strategy = 'BULK_EXPERIMENTAL';
    } else if (rawVal === 'SEQUENTIAL' || rawVal === 'seq') {
      strategy = 'SEQUENTIAL';
    } else {
      throw new Error(`Invalid --strategy value: "${rawVal}". Must be either "BULK_EXPERIMENTAL" or "SEQUENTIAL".`);
    }
  }

  // Validate confirmEndpoint if provided
  let confirmEndpoint: string | undefined = undefined;
  if (flags.has('--confirm-endpoint')) {
    const rawVal = flags.get('--confirm-endpoint');
    if (typeof rawVal !== 'string' || !rawVal.trim()) {
      throw new Error(`Flag "--confirm-endpoint" was provided with an empty value.`);
    }
    confirmEndpoint = rawVal.trim();
  }

  // Safety Gate: In live execution mode (--execute), forbid ambiguous defaults for cursor if resume is not set
  if (hasExecute && !hasDryRun) {
    if (startAfterObjectId === undefined && !resume) {
      throw new Error(
        `Safety gate: Live execution (--execute) requires either an explicit starting cursor (--start-after-object-id <OID>) or --resume. Refusing to default to 0.`
      );
    }
  }

  return {
    execute: hasExecute && !hasDryRun,
    dryRun,
    limit,
    batchSize,
    pageSize,
    startAfterObjectId,
    resume,
    strategy,
    confirmEndpoint,
  };
}
