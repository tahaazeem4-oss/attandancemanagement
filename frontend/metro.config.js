const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// expo-file-system v19 ships TypeScript source only.
// The '/legacy' subpath lives at src/legacy/index.ts but Metro can't
// find it via the normal node_modules resolution because there is no
// node_modules/expo-file-system/legacy/ directory.
// This resolver maps the subpath import to the correct TypeScript file.
const legacyPath = path.resolve(
  __dirname,
  'node_modules/expo-file-system/src/legacy/index.ts'
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-file-system/legacy') {
    return { filePath: legacyPath, type: 'sourceFile' };
  }
  // Fall back to default resolution for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
