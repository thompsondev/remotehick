import fs from 'fs';
import path from 'path';

export function loadEnv(envPath = '.env') {
  const text = fs
    .readFileSync(path.resolve(envPath), 'utf8')
    .replace(/^\uFEFF/, '');
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function upsertEnvValue(text, key, value) {
  const line = `${key}="${value}"`;
  const active = new RegExp(`^${key}=.*$`, 'm');
  const commented = new RegExp(`^#\\s*${key}=.*$`, 'm');

  if (active.test(text)) {
    return text.replace(active, line);
  }
  if (commented.test(text)) {
    return text.replace(commented, line);
  }
  return `${text.trimEnd()}\n${line}\n`;
}

export function saveEnvValues(values, envPath = '.env') {
  const resolved = path.resolve(envPath);
  let text = fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
  for (const [key, value] of Object.entries(values)) {
    text = upsertEnvValue(text, key, value);
  }
  fs.writeFileSync(resolved, text, 'utf8');
}

export function getAgentInstallerPath(env) {
  const variant = (env.AGENT_INSTALLER_VARIANT || 'setup').toLowerCase();
  const defaults = {
    setup: 'public/agents/Remote-Agent-Setup.exe',
    portable: 'public/agents/Remote-Agent-Portable.exe',
    zip: 'public/agents/Remote-Agent-win.zip',
  };
  const configured =
    variant === 'setup' ? env.AGENT_INSTALLER_PATH?.trim() : undefined;
  return path.resolve(configured || defaults[variant] || defaults.setup);
}
