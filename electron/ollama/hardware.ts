import { execSync } from 'child_process'
import { freemem, totalmem } from 'os'

export interface HardwareInfo {
  totalRamGB: number
  freeRamGB: number
  hasNvidiaGPU: boolean
  gpuVramGB: number | null
  recommendedModel: string
  recommendedQuantization: string
  recommendedCtx: number
  sufficient: boolean
}

export function detectHardware(): HardwareInfo {
  const totalRamGB = Math.round(totalmem() / 1024 / 1024 / 1024)
  const freeRamGB = Math.round(freemem() / 1024 / 1024 / 1024)

  let hasNvidiaGPU = false
  let gpuVramGB: number | null = null

  try {
    const output = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', {
      timeout: 5000,
      encoding: 'utf-8'
    })
    const vram = parseInt(output.trim(), 10)
    if (!isNaN(vram)) {
      hasNvidiaGPU = true
      gpuVramGB = Math.round(vram / 1024)
    }
  } catch {
    // No NVIDIA GPU or nvidia-smi not available
  }

  // Determine recommended model based on available resources
  const availableVram = gpuVramGB ?? 0
  const effectiveRam = Math.max(availableVram, freeRamGB)

  let recommendedModel: string
  let recommendedQuantization: string

  if (effectiveRam >= 16) {
    recommendedModel = 'qwen2.5-coder:14b'
    recommendedQuantization = 'Q4_K_M'
  } else if (effectiveRam >= 8) {
    recommendedModel = 'qwen2.5-coder:7b'
    recommendedQuantization = 'Q4_K_M'
  } else if (effectiveRam >= 4) {
    recommendedModel = 'qwen2.5-coder:3b'
    recommendedQuantization = 'Q4_K_M'
  } else {
    recommendedModel = 'qwen2.5-coder:1.5b'
    recommendedQuantization = 'Q4_0'
  }

  // Hardware is insufficient if less than 4GB effective RAM and no dedicated GPU
  const sufficient = effectiveRam >= 4

  // Scale context window to available memory
  let recommendedCtx: number
  if (effectiveRam >= 16) {
    recommendedCtx = 16384
  } else if (effectiveRam >= 8) {
    recommendedCtx = 8192
  } else {
    recommendedCtx = 4096
  }

  return {
    totalRamGB,
    freeRamGB,
    hasNvidiaGPU,
    gpuVramGB,
    recommendedModel,
    recommendedQuantization,
    recommendedCtx,
    sufficient
  }
}
