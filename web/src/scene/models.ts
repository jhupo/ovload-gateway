import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

export type LayerId = 'room' | 'desk' | 'character' | 'laptop' | 'screen' | 'hands' | 'flow'
export interface Cloud {
  layer: LayerId
  positions: number[]
  closed: number[]
  normals: number[]
  closedNormals: number[]
  colors: number[]
  lines: number[]
  closedLines: number[]
  neutral: boolean
}

let seed = 71339
export function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

class Model {
  cloud: Cloud
  transform = new THREE.Matrix4()
  constructor(layer: LayerId, neutral = false) {
    this.cloud = { layer, positions: [], closed: [], normals: [], closedNormals: [], colors: [], lines: [], closedLines: [], neutral }
  }
  point(position: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, closed = position, closedNormal = normal) {
    this.cloud.positions.push(...position.clone().applyMatrix4(this.transform).toArray())
    this.cloud.closed.push(...closed.clone().applyMatrix4(this.transform).toArray())
    this.cloud.normals.push(...normal.clone().transformDirection(this.transform).toArray())
    this.cloud.closedNormals.push(...closedNormal.clone().transformDirection(this.transform).toArray())
    const variation = .84 + random() * .24
    this.cloud.colors.push(color.r * variation, color.g * variation, color.b * variation)
  }
  line(a: THREE.Vector3, b: THREE.Vector3, ca = a, cb = b) {
    this.cloud.lines.push(...a.clone().applyMatrix4(this.transform).toArray(), ...b.clone().applyMatrix4(this.transform).toArray())
    this.cloud.closedLines.push(...ca.clone().applyMatrix4(this.transform).toArray(), ...cb.clone().applyMatrix4(this.transform).toArray())
  }
  surface(geometry: THREE.BufferGeometry, color: string, count: number, position: number[], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.fromArray(position)
    mesh.scale.fromArray(scale)
    mesh.rotation.set(rotation[0]!, rotation[1]!, rotation[2]!)
    mesh.updateMatrixWorld()
    const sampler = new MeshSurfaceSampler(mesh).setRandomGenerator(random).build()
    const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color(color)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < Math.round(count * 1.5); i++) {
      sampler.sample(p, n)
      p.applyMatrix4(mesh.matrixWorld)
      n.applyMatrix3(normalMatrix).normalize()
      this.point(p, n, c)
    }
    geometry.dispose()
    material.dispose()
  }
  ellipsoid(pos: number[], scale: number[], color: string, n = 1000) {
    this.surface(new THREE.SphereGeometry(1, 30, 24), color, n, pos, scale)
  }
  box(pos: number[], scale: number[], color: string, n = 500, rotation = [0, 0, 0]) {
    this.surface(new THREE.BoxGeometry(...scale as [number, number, number]), color, n, pos, [1, 1, 1], rotation)
  }
  segment(a: number[], b: number[], radius: number, color: string, n = 500, tip = radius) {
    const from = new THREE.Vector3().fromArray(a), to = new THREE.Vector3().fromArray(b)
    const direction = to.clone().sub(from)
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()))
    this.surface(new THREE.CylinderGeometry(tip, radius, direction.length(), 20, 10), color, n, from.add(to).multiplyScalar(.5).toArray(), [1, 1, 1], [rotation.x, rotation.y, rotation.z])
  }
}

function room() {
  const m = new Model('room')
  // The window is directly in front of the programmer, at negative Z.
  m.box([0, 2.72, -2.15], [3.25, 3.0, .07], '#c4deeb', 1300)
  const frame = '#8b9ead'
  for (const x of [-1.7, 0, 1.7]) m.box([x, 2.72, -2.02], [.075, 3.25, .12], frame, 360)
  for (const y of [1.1, 2.55, 4.35]) m.box([0, y, -2.02], [3.5, .075, .12], frame, 400)
  m.box([0, 1.07, -1.88], [3.72, .12, .45], '#c9b69e', 850)
  // Quiet exterior shapes and a warm daylight disk, all sampled 3D geometry.
  m.ellipsoid([.94, 3.72, -2.19], [.28, .28, .025], '#f0c77e', 420)
  for (const [x, h] of [[-1.1, .55], [-.58, .82], [.23, .42], [.9, .63]]) {
    m.box([x!, 1.2 + h! / 2, -2.22], [.42, h!, .06], '#a9c3d0', 130)
  }
  // Floor boundary describes a room without a tech grid or opaque ground plane.
  for (let i = 0; i < 850; i++) {
    const x = (random() - .5) * 5.7, z = (random() - .5) * 4.5
    m.point(new THREE.Vector3(x, -.07, z), new THREE.Vector3(0, 1, 0), new THREE.Color('#b5a793'))
  }
  return m.cloud
}

