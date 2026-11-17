import * as THREE from 'three';
import { CONFIG } from '../config';

type QualityMode = 'high' | 'balanced' | 'battery';

function detectQualityMode(): QualityMode {
  const requested = new URLSearchParams(location.search).get('quality');
  if (requested === 'high' || requested === 'balanced' || requested === 'battery') {
    return requested;
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lowMemory = (nav.deviceMemory ?? 8) <= 4;
  const lowCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  const saveData = nav.connection?.saveData === true;

  if (saveData || (coarse && lowMemory && lowCpu)) return 'battery';
  if (coarse || lowMemory || lowCpu) return 'balanced';
  return 'high';
}

/**
 * WebGL renderer with an automatic mobile performance profile.
 * The selected quality can be forced with ?quality=high|balanced|battery.
 */
export function createRenderer(): THREE.WebGLRenderer {
  const quality = detectQualityMode();
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: quality === 'battery' ? 'low-power' : 'high-performance',
    stencil: false,
    depth: true,
  });

  const dprCap = quality === 'high' ? 2 : quality === 'balanced' ? 1.5 : 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = quality !== 'battery';
  renderer.shadowMap.type = quality === 'high'
    ? THREE.PCFSoftShadowMap
    : THREE.PCFShadowMap;
  renderer.setClearColor(CONFIG.clearColor);
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.dataset.quality = quality;

  document.documentElement.dataset.gameQuality = quality;
  document.body.appendChild(renderer.domElement);
  return renderer;
}
