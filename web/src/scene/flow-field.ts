import * as THREE from 'three'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
export type TreeLimb = { points: THREE.Vector3[], weight: number, lanes: number, radius: number }

/** Distance sampling avoids a speed change where a tributary joins its parent. */
export function resampleFlow(points: THREE.Vector3[], segments = 256) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + points[i]!.distanceTo(points[i - 1]!))
  const total = lengths.at(-1)!
  let index = 1
  return Array.from({ length: segments + 1 }, (_, step) => {
    const distance = step / segments * total
    while (index < points.length - 1 && lengths[index]! < distance) index++
    const span = lengths[index]! - lengths[index - 1]!
    return points[index - 1]!.clone().lerp(points[index]!, span ? (distance - lengths[index - 1]!) / span : 0)
  })
}

export function createFlowField(core: THREE.Vector3, mobile: boolean, random: () => number) {
  const width = mobile ? .42 : 1.08
  const stemCurve = new THREE.CatmullRomCurve3([
    core.clone(), core.clone().add(v(-.28 * width, 1.05, -.10)),
    core.clone().add(v(.32 * width, 2.25, -.3)), core.clone().add(v(-.1, 4.25, -.55)),
  ])
  const stem = stemCurve.getSpacedPoints(192)
  const linePaths: TreeLimb[] = [{ points: resampleFlow(stem, 128), weight: .9, lanes: 13, radius: .28 * width }]
  const incoming: THREE.Vector3[][] = [], foliageTips: THREE.Vector3[] = []
  const joinGaps: number[] = [], joinAlignment: number[] = []

  // Unequal crotch heights and depth angles prevent paired, horizontal tiers.
  for (let boughIndex = 0; boughIndex < 14; boughIndex++) {
    const fan = -1.42 + boughIndex / 13 * 2.84
    const rootIndex = 20 + Math.floor((1 - Math.abs(fan) / 1.42) * 130 + random() * 15)
    const root = stem[rootIndex]!, towardRoot = stem[rootIndex - 1]!.clone().sub(root).normalize()
    const tip = core.clone().add(v(Math.sin(fan) * (4.6 + random() * .8) * width,
      2.1 + Math.cos(fan) * 2.05 + random() * .38, -1.1 + Math.sin(boughIndex * 2.4) * 1.05))
    const bough = new THREE.CubicBezierCurve3(tip,
      tip.clone().lerp(root, .4).add(v(Math.sin(fan) * .5 * width, -.2, .3)),
      root.clone().addScaledVector(towardRoot, -1.05), root)
    const boughPoints = bough.getSpacedPoints(128)
    linePaths.push({ points: boughPoints, weight: .78, lanes: 7, radius: .12 * width })
    for(let spray=0;spray<3;spray++){
      const start=boughPoints[32+spray*19]!
      const end=start.clone().add(v((random()-.5)*1.1*width,.5+random()*.6,(random()-.5)*1.2))
      linePaths.push({points:new THREE.QuadraticBezierCurve3(start,start.clone().lerp(end,.45).add(v(.16,.15,.15)),end).getSpacedPoints(128),weight:.3,lanes:1,radius:.018})
      foliageTips.push(end)
    }
    joinGaps.push(boughPoints.at(-1)!.distanceTo(root)); joinAlignment.push(bough.getTangent(1).dot(towardRoot))
    const stemToHub = stem.slice(0, rootIndex + 1).reverse()
    for (let limb = 0; limb < 4; limb++) {
      const mergeIndex = 5 + limb * 18, merge = boughPoints[mergeIndex]!
      const tangent = boughPoints[mergeIndex + 1]!.clone().sub(merge).normalize()
      const angle = fan + (limb - 1.5) * .19
      const source = tip.clone().lerp(merge,limb*.11).add(v(Math.sin(angle) * (.5 + random() * .85) * width,
        .25 + random() * .5, (random() - .5) * 1.6))
      const curve = new THREE.CubicBezierCurve3(source,
        source.clone().lerp(merge, .45).add(v(Math.sin(angle) * .26, .25, .10)),
        merge.clone().addScaledVector(tangent, -.65), merge)
      const limbPoints = curve.getSpacedPoints(128)
      linePaths.push({ points: limbPoints, weight: .5, lanes: 3, radius: .047 * width })
      incoming.push([...limbPoints, ...boughPoints.slice(mergeIndex + 1), ...stemToHub.slice(1)])
      joinGaps.push(limbPoints.at(-1)!.distanceTo(merge)); joinAlignment.push(curve.getTangent(1).dot(tangent))
      for (let twig = 0; twig < 4; twig++) {
        const start = limbPoints[8 + twig * 17]!
        const end = start.clone().add(v((random() - .5) * 1.6 * width, .18 + random() * .5, (random() - .5) * 1.0))
        const points = new THREE.QuadraticBezierCurve3(start, start.clone().lerp(end, .5).add(v(.14, .12, .15)), end).getSpacedPoints(128)
        linePaths.push({ points, weight: .28, lanes: 1, radius: .014 })
        foliageTips.push(end)
      }
    }
  }

  const rootBase = v(core.x - .12, -2.48, .15)
  const lower = new THREE.CatmullRomCurve3([rootBase, v(core.x + .1, -1.55, .2), v(core.x + .22, -.35, .4), core])
  const lowerPoints=lower.getSpacedPoints(128),rootFlows:THREE.Vector3[][]=[]
  linePaths.push({ points: lowerPoints, weight: 1, lanes: 19, radius: .55 * Math.sqrt(width) })
  for(let spray=0;spray<12;spray++)foliageTips.push(stem.at(-1)!.clone().add(v((random()-.5)*1.5*width,(random()-.3)*.7,(random()-.5)*1.3)))
  for (let rootIndex = 0; rootIndex < 11; rootIndex++) {
    const angle = rootIndex / 11 * Math.PI * 2 + random() * .18
    const reach = (3.3 + random() * 1.9) * width
    const end = rootBase.clone().add(v(Math.cos(angle) * reach, -.12 - random() * .2, Math.sin(angle) * 1.65))
    const curve = new THREE.CatmullRomCurve3([lowerPoints[8]!.clone(),
      rootBase.clone().add(v(Math.cos(angle) * .65 * width, .0, Math.sin(angle) * .35)),
      rootBase.clone().lerp(end,.48).add(v(Math.sin(angle)*.28*width,.06,-Math.cos(angle)*.22)),
      rootBase.clone().lerp(end,.78).add(v(-Math.sin(angle)*.16*width,-.02,Math.cos(angle)*.16)),end])
    const rootPoints=curve.getSpacedPoints(128)
    joinGaps.push(rootPoints[0]!.distanceTo(lowerPoints[8]!))
    rootFlows.push([...rootPoints.slice().reverse(),...lowerPoints.slice(9)])
    linePaths.push({ points: rootPoints, weight: .8, lanes: 9, radius: .32 * Math.sqrt(width) })
    for(let fork=0;fork<2;fork++){
      const start=rootPoints[48+fork*32]!
      const end=start.clone().add(v(Math.cos(angle+(fork?-.45:.6))*width*(1+random()),-.16,Math.sin(angle+(fork?-.45:.6))*.8))
      linePaths.push({points:new THREE.QuadraticBezierCurve3(start,start.clone().lerp(end,.5).add(v(0,.07,.13)),end).getSpacedPoints(128),weight:.4,lanes:2,radius:.04})
    }
  }
  const continuations = incoming.map((_, i) => incoming[(i + 28) % incoming.length]!.slice().reverse())
  const through = incoming.map((path, i) => resampleFlow([...path, ...continuations[i]!.slice(1)]))
  rootFlows.forEach((path,i)=>through.push(resampleFlow([...path,...continuations[i*4]!.slice(1)])))
  return { linePaths, incoming, continuations, through, joinGaps, joinAlignment, foliageTips, rootBase }
}

/** Shared with the line shader: attachments and particles breathe together. */
export function driftFlow(point: THREE.Vector3, core: THREE.Vector3, time: number) {
  const weight = (1 - THREE.MathUtils.smoothstep(point.distanceTo(core), 1, 3)) * THREE.MathUtils.smoothstep(point.y, -.8, .5)
  const { x, y } = point
  point.x += Math.sin(y * .55 + time * .13) * .035 * weight
  point.y += Math.sin(x * .55 + time * .16) * .060 * weight
  point.z += Math.sin((x + y) * .7 + time * .11) * .07 * weight
  return point
}