function desk() {
  const m = new Model('desk')
  m.box([0, 1.40, -.60], [2.65, .13, 1.13], '#d49962', 2500)
  for (const x of [-1.13, 1.13]) for (const z of [-1.00, -.17]) {
    m.segment([x, .04, z], [x, 1.34, z], .035, '#516476', 240)
  }
  // Chair stays with the furniture group so the character can be inspected alone.
  m.box([0, .86, .76], [.94, .13, .79], '#d6b48d', 800)
  m.surface(new THREE.CapsuleGeometry(.43, .47, 8, 20), '#d6b48d', 950, [0, 1.27, 1.10], [1, .74, .18], [0, 0, 0])
  for (const x of [-.33, .33]) for (const z of [.49, 1.0]) {
    m.segment([x * 1.2, .05, z + .04], [x, .83, z], .033, '#667c85', 180)
  }
  return m.cloud
}

function character() {
  const m = new Model('character')
  const blue = '#5280ed', denim = '#383e77', skin = '#efb386', hair = '#26272d'
  // Broad shoulders and a curved back make the rear view immediately readable.
  const profile: THREE.Vector2[] = [[.28, 0], [.43, .08], [.50, .34], [.53, .62], [.46, .80], [.25, .96]].map(([r, y]) => new THREE.Vector2(r, y))
  m.surface(new THREE.LatheGeometry(profile, 40), blue, 3600, [0, 1.02, .58], [1.06, 1, .58], [-.12, 0, 0])
  m.segment([0, 1.91, .43], [0, 2.10, .40], .12, skin, 260)
  // Only the back of the head is modeled. No facial surface can show through.
  m.ellipsoid([0, 2.34, .43], [.37, .41, .35], hair, 2500)
  for (const [x, y, z, r] of [[-.24, 2.60, .47, .14], [-.07, 2.69, .44, .17], [.13, 2.65, .40, .16], [.27, 2.51, .45, .12]]) {
    m.ellipsoid([x!, y!, z!], [r!, r! * .72, r! * .9], hair, 210)
  }
  m.surface(new THREE.TorusGeometry(.29, .052, 8, 36), '#f1a365', 430, [0, 1.98, .49], [1, .72, 1], [Math.PI / 2, 0, 0])
  for (const side of [-1, 1]) {
    const shoulder = [side * .46, 1.74, .48], elbow = [side * .64, 1.43, .20], wrist = [side * .31, 1.49, -.47]
    m.segment(shoulder, elbow, .175, blue, 880, .145)
    m.ellipsoid(elbow, [.145, .155, .15], blue, 270)
    m.segment(elbow, wrist, .132, blue, 930, .10)
    m.ellipsoid([side * .28, 1.49, -.61], [.12, .045, .12], skin, 300)
    // Small typing fingers; the large gathering hands are a different group.
    for (let j = 0; j < 4; j++) m.segment([side * .28 + (j - 1.5) * .039, 1.50, -.67], [side * .28 + (j - 1.5) * .039, 1.49, -.78], .017, skin, 32)
    m.segment([side * .22, 1.01, .53], [side * .25, .73, .04], .18, denim, 850, .15)
    m.segment([side * .25, .73, .04], [side * .27, .20, -.35], .135, denim, 760, .10)
    m.ellipsoid([side * .27, .12, -.52], [.15, .10, .27], '#eee4d3', 420)
    m.box([side * .27, .055, -.52], [.28, .04, .43], '#f18e59', 180)
  }
  return m.cloud
}

