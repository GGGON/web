import { generateImageToImage } from '../../../../seedream'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const image = body && body.image ? body.image : undefined
    const prompt = body && body.prompt ? String(body.prompt) : ''
    const size = body && body.size ? body.size : undefined
    const model = body && body.model ? body.model : undefined
    const sequential = body && body.sequential ? body.sequential : undefined
    const response_format = body && body.response_format ? body.response_format : 'url'
    const watermark = body && typeof body.watermark !== 'undefined' ? !!body.watermark : false
    const n = body && typeof body.n !== 'undefined' ? body.n : undefined
    const apiKey = body && body.apiKey ? body.apiKey : undefined
    const data = await generateImageToImage({ image, prompt, size, model, sequential, response_format, watermark, n }, apiKey)
    return Response.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const bad = /invalid|missing/i.test(msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: bad ? 400 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
