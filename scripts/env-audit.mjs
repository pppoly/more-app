#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const BACKEND_ROOT = path.join(repoRoot, 'backend', 'src');
const FRONTEND_ROOT = path.join(repoRoot, 'frontend', 'src');

const RE_PROCESS_ENV_DOT = /process\.env\.([A-Z0-9_]+)/g;
const RE_PROCESS_ENV_BRACKET = /process\.env\[['"]([A-Z0-9_]+)['"]\]/g;
const RE_IMPORT_META_ENV_DOT = /import\.meta\.env\.([A-Z0-9_]+)/g;
const RE_IMPORT_META_ENV_BRACKET = /import\.meta\.env\[['"]([A-Z0-9_]+)['"]\]/g;

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vite',
  '.logs',
  'uploads',
  'coverage',
  'tmp',
  'temp',
]);

const usageMeta = {
  backend: {
    exact: {
      APP_ENV: { module: 'Core', purpose: 'Environment label switch (prod/uat/dev)', prodRequired: 'yes' },
      NODE_ENV: { module: 'Core', purpose: 'Runtime environment (production/development)', prodRequired: 'yes' },
      PORT: { module: 'Core', purpose: 'HTTP port binding', prodRequired: 'no' },
      HOST: { module: 'Core', purpose: 'HTTP host binding', prodRequired: 'no' },
      DATABASE_URL: { module: 'DB', purpose: 'Postgres connection for Prisma', prodRequired: 'yes' },
      JWT_SECRET: { module: 'Auth', purpose: 'JWT signing/verification secret', prodRequired: 'yes' },
      FRONTEND_ORIGINS: { module: 'CORS', purpose: 'Allowed origins for browser requests', prodRequired: 'yes' },
      FRONTEND_BASE_URL: { module: 'Core', purpose: 'Frontend base URL fallback (CORS & redirects)', prodRequired: 'conditional' },
      LINE_CHANNEL_ID: { module: 'LINE', purpose: 'LINE Login channel ID', prodRequired: 'conditional' },
      LINE_LOGIN_CHANNEL_ID: { module: 'LINE', purpose: 'Legacy LINE channel ID (fallback)', prodRequired: 'no' },
      LINE_CHANNEL_SECRET: { module: 'LINE', purpose: 'LINE Login channel secret', prodRequired: 'conditional' },
      LINE_REDIRECT_URI: { module: 'LINE', purpose: 'LINE OAuth callback URL', prodRequired: 'conditional' },
      STRIPE_API_VERSION: { module: 'Stripe', purpose: 'Pinned Stripe API version used by SDK', prodRequired: 'conditional' },
      STRIPE_SECRET_KEY_LIVE: { module: 'Stripe', purpose: 'Stripe secret key (live)', prodRequired: 'conditional' },
      STRIPE_PUBLISHABLE_KEY_LIVE: { module: 'Stripe', purpose: 'Stripe publishable key (live)', prodRequired: 'conditional' },
      STRIPE_WEBHOOK_SECRET_LIVE: { module: 'Stripe', purpose: 'Stripe webhook signing secret (live)', prodRequired: 'conditional' },
      STRIPE_SECRET_KEY_TEST: { module: 'Stripe', purpose: 'Stripe secret key (test)', prodRequired: 'no' },
      STRIPE_PUBLISHABLE_KEY_TEST: { module: 'Stripe', purpose: 'Stripe publishable key (test)', prodRequired: 'no' },
      STRIPE_WEBHOOK_SECRET_TEST: { module: 'Stripe', purpose: 'Stripe webhook signing secret (test)', prodRequired: 'no' },
      STRIPE_ONBOARDING_REFRESH_URL: { module: 'Stripe', purpose: 'Stripe onboarding refresh URL', prodRequired: 'conditional' },
      STRIPE_ONBOARDING_RETURN_URL: { module: 'Stripe', purpose: 'Stripe onboarding return URL', prodRequired: 'conditional' },
      STRIPE_WEBHOOK_DEBUG: { module: 'Stripe', purpose: 'Verbose webhook raw-body debug logging', prodRequired: 'no' },
      UPLOADS_HTTP_PREFIX: { module: 'Upload', purpose: 'Static uploads URL prefix', prodRequired: 'no' },
      DEV_LOGIN_ENABLED: { module: 'Auth', purpose: 'Enable dev-login endpoint', prodRequired: 'no' },
      DEV_LOGIN_SECRET: { module: 'Auth', purpose: 'Shared secret for dev-login', prodRequired: 'no' },
      EMAIL_LOGIN_ENABLED: { module: 'Auth', purpose: 'Enable email login endpoints', prodRequired: 'no' },
      REDIS_URL: { module: 'Queue', purpose: 'Redis connection string', prodRequired: 'conditional' },
      BULL_DISABLED: { module: 'Queue', purpose: 'Disable background queues', prodRequired: 'no' },
      OPENAI_API_KEY: { module: 'AI', purpose: 'OpenAI API key', prodRequired: 'no' },
      GOOGLE_APPLICATION_CREDENTIALS: { module: 'Google', purpose: 'GCP service account JSON path', prodRequired: 'conditional' },
      BREVO_API_KEY: { module: 'Email', purpose: 'Brevo (Sendinblue) API key', prodRequired: 'conditional' },
    },
    prefix: [
      { re: /^STRIPE_/, module: 'Stripe' },
      { re: /^LINE_/, module: 'LINE' },
      { re: /^FRONTEND_/, module: 'CORS' },
      { re: /^UPLOAD/, module: 'Upload' },
      { re: /^OSS_/, module: 'Upload' },
      { re: /^S3_/, module: 'Upload' },
      { re: /^REDIS_/, module: 'Queue' },
      { re: /^BULL_/, module: 'Queue' },
      { re: /^OPENAI_/, module: 'AI' },
      { re: /^GOOGLE_/, module: 'Google' },
      { re: /^BREVO_/, module: 'Email' },
      { re: /^SETTLEMENT_/, module: 'Settlement' },
    ],
  },
  frontend: {
    exact: {
      VITE_API_BASE_URL: { module: 'API', purpose: 'Backend API base URL', prodRequired: 'yes' },
      VITE_LIFF_ID: { module: 'LINE/LIFF', purpose: 'LIFF App ID (only required for LIFF)', prodRequired: 'conditional' },
      VITE_LINE_CHANNEL_ID: { module: 'LINE/LIFF', purpose: 'LINE Channel ID (frontend usage)', prodRequired: 'conditional' },
      VITE_APP_TARGET: { module: 'App', purpose: 'Target app mode (web/liff)', prodRequired: 'no' },
      VITE_APP_ENV: { module: 'App', purpose: 'Frontend env label (optional)', prodRequired: 'no' },
      VITE_DEV_LOGIN_SECRET: { module: 'Auth', purpose: 'Dev-login secret (frontend)', prodRequired: 'no' },
      VITE_GOOGLE_MAPS_API_KEY: { module: 'Maps', purpose: 'Google Maps API key', prodRequired: 'no' },
      VITE_STRIPE_FEE_PERCENT: { module: 'Finance', purpose: 'Fee display percent (UI)', prodRequired: 'no' },
      VITE_STRIPE_FEE_FIXED_JPY: { module: 'Finance', purpose: 'Fee display fixed amount (UI)', prodRequired: 'no' },
      VITE_STRIPE_FEE_MIN_JPY: { module: 'Finance', purpose: 'Fee display minimum amount (UI)', prodRequired: 'no' },
      VITE_PLATFORM_FEE_WAIVED: { module: 'Finance', purpose: 'Toggle platform fee display/logic (UI)', prodRequired: 'no' },
    },
    prefix: [{ re: /^VITE_/, module: 'Vite' }],
  },
};

const parseArgs = (argv) => {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [key, inlineValue] = token.split('=', 2);
      if (inlineValue != null) {
        out[key] = inlineValue;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[key] = argv[i + 1];
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
};

const fileExists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const walk = async (rootDir, { exts }) => {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const full = path.join(current, entry.name);
      const ext = path.extname(entry.name).toLowerCase();
      if (!exts.includes(ext)) continue;
      files.push(full);
    }
  }
  return files;
};

const addMatch = (usage, varName, fileRel) => {
  const entry = usage.get(varName) ?? new Map();
  entry.set(fileRel, (entry.get(fileRel) ?? 0) + 1);
  usage.set(varName, entry);
};

const scanEnvReads = async () => {
  if (!(await fileExists(BACKEND_ROOT))) {
    throw new Error(`Missing backend sources at ${BACKEND_ROOT}`);
  }
  if (!(await fileExists(FRONTEND_ROOT))) {
    throw new Error(`Missing frontend sources at ${FRONTEND_ROOT}`);
  }

  const backendFiles = await walk(BACKEND_ROOT, { exts: ['.ts'] });
  const frontendFiles = await walk(FRONTEND_ROOT, { exts: ['.ts', '.vue'] });

  const backend = new Map();
  for (const file of backendFiles) {
    const rel = path.relative(repoRoot, file);
    const content = await fs.readFile(file, 'utf8');
    for (const re of [RE_PROCESS_ENV_DOT, RE_PROCESS_ENV_BRACKET]) {
      for (const match of content.matchAll(re)) {
        addMatch(backend, match[1], rel);
      }
    }
  }

  const frontend = new Map();
  for (const file of frontendFiles) {
    const rel = path.relative(repoRoot, file);
    const content = await fs.readFile(file, 'utf8');
    for (const re of [RE_IMPORT_META_ENV_DOT, RE_IMPORT_META_ENV_BRACKET]) {
      for (const match of content.matchAll(re)) {
        addMatch(frontend, match[1], rel);
      }
    }
  }

  const toSortedObject = (m) => {
    const obj = {};
    for (const varName of Array.from(m.keys()).sort()) {
      const fileMap = m.get(varName);
      obj[varName] = Array.from(fileMap.entries())
        .map(([file, count]) => ({ file, count }))
        .sort((a, b) => (a.file < b.file ? -1 : 1));
    }
    return obj;
  };

  return {
    generatedAt: new Date().toISOString(),
    backend: toSortedObject(backend),
    frontend: toSortedObject(frontend),
  };
};

const stripInlineComment = (rawValue) => {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : null;
  if (quote) {
    if (trimmed.endsWith(quote) && trimmed.length >= 2) return trimmed.slice(1, -1);
    return trimmed.slice(1);
  }
  const idx = trimmed.search(/\s#/);
  if (idx >= 0) return trimmed.slice(0, idx).trimEnd();
  return trimmed;
};

const parseEnvFile = async (envPath) => {
  const content = await fs.readFile(envPath, 'utf8');
  const keys = new Set();
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rawValue = m[2] ?? '';
    const value = stripInlineComment(rawValue);
    keys.add(key);
    values.set(key, value);
  }
  return { keys, values };
};

const inferBackendMeta = (varName, files) => {
  const exact = usageMeta.backend.exact[varName];
  if (exact) return exact;
  for (const rule of usageMeta.backend.prefix) {
    if (rule.re.test(varName)) return { module: rule.module, purpose: '-', prodRequired: 'no' };
  }
  const fileHint = (files || []).join(' ');
  if (fileHint.includes('/auth/')) return { module: 'Auth', purpose: '-', prodRequired: 'no' };
  if (fileHint.includes('/stripe/') || fileHint.includes('/payments/'))
    return { module: 'Payments', purpose: '-', prodRequired: 'no' };
  if (fileHint.includes('/ai/')) return { module: 'AI', purpose: '-', prodRequired: 'no' };
  if (fileHint.includes('/common/storage')) return { module: 'Upload', purpose: '-', prodRequired: 'no' };
  return { module: '-', purpose: '-', prodRequired: 'no' };
};

const inferFrontendMeta = (varName, files) => {
  const exact = usageMeta.frontend.exact[varName];
  if (exact) return exact;
  for (const rule of usageMeta.frontend.prefix) {
    if (rule.re.test(varName)) return { module: rule.module, purpose: '-', prodRequired: 'no' };
  }
  const fileHint = (files || []).join(' ');
  if (fileHint.includes('/liff')) return { module: 'LINE/LIFF', purpose: '-', prodRequired: 'no' };
  return { module: '-', purpose: '-', prodRequired: 'no' };
};

const summarizeMissingSymptoms = (scope, missingVars) => {
  const entries = [];
  const add = (re, msg) => {
    if (missingVars.some((v) => re.test(v))) entries.push(msg);
  };
  if (scope === 'backend') {
    add(/^DATABASE_URL$/, 'DB connect fails / Prisma errors');
    add(/^JWT_SECRET$/, 'Backend fails to boot (JWT strategy throws)');
    add(/^FRONTEND_ORIGINS$/, 'CORS blocked (browser cannot call API)');
    add(/^LINE_/, 'LINE login/redirect/callback returns 500');
    add(/^STRIPE_/, 'Checkout/webhook/payment status updates fail or disabled');
    add(/^REDIS_/, 'Queue/settlement jobs may be blocked');
  } else {
    add(/^VITE_API_BASE_URL$/, 'Frontend loads but throws at runtime (config.ts requires it outside dev)');
    add(/^VITE_LIFF_ID$/, 'LIFF flows fail (requireLiffId throws in PROD)');
  }
  return entries.length ? entries.join('; ') : '-';
};

const formatFilesCell = (files) => {
  const max = 4;
  const shown = files.slice(0, max);
  const rest = files.length - shown.length;
  if (!rest) return shown.join(', ');
  return `${shown.join(', ')} (+${rest} more)`;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args['--help'] || args['-h']) {
    console.log(`Usage:
  node scripts/env-audit.mjs [--env-file <path>] [--out <path>] [--out-map <path>]

Examples:
  node scripts/env-audit.mjs --env-file /path/to/.env.production --out deploy/env-audit.report.md
  node scripts/env-audit.mjs --out-map .logs/env-map.json
`);
    process.exit(0);
  }

  const outMap = args['--out-map']
    ? path.resolve(process.cwd(), String(args['--out-map']))
    : path.join(repoRoot, '.logs', 'env-map.json');
  const outReport = args['--out'] ? path.resolve(process.cwd(), String(args['--out'])) : null;
  const envFile = args['--env-file'] ? path.resolve(process.cwd(), String(args['--env-file'])) : null;

  const map = await scanEnvReads();
  await fs.mkdir(path.dirname(outMap), { recursive: true });
  await fs.writeFile(outMap, JSON.stringify(map, null, 2), 'utf8');

  let env = null;
  if (envFile) {
    if (!(await fileExists(envFile))) {
      throw new Error(`Env file not found: ${envFile}`);
    }
    env = await parseEnvFile(envFile);
  }

  const renderTable = (scope, varsObj, inferMeta) => {
    const rows = [];
    const envKeys = env?.keys ?? new Set();
    const missingRequired = [];
    for (const varName of Object.keys(varsObj).sort()) {
      const files = varsObj[varName]?.map((x) => x.file) ?? [];
      const meta = inferMeta(varName, files);
      const present = env ? (envKeys.has(varName) ? 'yes' : 'no') : 'n/a';
      if (env && present === 'no' && (meta.prodRequired === 'yes' || meta.prodRequired === 'conditional')) {
        missingRequired.push(varName);
      }
      rows.push({
        varName,
        module: meta.module,
        purpose: meta.purpose,
        prodRequired: meta.prodRequired,
        present,
        files: formatFilesCell(files),
      });
    }

    const header = `| Variable | Module | Purpose | Prod required | In env file | Read from |\n|---|---|---|---|---|---|\n`;
    const body = rows
      .map((r) => `| \`${r.varName}\` | ${r.module} | ${r.purpose} | ${r.prodRequired} | ${r.present} | ${r.files} |`)
      .join('\n');
    const symptoms = env ? summarizeMissingSymptoms(scope, missingRequired) : '-';
    const summary = env
      ? `\n\nMissing (required/conditional): ${
          missingRequired.length ? missingRequired.map((v) => `\`${v}\``).join(', ') : '(none)'
        }\n\nLikely symptoms: ${symptoms}\n`
      : '';
    return { markdown: header + body + summary, missingRequired };
  };

  const backendReport = renderTable('backend', map.backend, inferBackendMeta);
  const frontendReport = renderTable('frontend', map.frontend, inferFrontendMeta);

  const envWarnings = [];
  if (env?.values) {
    const lineRedirect = env.values.get('LINE_REDIRECT_URI');
    if (typeof lineRedirect === 'string') {
      const trimmed = lineRedirect.trim();
      if (trimmed && trimmed.endsWith('.')) {
        envWarnings.push('`LINE_REDIRECT_URI` ends with `.` (LINE callback URL mismatch risk)');
      }
    }
    const stripeApiVersion = env.values.get('STRIPE_API_VERSION');
    if (stripeApiVersion != null && String(stripeApiVersion).trim() === '') {
      envWarnings.push('`STRIPE_API_VERSION` is present but empty');
    }
  }

  const report = `# Env Audit Report