function laptop() {
  const m = new Model('laptop')
  m.box([0, 1.493, -.72], [.96, .037, .64], '#b7c6ce', 1600)
  // Screen front faces +Z: both the programmer and the rear camera see it.
  m.box([0, 1.83, -1.007], [.99, .66, .043], '#465a69', 1150, [-.14, 0, 0])
  for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) {
    m.box([-.365 + col * .081, 1.516, -.88 + row * .078], [.058, .005, .052], '#3e4e61', 10)
  }
  m.box([0, 1.517, -.515], [.28, .004, .13], '#e0e6e5', 140)
  return m.cloud
}

function screen() {
  const m = new Model('screen')
  m.box([0, 1.83, -.980], [.90, .575, .003], '#dcece4', 650, [-.14, 0, 0])
  const canvas = document.createElement('canvas')
  canvas.width = 320; canvas.height = 180
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'; ctx.font = '600 29px monospace'; ctx.fillText('Codex', 30, 49)
  for (let i = 0; i < 4; i++) ctx.fillRect(30, 76 + i * 20, [202, 156, 179, 79][i]!, 3)
  const data = ctx.getImageData(0, 0, 320, 180).data
  for (let y = 0; y < 180; y += 2) for (let x = 0; x < 320; x += 2) {
    if (data[(y * 320 + x) * 4 + 3]! < 128) continue
    const py = 2.08 - y / 180 * .50
    m.point(new THREE.Vector3((x / 320 - .5) * .85, py, -.965 - (py - 1.83) * .14), new THREE.Vector3(0, .14, 1), new THREE.Color('#38605b'))
  }
  return m.cloud
}

function finger(m: Model, openPoints: number[][], closedPoints: number[][], radius: number, n: number) {
  const make = (points: number[][]) => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3().fromArray(p)))
  const open = make(openPoints), closed = make(closedPoints)
  const position = (curve: THREE.CatmullRomCurve3, t: number, theta: number) => {
    const tangent = curve.getTangent(t).normalize()
    const cross = new THREE.Vector3(0, 0, 1).cross(tangent).normalize()
    const other = tangent.clone().cross(cross).normalize()
    const normal = cross.multiplyScalar(Math.cos(theta)).add(other.multiplyScalar(Math.sin(theta)))
    const taper = t > .91 ? Math.sqrt(Math.max(.015, 1 - ((t - .91) / .09) ** 2)) : 1 - t * .10
    return { point: curve.getPoint(t).addScaledVector(normal, radius * taper), normal }
  }
  for (let lane = 0; lane < 4; lane++) for (let step = 0; step < 22; step++) {
    const t = step / 22, t2 = (step + 1) / 22, a = lane / 4 * Math.PI * 2
    m.line(position(open, t, a).point, position(open, t2, a).point,
      position(closed, t, a).point, position(closed, t2, a).point)
    if (step % 7 === 0) m.line(position(open, t, a).point, position(open, t2, a + Math.PI / 2).point,
      position(closed, t, a).point, position(closed, t2, a + Math.PI / 2).point)
  }
  for (let i = 0; i < n; i++) {
    const t = random(), angle = random() * Math.PI * 2
    const a = position(open, t, angle), b = position(closed, t, angle)
    m.point(a.point, a.normal, new THREE.Color('#83929b'), b.point, b.normal)
  }
}

