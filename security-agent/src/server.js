const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const ini = require('ini');
const ESL = require('modesl');

const app = express();
const PORT = Number(process.env.AGENT_PORT || 9000);
const TOKEN = process.env.AGENT_TOKEN || '';
const DEFAULT_JAIL = process.env.F2B_DEFAULT_JAIL || 'freeswitch-sip';
const STATE_PATH = process.env.STATE_FILE || '/data/state.json';
const FIREWALL_FAMILY = process.env.NFT_FAMILY || 'inet';
const FIREWALL_TABLE = process.env.NFT_TABLE || 'filter';
const FIREWALL_CHAIN = process.env.NFT_CHAIN || 'input';
const FIREWALL_HOOK = process.env.NFT_CHAIN_HOOK || 'input';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const F2B_JAIL_CONFIG_PATH = process.env.F2B_JAIL_CONFIG_PATH || '/etc/fail2ban/jail.d/portal.local';
const F2B_FILTER_DIR = process.env.F2B_FILTER_DIR || '/etc/fail2ban/filter.d';
const ESL_ENABLED = (process.env.FS_ESL_ENABLED || 'true').toLowerCase() !== 'false';
const ESL_HOST = process.env.FS_ESL_HOST || '127.0.0.1';
const ESL_PORT = Number(process.env.FS_ESL_PORT || 8021);
const ESL_PASSWORD = process.env.FS_ESL_PASSWORD || '';
const ESL_TIMEOUT_MS = Number(process.env.FS_ESL_TIMEOUT_MS || 2000);
const ESL_PROFILES = (process.env.FS_ESL_PROFILES || 'internal')
  .split(',')
  .map((item) => item.trim())
  .filter((item) => item.length > 0);

let state = {
  firewallRules: [],
};

async function loadState() {
  try {
    const file = await fs.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(file);
    if (parsed && typeof parsed === 'object') {
      const storedRules = Array.isArray(parsed.firewallRules) ? parsed.firewallRules : [];
      state = {
        firewallRules: storedRules.map((rule) => ({
          ...rule,
          managedBy: rule.managedBy || undefined,
          banKey: rule.banKey || undefined,
        })),
      };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[agent] Unable to load state file', error.message);
    }
  }
}

async function saveState() {
  const dir = path.dirname(STATE_PATH);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[agent] Failed to persist state', error.message);
  }
}

function runCommand(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10000, ...opts }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        return reject(error);
      }
      return resolve(stdout);
    });
  });
}

function hasEslConfig() {
  return Boolean(ESL_ENABLED && ESL_PASSWORD && ESL_HOST && ESL_PROFILES.length > 0);
}

async function execEsl(command) {
  if (!hasEslConfig()) {
    return null;
  }
  return new Promise((resolve, reject) => {
    let resolved = false;
    const connection = new ESL.Connection(ESL_HOST, ESL_PORT, ESL_PASSWORD, () => {
      connection.api(command, (response) => {
        resolved = true;
        clearTimeout(timeout);
        const body = typeof response?.getBody === 'function' ? response.getBody() : null;
        connection.disconnect();
        resolve(body);
      });
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        try {
          connection.disconnect();
        } catch (error) {
          // noop
        }
        reject(new Error('ESL timeout'));
      }
    }, ESL_TIMEOUT_MS);

    connection.on('error', (error) => {
      clearTimeout(timeout);
      if (!resolved) {
        reject(error);
      }
    });

    connection.on('disconnect', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolve(null);
      }
    });
  }).catch((error) => {
    if (LOG_LEVEL === 'debug') {
      console.warn(`[agent] ESL command failed (${command}):`, error.message);
    }
    return null;
  });
}

async function flushFsRegistrations(ip) {
  if (!ip || !hasEslConfig()) {
    return;
  }
  for (const profile of ESL_PROFILES) {
    const cmd = `sofia profile ${profile} flush_inbound_reg ${ip}`;
    await execEsl(cmd);
  }
}

async function flushConntrack(ip) {
  if (!ip) {
    return;
  }
  const commands = [
    ['conntrack', ['-D', '-s', ip]],
    ['conntrack', ['-D', '-d', ip]],
  ];
  for (const [cmd, args] of commands) {
    try {
      await runCommand(cmd, args);
    } catch (error) {
      if (LOG_LEVEL === 'debug') {
        console.warn(`[agent] conntrack cleanup failed (${cmd} ${args.join(' ')}):`, error.message);
      }
    }
  }
}

