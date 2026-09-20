import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { gsap } from 'gsap'
import { buildClouds, random, requestPath, type LayerId } from './models'

export type ReviewView = 'all' | 'world' | 'open' | 'grip' | 'room'

const vertexShader = `
attribute vec3 closed;
attribute vec3 globe;
attribute vec3 shadeNormal;
attribute vec3 particleColor;
attribute float seed;
uniform float uForm, uUnfold, uGrip, uTime, uDpr, uSize, uDark, uNeutral, uDelay;
varying vec3 vColor;
varying float vOpacity;
void main() {
  float formed = smoothstep(0.0, 1.0, clamp((uForm-uDelay)/(1.0-uDelay),0.0,1.0));
  vec3 finalPoint = mix(position, closed, uGrip);
  float angle = uTime * .085 * (1.0-formed);
  vec3 g = globe;
  g.xz = mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*g.xz;
  vec3 unrolled = vec3(g.x*2.45, .4*sin(g.x*.9+seed*5.0)+g.y*.13, g.z*.14);
  vec3 initial = mix(g, unrolled, uUnfold) + vec3(0.0,2.8,0.0);
  vec3 p = mix(initial, finalPoint, formed);
  p += sin(formed*3.14159265) * vec3(sin(seed*31.0+uTime*.5),cos(seed*24.0+uTime*.4),sin(seed*8.0))*.72;
  float light = .40 + .60 * max(0.0,dot(normalize(shadeNormal),normalize(vec3(-.4,.8,1.0))));
  vec3 neutral = mix(vec3(.10,.14,.18),vec3(.65,.77,.84),uDark);
  vec3 finalColor = mix(particleColor,neutral,uNeutral);
  vec3 worldColor = mix(vec3(.32,.40,.45),vec3(.63,.76,.82),uDark);
  vColor = mix(worldColor,finalColor,formed) * (light*.80+.20);
  vOpacity = .84 + seed*.16;
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize*uDpr*(11.0/-mv.z), .75*uDpr, 4.0*uDpr);
}
`
const fragmentShader = `
varying vec3 vColor;
varying float vOpacity;
void main() {
  float d=length(gl_PointCoord-vec2(.5));
  if(d>.48) discard;
  gl_FragColor=vec4(vColor, vOpacity*(1.0-smoothstep(.30,.49,d)));
  #include <colorspace_fragment>
}
`

