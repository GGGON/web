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

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image() // browser API
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height
      
      // Volcengine new requirements:
      // Min > 14px
      // Max 6000x6000px
      // Ratio 1/16 to 16
      // Size < 10MB
      
      const MAX_DIMENSION = 4096 // Safe limit within 6000px to ensure performance and file size
      
      // Check ratio [1/16, 16]
      const ratio = width / height
      if (ratio < 1/16 || ratio > 16) {
        // Simple crop to fit ratio could be complex, for now we assume user provides reasonable images
        // or we clamp dimensions if needed. But let's just handle max dimension.
      }

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          width = MAX_DIMENSION
          height = Math.round(width / ratio)
        } else {
          height = MAX_DIMENSION
          width = Math.round(height * ratio)
        }
      }
      
      // Ensure min dimension > 14
      if (width < 15) width = 15
      if (height < 15) height = 15

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context not available'))
        return
      }
      
      // White background for transparent PNGs
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      
      // Compress to JPEG 0.8
      // Check file size < 10MB (approx 10485760 bytes)
      // Base64 overhead is ~33%, so safe limit for base64 string is ~13.3MB
      let quality = 0.8
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      
      while (dataUrl.length > 13000000 && quality > 0.1) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      
      resolve(dataUrl)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

type Task = {
    id: string
    file: File
    preview: string
    status: 'pending' | 'generating' | 'success' | 'error'
    result?: string
    error?: string
  }

  export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [size, setSize] = useState('2K')
  const [apiKey, setApiKey] = useState('')
  const [addHats, setAddHats] = useState(true)
  const [enhanceEnv, setEnhanceEnv] = useState(true)
  const [intensity, setIntensity] = useState<'natural' | 'strong'>('natural')

  async function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    const newTasks: Task[] = []
    
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        // Use compressed image for both preview and API to save memory/bandwidth
        const url = await compressImage(f)
        newTasks.push({
          id: Math.random().toString(36).substring(7),
          file: f,
          preview: url,
          status: 'pending'
        })
      } catch (e) {
        console.error(e)
        // If compression fails, we skip this file or add error task
      }
    }
    
    setTasks(prev => [...prev, ...newTasks])
    setGlobalError('')
  }

  async function onGenerate() {
    if (tasks.filter(t => t.status === 'pending' || t.status === 'error').length === 0) return
    
    setLoading(true)
    setGlobalError('')
    
    // Process tasks one by one or in parallel
    // Here we do parallel but limits could be applied if needed
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'error')
    
    // Update status to generating
    setTasks(prev => prev.map(t => 
      pendingTasks.find(pt => pt.id === t.id) ? { ...t, status: 'generating', error: undefined } : t
    ))

    const prompt = buildPrompt({ addHats, enhanceEnv, intensity })
    
    await Promise.all(pendingTasks.map(async (task) => {
      try {
        const res = await fetch('/api/ai/i2i', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: task.preview,
            prompt,
            size,
            apiKey,
            response_format: 'url',
            sequential: 'disabled',
          }),
        })
        const jd = await res.json()
        if (!res.ok) {
          throw new Error(jd && jd.error ? String(jd.error) : '请求失败')
        }
        const out = extractImage(jd)
        if (!out) {
          throw new Error('未返回图片')
        }
        
        setTasks(prev => prev.map(t => 
          t.id === task.id ? { ...t, status: 'success', result: out } : t
        ))
      } catch (e: any) {
        const errMsg = String(e && e.message ? e.message : e)
        setTasks(prev => prev.map(t => 
          t.id === task.id ? { ...t, status: 'error', error: errMsg } : t
        ))
      }
    }))
    
    setLoading(false)
  }

  function downloadImage(url: string) {
    const link = document.createElement('a')
    link.href = url
    link.download = `christmas-magic-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
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
          <h1 className={styles.title}>🎄 圣诞魔法工坊 🎅</h1>
          <p className={styles.subtitle}>✨ 用 AI 让你的照片充满节日氛围 ✨</p>
        </div>

        <div className={styles.card}>
          <label className={styles.uploadArea}>
            <input type="file" multiple accept="image/*" onChange={onChangeFile} style={{ display: 'none' }} />
            <div className={styles.uploadIcon}>📸</div>
            <div className={styles.uploadText}>
              {tasks.length > 0 ? `已选择 ${tasks.length} 张照片` : '点击上传照片 (支持多选)'}
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
                <option value="2K">2K (2048x2048)</option>
                <option value="3K">3K (3072x3072)</option>
                <option value="1440x2560">竖屏 9:16 (1440x2560)</option>
                <option value="2560x1440">横屏 16:9 (2560x1440)</option>
              </select>
            </div>
          </div>

          <button 
            className={styles.generateBtn}
            onClick={onGenerate} 
            disabled={tasks.length === 0 || loading}
          >
            {loading ? '正在施展魔法...' : `生成圣诞照片 (${tasks.filter(t => t.status === 'pending').length})`}
          </button>

          {globalError && <div className={styles.error}>{globalError}</div>}
        </div>

        <div className={styles.resultList}>
          {tasks.map(task => (
            <div key={task.id} className={styles.taskItem}>
              <button className={styles.removeBtn} onClick={() => removeTask(task.id)} title="移除">×</button>
              <div className={styles.resultArea}>
                <div className={styles.imageCard}>
                  <div className={styles.imageHeader}>原始照片</div>
                  <div className={styles.imageWrapper}>
                    <Image 
                      src={task.preview} 
                      alt="原始预览" 
                      fill
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                </div>

                <div className={styles.imageCard}>
                  <div className={styles.imageHeader}>
                    <span>圣诞版本</span>
                    {task.result && (
                      <button 
                        className={styles.downloadBtn} 
                        onClick={() => downloadImage(task.result!)}
                        title="下载图片"
                      >
                        ⬇️ 下载
                      </button>
                    )}
                  </div>
                  <div className={styles.imageWrapper}>
                    {task.status === 'generating' ? (
                      <div className={styles.emptyState}>
                        <div className={styles.spinner} style={{width: 24, height: 24, borderWidth: 2}} />
                        <span style={{marginLeft: 8}}>生成中...</span>
                      </div>
                    ) : task.result ? (
                      <Image 
                        src={task.result} 
                        alt="AI 生成结果" 
                        fill
                        style={{ objectFit: 'contain' }}
                        unoptimized
                      />
                    ) : task.status === 'error' ? (
                       <div className={styles.emptyState} style={{color: 'var(--accent)', flexDirection: 'column', padding: 10}}>
                         <div>生成失败</div>
                         <div style={{fontSize: 10, marginTop: 4}}>{task.error}</div>
                       </div>
                    ) : (
                      <div className={styles.emptyState}>等待生成</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
