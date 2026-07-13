import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BIOINFORMATICS_EXTENSION_LOCK,
  BIOINFORMATICS_EXTENSION_SCOPE,
  BIOINFORMATICS_EXTENSION_VERSION,
  installBioinformaticsCapabilityPack
} from './python-bioinformatics-pack-service'

const roots: string[] = []

async function preparedRuntime(withBasePack = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-bio-pack-'))
  roots.push(root)
  const python = join(root, 'runtimes', 'python', 'python.exe')
  await mkdir(join(python, '..'), { recursive: true })
  await writeFile(python, 'python')
  if (withBasePack) {
    const base = join(root, 'runtimes', 'python-packages', 'base-science', '2026.07.1')
    await mkdir(base, { recursive: true })
    await writeFile(join(
      root, 'runtimes', 'python-packages', 'base-science', 'active-environment.json'
    ), JSON.stringify({ packVersion: '2026.07.1' }))
  }
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('bioinformatics extension contract', () => {
  it('pins Scanpy and graph clustering packages separately from the base pack', () => {
    expect(BIOINFORMATICS_EXTENSION_VERSION).toBe('2026.07.1')
    expect(BIOINFORMATICS_EXTENSION_LOCK).toEqual(expect.arrayContaining([
      { name: 'scanpy', version: '1.12.1' },
      { name: 'python-igraph', version: '1.0.0' },
      { name: 'leidenalg', version: '0.12.0' }
    ]))
    expect(new Set(BIOINFORMATICS_EXTENSION_LOCK.map(({ name }) => name)).size)
      .toBe(BIOINFORMATICS_EXTENSION_LOCK.length)
  })

  it('states the processed-data boundary explicitly', () => {
    expect(BIOINFORMATICS_EXTENSION_SCOPE.supported).toEqual(expect.arrayContaining([
      'processed-h5ad', 'processed-expression-matrix', 'processed-spatial-table'
    ]))
    expect(BIOINFORMATICS_EXTENSION_SCOPE.notSupported).toEqual(expect.arrayContaining([
      'fastq', 'bam', 'cram', 'cell-ranger-pipeline'
    ]))
  })
})

describe('installBioinformaticsCapabilityPack', () => {
  it('installs the fixed extension without replacing the base science pack', async () => {
    const userDataPath = await preparedRuntime()
    const commands: Array<{ kind: string; args: string[]; env?: NodeJS.ProcessEnv }> = []
    const result = await installBioinformaticsCapabilityPack({
      userDataPath,
      runPython: vi.fn(async (command) => {
        commands.push(command)
        return command.kind === 'smoke-test'
          ? {
              ok: true,
              stdout: `ZHIYAN_BIO_PACK_SNAPSHOT=${JSON.stringify(Object.fromEntries(
                BIOINFORMATICS_EXTENSION_LOCK.map(({ name, version }) => [name, version])
              ))}`,
              stderr: ''
            }
          : { ok: true, stdout: '', stderr: '' }
      })
    })

    expect(result).toMatchObject({ ok: true, packVersion: BIOINFORMATICS_EXTENSION_VERSION })
    const install = commands.find(({ kind }) => kind === 'install')
    expect(install?.args).toEqual(expect.arrayContaining([
      '--no-deps', 'scanpy==1.12.1', 'python-igraph==1.0.0', 'leidenalg==0.12.0'
    ]))
    expect(install?.args).not.toContain('numpy==2.4.6')
    const smoke = commands.find(({ kind }) => kind === 'smoke-test')
    expect(smoke?.args.join('\n')).toContain('flavor="igraph"')
    const active = join(
      userDataPath, 'runtimes', 'python-packages', 'bioinformatics', BIOINFORMATICS_EXTENSION_VERSION
    )
    expect(JSON.parse(await readFile(join(active, 'environment.json'), 'utf8'))).toMatchObject({
      packVersion: BIOINFORMATICS_EXTENSION_VERSION,
      scope: BIOINFORMATICS_EXTENSION_SCOPE
    })
  })

  it('requires the validated base science pack first', async () => {
    const userDataPath = await preparedRuntime(false)
    const runPython = vi.fn()
    await expect(installBioinformaticsCapabilityPack({ userDataPath, runPython })).resolves.toMatchObject({
      ok: false,
      code: 'base-pack-required'
    })
    expect(runPython).not.toHaveBeenCalled()
  })

  it('does not activate the extension when graph-analysis smoke tests fail', async () => {
    const userDataPath = await preparedRuntime()
    const result = await installBioinformaticsCapabilityPack({
      userDataPath,
      runPython: async (command) => command.kind === 'smoke-test'
        ? { ok: false, stdout: '', stderr: 'leiden failed' }
        : { ok: true, stdout: '', stderr: '' }
    })

    expect(result).toMatchObject({ ok: false, code: 'smoke-test-failed' })
    await expect(readFile(join(
      userDataPath, 'runtimes', 'python', 'Lib', 'site-packages', 'zhiyan-bioinformatics.pth'
    ))).rejects.toThrow()
  })
})
