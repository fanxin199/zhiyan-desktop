const { existsSync } = require('node:fs')

const hasExplicitMacSigningIdentity = Boolean(
  process.env.CSC_LINK ||
    process.env.CSC_NAME ||
    process.env.CSC_KEY_PASSWORD ||
    process.env.MAC_SIGN === '1'
)

const iconPath = existsSync('./src/asset/img/zhiyan.png')
  ? './src/asset/img/zhiyan.png'
  : undefined

module.exports = {
  appId: 'com.zhiyan.assistant',
  productName: '智研助手',
  asar: true,
  asarUnpack: [
    '**/kun/dist/**/*',
    '**/kun/package*.json',
    '**/kun/node_modules/**/*',
    '**/node_modules/better-sqlite3/**/*',
    '**/node_modules/bindings/**/*',
    '**/node_modules/file-uri-to-path/**/*'
  ],
  npmRebuild: true,
  directories: {
    output: process.env.ZHIYAN_DIST_DIR || 'dist'
  },
  extraResources: [
    {
      from: 'resources/builtin-skills',
      to: 'builtin-skills'
    }
  ],
  files: [
    'out/**/*',
    'package.json',
    'kun/dist/**/*',
    'kun/package.json',
    'kun/package-lock.json',
    'kun/node_modules/**/*',
    '!**/*.map',
    '!**/*.d.ts',
    '!**/*.ts',
    '!**/tsconfig*.json',
    '!**/README*',
    '!**/CHANGELOG*',
    '!**/node_modules/openclaw/**/*'
  ],
  artifactName: 'ZhiYan-Assistant-${version}-${os}-${arch}.${ext}',
  afterPack: './scripts/after-pack.cjs',
  afterSign: './scripts/mac-notarize.cjs',
  mac: {
    category: 'public.app-category.education',
    identity: hasExplicitMacSigningIdentity ? undefined : null,
    notarize: false,
    hardenedRuntime: hasExplicitMacSigningIdentity,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    ...(iconPath ? { icon: iconPath } : {}),
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] }
    ]
  },
  dmg: {
    sign: hasExplicitMacSigningIdentity
  },
  win: {
    ...(iconPath ? { icon: iconPath } : {}),
    target: [{ target: 'nsis', arch: ['x64'] }]
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    allowElevation: true,
    selectPerMachineByDefault: false,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: '智研助手',
    uninstallDisplayName: '智研助手',
    deleteAppDataOnUninstall: false
  },
  linux: {
    category: 'Education',
    ...(iconPath ? { icon: iconPath } : {}),
    target: [{ target: 'AppImage', arch: ['x64'] }]
  }
}
