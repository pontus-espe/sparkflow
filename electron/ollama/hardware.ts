import { execSync } from 'child_process'
import { freemem, totalmem } from 'os'

export interface HardwareInfo {
  totalRamGB: number
  freeRamGB: number
  hasNvidiaGPU: boolean
  gpuVramGB: number | null
  recommendedModel: string
  recommendedQuantization: string
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
    recommendedModel = 'qwen3.5:latest'
    recommendedQuantization = 'Q4_K_M'
  } else if (effectiveRam >= 4) {
    // 4b (3.4GB) is a much better first-launch experience — fast download, works on most machines
    recommendedModel = 'qwen3.5:4b'
    recommendedQuantization = 'Q4_K_M'
  } else {
    recommendedModel = 'qwen3.5:0.8b'
    recommendedQuantization = 'Q4_0'
  }

  // Hardware is insufficient if less than 4GB effective RAM and no dedicated GPU
  const sufficient = effectiveRam >= 4

  return {
    totalRamGB,
    freeRamGB,
    hasNvidiaGPU,
    gpuVramGB,
    recommendedModel,
    recommendedQuantization,
    sufficient
  }
}