async function remediateBlockedIp(ip) {
  if (!ip) {
    return;
  }
  await Promise.allSettled([
    flushConntrack(ip),
    flushFsRegistrations(ip),
  ]);
}

async function loadFilterConfig(filterName) {
  if (!filterName) {
    return null;
  }
  const targetPath = path.join(F2B_FILTER_DIR, `${filterName}.conf`);
  const content = await fs.readFile(targetPath, 'utf8').catch(() => null);
  if (!content) {
    return {
      name: filterName,
      path: targetPath,
      failregex: [],
      ignoreregex: [],
    };
  }

  const lines = content.split(/\r?\n/);
  const failregex = [];
  const ignoreregex = [];
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim()) {
      continue;
    }
    const equalIndex = line.indexOf('=');
    if (equalIndex !== -1) {
      const key = line.slice(0, equalIndex).trim().toLowerCase();
      const value = line.slice(equalIndex + 1).trim();
      currentKey = key;
      if (key === 'failregex') {
        if (value) {
          failregex.push(value);
        }
        continue;
      }
      if (key === 'ignoreregex') {
        if (value) {
          ignoreregex.push(value);
        }
        continue;
      }
      currentKey = null;
    } else if (currentKey) {
      const continuation = line.trim();
      if (continuation) {
        if (currentKey === 'failregex') {
          failregex.push(continuation);
        }
        if (currentKey === 'ignoreregex') {
          ignoreregex.push(continuation);
        }
      }
    }
  }

  return {
    name: filterName,
    path: targetPath,
    failregex,
    ignoreregex,
  };
}

async function writeFilterConfig(filter) {
  if (!filter || !filter.name) {
    return;
  }
  const targetPath = path.join(F2B_FILTER_DIR, `${filter.name}.conf`);
  const failregex = Array.isArray(filter.failregex) ? filter.failregex.filter(Boolean) : [];
  const ignoreregex = Array.isArray(filter.ignoreregex) ? filter.ignoreregex.filter(Boolean) : [];

  const lines = ['[Definition]'];

  if (failregex.length > 0) {
    lines.push(`failregex = ${failregex[0]}`);
    for (let i = 1; i < failregex.length; i += 1) {
      lines.push(`            ${failregex[i]}`);
    }
  } else {
    lines.push('failregex =');
  }

  lines.push('');

  if (ignoreregex.length > 0) {
    lines.push(`ignoreregex = ${ignoreregex[0]}`);
    for (let i = 1; i < ignoreregex.length; i += 1) {
      lines.push(`              ${ignoreregex[i]}`);
    }
  } else {
    lines.push('ignoreregex =');
  }

  lines.push('');

  const payload = `${lines.join('\n')}\n`;
  await fs.writeFile(targetPath, payload, 'utf8');
}

function normalizeJailSection(name, settings) {
  const rawSettings = { ...settings };
  const filterName = rawSettings.filter || name;
  const ignoreIp = splitList(rawSettings.ignoreip);

  return {
    name,
    enabled: parseBoolean(rawSettings.enabled, true),
    maxretry: parseNumber(rawSettings.maxretry),
    findtime: parseNumber(rawSettings.findtime),
    bantime: parseNumber(rawSettings.bantime),
    ignoreIp,
    logPath: rawSettings.logpath || null,
    action: rawSettings.action || null,
    backend: rawSettings.backend || null,
    port: rawSettings.port || null,
    protocol: rawSettings.protocol || null,
    filter: {
      name: filterName,
    },
    settings: rawSettings,
  };
}

async function loadFail2banConfig() {
  const jailContent = await fs.readFile(F2B_JAIL_CONFIG_PATH, 'utf8').catch(() => '');
  const parsed = jailContent ? ini.parse(jailContent) : {};

  const global = { ...(parsed.DEFAULT || {}) };

  const jailEntries = Object.entries(parsed).filter(([section]) => section !== 'DEFAULT');
  const jails = await Promise.all(
    jailEntries.map(async ([name, settings]) => {
      const jail = normalizeJailSection(name, settings || {});
      if (jail.filter?.name) {
        jail.filter = await loadFilterConfig(jail.filter.name);
      }
      return jail;
    }),
  );

  return {
    global,
    jails,
  };
}

