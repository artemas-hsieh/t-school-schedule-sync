#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const defaultOutput = path.join(
  projectRoot,
  'outputs',
  'google-docs-control-panel',
  'Code.gs'
);
const REQUIRED_OAUTH_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/documents.currentonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/script.send_mail',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/script.container.ui',
  'https://www.googleapis.com/auth/userinfo.email'
]);

function parseArguments(argv) {
  const options = {
    appVersion: '2.0.0-rc.2',
    highLoadTestingEnabled: false,
    output: defaultOutput,
    manifestOutput: '',
    emailTemplateManifestUrl: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--test-build') {
      options.highLoadTestingEnabled = true;
      continue;
    }
    if (argument === '--manifest-url') {
      options.emailTemplateManifestUrl = String(argv[++index] || '');
      continue;
    }
    if (argument === '--app-version') {
      options.appVersion = String(argv[++index] || '');
      continue;
    }
    if (argument === '--output') {
      options.output = path.resolve(process.cwd(), String(argv[++index] || ''));
      continue;
    }
    if (argument === '--appsscript-manifest-output') {
      options.manifestOutput = path.resolve(process.cwd(), String(argv[++index] || ''));
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    throw new Error('Unknown argument: ' + argument);
  }

  return options;
}

function printUsage() {
  process.stdout.write([
    'Usage:',
    '  node scripts/generate-google-docs-control-panel.js \\',
    '    --manifest-url https://raw.githubusercontent.com/<owner>/<repo>/<40-char-commit>/notification-email-templates.json',
    '',
    'Options:',
    '  --output <path>       Output path (default: outputs/google-docs-control-panel/Code.gs)',
    '  --appsscript-manifest-output <path>',
    '                        Apps Script manifest path (default: appsscript.json beside Code.gs)',
    '  --app-version <value> App version embedded in the artifact',
    '  --test-build          Include developer-only high-load test functions',
    ''
  ].join('\n'));
}

function buildAppsScriptManifest() {
  return {
    timeZone: 'Asia/Taipei',
    dependencies: {
      enabledAdvancedServices: [{
        userSymbol: 'Sheets',
        version: 'v4',
        serviceId: 'sheets'
      }]
    },
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    oauthScopes: REQUIRED_OAUTH_SCOPES.slice()
  };
}

function loadGenerator() {
  global.window = global;
  require(path.join(projectRoot, 'sidebar-template.js'));
  require(path.join(projectRoot, 'setup-dialog-template.js'));
  require(path.join(projectRoot, 'code-template.js'));
  if (typeof global.buildAppsScriptCode !== 'function') {
    throw new Error('Unable to load the Code.gs generator.');
  }
  return global.buildAppsScriptCode;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.emailTemplateManifestUrl) {
    throw new Error(
      'Production generation requires --manifest-url with a published, immutable 40-character commit URL.'
    );
  }

  const scheduleData = require(path.join(projectRoot, 'schedule-data.js'));
  const buildAppsScriptCode = loadGenerator();
  const output = buildAppsScriptCode({
    appVersion: options.appVersion,
    sourceApiUrl: scheduleData.API_URL,
    emailTemplateManifestUrl: options.emailTemplateManifestUrl,
    highLoadTestingEnabled: options.highLoadTestingEnabled
  });
  const manifestOutput = options.manifestOutput || path.join(
    path.dirname(options.output),
    'appsscript.json'
  );
  const manifest = JSON.stringify(buildAppsScriptManifest(), null, 2) + '\n';

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, output, 'utf8');
  fs.mkdirSync(path.dirname(manifestOutput), { recursive: true });
  fs.writeFileSync(manifestOutput, manifest, 'utf8');
  process.stdout.write(options.output + '\n' + manifestOutput + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write('Generation failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_OAUTH_SCOPES,
  buildAppsScriptManifest,
  parseArguments
};