Generated: ${map.generatedAt}
Repo: ${repoRoot}
Env file: ${envFile ?? '(not provided)'}

## Backend (process.env.*)
${backendReport.markdown}

## Frontend (import.meta.env.*)
${frontendReport.markdown}

## Warnings
${envWarnings.length ? envWarnings.map((x) => `- ${x}`).join('\n') : '- (none)'}

## Notes
- Frontend \`VITE_*\` vars are **Vite build-time** by default. If you only inject env at container runtime, changing \`.env.production\` will not change an already-built frontend bundle.
- This report does **not** print secret values; it only checks whether keys exist.
`;

  if (outReport) {
    await fs.mkdir(path.dirname(outReport), { recursive: true });
    await fs.writeFile(outReport, report, 'utf8');
    console.log(`[env-audit] wrote report: ${path.relative(repoRoot, outReport)}`);
  } else {
    console.log(report);
  }

  console.log(`[env-audit] wrote map: ${path.relative(repoRoot, outMap)}`);
  if (envFile) {
    const unused = Array.from(env.keys)
      .filter((k) => !(k in map.backend) && !(k in map.frontend))
      .sort();
    if (unused.length) {
      console.log(`\n[env-audit] Unused keys in env file (${unused.length}):`);
      console.log(unused.map((k) => `- ${k}`).join('\n'));
    }
  }
};

main().catch((err) => {
  console.error('[env-audit] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

