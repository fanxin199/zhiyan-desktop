const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')
let createCanvas
try {
  createCanvas = require('canvas').createCanvas
} catch {
  console.error('The optional "canvas" package is required to regenerate logo PNG/ICO assets.')
  console.error('Run `npm ci` with optional dependencies enabled, then rerun this script.')
  process.exit(1)
}

const root = join(__dirname, '..')
const assetDir = join(root, 'src', 'asset', 'img')
const pngPath = join(assetDir, 'zhiyan.png')
const svgPath = join(assetDir, 'zhiyan.svg')
const icoPath = join(assetDir, 'zhiyan.ico')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="ZhiYan Assistant">
  <defs>
    <linearGradient id="bg" x1="64" y1="40" x2="448" y2="472" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1267D6"/>
      <stop offset="0.55" stop-color="#0E91C4"/>
      <stop offset="1" stop-color="#12A684"/>
    </linearGradient>
    <linearGradient id="pageRight" x1="262" y1="208" x2="424" y2="392" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F2FFFC"/>
      <stop offset="1" stop-color="#DFF8F4"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#043B53" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path d="M92 150c32-17 67-21 104-11 24 6 45 17 64 31v236c-47-34-103-45-168-23V150Z" fill="#FFFFFF" opacity="0.97" filter="url(#softShadow)"/>
  <path d="M420 150c-32-17-67-21-104-11-24 6-45 17-64 31v236c47-34 103-45 168-23V150Z" fill="url(#pageRight)" opacity="0.98" filter="url(#softShadow)"/>
  <path d="M256 164v244" stroke="#BFF4EB" stroke-width="17" stroke-linecap="round"/>
  <path d="M142 214c38-8 72-3 100 13M142 258c38-7 72-3 100 14M270 227c29-16 64-21 104-13M270 272c29-16 64-21 104-14" stroke="#D7E5F4" stroke-width="9" stroke-linecap="round" opacity="0.72"/>
  <path d="M153 150h180l-126 139h162" fill="none" stroke="#083F70" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" opacity="0.2"/>
  <path d="M153 138h180l-126 139h162" fill="none" stroke="#F7FFFE" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M153 138h180l-126 139h162" fill="none" stroke="#9BE7DC" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="153" cy="138" r="31" fill="#F7FFFE"/>
  <circle cx="333" cy="138" r="31" fill="#F7FFFE"/>
  <circle cx="207" cy="277" r="31" fill="#F7FFFE"/>
  <circle cx="369" cy="277" r="31" fill="#F7FFFE"/>
  <circle cx="153" cy="138" r="17" fill="#12A684"/>
  <circle cx="333" cy="138" r="17" fill="#1267D6"/>
  <circle cx="207" cy="277" r="17" fill="#0E91C4"/>
  <circle cx="369" cy="277" r="17" fill="#12A684"/>
  <circle cx="333" cy="138" r="8" fill="#CFFAF2"/>
  <circle cx="369" cy="277" r="8" fill="#DFFFF8"/>
  <path d="M397 82l10 25 25 10-25 10-10 25-10-25-25-10 25-10 10-25Z" fill="#FFF1A8"/>
