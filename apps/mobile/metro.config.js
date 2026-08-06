// Metro config for a pnpm monorepo. Without this, the bundler only looks inside apps/mobile and
// fails to resolve the workspace package @surani/shared (which lives at packages/shared).
// See: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so changes in packages/shared are picked up.
config.watchFolders = [workspaceRoot];

// Resolve packages from the app first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm uses symlinks; keep resolution to the paths above only.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
