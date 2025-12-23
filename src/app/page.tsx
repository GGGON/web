'use client'
import { useState } from 'react'
import Image from 'next/image'
import styles from './page.module.css'

function buildPrompt(opts: { addHats: boolean; enhanceEnv: boolean; intensity: 'natural' | 'strong' }) {
  const parts: string[] = []
  // 核心指令：严格保持姿态
  parts.push('Strictly preserve the original pose, gesture, facial expression, and body structure of the subject (person or pet). Do not change the action, angle, or composition.')
  
  parts.push('Convert the input photo into a Christmas atmosphere image, realistic photo style')
  if (opts.addHats) {
    parts.push('Place red Santa hats on all visible heads, including both people and pets/animals. Ensure each hat fits the original head pose naturally, do not alter the face or hair structure')
  }
  if (opts.enhanceEnv) {
    parts.push('Add warm festive elements to the background: string lights, garlands, wreaths, gentle snowfall, red green gold palette')
  }
  if (opts.intensity === 'strong') {
    parts.push('Strong holiday ambiance while strictly maintaining subject identity')
  } else {
    parts.push('Subtle holiday ambiance, keep natural look')
  }
  return parts.join('. ')
}

function extractImage(res: any) {
  if (!res) return null
  if (Array.isArray(res.data) && res.data.length > 0) {
    const item = res.data[0] as any
    if (item.url) return item.url as string
    if (item.b64_json) return `data:image/jpeg;base64,${item.b64_json as string}`
  }
  if (Array.isArray(res.images) && res.images.length > 0) {
    const item = res.images[0] as any
    if (item.url) return item.url as string
    if (item.b64_json) return `data:image/jpeg;base64,${item.b64_json as string}`
  }
  return null
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [size, setSize] = useState('2K')
  const [apiKey, setApiKey] = useState('')
  const [addHats, setAddHats] = useState(true)
  const [enhanceEnv, setEnhanceEnv] = useState(true)
  const [intensity, setIntensity] = useState<'natural' | 'strong'>('natural')

  async function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setFile(f)
    const url = await fileToDataUrl(f)
    setPreview(url)
    setResult(null)
    setError('')
  }

  async function onGenerate() {
    try {
      if (!file || !preview) return
      setLoading(true)
      setError('')
      setResult(null)
      const prompt = buildPrompt({ addHats, enhanceEnv, intensity })
      const res = await fetch('/api/ai/i2i', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: preview,
          prompt,
          size,
          apiKey,
          response_format: 'url',
          sequential: 'disabled',
        }),
      })
      const jd = await res.json()
      if (!res.ok) {
        setError(jd && jd.error ? String(jd.error) : '请求失败')
        setLoading(false)
        return
      }
      const out = extractImage(jd)
      if (!out) {
        setError('未返回图片')
        setLoading(false)
        return
      }
      setResult(out)
      setLoading(false)
    } catch (e: any) {
      setError(String(e && e.message ? e.message : e))
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
        </div>
      )}
      
      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>圣诞魔法工坊</h1>
          <p className={styles.subtitle}>用 AI 让你的照片充满节日氛围</p>
        </div>

        <div className={styles.card}>
          <label className={styles.uploadArea}>
            <input type="file" accept="image/*" onChange={onChangeFile} style={{ display: 'none' }} />
            <div className={styles.uploadIcon}>📸</div>
            <div className={styles.uploadText}>
              {file ? file.name : '点击上传照片'}
            </div>
          </label>

          <div className={styles.controls}>
            <div className={`${styles.controlGroup} ${styles.fullWidth}`}>
              <div className={styles.label}>火山引擎 API Key</div>
              <input
                type="password"
                className={styles.input}
                placeholder="请输入您的 API Key (选填，若服务器已配置则留空)"
                value={apiKey}
                onChange={e => {
                  setApiKey(e.target.value)
                  localStorage.setItem('volc_ark_api_key', e.target.value)
                }}
              />
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.label}>魔法选项</div>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  className={styles.checkbox}
                  checked={addHats} 
                  onChange={e => setAddHats(e.target.checked)} 
                />
                <span>戴上圣诞帽</span>
              </label>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  className={styles.checkbox}
                  checked={enhanceEnv} 
                  onChange={e => setEnhanceEnv(e.target.checked)} 
                />
                <span>增强节日氛围</span>
              </label>
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.label}>效果强度</div>
              <select 
                className={styles.select}
                value={intensity} 
                onChange={e => setIntensity(e.target.value as 'natural' | 'strong')}
              >
                <option value="natural">自然</option>
                <option value="strong">强烈</option>
              </select>
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.label}>生成尺寸</div>
              <select 
                className={styles.select}
                value={size} 
                onChange={e => setSize(e.target.value)}
              >
                <option value="2K">方形 (2048x2048)</option>
                <option value="4K">方形 (4096x4096)</option>
                <option value="1440x2560">竖屏 (9:16)</option>
                <option value="2560x1440">横屏 (16:9)</option>
              </select>
            </div>
          </div>

          <button 
            className={styles.generateBtn}
            onClick={onGenerate} 
            disabled={!preview || loading}
          >
            {loading ? '正在施展魔法...' : '生成圣诞照片'}
          </button>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.resultArea}>
          <div className={styles.imageCard}>
            <div className={styles.imageHeader}>原始照片</div>
            <div className={styles.imageWrapper}>
              {preview ? (
                <Image 
                  src={preview} 
                  alt="原始预览" 
                  fill
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <div className={styles.emptyState}>暂无图片</div>
              )}
            </div>
          </div>

          <div className={styles.imageCard}>
            <div className={styles.imageHeader}>圣诞版本</div>
            <div className={styles.imageWrapper}>
              {result ? (
                <Image 
                  src={result} 
                  alt="AI 生成结果" 
                  fill
                  style={{ objectFit: 'contain' }}
                  unoptimized
                />
              ) : (
                <div className={styles.emptyState}>结果将显示在这里</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
