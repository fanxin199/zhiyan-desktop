const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { createReadStream, existsSync } = require('node:fs')
const { mkdir, stat, writeFile } = require('node:fs/promises')
const { basename, join, resolve } = require('node:path')

const MINIMUM_INSTALLER_BYTES = 50 * 1024 * 1024

function requiredPackagedPaths(productName) {
  return [
    `${productName}.exe`,
    'resources/app.asar',
    'resources/app.asar.unpacked/kun/dist/cli/serve-entry.js',
    'resources/app.asar.unpacked/kun/node_modules/zod/package.json',
    'resources/app.asar.unpacked/node_modules/better-sqlite3/package.json',
    'resources/builtin-skills/courseware-builder/skill.json',
    'resources/builtin-skills/research-data-analyst/skill.json'
  ]
}

async function sha256(path) {
  const hash = createHash('sha256')
  await new Promise((resolvePromise, reject) => {
    const input = createReadStream(path)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('error', reject)
    input.on('end', resolvePromise)
  })
  return hash.digest('hex')
}

function readAuthenticodeSignature(installerPath) {
  if (process.platform !== 'win32') return { status: 'not-checked', subject: null }
  const command = [
    '$signature = Get-AuthenticodeSignature -LiteralPath $env:ZHIYAN_INSTALLER_PATH',
    '$subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }',
    '[pscustomobject]@{ status = [string]$signature.Status; subject = $subject } | ConvertTo-Json -Compress'
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, ZHIYAN_INSTALLER_PATH: installerPath }
  })
  if (result.status !== 0) return { status: 'check-failed', subject: null }
  try {
    const parsed = JSON.parse(result.stdout.trim())
    return {
      status: typeof parsed.status === 'string' ? parsed.status : 'check-failed',
      subject: typeof parsed.subject === 'string' ? parsed.subject : null
    }
  } catch {
    return { status: 'check-failed', subject: null }
  }
}

async function verifyWindowsRelease({
  outputDirectory,
  version,
  productName,
  minimumInstallerBytes = MINIMUM_INSTALLER_BYTES,
  signature = readAuthenticodeSignature(join(outputDirectory, `ZhiYan-Assistant-${version}-win-x64.exe`))
}) {
  const installerName = `ZhiYan-Assistant-${version}-win-x64.exe`
  const installerPath = join(outputDirectory, installerName)
  const unpackedRoot = join(outputDirectory, 'win-unpacked')
  const missing = requiredPackagedPaths(productName).filter((path) => !existsSync(join(unpackedRoot, path)))
  if (!existsSync(installerPath)) missing.unshift(installerName)
  if (missing.length > 0) {
    throw new Error(`Windows release is incomplete. Missing: ${missing.join(', ')}`)
  }

  const installerStat = await stat(installerPath)
  if (installerStat.size < minimumInstallerBytes) {
    throw new Error(`Windows installer is unexpectedly small: ${installerStat.size} bytes.`)
  }

  const report = {
    version: 1,
    verifiedAt: new Date().toISOString(),
    platform: 'win32',
    architecture: 'x64',
    productName,
    installer: {
      fileName: basename(installerPath),
      size: installerStat.size,
      sha256: await sha256(installerPath)
    },
    codeSigning: signature,
    packagedChecks: requiredPackagedPaths(productName),
    status: signature.status === 'Valid' ? 'passed' : 'internal-alpha-passed'
  }
  if (process.env.ZHIYAN_REQUIRE_SIGNED === '1' && signature.status !== 'Valid') {
    throw new Error(`Windows installer signature is not valid: ${signature.status}.`)
  }
  await mkdir(outputDirectory, { recursive: true })
  const reportPath = join(outputDirectory, 'teacher-release-verification.json')
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return { report, reportPath }
}

async function main() {
  const packageJson = require('../package.json')
  const builderConfig = require('../electron-builder.config.cjs')
  const outputDirectory = resolve(process.env.ZHIYAN_DIST_DIR || process.argv[2] || 'dist')
  const result = await verifyWindowsRelease({
    outputDirectory,
    version: packageJson.version,
    productName: builderConfig.productName
  })
  console.log(`[release-check] Windows release verification completed (${result.report.status}): ${result.reportPath}`)
  console.log(`[release-check] SHA-256: ${result.report.installer.sha256}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[release-check] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

exports.MINIMUM_INSTALLER_BYTES = MINIMUM_INSTALLER_BYTES
exports.requiredPackagedPaths = requiredPackagedPaths
exports.readAuthenticodeSignature = readAuthenticodeSignature
exports.verifyWindowsRelease = verifyWindowsRelease