async function updateFail2banConfig(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload không hợp lệ');
  }

  const iniData = {};

  if (payload.global && typeof payload.global === 'object') {
    const defaultSection = {};
    Object.entries(payload.global).forEach(([key, value]) => {
      const serialized = serializeValue(value);
      if (serialized !== undefined) {
        defaultSection[key] = serialized;
      }
    });
    if (Object.keys(defaultSection).length > 0) {
      iniData.DEFAULT = defaultSection;
    }
  }

  if (Array.isArray(payload.jails)) {
    for (const jail of payload.jails) {
      if (!jail || typeof jail !== 'object' || !jail.name) {
        continue;
      }
      const section = {};
      const baseSettings = jail.settings && typeof jail.settings === 'object' ? { ...jail.settings } : {};

      const enabledValue = serializeValue(
        jail.enabled !== undefined ? (jail.enabled ? 'true' : 'false') : baseSettings.enabled,
      );
      if (enabledValue !== undefined) {
        section.enabled = enabledValue;
      }

      const numericKeys = ['maxretry', 'findtime', 'bantime'];
      numericKeys.forEach((key) => {
        const value = jail[key] !== undefined ? jail[key] : baseSettings[key];
        const serialized = serializeValue(value);
        if (serialized !== undefined) {
          section[key] = serialized;
        }
      });

      const stringKeys = ['logpath', 'action', 'backend', 'port', 'protocol'];
      stringKeys.forEach((key) => {
        const value = jail[key] !== undefined ? jail[key] : baseSettings[key];
        const serialized = serializeValue(value);
        if (serialized !== undefined) {
          section[key] = serialized;
        }
      });

      if (jail.ignoreIp || baseSettings.ignoreip) {
        const value = Array.isArray(jail.ignoreIp) ? jail.ignoreIp : splitList(baseSettings.ignoreip);
        const serialized = serializeValue(value);
        if (serialized !== undefined) {
          section.ignoreip = serialized;
        }
      }

      const filterName = jail.filter?.name || baseSettings.filter || jail.name;
      if (filterName) {
        section.filter = filterName;
      }

      Object.entries(baseSettings).forEach(([key, value]) => {
        if (section[key] === undefined) {
          const serialized = serializeValue(value);
          if (serialized !== undefined) {
            section[key] = serialized;
          }
        }
      });

      iniData[jail.name] = section;
    }
  }

  const iniPayload = ini.stringify(iniData);
  await fs.writeFile(F2B_JAIL_CONFIG_PATH, `${iniPayload.trim()}\n`, 'utf8');

  if (Array.isArray(payload.jails)) {
    for (const jail of payload.jails) {
      if (jail && jail.filter && jail.filter.name) {
        await writeFilterConfig(jail.filter);
      }
    }
  }

  await runCommand('fail2ban-client', ['reload']);
}

async function ensureFirewallRule(rule) {
  await ensureFirewallBase();
  const handle = await findRuleHandle(rule.id);
  if (handle) {
    rule.handle = handle;
    return;
  }
  await addFirewallRule(rule, true);
  rule.handle = await findRuleHandle(rule.id);
}

async function ensureFirewallBase() {
  try {
    await runCommand('nft', ['list', 'table', FIREWALL_FAMILY, FIREWALL_TABLE]);
  } catch (error) {
    try {
      await runCommand('nft', ['create', 'table', FIREWALL_FAMILY, FIREWALL_TABLE]);
    } catch (inner) {
      if (LOG_LEVEL === 'debug') {
        console.warn('[agent] create table failed', inner.message);
      }
    }
  }

  try {
    await runCommand('nft', ['list', 'chain', FIREWALL_FAMILY, FIREWALL_TABLE, FIREWALL_CHAIN]);
  } catch (error) {
    const chainArgs = [
      'create',
      'chain',
      FIREWALL_FAMILY,
      FIREWALL_TABLE,
      FIREWALL_CHAIN,
      '{',
      'type',
      'filter',
      'hook',
      FIREWALL_HOOK,
      'priority',
      '0',
      ';',
      'policy',
      'accept',
      ';',
      '}',
    ];
    try {
      await runCommand('nft', chainArgs);
    } catch (inner) {
      if (LOG_LEVEL === 'debug') {
        console.warn('[agent] create chain failed', inner.message);
      }
    }
  }
}

