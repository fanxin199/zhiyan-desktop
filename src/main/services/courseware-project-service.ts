import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import JSZip from 'jszip'
import {
  parseCoursewareProject,
  type CoursewareProject,
  type SourceVisualAsset
} from '../../shared/courseware'

function extensionForMediaType(mediaType: string): string {
  switch (mediaType.toLowerCase()) {
    case 'image/jpeg': return 'jpg'
    case 'image/gif': return 'gif'
    case 'image/svg+xml': return 'svg'
    default: return 'png'
  }
}

function decodeDataUrl(value: string): Buffer | null {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/)
  return match ? Buffer.from(match[2], 'base64') : null
}

function safeAssetFileName(id: string): string {
  const value = id.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '')
  return value || 'asset'
}

function archiveAsset(
  zip: JSZip,
  asset: SourceVisualAsset
): SourceVisualAsset {
  if (!asset.imageDataUrl) return asset
  const data = decodeDataUrl(asset.imageDataUrl)
  if (!data) return asset
  const assetPath = `assets/${safeAssetFileName(asset.id)}.${extensionForMediaType(asset.mediaType)}`
  zip.file(assetPath, data)
  const { imageDataUrl: _imageDataUrl, ...withoutData } = asset
  return { ...withoutData, assetPath }
}

export async function writeCoursewareProjectArchive(
  project: CoursewareProject,
  path: string
): Promise<void> {
  const parsed = parseCoursewareProject(project)
  const zip = new JSZip()
  const archivedProject: CoursewareProject = {
    ...parsed,
    sourceVisuals: parsed.sourceVisuals.map((asset) => archiveAsset(zip, asset))
  }
  zip.file('project.json', `${JSON.stringify(archivedProject, null, 2)}\n`)
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

export async function loadCoursewareProject(path: string): Promise<CoursewareProject> {
  if (extname(path).toLowerCase() === '.json') {
    return parseCoursewareProject(JSON.parse(await readFile(path, 'utf8')))
  }
  const zip = await JSZip.loadAsync(await readFile(path))
  const projectFile = zip.file('project.json')
  if (!projectFile) throw new Error('课件项目包缺少 project.json。')
  const project = parseCoursewareProject(JSON.parse(await projectFile.async('string')))
  const sourceVisuals = await Promise.all(project.sourceVisuals.map(async (asset) => {
    if (!asset.assetPath || !asset.assetPath.startsWith('assets/') || asset.assetPath.includes('..')) {
      return asset
    }
    const file = zip.file(asset.assetPath)
    if (!file) return asset
    const data = await file.async('base64')
    return {
      ...asset,
      imageDataUrl: `data:${asset.mediaType};base64,${data}`
    }
  }))
  return { ...project, sourceVisuals }
}
