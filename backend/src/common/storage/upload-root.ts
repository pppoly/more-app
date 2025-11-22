import { mkdirSync } from 'fs';
import { isAbsolute, resolve } from 'path';

const configuredRoot = (process.env.UPLOAD_ROOT ?? '').trim();

const resolvedRoot = configuredRoot
  ? isAbsolute(configuredRoot)
    ? configuredRoot
    : resolve(process.cwd(), configuredRoot)
  : resolve(process.cwd(), 'uploads');

mkdirSync(resolvedRoot, { recursive: true });

export const UPLOAD_ROOT = resolvedRoot;