function buildNftArgs(rule) {
  const args = ['add', 'rule', FIREWALL_FAMILY, FIREWALL_TABLE, FIREWALL_CHAIN];

  if (rule.source) {
    args.push('ip', 'saddr', rule.source);
  }

  if (rule.destination) {
    args.push('ip', 'daddr', rule.destination);
  }

  if (rule.protocol) {
    args.push('meta', 'l4proto', rule.protocol.toLowerCase());
    if (rule.port && ['tcp', 'udp'].includes(rule.protocol.toLowerCase())) {
      const portExpr = String(rule.port).includes('-') ? String(rule.port) : Number(rule.port);
      args.push(rule.protocol.toLowerCase(), 'dport', portExpr);
    }
  }

  const action = (rule.action || 'drop').toLowerCase();
  if (action === 'accept') {
    args.push('counter', 'accept');
  } else if (action === 'reject') {
    args.push('counter', 'reject');
  } else {
    args.push('counter', 'drop');
  }

  const commentParts = [`portal-${rule.id}`];
  if (rule.description) {
    commentParts.push(rule.description);
  }
  const commentRaw = commentParts.join(' ');
  const sanitizedComment = commentRaw.replace(/[^a-zA-Z0-9_:\-\s]/g, ' ').trim() || `portal-${rule.id}`;
  args.push('comment', `"${sanitizedComment}"`);

  return args;
}

async function findRuleHandle(id) {
  try {
    const output = await runCommand('nft', ['-j', 'list', 'chain', FIREWALL_FAMILY, FIREWALL_TABLE, FIREWALL_CHAIN]);
    const parsed = JSON.parse(output);
    if (!parsed || !Array.isArray(parsed.nftables)) {
      return null;
    }
    for (const item of parsed.nftables) {
      if (!item.rule) continue;
      const { handle, comment } = item.rule;
      if (comment && comment.startsWith(`portal-${id}`)) {
        return handle;
      }
    }
  } catch (error) {
    if (LOG_LEVEL === 'debug') {
      console.warn('[agent] findRuleHandle error', error.message);
    }
  }
  return null;
}

async function addFirewallRule(rule, reapply = false) {
  const args = buildNftArgs(rule);
  try {
    await runCommand('nft', args);
  } catch (error) {
    if (reapply && error.stderr && error.stderr.includes('already exists')) {
      return;
    }
    throw error;
  }
}

async function deleteFirewallRule(rule) {
  let handle = rule?.handle ? String(rule.handle) : null;
  if (!handle) {
    handle = await findRuleHandle(rule.id);
  }
  if (!handle) {
    return false;
  }
  await runCommand('nft', ['delete', 'rule', FIREWALL_FAMILY, FIREWALL_TABLE, FIREWALL_CHAIN, 'handle', String(handle)]);
  return true;
}

async function listPortalBanRulesFromNft() {
  const matches = [];
  try {
    const output = await runCommand('nft', ['-j', 'list', 'chain', FIREWALL_FAMILY, FIREWALL_TABLE, FIREWALL_CHAIN]);
    const parsed = JSON.parse(output);
    if (!parsed || !Array.isArray(parsed.nftables)) {
      return matches;
    }
    for (const item of parsed.nftables) {
      if (!item.rule) continue;
      const { handle, comment } = item.rule;
      if (!comment || typeof comment !== 'string') {
        continue;
      }
      if (comment.startsWith('portal-ban-')) {
        const rest = comment.slice('portal-ban-'.length).trim();
        const spaceIndex = rest.indexOf(' ');
        const banKey = (spaceIndex === -1 ? rest : rest.slice(0, spaceIndex)).trim();
        if (banKey) {
          matches.push({ handle: String(handle), banKey });
        }
      }
    }
  } catch (error) {
    if (LOG_LEVEL === 'debug') {
      console.warn('[agent] unable to list ban rules from nft', error.message);
    }
  }
  return matches;
}

function parseJailList(raw) {
  const match = raw.match(/Jail list:\s*([^\n]+)/i);
  if (!match) {
    return [];
  }
  const list = match[1].trim();
  if (!list) {
    return [];
  }
  return list.split(/[,\s]+/).filter(Boolean);
}