export function createParticleScene(host: HTMLElement, onReady: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.setClearColor('#f6f5f2')
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.tabIndex = 0
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 80)
  camera.position.set(6.0, 5.0, 11.6)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 2.72, -.15)
  controls.enableDamping = false
  controls.enablePan = false
  controls.minDistance = 5; controls.maxDistance = 22
  controls.minPolarAngle = .25; controls.maxPolarAngle = Math.PI * .69
  controls.update()

  const state = { form: 1, unfold: 1, grip: 0, time: 0 }
  const uniforms = {
    uForm: { value: 1 }, uUnfold: { value: 1 }, uGrip: { value: 0 },
    uTime: { value: 0 }, uDpr: { value: renderer.getPixelRatio() }, uDark: { value: 0 },
  }
  const groups = new Map<LayerId, THREE.Group>()
  const materials: THREE.ShaderMaterial[] = []
  let totalParticles = 0
  const mobile = window.matchMedia('(max-width: 700px)').matches
  for (const cloud of buildClouds()) {
    const positions: number[] = [], closed: number[] = [], normals: number[] = [], colors: number[] = [], globe: number[] = [], seeds: number[] = []
    const stride = mobile ? 2 : 1
    for (let i = 0; i < cloud.positions.length / 3; i += stride) {
      positions.push(...cloud.positions.slice(i * 3, i * 3 + 3))
      closed.push(...cloud.closed.slice(i * 3, i * 3 + 3))
      normals.push(...cloud.normals.slice(i * 3, i * 3 + 3))
      colors.push(...cloud.colors.slice(i * 3, i * 3 + 3))
      const theta = random() * Math.PI * 2, y = random() * 2 - 1, r = Math.sqrt(1 - y * y)
      const radius = 2.10 + random() * .07
      globe.push(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius)
      seeds.push(random())
    }
    totalParticles += positions.length / 3
    const geometry = new THREE.BufferGeometry()
    for (const [name, values] of Object.entries({ position: positions, closed, globe, shadeNormal: normals, particleColor: colors })) {
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 3))
    }
    geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: {
      ...uniforms, uNeutral: { value: cloud.neutral ? 1 : 0 },
      uDelay: { value: cloud.layer === 'hands' ? 0 : .18 }, uSize: { value: cloud.neutral ? 1.6 : 1.9 },
    }, transparent: true, depthWrite: true })
    materials.push(material)
    const points = new THREE.Points(geometry, material)
    // Formation starts away from the final model's bounds.
    points.frustumCulled = false
    if (!groups.has(cloud.layer)) { const group = new THREE.Group(); groups.set(cloud.layer, group); scene.add(group) }
    groups.get(cloud.layer)!.add(points)
  }

  const flowGroup = new THREE.Group()
  groups.set('flow', flowGroup); scene.add(flowGroup)
  const flowCount = mobile ? 650 : 1250
  const flowPositions = new Float32Array(flowCount * 3)
  const flowGeometry = new THREE.BufferGeometry()
  flowGeometry.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3))
  const flowMaterial = new THREE.PointsMaterial({ size: .024, color: '#66899b', transparent: true, opacity: .75, depthWrite: false })
  const flow = new THREE.Points(flowGeometry, flowMaterial)
  flow.frustumCulled = false
  flowGroup.add(flow)
  const samples = requestPath.getPoints(360)
  function updateFlow() {
    for (let i = 0; i < flowCount; i++) {
      const reverse = i % 2 === 0
      const phase = ((i / flowCount + state.time * (reverse ? -.052 : .072)) % 1 + 1) % 1
      const f = phase * 359, index = Math.floor(f), weight = f - index
      const a = samples[index]!, b = samples[index + 1]!
      const lane = (i % 13 - 6) * .013
      flowPositions[i * 3] = THREE.MathUtils.lerp(a.x, b.x, weight)
      flowPositions[i * 3 + 1] = THREE.MathUtils.lerp(a.y, b.y, weight) + lane + (reverse ? -.15 : .02)
      flowPositions[i * 3 + 2] = THREE.MathUtils.lerp(a.z, b.z, weight) + Math.sin(i * 5.7) * .035
    }
    flowGeometry.attributes.position!.needsUpdate = true
    flowMaterial.opacity = Math.max(0, state.form - .68) * 2.35
  }

  let disposed = false, running = false, requestedPlaying = false, visible = true, renderCount = 0
  let view: ReviewView = 'all'
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = preference.matches
  let startedAt = performance.now()

  function render() {
    if (disposed) return
    uniforms.uForm.value = state.form; uniforms.uUnfold.value = state.unfold
    uniforms.uGrip.value = state.grip; uniforms.uTime.value = state.time
    updateFlow()
    renderer.render(scene, camera)
    renderCount++
  }
  const tick = (_time: number, delta: number) => {
    state.time += Math.min(delta, 50) / 1000
    render()
  }
  function syncActivity() {
    const active = requestedPlaying && visible && document.visibilityState === 'visible' && !reduced
    if (active === running) return
    running = active
    if (active) {
      gsap.ticker.add(tick)
      if (intro.progress() < 1) intro.resume()
      else ambient.resume()
    } else { gsap.ticker.remove(tick); intro.pause(); ambient.pause() }
  }
  const intro = gsap.timeline({ paused: true, defaults: { ease: 'sine.inOut' }, onComplete: () => {
    if (running) ambient.restart()
  } })
    .addLabel('world', 0)
    .to(state, { form: 0, unfold: 0, duration: 1.5 }, 0)
    .addLabel('unfold', 1.5)
    .to(state, { unfold: 1, duration: 2.4 }, 'unfold')
    .addLabel('gather', 3.5)
    .to(state, { form: 1, duration: 3.5 }, 'gather')
    .addLabel('open', 7)
    .to(state, { grip: 0, duration: 1.2 }, 'open')
    .addLabel('grip', 8.2)
    .to(state, { grip: 1, duration: 2.0 }, 'grip')
    .to(state, { grip: 1, duration: 1.8 })
    .addLabel('ready')
  const ambient = gsap.timeline({ paused: true, repeat: -1, defaults: { ease: 'sine.inOut' } })
    .to(state, { grip: 0, duration: 1.7 }).to(state, { grip: 0, duration: 1.3 })
    .to(state, { grip: 1, duration: 1.8 }).to(state, { grip: 1, duration: 2.2 })

  function setView(next: ReviewView) {
    view = next
    requestedPlaying = false; syncActivity(); intro.pause(); ambient.pause()
    state.form = next === 'world' ? 0 : 1; state.unfold = next === 'world' ? 0 : 1
    state.grip = next === 'grip' ? 1 : 0
    for (const [id, group] of groups) group.visible = next === 'room' ? id !== 'hands' && id !== 'flow' : next === 'open' || next === 'grip' ? id === 'hands' || id === 'flow' : true
    if (next === 'room') {
      camera.position.set(3.35, 3.22, 6.35); controls.target.set(0, 1.98, -.48)
    } else if (next === 'world') {
      camera.position.set(4.0, 3.50, 9.7); controls.target.set(0, 2.8, 0)
    } else if (next === 'open' || next === 'grip') {
      camera.position.set(3.35, 4.63, 10.8); controls.target.set(.1, 3.85, 0)
    } else {
      camera.position.set(6.0, 5.0, 11.6); controls.target.set(0, 2.72, -.15)
    }
    controls.update(); resize(); render()
  }
  function play() {
    requestedPlaying = true
    if (intro.progress() === 0 && state.form === 1) intro.progress(1, true)
    syncActivity()
  }
  function pause() { requestedPlaying = false; syncActivity(); render() }
  function restart() {
    setView('all')
    state.form = 0; state.unfold = 0; state.grip = 0; state.time = 0
    intro.invalidate().restart().pause(); ambient.pause(0)
    if (reduced) { state.form = 1; state.unfold = 1; intro.progress(1, true); render(); return }
    requestedPlaying = true; syncActivity(); render()
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.fov = w < 700 ? (view === 'room' ? 47 : 61) : 38
    camera.updateProjectionMatrix(); render()
  }
  const onControls = () => render()
  const onVisibility = () => syncActivity()
  const onPreference = () => {
    reduced = preference.matches
    if (reduced) {
      requestedPlaying = false; syncActivity(); intro.progress(1, true)
      state.form = 1; state.unfold = 1; state.grip = 0; render()
    }
  }
  const onKeyboard = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const relative = camera.position.clone().sub(controls.target)
    relative.applyAxisAngle(new THREE.Vector3(0, 1, 0), e.key === 'ArrowLeft' ? -.12 : .12)
    camera.position.copy(controls.target).add(relative); controls.update(); render()
  }
  const observer = new ResizeObserver(resize); observer.observe(host)
  const intersection = new IntersectionObserver(entries => { visible = !!entries[0]?.isIntersecting; syncActivity() })
  intersection.observe(host)
  controls.addEventListener('change', onControls)
  document.addEventListener('visibilitychange', onVisibility)
  preference.addEventListener('change', onPreference)
  renderer.domElement.addEventListener('keydown', onKeyboard)
  setView('all')
  onReady()

  return {
    setView, play, pause, restart,
    setLayer(id: LayerId, enabled: boolean) { groups.get(id)!.visible = enabled; render() },
    setDark(dark: boolean) { uniforms.uDark.value = dark ? 1 : 0; renderer.setClearColor(dark ? '#10151b' : '#f6f5f2'); flowMaterial.color.set(dark ? '#a8c8d4' : '#506e83'); render() },
    setLabel(label: string) { renderer.domElement.setAttribute('aria-label', label) },
    capture() { render(); return renderer.domElement.toDataURL('image/png') },
    inspect() { return { particles: totalParticles + flowCount, running, reduced, frames: renderCount, elapsed: performance.now() - startedAt, layers: [...groups].filter(([, g]) => g.visible).map(([id]) => id), state: { ...state }, view, geometries: renderer.info.memory.geometries } },
    resetMetrics() { startedAt = performance.now(); renderCount = 0 },
    dispose() {
      disposed = true; requestedPlaying = false
      gsap.ticker.remove(tick); intro.kill(); ambient.kill()
      observer.disconnect(); intersection.disconnect(); controls.dispose()
      document.removeEventListener('visibilitychange', onVisibility)
      preference.removeEventListener('change', onPreference)
      renderer.domElement.removeEventListener('keydown', onKeyboard)
      scene.traverse(object => { if (object instanceof THREE.Points) object.geometry.dispose() })
      materials.forEach(material => material.dispose()); flowMaterial.dispose()
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
    },
  }
}
