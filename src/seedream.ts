const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

function validatePixelSize(size: string): boolean {
  if (typeof size !== 'string') return false
  const m = size.match(/^(\d{2,5})x(\d{2,5})$/)
  if (!m) return false
  const w = parseInt(m[1], 10)
  const h = parseInt(m[2], 10)
  if (!(w > 14 && h > 14)) return false
  const pixels = w * h
  if (pixels < 3686400 || pixels > 16777216) return false
  const ratio = w / h
  if (ratio < 1 / 16 || ratio > 16) return false
  return true
}

function normalizeSize(size?: string): string {
  if (!size) return '2048x2048'
  if (size === '1K') return '2048x2048'
  if (size === '2K') return '2048x2048'
  if (size === '3K') return '3072x3072'
  if (size === '4K') return '4096x4096'
  if (validatePixelSize(size)) return size
  throw new Error(`invalid size: ${size}`)
}

function ensureApiKey(apiKey?: string): string {
  const key = apiKey || process.env.VOLC_ARK_API_KEY
  if (!key) throw new Error('missing api key')
  return key
}

type ArkImageItem = { url?: string; b64_json?: string; size?: string }
type ArkResponse = {
  model?: string
  created?: number
  data?: ArkImageItem[]
  images?: ArkImageItem[]
  usage?: unknown
  error?: { code?: string; message?: string }
}

async function postArk(body: Record<string, unknown>, apiKey?: string): Promise<ArkResponse> {
  const key = ensureApiKey(apiKey)
  const res = await fetch(ARK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ark http ${res.status} ${text}`)
  }
  return res.json() as Promise<ArkResponse>
}

type T2IParams = {
  prompt: string
  size?: string
  model?: string
  sequential?: 'disabled' | 'auto'
  response_format?: 'url' | 'b64_json'
  watermark?: boolean
  n?: number
}

type I2IParams = {
  image: string | string[]
  prompt: string
  size?: string
  model?: string
  sequential?: 'disabled' | 'auto'
  response_format?: 'url' | 'b64_json'
  watermark?: boolean
  n?: number
}

function buildT2IBody({ prompt, size, model, sequential, response_format, watermark, n }: T2IParams) {
  const s = normalizeSize(size)
  return {
    model: model || 'doubao-seedream-4-5-251128',
    prompt,
    size: s,
    sequential_image_generation: sequential || 'disabled',
    response_format: response_format || 'url',
    watermark: !!watermark,
    n,
  }
}

function buildI2IBody({ image, prompt, size, model, sequential, response_format, watermark, n }: I2IParams) {
  const s = normalizeSize(size)
  const img = image
  if (!img || (typeof img !== 'string' && !Array.isArray(img))) {
    throw new Error('invalid image input')
  }
  return {
    model: model || 'doubao-seedream-4-5-251128',
    prompt,
    image: img,
    size: s,
    sequential_image_generation: sequential || 'disabled',
    response_format: response_format || 'url',
    watermark: !!watermark,
    n,
  }
}

export async function generateTextToImage(params: T2IParams, apiKey?: string) {
  const body = buildT2IBody(params)
  return postArk(body, apiKey)
}

export async function generateImageToImage(params: I2IParams, apiKey?: string) {
  const body = buildI2IBody(params)
  return postArk(body, apiKey)
}

export { validatePixelSize, normalizeSize, buildT2IBody, buildI2IBody }