function parseBannedFromStatus(raw) {
  const banned = [];
  const lines = raw.split('\n').map((line) => line.trim());
  let ipListLine = lines.find((line) => /ip list:/i.test(line));
  if (ipListLine) {
    const part = ipListLine.split(':').slice(1).join(':').trim();
    if (part) {
      banned.push(...part.split(/\s+/).filter(Boolean));
    }
  }
  const altLine = lines.find((line) => /banned ip list/i.test(line));
  if (altLine) {
    const part = altLine.split(':').slice(1).join(':').trim();
    if (part) {
      banned.push(...part.split(/\s+/).filter(Boolean));
    }
  }
  return Array.from(new Set(banned));
}

async function getFail2banSummary() {
  try {
    const [versionRaw, statusRaw] = await Promise.all([
      runCommand('fail2ban-client', ['--version']).catch(() => ''),
      runCommand('fail2ban-client', ['status']),
    ]);
    const jails = parseJailList(statusRaw);
    const jailSummaries = [];
    for (const jail of jails) {
      try {
        const jailStatus = await runCommand('fail2ban-client', ['status', jail]);
        const banned = parseBannedFromStatus(jailStatus);
        jailSummaries.push({
          name: jail,
          banned: banned.length,
          total: banned.length,
          file: null,
        });
      } catch (error) {
        jailSummaries.push({
          name: jail,
          banned: 0,
        });
      }
    }
    return {
      running: true,
      version: versionRaw.trim() || null,
      jails: jailSummaries,
    };
  } catch (error) {
    return {
      running: false,
      version: null,
      jails: [],
    };
  }
}

async function listBans() {
  const bans = [];
  let jails = [];
  try {
    const raw = await runCommand('fail2ban-client', ['status']);
    jails = parseJailList(raw);
  } catch (error) {
    return bans;
  }

  for (const jail of jails) {
    try {
      const jailStatus = await runCommand('fail2ban-client', ['status', jail]);
      const bannedIps = parseBannedFromStatus(jailStatus);
      for (const ip of bannedIps) {
        bans.push({
          id: `${jail}:${ip}`,
          ip,
          jail,
          createdAt: null,
          expiresAt: null,
          reason: null,
          source: 'fail2ban',
        });
      }
    } catch (error) {
      if (LOG_LEVEL === 'debug') {
        console.warn(`[agent] Unable to list bans for ${jail}:`, error.message);
      }
    }
  }
  return bans;
}

async function createBan({ ip, jail, durationSeconds, reason }) {
  const targetJail = jail || DEFAULT_JAIL;
  const command = ['set', targetJail, 'banip', ip];
  await runCommand('fail2ban-client', command);
  return {
    id: `${targetJail}:${ip}`,
    ip,
    jail: targetJail,
    createdAt: new Date().toISOString(),
    expiresAt: durationSeconds ? null : null,
    reason: reason || null,
    source: 'manual',
  };
}

async function removeBan({ idOrIp, jail }) {
  const targetJail = jail || DEFAULT_JAIL;
  const ip = idOrIp.includes(':') ? idOrIp.split(':')[1] : idOrIp;
  await runCommand('fail2ban-client', ['set', targetJail, 'unbanip', ip]);
  return true;
}

