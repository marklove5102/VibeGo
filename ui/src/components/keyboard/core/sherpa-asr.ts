export type SherpaStatus = 'idle' | 'loading' | 'recording' | 'recognizing' | 'error'
export type SherpaResultCallback = (text: string) => void

declare global {
  interface Window {
    Module: any
    createVad: any
    CircularBuffer: any
    OfflineRecognizer: any
  }
}

const SHERPA_LOCAL_BASE = '/sherpa/'
const EXPECTED_SAMPLE_RATE = 16000

let sherpaBase = SHERPA_LOCAL_BASE
let moduleLoaded = false
let moduleLoading = false
let loadError: string | null = null

let vad: any = null
let recognizer: any = null

let audioCtx: AudioContext | null = null
let mediaStreamNode: MediaStreamAudioSourceNode | null = null
let recorder: ScriptProcessorNode | null = null
let micStream: MediaStream | null = null
let recordSampleRate = 0

let recordedChunks: Float32Array[] = []
let statusCb: ((status: SherpaStatus, progress?: string) => void) | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

function assignGlobals(code: string) {
  const script = document.createElement('script')
  script.textContent = code
  document.head.appendChild(script)
  document.head.removeChild(script)
}

function fileExists(filename: string): boolean {
  const M = window.Module
  const len = M.lengthBytesUTF8(filename) + 1
  const buf = M._malloc(len)
  M.stringToUTF8(filename, buf, len)
  const exists = M._SherpaOnnxFileExists(buf)
  M._free(buf)
  return exists === 1
}

function initOfflineRecognizer() {
  const config: any = { modelConfig: { debug: 0, tokens: './tokens.txt' } }
  if (fileExists('sense-voice.onnx')) {
    config.modelConfig.senseVoice = { model: './sense-voice.onnx', useInverseTextNormalization: 1 }
  }
  recognizer = new window.OfflineRecognizer(config, window.Module)
}

export async function ensureLoaded(
  onStatus?: (status: SherpaStatus, progress?: string) => void,
): Promise<void> {
  if (moduleLoaded) return
  if (moduleLoading) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (moduleLoaded) { clearInterval(check); resolve() }
        if (loadError) { clearInterval(check); reject(new Error(loadError)) }
      }, 200)
    })
  }
  moduleLoading = true
  onStatus?.('loading', 'Loading...')

  try {
    window.Module = {
      locateFile: (path: string) => sherpaBase + path,
      setStatus(status: string) {
        const m = status.match(/Downloading data... \((\d+)\/(\d+)\)/)
        if (m) {
          const pct = Number(m[2]) === 0 ? 0 : (Number(m[1]) / Number(m[2]) * 100)
          const dl = (Number(m[1]) / 1048576).toFixed(1)
          const tot = (Number(m[2]) / 1048576).toFixed(1)
          onStatus?.('loading', `${pct.toFixed(0)}% (${dl}/${tot}MB)`)
        } else if (status === 'Running...') {
          onStatus?.('loading', 'Initializing...')
        }
      },
      onRuntimeInitialized() {
        vad = window.createVad(window.Module)
        initOfflineRecognizer()
        moduleLoaded = true
        moduleLoading = false
      },
    }

    await loadScript(sherpaBase + 'sherpa-onnx-vad.js')
    assignGlobals('window.createVad = createVad; window.CircularBuffer = CircularBuffer;')
    await loadScript(sherpaBase + 'sherpa-onnx-asr.js')
    assignGlobals('window.OfflineRecognizer = OfflineRecognizer;')
    await loadScript(sherpaBase + 'sherpa-onnx-wasm-main-vad-asr.js')

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!moduleLoaded) { loadError = 'Timeout'; reject(new Error(loadError)) }
      }, 300000)
      const check = setInterval(() => {
        if (moduleLoaded) { clearInterval(check); clearTimeout(timeout); resolve() }
      }, 100)
    })
  } catch (e) {
    loadError = (e as Error).message
    moduleLoading = false
    throw e
  }
}

function downsample(buf: Float32Array, target: number): Float32Array {
  if (target === recordSampleRate) return buf
  const ratio = recordSampleRate / target
  const len = Math.round(buf.length / ratio)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const next = Math.round((i + 1) * ratio)
    let s = 0, c = 0
    for (let j = Math.round(i * ratio); j < next && j < buf.length; j++) { s += buf[j]; c++ }
    out[i] = s / c
  }
  return out
}

function recognizeAudio(samples: Float32Array): string {
  if (!vad || !recognizer) return ''

  const circularBuffer = new window.CircularBuffer(samples.length + 1024, window.Module)
  circularBuffer.push(samples)

  const results: string[] = []

  while (circularBuffer.size() > vad.config.sileroVad.windowSize) {
    const s = circularBuffer.get(circularBuffer.head(), vad.config.sileroVad.windowSize)
    vad.acceptWaveform(s)
    circularBuffer.pop(vad.config.sileroVad.windowSize)

    while (!vad.isEmpty()) {
      const seg = vad.front()
      vad.pop()
      const stream = recognizer.createStream()
      stream.acceptWaveform(EXPECTED_SAMPLE_RATE, seg.samples)
      recognizer.decode(stream)
      const r = recognizer.getResult(stream)
      stream.free()
      const t = r.text?.trim()
      if (t) results.push(t)
    }
  }

  vad.flush()
  while (!vad.isEmpty()) {
    const seg = vad.front()
    vad.pop()
    const stream = recognizer.createStream()
    stream.acceptWaveform(EXPECTED_SAMPLE_RATE, seg.samples)
    recognizer.decode(stream)
    const r = recognizer.getResult(stream)
    stream.free()
    const t = r.text?.trim()
    if (t) results.push(t)
  }

  vad.reset()
  circularBuffer.free()
  return results.join('')
}

export async function startRecording(
  onStatus: (status: SherpaStatus, progress?: string) => void,
): Promise<void> {
  statusCb = onStatus

  try {
    await ensureLoaded(onStatus)
  } catch {
    onStatus('error', 'Failed to load model')
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    micStream = stream
    recordedChunks = []

    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: EXPECTED_SAMPLE_RATE })
    }
    recordSampleRate = audioCtx.sampleRate
    mediaStreamNode = audioCtx.createMediaStreamSource(stream)
    recorder = audioCtx.createScriptProcessor(4096, 1, 2)

    recorder.onaudioprocess = (e) => {
      const raw = new Float32Array(e.inputBuffer.getChannelData(0))
      recordedChunks.push(downsample(raw, EXPECTED_SAMPLE_RATE))
    }

    mediaStreamNode.connect(recorder)
    recorder.connect(audioCtx.destination)
    onStatus('recording')
  } catch {
    onStatus('error', 'Microphone denied')
  }
}

export function stopAndRecognize(): string {
  if (recorder && audioCtx) {
    try { recorder.disconnect(audioCtx.destination) } catch {}
    try { mediaStreamNode?.disconnect(recorder) } catch {}
    recorder = null
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop())
    micStream = null
  }

  if (recordedChunks.length === 0) {
    statusCb?.('idle')
    statusCb = null
    return ''
  }

  statusCb?.('recognizing')

  let total = 0
  for (const c of recordedChunks) total += c.length
  const merged = new Float32Array(total)
  let off = 0
  for (const c of recordedChunks) { merged.set(c, off); off += c.length }
  recordedChunks = []

  const text = recognizeAudio(merged)
  statusCb?.('idle')
  statusCb = null
  return text
}

export function isLoaded(): boolean {
  return moduleLoaded
}

export function isLoading(): boolean {
  return moduleLoading
}