</svg>
`

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function drawPath(ctx, commands) {
  ctx.beginPath()
  for (const command of commands) {
    if (command[0] === 'M') ctx.moveTo(command[1], command[2])
    else if (command[0] === 'L') ctx.lineTo(command[1], command[2])
    else if (command[0] === 'C') ctx.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6])
    else if (command[0] === 'Q') ctx.quadraticCurveTo(command[1], command[2], command[3], command[4])
  }
  ctx.closePath()
}

function strokeLine(ctx, points, color, width, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1])
  }
  ctx.stroke()
  ctx.restore()
}

function drawLogo(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const s = size / 512

  ctx.scale(s, s)
  ctx.clearRect(0, 0, 512, 512)

  const bg = ctx.createLinearGradient(64, 40, 448, 472)
  bg.addColorStop(0, '#1267D6')
  bg.addColorStop(0.55, '#0E91C4')
  bg.addColorStop(1, '#12A684')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, 512, 512, 112)
  ctx.fill()

  ctx.save()
  ctx.globalAlpha = 0.24
  ctx.fillStyle = '#043B53'
  drawPath(ctx, [
    ['M', 92, 168],
    ['C', 124, 151, 159, 147, 196, 157],
    ['C', 220, 163, 241, 174, 260, 188],
    ['L', 260, 424],
    ['C', 213, 390, 157, 379, 92, 401],
    ['L', 92, 168]
  ])
  ctx.fill()
  drawPath(ctx, [
    ['M', 420, 168],
    ['C', 388, 151, 353, 147, 316, 157],
    ['C', 292, 163, 271, 174, 252, 188],
    ['L', 252, 424],
    ['C', 299, 390, 355, 379, 420, 401],
    ['L', 420, 168]
  ])
  ctx.fill()
  ctx.restore()

  drawPath(ctx, [
    ['M', 92, 150],
    ['C', 124, 133, 159, 129, 196, 139],
    ['C', 220, 145, 241, 156, 260, 170],
    ['L', 260, 406],
    ['C', 213, 372, 157, 361, 92, 383],
    ['L', 92, 150]
  ])
  ctx.fillStyle = '#FFFFFF'
  ctx.globalAlpha = 0.97
  ctx.fill()
  ctx.globalAlpha = 1

  drawPath(ctx, [
    ['M', 420, 150],
    ['C', 388, 133, 353, 129, 316, 139],
    ['C', 292, 145, 271, 156, 252, 170],
    ['L', 252, 406],
    ['C', 299, 372, 355, 361, 420, 383],
    ['L', 420, 150]
  ])
  const pageRight = ctx.createLinearGradient(262, 208, 424, 392)
  pageRight.addColorStop(0, '#F2FFFC')
  pageRight.addColorStop(1, '#DFF8F4')
  ctx.fillStyle = pageRight
  ctx.fill()

  strokeLine(ctx, [[256, 164], [256, 408]], '#BFF4EB', 17)
  strokeLine(ctx, [[142, 214], [190, 209], [242, 227]], '#D7E5F4', 9, 0.72)
  strokeLine(ctx, [[142, 258], [190, 253], [242, 272]], '#D7E5F4', 9, 0.72)
  strokeLine(ctx, [[270, 227], [320, 207], [374, 214]], '#D7E5F4', 9, 0.72)
  strokeLine(ctx, [[270, 272], [320, 252], [374, 258]], '#D7E5F4', 9, 0.72)

  strokeLine(ctx, [[153, 150], [333, 150], [207, 289], [369, 289]], '#083F70', 34, 0.2)
  strokeLine(ctx, [[153, 138], [333, 138], [207, 277], [369, 277]], '#F7FFFE', 24)
  strokeLine(ctx, [[153, 138], [333, 138], [207, 277], [369, 277]], '#9BE7DC', 10)

  const nodes = [
    [153, 138, '#12A684', null],
    [333, 138, '#1267D6', '#CFFAF2'],
    [207, 277, '#0E91C4', null],
    [369, 277, '#12A684', '#DFFFF8']
  ]
  for (const [x, y, color, nucleus] of nodes) {
    ctx.fillStyle = '#F7FFFE'
    ctx.beginPath()
    ctx.arc(x, y, 31, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 17, 0, Math.PI * 2)
    ctx.fill()
    if (nucleus) {
      ctx.fillStyle = nucleus
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.fillStyle = '#FFF1A8'
  ctx.beginPath()
  ctx.moveTo(397, 82)
  ctx.lineTo(407, 107)
  ctx.lineTo(432, 117)
  ctx.lineTo(407, 127)
  ctx.lineTo(397, 152)
  ctx.lineTo(387, 127)
  ctx.lineTo(362, 117)
  ctx.lineTo(387, 107)
  ctx.closePath()
  ctx.fill()

  return canvas
}

function makeIco(buffers) {
  const headerSize = 6
  const directorySize = buffers.length * 16
  const imageOffset = headerSize + directorySize
  const totalSize = imageOffset + buffers.reduce((sum, item) => sum + item.buffer.length, 0)
  const ico = Buffer.alloc(totalSize)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(buffers.length, 4)

  let offset = imageOffset
  buffers.forEach((item, index) => {
    const dirOffset = headerSize + index * 16
    ico.writeUInt8(item.size >= 256 ? 0 : item.size, dirOffset)
    ico.writeUInt8(item.size >= 256 ? 0 : item.size, dirOffset + 1)
    ico.writeUInt8(0, dirOffset + 2)
    ico.writeUInt8(0, dirOffset + 3)
    ico.writeUInt16LE(1, dirOffset + 4)
    ico.writeUInt16LE(32, dirOffset + 6)
    ico.writeUInt32LE(item.buffer.length, dirOffset + 8)
    ico.writeUInt32LE(offset, dirOffset + 12)
    item.buffer.copy(ico, offset)
    offset += item.buffer.length
  })

  return ico
}

mkdirSync(dirname(pngPath), { recursive: true })
writeFileSync(svgPath, svg, 'utf8')
writeFileSync(pngPath, drawLogo(1024).toBuffer('image/png'))

const icoImages = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
  size,
  buffer: drawLogo(size).toBuffer('image/png')
}))
writeFileSync(icoPath, makeIco(icoImages))

console.log(`Generated ${pngPath}`)
console.log(`Generated ${svgPath}`)
console.log(`Generated ${icoPath}`)