function extractSingleIp(value) {
  if (!value) {
    return null;
  }
  if (IPV4_REGEX.test(value)) {
    return value;
  }
  if (value.includes('/')) {
    const [base, mask] = value.split('/');
    if (mask === '32' && IPV4_REGEX.test(base)) {
      return base;
    }
  }
  return null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function splitList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function serializeValue(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.join(' ');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

async function ensureBanFirewallRule(ip, banKey) {
  if (!ip) {
    return;
  }
  const ruleId = `ban-${banKey}`;
  const existing = state.firewallRules.find((item) => item.id === ruleId);
  const rulePayload = {
    id: ruleId,
    action: 'drop',
    source: ip,
    destination: null,
    protocol: null,
    port: null,
    description: `[ban] ${ip}`,
    createdAt: new Date().toISOString(),
    managedBy: 'ban',
    banKey,
  };

  try {
    await addFirewallRule(rulePayload);
    rulePayload.handle = await findRuleHandle(ruleId);
    if (existing) {
      Object.assign(existing, rulePayload);
    } else {
      state.firewallRules.unshift(rulePayload);
    }
    await saveState();
  } catch (error) {
    console.error('[agent] unable to create ban firewall rule', error.message);
  }
}

async function removeBanFirewallRule(banKey) {
  const targets = state.firewallRules.filter((rule) => rule.banKey === banKey || rule.id === `ban-${banKey}`);
  if (targets.length === 0) {
    return;
  }
  const failedIds = new Set();
  for (const rule of targets) {
    try {
      const deleted = await deleteFirewallRule(rule);
      if (!deleted) {
        failedIds.add(rule.id);
      }
    } catch (error) {
      if (LOG_LEVEL === 'debug') {
        console.warn('[agent] unable to delete ban firewall rule', error.message);
      }
      failedIds.add(rule.id);
    }
  }
  state.firewallRules = state.firewallRules.filter((rule) => {
    if (rule.banKey === banKey || rule.id === `ban-${banKey}`) {
      return failedIds.has(rule.id);
    }
    return true;
  });
  await saveState();
}

async function syncBanFirewallRules(bans) {
  const activeKeys = new Map();
  for (const ban of bans) {
    const key = ban?.id || (ban?.jail && ban?.ip ? `${ban.jail}:${ban.ip}` : null);
    if (key) {
      activeKeys.set(key, extractSingleIp(ban.ip));
      await ensureBanFirewallRule(extractSingleIp(ban.ip), key);
    }
  }

  const nftBanRules = await listPortalBanRulesFromNft();
  for (const nftRule of nftBanRules) {
    if (!activeKeys.has(nftRule.banKey)) {
      try {
        await runCommand('nft', ['delete', 'rule', FIREWALL_FAMILY, FIREWALL_TABLE, FIREWALL_CHAIN, 'handle', nftRule.handle]);
      } catch (error) {
        if (LOG_LEVEL === 'debug') {
          console.warn('[agent] unable to delete orphan ban rule', error.message);
        }
      }
    }
  }

  state.firewallRules = state.firewallRules.filter((rule) => {
    if (rule.managedBy === 'ban') {
      if (!activeKeys.has(rule.banKey)) {
        return false;
      }
      const nftMatch = nftBanRules.find((item) => item.banKey === rule.banKey);
      if (nftMatch) {
        rule.handle = nftMatch.handle;
      }
      return true;
    }
    return true;
  });
  await saveState();
}

async function getFirewallSummary() {
  const total = state.firewallRules.length;
  return {
    backend: 'nftables',
    defaultPolicy: 'managed via nft',
    rulesCount: total,
    updatedAt: new Date().toISOString(),
  };
}

async function syncFirewallState() {
  await ensureFirewallBase();
  for (const rule of state.firewallRules) {
    try {
      await ensureFirewallRule(rule);
    } catch (error) {
      console.error(`[agent] unable to ensure rule ${rule.id}:`, error.message);
    }
  }
  await saveState();
}

function authenticate(req, res, next) {
  if (!TOKEN) {
    return next();
  }
  const header = req.headers['authorization'];
  if (!header || header !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return next();
}

function validateIpOrCidr(value) {
  const cidrRegex = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
  return cidrRegex.test(value);
}

function validateAction(value) {
  return ['drop', 'reject', 'accept'].includes(value);
}

app.use(morgan(LOG_LEVEL === 'debug' ? 'dev' : 'tiny'));
app.use(bodyParser.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use(authenticate);

app.get('/status', async (_req, res) => {
  const [fail2ban, firewall] = await Promise.all([
    getFail2banSummary(),
    getFirewallSummary(),
  ]);
  res.json({
    agent: {
      connected: true,
      lastCheckedAt: new Date().toISOString(),
    },
    summary: {
      fail2ban,
      firewall,
    },
  });
});

app.get('/fail2ban/config', async (_req, res) => {
  try {
    const config = await loadFail2banConfig();
    res.json(config);
  } catch (error) {
    console.error('[agent] load fail2ban config failed', error.message);
    res.status(500).json({ message: 'Không thể đọc cấu hình Fail2Ban', detail: error.message });
  }
});

app.put('/fail2ban/config', async (req, res) => {
  try {
    await updateFail2banConfig(req.body);
    const config = await loadFail2banConfig();
    const bans = await listBans();
    await syncBanFirewallRules(bans);
    res.json(config);
  } catch (error) {
    console.error('[agent] update fail2ban config failed', error.message);
    const status = /không hợp lệ/i.test(error.message) ? 400 : 500;
    res.status(status).json({ message: 'Không thể cập nhật cấu hình Fail2Ban', detail: error.message });
  }
});

app.get('/bans', async (_req, res) => {
  const bans = await listBans();
  await syncBanFirewallRules(bans);
  res.json(bans);
});

app.post('/bans', async (req, res) => {
  const { ip, jail, durationSeconds, reason } = req.body || {};
  if (!ip || !validateIpOrCidr(ip)) {
    return res.status(400).json({ message: 'IP hoặc CIDR không hợp lệ' });
  }
  try {
    const result = await createBan({ ip, jail, durationSeconds, reason });
    await ensureBanFirewallRule(result.ip, result.id);
    await remediateBlockedIp(result.ip);
    res.json(result);
  } catch (error) {
    console.error('[agent] create ban failed', error.message);
    res.status(500).json({ message: 'Không thể ban IP', detail: error.stderr || error.message });
  }
});

app.delete('/bans/:id', async (req, res) => {
  const { id } = req.params;
  const jail = req.query.jail;
  if (!id) {
    return res.status(400).json({ message: 'Thiếu mã ban hoặc IP' });
  }
  try {
    await removeBan({ idOrIp: id, jail });
    const ipCandidate = extractSingleIp(id.includes(':') ? id.split(':')[1] : id);
    if (ipCandidate) {
      await remediateBlockedIp(ipCandidate);
    }
    await removeBanFirewallRule(id);
    const remainingBans = await listBans();
    await syncBanFirewallRules(remainingBans);
    res.json({ success: true });
  } catch (error) {
    console.error('[agent] remove ban failed', error.message);
    res.status(500).json({ message: 'Không thể gỡ ban', detail: error.stderr || error.message });
  }
});

app.get('/firewall/rules', async (_req, res) => {
  const enriched = [];
  const visibleRules = state.firewallRules.filter((rule) => rule.managedBy !== 'ban');
  for (const rule of visibleRules) {
    const handle = await findRuleHandle(rule.id);
    enriched.push({ ...rule, handle });
  }
  res.json(enriched);
});

app.post('/firewall/rules', async (req, res) => {
  const { action = 'drop', source, destination, protocol, port, description } = req.body || {};

  if (!validateAction(action.toLowerCase())) {
    return res.status(400).json({ message: 'Action không hợp lệ (drop | reject | accept)' });
  }

  if (source && !validateIpOrCidr(source)) {
    return res.status(400).json({ message: 'Source IP/CIDR không hợp lệ' });
  }
  if (destination && !validateIpOrCidr(destination)) {
    return res.status(400).json({ message: 'Destination IP/CIDR không hợp lệ' });
  }

  const rule = {
    id: uuidv4(),
    action: action.toLowerCase(),
    source: source || null,
    destination: destination || null,
    protocol: protocol ? String(protocol).toLowerCase() : null,
    port: port || null,
    description: description || null,
    createdAt: new Date().toISOString(),
    managedBy: 'manual',
  };

  try {
    await addFirewallRule(rule);
    rule.handle = await findRuleHandle(rule.id);
    state.firewallRules.unshift(rule);
    await saveState();
    const ipCandidate = extractSingleIp(rule.source);
    if (ipCandidate) {
      await remediateBlockedIp(ipCandidate);
    }
    res.json(rule);
  } catch (error) {
    console.error('[agent] create rule failed', error.message);
    res.status(500).json({ message: 'Không thể tạo rule nftables', detail: error.stderr || error.message });
  }
});

app.delete('/firewall/rules/:id', async (req, res) => {
  const { id } = req.params;
  const rule = state.firewallRules.find((item) => item.id === id);
  if (!rule) {
    return res.status(404).json({ message: 'Không tìm thấy rule' });
  }
  try {
    await deleteFirewallRule(rule);
    state.firewallRules = state.firewallRules.filter((item) => item.id !== id);
    await saveState();
    res.json({ success: true });
  } catch (error) {
    console.error('[agent] delete rule failed', error.message);
    res.status(500).json({ message: 'Không thể xoá rule', detail: error.stderr || error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[agent] unexpected error', err);
  res.status(500).json({ message: 'Agent internal error' });
});

(async () => {
  await loadState();
  await syncFirewallState();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[agent] listening on port ${PORT}`);
  });
})();
