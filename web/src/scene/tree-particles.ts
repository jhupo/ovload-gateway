import * as THREE from 'three'
import type { createFlowField } from './flow-field'

/** Static volume samples, animated on the GPU without rebuilding tree buffers. */
export function createTreeParticles(field: ReturnType<typeof createFlowField>, mobile: boolean, random: () => number,
  core: THREE.Vector3, time: { value: number }, dark: { value: number }) {
  const positions: number[] = [], tints: number[] = [], masses: number[] = [], phases: number[] = [], foliage: number[] = []
  function point(p: THREE.Vector3, tint: number, mass: number, leaf = 0) {
    positions.push(...p.toArray()); tints.push(tint); masses.push(mass); phases.push(random());foliage.push(leaf)
  }
  for (const limb of field.linePaths) {
    const samples = limb.lanes===1?12:Math.round((mobile ? 650 : 1000) * limb.radius + (limb.lanes > 10 ? 2600 : limb.lanes===9?520:25))
    for (let i = 0; i < samples; i++) {
      const t = random(), step = t * 127, k = Math.floor(step)
      const p = limb.points[k]!.clone().lerp(limb.points[k + 1]!, step - k)
      const tangent = limb.points[k + 1]!.clone().sub(limb.points[k]!).normalize()
      const normal = new THREE.Vector3(-tangent.y, tangent.x, .05).normalize()
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize()
      const angle = random() * Math.PI * 2 + t * 6
      const taper = limb.lanes === 19 ? 1.1 - t * .57 : limb.lanes === 13 ? 1 - t * .96 : limb.lanes === 9 ? (1-t)**1.3 : limb.lanes > 1 ? .08+t*.92 : .2+Math.sin(t*Math.PI)*.8
      const radius = limb.radius * taper * (.45 + random() * .55)
      p.addScaledVector(normal, Math.cos(angle) * radius).addScaledVector(binormal, Math.sin(angle) * radius)
      point(p, .10 + random() * .35, .68 + random() * .3)
    }
  }
  // Leaf sprays leave gaps between clusters and use varied depths and colors.
  for (const tip of field.foliageTips) {
    const tint = random(), leafCount = mobile ? 60 : 100
    for (let i = 0; i < leafCount; i++) {
      const angle = random() * Math.PI * 2, r = Math.sqrt(random())
      const p = tip.clone().add(new THREE.Vector3(Math.cos(angle) * r * (mobile ? .28 : .58),
        Math.sin(angle) * r * .38, (random() - .5) * .85))
      point(p, tint > .84 ? .92 : .35 + random() * .38, .7 + random() * .3, 1)
    }
  }
  for (let i = 0; i < (mobile ? 1300 : 3000); i++) {
    const angle = random() * Math.PI * 2, r = Math.sqrt(random())
    const x = Math.cos(angle) * r * (mobile ? 1.9 : 4.5), z = Math.sin(angle) * r * 2.2
    const p = field.rootBase.clone().add(new THREE.Vector3(x, -.26 + Math.sin(x * 2 + z) * .09 * r, z))
    point(p, .35 + random() * .4, (.15 + random() * .23) * (1 - r * .7))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 1))
  geometry.setAttribute('mass', new THREE.Float32BufferAttribute(masses, 1))
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('foliage', new THREE.Float32BufferAttribute(foliage, 1))
  const presence = { value: 0 }
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { time, dark, presence, core: { value: core }, dpr: { value: Math.min(devicePixelRatio, 1.15) } },
    vertexShader: `
      attribute float tint,mass,phase,foliage;
      uniform float time,dark,presence,dpr;
      uniform vec3 core;
      varying vec3 color;
      varying float alpha;
      void main(){
        vec3 p=position;
        float weight=(1.-smoothstep(1.,3.,length(position-core)))*smoothstep(-.8,.5,position.y);
        if(weight>0.)p+=vec3(sin(position.y*.55+time*.13)*.035,sin(position.x*.55+time*.16)*.060,
          sin((position.x+position.y)*.7+time*.11)*.07)*weight;
        float canopy=smoothstep(3.,6.,position.y);
        if(canopy>0.)p+=vec3(sin(time*.23+position.y)*.025,cos(time*.19+position.x)*.022,sin(time*.17+position.z)*.035)*canopy;
        vec3 night=mix(vec3(.20,.52,.46),vec3(.28,.42,.68),smoothstep(.3,.8,tint));
        vec3 day=mix(vec3(.10,.055,.08),vec3(.15,.085,.12),tint);
        night=mix(night,vec3(.72,.61,.39),smoothstep(.80,.94,tint));
        vec3 blossom=mix(vec3(.44,.085,.18),vec3(.64,.23,.31),phase);
        blossom=mix(blossom,vec3(.29,.14,.40),smoothstep(.55,.8,tint)*.58);
        day=mix(day,blossom,foliage);
        color=mix(day,night,dark)*(0.8+phase*.3);
        float height=max(0.,position.y)*.055;
        float reveal=smoothstep(height+.06,height+.62,presence);
        alpha=mass*reveal*(.74+.12*sin(time*.7+phase*6.28))*mix(.9,1.,dark);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((1.4+phase*.95)*(1.+foliage*.36)*dpr*14./-mv.z,.8,3.5*dpr);
      }`,
    fragmentShader: `varying vec3 color;varying float alpha;
      void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;
      gl_FragColor=vec4(color,alpha*(1.-smoothstep(.18,.5,d)));
      #include <colorspace_fragment>
      }`,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return { points, geometry, material, presence, count: masses.length }
}
