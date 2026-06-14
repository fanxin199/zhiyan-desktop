import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { SourceVisualAsset } from '../../../shared/courseware'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

export type NormalizedCrop = {
  x: number
  y: number
  width: number
  height: number
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function renderPdfPageDataUrl(
  base64: string,
  pageNumber: number
): Promise<{ dataUrl: string; pageCount: number }> {
  const pdf = await getDocument({
    data: base64ToBytes(base64),
    useSystemFonts: true
  }).promise
  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`页码超出范围，当前 PDF 共 ${pdf.numPages} 页。`)
    }
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.45 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建教材页面预览。')
    await page.render({ canvasContext: context, viewport }).promise
    return {
      dataUrl: canvas.toDataURL('image/png'),
      pageCount: pdf.numPages
    }
  } finally {
    await pdf.destroy()
  }
}

export async function cropImageDataUrl(
  dataUrl: string,
  crop: NormalizedCrop
): Promise<string> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()

  const x = Math.max(0, Math.min(1, crop.x))
  const y = Math.max(0, Math.min(1, crop.y))
  const width = Math.max(0.01, Math.min(1 - x, crop.width))
  const height = Math.max(0.01, Math.min(1 - y, crop.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * width))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法裁剪教材图片。')
  context.drawImage(
    image,
    image.naturalWidth * x,
    image.naturalHeight * y,
    image.naturalWidth * width,
    image.naturalHeight * height,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return canvas.toDataURL('image/png')
}

export async function materializePdfVisualAssets(
  base64: string,
  assets: SourceVisualAsset[]
): Promise<SourceVisualAsset[]> {
  const pdf = await getDocument({
    data: base64ToBytes(base64),
    useSystemFonts: true
  }).promise
  try {
    const pageImages = new Map<number, string>()
    const materialized: SourceVisualAsset[] = []
    for (const asset of assets.slice(0, 40)) {
      if (!asset.crop) {
        materialized.push(asset)
        continue
      }
      let pageDataUrl = pageImages.get(asset.sourceIndex)
      if (!pageDataUrl) {
        const page = await pdf.getPage(asset.sourceIndex)
        const viewport = page.getViewport({ scale: 1.45 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建教材页面预览。')
        await page.render({ canvasContext: context, viewport }).promise
        pageDataUrl = canvas.toDataURL('image/png')
        pageImages.set(asset.sourceIndex, pageDataUrl)
      }
      materialized.push({
        ...asset,
        imageDataUrl: await cropImageDataUrl(pageDataUrl, asset.crop)
      })
    }
    return materialized
  } finally {
    await pdf.destroy()
  }
}