function hand(pos: number[], rotation: number[], scale: number, mirror = 1) {
  const m = new Model('hands', true)
  m.transform.compose(new THREE.Vector3().fromArray(pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation as [number, number, number])), new THREE.Vector3(scale * mirror, scale, scale))
  // A short tapered wrist keeps the hand readable without turning it into an arm.
  for (let i = 0; i < 230; i++) {
    const t = random(), angle = random() * Math.PI * 2
    const width = .16 + t * .14
    const x = Math.cos(angle) * width
    const z = Math.sin(angle) * (.055 + t * .035)
    m.point(new THREE.Vector3(x, -1.12 + t * .46, z), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize(), new THREE.Color('#8297a4'))
  }
  for (let lane = 0; lane < 6; lane++) {
    const angle = lane / 6 * Math.PI * 2
    m.line(new THREE.Vector3(Math.cos(angle) * .16, -1.12, Math.sin(angle) * .055), new THREE.Vector3(Math.cos(angle) * .30, -.66, Math.sin(angle) * .09))
  }
  // A thin, open particle volume keeps the palm readable as a connected field.
  for (let i = 0; i < 520; i++) {
    const t = random(), angle = random() * Math.PI * 2
    const width = (.32 + Math.sin(t * Math.PI * .73) * .18) * Math.sqrt(Math.min(1, t * 9))
    const power = .70, c = Math.cos(angle), s = Math.sin(angle)
    const x = width * Math.sign(c) * Math.abs(c) ** power
    const z = .10 * Math.sign(s) * Math.abs(s) ** power
    m.point(new THREE.Vector3(x, -.72 + t * 1.16, z), new THREE.Vector3(c * .35, .02, s).normalize(), new THREE.Color('#8fa0ac'))
  }
  const palm = (t: number, angle: number) => {
    const width = (.32 + Math.sin(t * Math.PI * .73) * .18) * Math.sqrt(Math.min(1, t * 9))
    return new THREE.Vector3(width * Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** .70,
      -.72 + t * 1.16, .10 * Math.sin(angle) * Math.sqrt(Math.min(1, t * 10)))
  }
  for (let lane = 0; lane < 10; lane++) for (let step = 0; step < 12; step++) {
    const t = step / 12, angle = lane / 10 * Math.PI * 2
    m.line(palm(t, angle), palm((step + 1) / 12, angle))
    if (step % 4 === 0) m.line(palm(t, angle), palm((step + 1) / 12, angle + Math.PI / 5))
  }
  const xs = [-.36, -.12, .14, .36], lengths = [.98, 1.18, 1.08, .82], radii = [.055, .060, .055, .048]
  for (let j = 0; j < 4; j++) {
    const x = xs[j]!, len = lengths[j]!, spread = (j - 1.5) * .14
    const open = [[x, .35, 0], [x + spread * .5, .35 + len * .40, .025], [x + spread, .35 + len * .8, .10], [x + spread * 1.1, .35 + len, .16]]
    const resting = [
      [[x, .35, 0], [-.39, .72, .14], [-.43, .74, .43], [-.30, .55, .64]],
      [[x, .35, 0], [-.13, .75, .10], [-.15, .84, .38], [-.10, .64, .72]],
      [[x, .35, 0], [.13, .70, .09], [.19, .78, .35], [.10, .59, .68]],
      [[x, .35, 0], [.37, .59, .07], [.42, .64, .28], [.25, .47, .56]],
    ]
    finger(m, open, resting[j]!, radii[j]!, 220)
  }
  finger(m, [[-.38, -.36, 0], [-.69, -.10, .09], [-.91, .23, .14], [-.91, .52, .18]], [[-.38, -.36, 0], [-.61, -.03, .20], [-.48, .32, .48], [-.22, .40, .62]], .068, 260)
  return m.cloud
}

const handTransforms = [
  { position: [-.12, 2.42, .52], rotation: [.22, -.44, -.58], scale: .29, mirror: 1 },
  { position: [3.35, 3.32, -.55], rotation: [-.12, -.10, 2.32], scale: .27, mirror: -1 },
]
const handoffAnchor = new THREE.Vector3(0, .46, .46)
export const gripAnchors = handTransforms.map(h => handoffAnchor.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().fromArray(h.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...h.rotation as [number, number, number])), new THREE.Vector3(h.scale * h.mirror, h.scale, h.scale))))
export const requestPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(.2, 2.05, -.96), new THREE.Vector3(-1.1, 2.82, .10),
  gripAnchors[0]!, new THREE.Vector3(-.1, 4.6, .1),
  gripAnchors[1]!, new THREE.Vector3(4.0, 5.40, -1.6),
])

export function buildClouds(): Cloud[] {
  seed = 71339
  const roomClouds = [room(), desk(), character(), laptop(), screen()]
  for (const cloud of roomClouds) for (const values of [cloud.positions, cloud.closed]) {
    for (let i = 0; i < values.length; i += 3) {
      values[i] = values[i]! * .46
      values[i + 1] = values[i + 1]! * .46 - 2.02
      values[i + 2] = values[i + 2]! * .46
    }
  }
  return [...roomClouds, ...handTransforms.map(h => hand(h.position, h.rotation, h.scale, h.mirror))]
}
