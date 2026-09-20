import * as THREE from 'three'
import { gsap } from 'gsap'
import { buildClouds, gripAnchors, random } from './models'
import { createFlowField, driftFlow, resampleFlow } from './flow-field'
import { createTreeParticles } from './tree-particles'
import { createGardenMotion } from './garden-motion'

const pointVertex = `
attribute vec3 closed, globe, shadeNormal, closedNormal, particleColor;
attribute float seed;
uniform float uForm, uUnfold, uGrip, uTime, uDpr, uSize, uDark, uHand, uPresence, uAlpha, uPhaseStart, uPhaseEnd;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float f=smoothstep(uPhaseStart,uPhaseEnd,uForm);
  vec3 p=mix(position,closed,uGrip);
  vec3 normal=normalize(mix(shadeNormal,closedNormal,uGrip));
  // Formation is uniform for each draw. Settled room clouds skip the globe's
  // trigonometry while retaining their full particle detail and parallax.
  if(f<1.){
    vec3 g=globe;
    float a=uTime*.065*(1.-f);
    g.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*g.xz;
    float longitude=atan(g.z,g.x)/3.14159265;
    float latitude=asin(clamp(g.y/2.28,-1.,1.))/(3.14159265*.5);
    vec3 ribbon=vec3(longitude*5.7,latitude*2.75,.10*cos(longitude*3.14159265)+sin(seed*18.)*.025);
    p=mix(mix(g,ribbon,uUnfold)+vec3(0.,1.8,0.),p,f);
    p+=sin(f*3.14159)*vec3(sin(seed*36.+uTime*.3),cos(seed*21.),sin(seed*28.))*mix(.13,.28,uHand);
    vec3 initialNormal=normalize(mix(normalize(g),vec3(0.,0.,1.),uUnfold));
    normal=normalize(mix(initialNormal,normal,f));
  }
  float disperse=uHand*(1.-uPresence)*f;
  if(disperse>0.)p+=disperse*vec3(sin(seed*53.+uTime*.1)*2.2,cos(seed*71.)*1.3,sin(seed*27.));
  vec3 vn=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float front=dot(vn,normalize(-mv.xyz));
  float light=.50+.50*max(0.,dot(normal,normalize(vec3(-.4,.8,1.))));
  vec3 ink=mix(vec3(.06,.24,.34),vec3(.48,.78,.94),uDark);
  vec3 color=mix(particleColor,ink,uHand);
  vColor=mix(mix(vec3(.065,.15,.20),vec3(.53,.69,.79),uDark),color,f)*light;
  float sourceVisibility=1.-smoothstep(.14,.56,uForm);
  float targetVisibility=smoothstep(.28,.78,f);
  float assemblyVisibility=mix(max(sourceVisibility,targetVisibility),1.,uHand);
  vAlpha=mix(.35,.90,f)*smoothstep(-.15,.35,front)*(1.-disperse*.9)*assemblyVisibility;
  vAlpha*=mix(1.,(.32+seed*.38)*uPresence,uHand)*uAlpha;
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(uSize*uDpr*12./-mv.z,.7*uDpr,3.5*uDpr);
}`
const pointFragment = `
varying vec3 vColor; varying float vAlpha;
void main(){float d=length(gl_PointCoord-.5);if(d>.48||vAlpha<.015)discard;
 gl_FragColor=vec4(vColor,vAlpha*(1.-smoothstep(.25,.49,d)));
 #include <colorspace_fragment>
}`
const fiberVertex = `
attribute vec3 closed;
uniform float uGrip, uForm, uPresence, uTime, uPhaseStart, uPhaseEnd;
varying float vDepth, vForm;
void main(){
 vec3 p=mix(position,closed,uGrip);
 p+=vec3(sin(position.y*4.+uTime*.2),cos(position.x*4.),sin(position.z*3.))*(1.-uPresence)*.6;
 vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=clamp((16.+mv.z)*.12,.25,1.);
 vForm=smoothstep(uPhaseStart,uPhaseEnd,uForm);
 gl_Position=projectionMatrix*mv;
}`
const fiberFragment = `
uniform vec3 uColor; uniform float uForm,uPresence,uAlpha;
varying float vDepth,vForm;
void main(){gl_FragColor=vec4(uColor,smoothstep(.52,1.,vForm)*uPresence*vDepth*.37*uAlpha);
 #include <colorspace_fragment>
}`

export function createHomepageScene(host: HTMLElement, onReady: () => void, onFailure: () => void) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0, 0)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 60)
  const CARRY_GRIP=.56, CATCH_GRIP=.74
  const state = { form: 0, unfold: 0, trunkPresence: 0, branchGrowth: 30, gatherGrip: 0, presence: 0, captureProgress: 0, source: 0, provider: 0, iconForm: 0, iconDisperse: 0, time: 0 }
  const pointer = { x: 0, y: 0 }
  const login = { x: 0, y: 0, z: 0, grip: 0 }
  let reduced = false, mobile = innerWidth < 700, visible = true, paused = false, disposed = false, running = false, signingIn = false, settled = false
  let dark = false, frames = 0
  let detailView: 'room' | 'typing' | 'relay' | null = null
  const uniforms = {
    uForm: { value: 0 }, uUnfold: { value: 0 }, uGrip: { value: 0 }, uTime: { value: 0 },
    uDpr: { value: renderer.getPixelRatio() }, uDark: { value: 0 }, uPresence: { value: 1 },
  }
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const handGroups: THREE.Group[] = []
  const handGripUniforms: Array<{value:number}> = []
  const handPresenceUniforms: Array<{value:number}> = []
  const fibers: Array<{material:THREE.ShaderMaterial,layer:string}> = []
  let particleCount = 0
  const roomX = mobile ? 1.65 : 4.35
  const clouds = buildClouds(roomX)
  const roomOcclusion = new THREE.Group();scene.add(roomOcclusion)
  const depthMaterial = new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true})
  materials.push(depthMaterial)
  for (const cloud of clouds) {
    const isHand = cloud.layer === 'hands'
    const gripUniform = isHand ? { value: 0 } : uniforms.uGrip
    const presenceUniform = isHand ? { value: 1 } : uniforms.uPresence
    const group = new THREE.Group()
    scene.add(group)
    for(const geometry of cloud.occluders){
      const mesh=new THREE.Mesh(geometry,depthMaterial);mesh.renderOrder=-1;mesh.frustumCulled=false
      roomOcclusion.add(mesh);geometries.push(geometry)
    }
    if (isHand) { handGroups.push(group); handGripUniforms.push(gripUniform); handPresenceUniforms.push(presenceUniform) }
    const attrs: Record<string, number[]> = {position: [],closed: [],shadeNormal: [],closedNormal: [],particleColor: [],globe: [],seed: []}
    const sampleStride=cloud.layer==='room'?3:isHand?6:2
    for(let i=0;i<cloud.positions.length/3;i+=sampleStride){
      for(const [key,values] of Object.entries({position:cloud.positions,closed:cloud.closed,shadeNormal:cloud.normals,closedNormal:cloud.closedNormals,particleColor:cloud.colors})) attrs[key]!.push(...values.slice(i*3,i*3+3))
      const theta=random()*Math.PI*2, y=random()*2-1, r=Math.sqrt(1-y*y), radius=2.28
      attrs.globe!.push(Math.cos(theta)*r*radius,y*radius,Math.sin(theta)*r*radius)
      attrs.seed!.push(random())
    }
    const geometry=new THREE.BufferGeometry()
    for(const [key,values] of Object.entries(attrs)) geometry.setAttribute(key,new THREE.Float32BufferAttribute(values,key==='seed'?1:3))
    const phase:Record<string,[number,number]>={room:[.06,.50],desk:[.24,.68],laptop:[.38,.76],screen:[.50,.82],character:[.48,1],hands:[.68,1],flow:[0,1]}
    const [phaseStart,phaseEnd]=phase[cloud.layer]!
    const phaseUniforms={uPhaseStart:{value:phaseStart},uPhaseEnd:{value:phaseEnd}}
    const pointAlpha=cloud.layer==='character'?1.10:isHand?.76:1
    const fiberAlpha=cloud.layer==='character'?.65:isHand?.92:1
    const pointSize=cloud.layer==='character'?2.45:isHand?1.56:2.85
    const material=new THREE.ShaderMaterial({vertexShader:pointVertex,fragmentShader:pointFragment,uniforms:{...uniforms,...phaseUniforms,uGrip:gripUniform,uPresence:presenceUniform,uSize:{value:pointSize},uHand:{value:isHand?1:0},uAlpha:{value:pointAlpha}},transparent:true,depthWrite:false})
    const points=new THREE.Points(geometry,material); points.frustumCulled=false; group.add(points)
    geometries.push(geometry); materials.push(material); particleCount+=attrs.seed!.length
    if(cloud.lines.length){
      const g=new THREE.BufferGeometry()
      g.setAttribute('position',new THREE.Float32BufferAttribute(cloud.lines,3));g.setAttribute('closed',new THREE.Float32BufferAttribute(cloud.closedLines,3))
      const fiberColor=cloud.layer==='character'?'#334e9c':'#4d90aa'
      const m=new THREE.ShaderMaterial({vertexShader:fiberVertex,fragmentShader:fiberFragment,uniforms:{...uniforms,...phaseUniforms,uGrip:gripUniform,uPresence:presenceUniform,uColor:{value:new THREE.Color(fiberColor)},uAlpha:{value:fiberAlpha}},transparent:true,depthWrite:false,blending:cloud.layer==='character'?THREE.NormalBlending:THREE.AdditiveBlending})
      const lines=new THREE.LineSegments(g,m);lines.frustumCulled=false;group.add(lines)
      geometries.push(g);materials.push(m);fibers.push({material:m,layer:cloud.layer})
    }
  }

  // Sparse great-circle topology: geographical traffic, not a flat background grid.
  const world = new THREE.Group(); scene.add(world); world.position.y=1.8
  const worldMaterial=new THREE.LineBasicMaterial({color:'#668591',transparent:true,opacity:.20,depthWrite:false})
  materials.push(worldMaterial)
  const worldLines:number[]=[]
  for(let ring=0;ring<13;ring++){
    for(let j=0;j<128;j++){
      for(const k of [j,j+1]){
        const a=k/128*Math.PI*2, p=new THREE.Vector3(Math.cos(a)*2.3,Math.sin(a)*2.3,0)
        p.applyAxisAngle(new THREE.Vector3(0,1,0),ring/13*Math.PI)
        worldLines.push(...p.toArray())
      }
    }
  }
  for(const lat of [-.75,-.45,0,.45,.75])for(let j=0;j<128;j++)for(const k of [j,j+1]){
    const a=k/128*Math.PI*2,r=2.3*Math.sqrt(1-lat*lat);worldLines.push(Math.cos(a)*r,lat*2.3,Math.sin(a)*r)
  }
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(worldLines,3));world.add(new THREE.LineSegments(wg,worldMaterial));geometries.push(wg)
  const arcMaterial=new THREE.LineBasicMaterial({color:'#69929a',transparent:true,opacity:.5,depthWrite:false});materials.push(arcMaterial)
  const arcLines:number[]=[]
  for(let i=0;i<16;i++){
    const a=new THREE.Vector3(Math.sin(i*2.3),Math.cos(i*3.1)*.65,Math.cos(i*2.3)).normalize()
    const b=new THREE.Vector3(Math.sin(i*1.7+1),Math.cos(i*2.1)*.7,Math.cos(i*1.7+1)).normalize()
    const points=Array.from({length:70},(_,j)=>{const t=j/69;return a.clone().lerp(b,t).normalize().multiplyScalar(2.31+Math.sin(t*Math.PI)*(.28+i%3*.16))})
    for(let j=0;j<points.length-1;j++)arcLines.push(...points[j]!.toArray(),...points[j+1]!.toArray())
  }
  const arcGeometry=new THREE.BufferGeometry();arcGeometry.setAttribute('position',new THREE.Float32BufferAttribute(arcLines,3));world.add(new THREE.LineSegments(arcGeometry,arcMaterial));geometries.push(arcGeometry)

  // Provider marks exist only during a capture. They form beside the moving hand,
  // travel with it, then dissolve along the outgoing stream.
  const providerMarks: Array<{
    points: THREE.Points
    geometry: THREE.BufferGeometry
    material: THREE.PointsMaterial
    final: Float32Array
    scatter: Float32Array
    phase: number
    lightColor: string
    darkColor: string
  }> = []
  const sampleStroke = (target: THREE.Vector2[], a: THREE.Vector2, b: THREE.Vector2, count: number) => {
    for (let i = 0; i < count; i++) target.push(a.clone().lerp(b, i / Math.max(1, count - 1)))
  }
  function addProviderMark(shape: THREE.Vector2[], scale: number, phase: number, lightColor: string, darkColor: string) {
    const final = new Float32Array(shape.length * 3)
    const scatter = new Float32Array(shape.length * 3)
    const current = new Float32Array(shape.length * 3)
    shape.forEach((point, index) => {
      new THREE.Vector3(point.x * scale, point.y * scale, 0).toArray(final, index * 3)
      const angle = random() * Math.PI * 2, radius = .3 + random() * 1.05
      new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (random() - .5) * .8).toArray(scatter, index * 3)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(current, 3))
    const material = new THREE.PointsMaterial({ size: mobile?.046:.052, color: lightColor, transparent: true, opacity: 0, depthWrite: false })
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.a*=1.-smoothstep(.20,.5,length(gl_PointCoord-.5));`)
    }
    material.customProgramCacheKey=()=> 'provider-particles-round-v1'
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    geometries.push(geometry); materials.push(material)
    providerMarks.push({ points, geometry, material, final, scatter, phase, lightColor, darkColor })
  }
  const openAi: THREE.Vector2[] = []
  for (let petal = 0; petal < 6; petal++) {
    const direction = petal / 6 * Math.PI * 2
    for (let i = 0; i < 48; i++) {
      const angle = -.72*Math.PI+i/47*1.38*Math.PI
      const point = new THREE.Vector2(.19+Math.cos(angle)*.22,Math.sin(angle)*.13)
      openAi.push(point.rotateAround(new THREE.Vector2(),direction))
    }
  }
  const knotHex=Array.from({length:7},(_,index)=>{
    const angle=index/6*Math.PI*2+Math.PI/6
    return new THREE.Vector2(Math.cos(angle)*.18,Math.sin(angle)*.18)
  })
  for(let index=0;index<6;index++)sampleStroke(openAi,knotHex[index]!,knotHex[index+1]!,12)
  const gemini: THREE.Vector2[] = []
  const geminiVertices = [new THREE.Vector2(0,.58),new THREE.Vector2(.11,.12),new THREE.Vector2(.52,0),new THREE.Vector2(.11,-.12),new THREE.Vector2(0,-.58),new THREE.Vector2(-.11,-.12),new THREE.Vector2(-.52,0),new THREE.Vector2(-.11,.12),new THREE.Vector2(0,.58)]
  for (let i = 0; i < geminiVertices.length - 1; i++) sampleStroke(gemini, geminiVertices[i]!, geminiVertices[i + 1]!, 28)
  const grok: THREE.Vector2[] = []
  for (let i = 0; i < 190; i++) {
    const angle = .22 * Math.PI + i / 189 * 1.58 * Math.PI
    grok.push(new THREE.Vector2(Math.cos(angle) * .48, Math.sin(angle) * .48))
  }
  sampleStroke(grok, new THREE.Vector2(.04,.02), new THREE.Vector2(.48,.02), 54)
  sampleStroke(grok, new THREE.Vector2(.05,.02), new THREE.Vector2(.30,-.24), 42)
  addProviderMark(openAi, mobile ? .21 : .23, 0, '#376f70', '#86d2c9')
  addProviderMark(grok, mobile ? .21 : .23, 1.3, '#5b587d', '#bbb5ed')
  addProviderMark(gemini, mobile ? .22 : .24, 2.6, '#456a94', '#91baf0')

  const network = new THREE.Group();scene.add(network)
  const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z)
  const b=gripAnchors[0]!,core=v(mobile?-.35:-2.05,.65,.55)
  // A shared spatial drift keeps branches, trails and handoffs attached without
  // rotating the network. Route opacity tapers instead of drawing uniform wires.
  function styleRoute(material:THREE.LineBasicMaterial|THREE.PointsMaterial){
    material.onBeforeCompile=shader=>{
      shader.uniforms.flowTime=uniforms.uTime
      shader.uniforms.flowCenter={value:core}
      shader.vertexShader=`attribute float routeStrength;\nvarying float vRouteStrength;\nuniform float flowTime;\nuniform vec3 flowCenter;\n${shader.vertexShader}`.replace('#include <begin_vertex>',`#include <begin_vertex>
        float weight=(1.-smoothstep(1.,3.,length(position-flowCenter)))*smoothstep(-.8,.5,position.y);
        if(weight>0.)transformed+=vec3(sin(position.y*.55+flowTime*.13)*.035,
          sin(position.x*.55+flowTime*.16)*.060,
          sin((position.x+position.y)*.7+flowTime*.11)*.07)*weight;
        vRouteStrength=routeStrength;`)
      shader.fragmentShader=`varying float vRouteStrength;\n${shader.fragmentShader}`.replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.a*=vRouteStrength;
        ${material instanceof THREE.PointsMaterial ? 'float d=length(gl_PointCoord-.5);diffuseColor.a*=1.-smoothstep(.16,.5,d);' : ''}`)
    }
    material.customProgramCacheKey=()=> `flow-field-v2-${material.type}`
  }
  function moveWithFlow(point:THREE.Vector3){return driftFlow(point,core,state.time)}
  function bindStrength(geometry:THREE.BufferGeometry,strengthForVertex:(index:number)=>number){
    const count=geometry.getAttribute('position').count,strength=new Float32Array(count)
    for(let index=0;index<count;index++)strength[index]=strengthForVertex(index)
    geometry.setAttribute('routeStrength',new THREE.BufferAttribute(strength,1))
  }
  const fieldPaths=createFlowField(core,mobile,random)
  const tree=createTreeParticles(fieldPaths,mobile,random,core,uniforms.uTime,uniforms.uDark)
  network.add(tree.points);geometries.push(tree.geometry);materials.push(tree.material);particleCount+=tree.count
  const garden=createGardenMotion(fieldPaths.foliageTips,mobile,random,uniforms.uTime,uniforms.uDark,tree.presence)
  network.add(garden.points);geometries.push(garden.geometry);materials.push(garden.material);particleCount+=garden.count
  const {incoming:trunkCenterPaths, continuations, through}=fieldPaths
  const trunkMaterial=new THREE.LineBasicMaterial({color:'#52798b',transparent:true,opacity:0,depthWrite:false})
  const branchMaterial=new THREE.LineBasicMaterial({color:'#638495',transparent:true,opacity:0,depthWrite:false})
  materials.push(trunkMaterial,branchMaterial)
  ;[trunkMaterial,branchMaterial].forEach(styleRoute)
  const trunkLanePaths:THREE.Vector3[][]=[]
  const trunkLaneStrengths:number[]=[]
  for(const {points:centerPath,weight,lanes,radius} of fieldPaths.linePaths){
    for(let lane=0;lane<lanes;lane++){
      const laneOffset=lane-(lanes-1)/2
      trunkLaneStrengths.push(weight*(1-Math.abs(laneOffset)/(lanes*.65)))
      trunkLanePaths.push(centerPath.map((point,index)=>{
        const t=index/(centerPath.length-1),next=centerPath[Math.min(centerPath.length-1,index+1)]!,previous=centerPath[Math.max(0,index-1)]!
        const tangent=next.clone().sub(previous).normalize(),normal=v(-tangent.y,tangent.x,0).normalize()
        const angle=lane/lanes*Math.PI*2+t*3.8
        const taper=lanes===19?1.1-t*.57:lanes===13?1-t*.96:lanes===9?(1-t)**1.3:Math.sin(t*Math.PI)
        const spread=radius*taper
        return point.clone().addScaledVector(normal,Math.cos(angle)*spread).add(v(0,0,Math.sin(angle)*spread))
      }))
    }
  }

  // A bounded reservoir supplies a tree of access paths. Thirty are visible when
  // the scene settles; the remaining paths grow from their sources into a trunk.
  const INITIAL_BRANCHES=30,MAX_BRANCHES=100,BRANCH_SEGMENTS=64
  const branchLinePaths:THREE.Vector3[][]=[]
  const branchFlowPaths:THREE.Vector3[][]=[]
  for(let index=0;index<MAX_BRANCHES;index++){
    const routeIndex=index%trunkCenterPaths.length
    const trunk=trunkCenterPaths[routeIndex]!,mergeAt=.08+random()*.50
    const mergeIndex=Math.round((trunk.length-1)*mergeAt),merge=trunk[mergeIndex]!,next=trunk[Math.min(trunk.length-1,mergeIndex+1)]!
    const mergeTangent=next.clone().sub(merge).normalize()
    const normal=v(-mergeTangent.y,mergeTangent.x,.12).normalize()
    const sideOfTrunk=index%2===0?1:-1
    const source=merge.clone()
      .addScaledVector(mergeTangent,-(.55+random()*1.65))
      .addScaledVector(normal,sideOfTrunk*(.55+random()*1.55))
      .add(v(0,0,-.25-random()*.6))
    // Tributaries can enter from either side of every trunk. The only exclusion
    // is the lower-right room, including the swept approach to a low branch.
    if(source.y<.6&&Math.abs(source.x-roomX)<1.8)source.y=.65+random()*.4
    const direction=merge.clone().sub(source).normalize(),distance=merge.distanceTo(source)
    const controlA=source.clone().addScaledVector(direction,distance*.30).addScaledVector(normal,sideOfTrunk*.15)
    const controlB=merge.clone().addScaledVector(mergeTangent,-Math.min(distance*.46,.85))
    const branch=new THREE.CubicBezierCurve3(source,controlA,controlB,merge).getPoints(BRANCH_SEGMENTS)
    branchLinePaths.push(branch)
    branchFlowPaths.push(resampleFlow([...branch,...trunk.slice(mergeIndex+1),...continuations[routeIndex]!.slice(1)]))
  }

  const baseFlowPaths=through
  const trunkFlowPathCount=through.length
  const addLineBatch=(paths:THREE.Vector3[][],material:THREE.LineBasicMaterial)=>{
    const positions:number[]=[]
    // Rendering needs half the samples used by the distance-based traffic paths.
    for(const path of paths)for(let index=0;index<path.length-1;index+=2)positions.push(...path[index]!.toArray(),...path[Math.min(path.length-1,index+2)]!.toArray())
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometries.push(geometry)
    const verticesPerPath=paths[0]!.length-1
    bindStrength(geometry,index=>{
      const pathIndex=Math.floor(index/verticesPerPath),t=(index%verticesPerPath)/verticesPerPath
      const strand=material===trunkMaterial?trunkLaneStrengths[pathIndex]!:[.5,1,.5][pathIndex%3]!
      return strand*(.28+.72*Math.pow(Math.sin(t*Math.PI),.32))
    })
    const lines=new THREE.LineSegments(geometry,material);lines.frustumCulled=false;network.add(lines)
  }
  addLineBatch(trunkLanePaths,trunkMaterial)
  const branchPositions:number[]=[]
  for(const path of branchLinePaths)for(let index=0;index<path.length-1;index++)branchPositions.push(...path[index]!.toArray(),...path[index+1]!.toArray())
  const branchGeometry=new THREE.BufferGeometry();branchGeometry.setAttribute('position',new THREE.Float32BufferAttribute(branchPositions,3));branchGeometry.setDrawRange(0,INITIAL_BRANCHES*BRANCH_SEGMENTS*2);geometries.push(branchGeometry)
  bindStrength(branchGeometry,index=>{
    const t=(index%(BRANCH_SEGMENTS*2))/(BRANCH_SEGMENTS*2)
    return THREE.MathUtils.smoothstep(t,0,.32)*(.65+.35*Math.sin(t*Math.PI))
  })
  const branchLines=new THREE.LineSegments(branchGeometry,branchMaterial);branchLines.frustumCulled=false;network.add(branchLines)
  let visibleBranchCount=INITIAL_BRANCHES
  let flowPaths: THREE.Vector3[][]=[...baseFlowPaths,...branchFlowPaths.slice(0,visibleBranchCount)]
  const count=mobile?1200:2800, flowPositions=new Float32Array(count*3), flowColors=new Float32Array(count*3)
  const flowGeometry=new THREE.BufferGeometry();flowGeometry.setAttribute('position',new THREE.BufferAttribute(flowPositions,3));flowGeometry.setAttribute('color',new THREE.BufferAttribute(flowColors,3))
  bindStrength(flowGeometry,index=>[1,.62,.32,.12][index%4]!)
  const flowMaterial=new THREE.PointsMaterial({size:.049,vertexColors:true,transparent:true,opacity:0,depthWrite:false});materials.push(flowMaterial);geometries.push(flowGeometry)
  styleRoute(flowMaterial)
  const flowPoints=new THREE.Points(flowGeometry,flowMaterial);flowPoints.frustumCulled=false;network.add(flowPoints)
  const fieldCount=mobile?1100:2200,fieldPositions=new Float32Array(fieldCount*3)
  for(let i=0;i<fieldCount;i++){
    fieldPositions[i*3]=(random()-.5)*23
    fieldPositions[i*3+1]=(random()-.5)*13+1.7
    fieldPositions[i*3+2]=(random()-.5)*7-1.7
  }
  const fieldGeometry=new THREE.BufferGeometry();fieldGeometry.setAttribute('position',new THREE.BufferAttribute(fieldPositions,3));geometries.push(fieldGeometry)
  const fieldMaterial=new THREE.PointsMaterial({size:.026,color:'#6f91a2',transparent:true,opacity:0,depthWrite:false});materials.push(fieldMaterial)
  const field=new THREE.Points(fieldGeometry,fieldMaterial);field.frustumCulled=false;scene.add(field)
  const mapPolygons:Array<Array<[number,number]>>=[
    [[-.97,.30],[-.88,.51],[-.67,.61],[-.47,.50],[-.39,.36],[-.48,.24],[-.62,.18],[-.68,.06],[-.80,.12],[-.91,.21]],
    [[-.59,.05],[-.43,-.01],[-.32,-.17],[-.39,-.43],[-.50,-.34],[-.60,-.10]],
    [[-.59,.62],[-.42,.68],[-.34,.53],[-.48,.43]],
    [[-.24,.38],[-.08,.48],[.12,.43],[.20,.32],[.08,.20],[-.08,.19],[-.21,.28]],
    [[-.17,.18],[.11,.20],[.24,.04],[.13,-.29],[-.04,-.44],[-.17,-.16]],
    [[.09,.41],[.38,.55],[.66,.50],[.96,.31],[.81,.13],[.61,.09],[.45,.19],[.27,.07],[.13,.20]],
    [[.33,.16],[.48,.12],[.59,-.02],[.48,-.12],[.31,.02]],
    [[.55,-.19],[.83,-.18],[.91,-.35],[.69,-.43],[.53,-.31]],
  ]
  const insidePolygon=(x:number,y:number,polygon:Array<[number,number]>)=>{
    let inside=false
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [xi,yi]=polygon[i]!,[xj,yj]=polygon[j]!
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside
    }
    return inside
  }
  const mapTarget=mobile?1050:2700,mapPositions:number[]=[]
  const mapScaleX=mobile?5.35:9.8,mapScaleY=mobile?5.75:6.6
  for(let attempts=0;mapPositions.length/3<mapTarget&&attempts<mapTarget*28;attempts++){
    const x=random()*2-1,y=random()*1.02-.46
    if(!mapPolygons.some(polygon=>insidePolygon(x,y,polygon)))continue
    mapPositions.push(x*mapScaleX+(random()-.5)*.05,y*mapScaleY+2.25+(random()-.5)*.05,-3.05+(random()-.5)*.12)
  }
  const mapGeometry=new THREE.BufferGeometry();mapGeometry.setAttribute('position',new THREE.Float32BufferAttribute(mapPositions,3));geometries.push(mapGeometry)
  const mapMaterial=new THREE.PointsMaterial({size:mobile?1.45:1.72,sizeAttenuation:false,color:'#607c88',transparent:true,opacity:0,depthWrite:false});materials.push(mapMaterial)
  const mapPoints=new THREE.Points(mapGeometry,mapMaterial);mapPoints.frustumCulled=false;scene.add(mapPoints)
  const mapScale=(x:number,y:number,z=-3.05)=>v(x*mapScaleX,y*mapScaleY+2.25,z)
  const countryNodes:[number,number][]=[[-.82,.36],[-.68,.27],[-.50,-.12],[-.14,.36],[-.03,.24],[.04,.03],[.18,.32],[.32,.18],[.46,.37],[.61,.32],[.76,.20],[.69,-.29],[.39,-.02],[.02,-.25]]
  const countryNodePositions:number[]=[]
  for(const [x,y] of countryNodes){
    const center=mapScale(x,y,-2.91)
    countryNodePositions.push(...center.toArray())
    for(let index=0;index<7;index++){
      const angle=index/7*Math.PI*2+random()*.3,radius=.018+random()*.020
      countryNodePositions.push(center.x+Math.cos(angle)*radius*mapScaleX,center.y+Math.sin(angle)*radius*mapScaleY,center.z+(random()-.5)*.025)
    }
  }
  const countryNodeGeometry=new THREE.BufferGeometry();countryNodeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(countryNodePositions,3));geometries.push(countryNodeGeometry)
  const countryNodeMaterial=new THREE.PointsMaterial({size:mobile?1.65:2.05,sizeAttenuation:false,color:'#bd8050',transparent:true,opacity:0,depthWrite:false});materials.push(countryNodeMaterial)
  const countryNodePoints=new THREE.Points(countryNodeGeometry,countryNodeMaterial);countryNodePoints.frustumCulled=false;scene.add(countryNodePoints)
  const MAX_CAPTURED_ROUTES=20
  const MAX_CAPTURE_LANES=10
  // Each cycle samples edge and upper-field targets procedurally. The lower-right
  // safe zone stays clear for the character, desk and laptop.
  const horizontalLimit=mobile?4.35:8.4,topY=mobile?5.15:6.35
  const captureSources=Array.from({length:32},(_,index)=>{
    const zone=index%5
    let target:THREE.Vector3
    if(zone===0)target=v(-horizontalLimit*(.72+random()*.26),1.7+random()*3.8,(random()-.5)*1.4)
    else if(zone===1)target=v(horizontalLimit*(.72+random()*.26),1.6+random()*4.0,(random()-.5)*1.4)
    else if(zone===2)target=v((random()-.5)*horizontalLimit*1.55,topY+random()*.9,(random()-.5)*1.5)
    else if(zone===3){
      const side=index%8===3?-1:1
      target=v(side*horizontalLimit*(.74+random()*.22),-.55+random()*1.45,(random()-.5)*1.35)
    }
    else target=v((index%2===0?-1:1)*horizontalLimit*(.58+random()*.26),topY*.72+random()*1.4,(random()-.5)*1.5)
    return target.sub(b)
  })
  const captureContinuations:THREE.Vector3[][]=[]
  const captureCurves=captureSources.map((offset,index)=>{
    const source=b.clone().add(offset)
    // A capture grafts onto a nearby canopy limb. Its packets then travel down
    // the connected bough and stem to the relay instead of drawing another ray.
    let routeIndex=0,mergeIndex=0,nearest=Infinity
    trunkCenterPaths.forEach((path,pathIndex)=>{
      for(const candidate of [18,46,78,108]){
        const distance=path[candidate]!.distanceToSquared(source)
        if(distance<nearest){nearest=distance;routeIndex=pathIndex;mergeIndex=candidate}
      }
    })
    const route=trunkCenterPaths[routeIndex]!,endpoint=route[mergeIndex]!,tangent=route[mergeIndex+1]!.clone().sub(endpoint).normalize()
    captureContinuations.push(resampleFlow([...route.slice(mergeIndex),...continuations[routeIndex]!.slice(1)]))
    const delta=endpoint.clone().sub(source),distance=delta.length(),direction=delta.clone().normalize()
    const side=index%2===0?1:-1
    const perpendicular=new THREE.Vector3(-direction.y,direction.x,.12).normalize()
    const bend=Math.min(1.25,distance*.16)*side,lift=.38+(index%3)*.18
    const controlA=source.clone().addScaledVector(direction,distance*.28).addScaledVector(perpendicular,bend).add(v(0,lift,.18))
    const controlB=endpoint.clone().addScaledVector(tangent,-Math.min(1.4,distance*.24))
    return new THREE.CubicBezierCurve3(source,controlA,controlB,endpoint)
  })
  const captureLaneCounts=captureCurves.map(()=>5+Math.floor(random()*6))
  const captureLanePaths=captureCurves.map((curve,sourceIndex)=>Array.from({length:captureLaneCounts[sourceIndex]!},(_,lane)=>{
    const laneOffset=lane-(captureLaneCounts[sourceIndex]!-1)/2
    return curve.getSpacedPoints(128).map((point,pointIndex)=>{
      const t=pointIndex/128
      const spread=Math.sin(t*Math.PI)
      return point.clone().add(v(0,spread*laneOffset*.055,spread*laneOffset*.032))
    })
  }))
  const currentGatherOffset=new THREE.Vector3()
  const zAxis=new THREE.Vector3(0,0,1),rotatedAnchor=new THREE.Vector3(),desiredGatherAnchor=new THREE.Vector3()
  const baseGatherAngle=Math.atan2(core.y-b.y,core.x-b.x)
  const trailMaterial=new THREE.LineBasicMaterial({color:'#5e8799',transparent:true,opacity:0,depthWrite:false})
  styleRoute(trailMaterial)
  materials.push(trailMaterial)
  const trailGeometry=new THREE.BufferGeometry()
  trailGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAX_CAPTURE_LANES*128*2*3),3))
  bindStrength(trailGeometry,()=>1)
  trailGeometry.setDrawRange(0,0);geometries.push(trailGeometry)
  const trailLines=new THREE.LineSegments(trailGeometry,trailMaterial);trailLines.frustumCulled=false;network.add(trailLines)
  let trailSource=-1,trailLaneCount=0
  type CapturedRoute={line:THREE.LineSegments,paths:THREE.Vector3[][],material:THREE.LineBasicMaterial}
  const capturedRoutes:CapturedRoute[]=[]
  const retiringRoutes=new Set<CapturedRoute>()
  const disposeCapturedRoute=(route:CapturedRoute)=>{
    network.remove(route.line);route.line.geometry.dispose()
    route.material.dispose()
  }
  function retireCapture(route:CapturedRoute){
    retiringRoutes.add(route)
    const startOpacity=Math.max(route.material.opacity,dark?.085:.065)
    route.material.opacity=startOpacity
    const original=Float32Array.from(route.line.geometry.attributes.position!.array as Float32Array)
    const scatter=new Float32Array(original.length)
    for(let i=0;i<original.length;i+=3){
        const away=v(original[i]!-core.x,original[i+1]!-core.y,original[i+2]!-core.z)
        if(away.lengthSq()<.001)away.set(random()-.5,random()-.5,random()-.5)
        away.normalize()
        const noise=.16+random()*.38
        scatter[i]=away.x*(.18+random()*.28)+(random()-.5)*noise
        scatter[i+1]=away.y*(.18+random()*.28)+(random()-.5)*noise
        scatter[i+2]=away.z*(.12+random()*.20)+(random()-.5)*noise*.65
    }
    const dissolve={progress:0}
    ctx.add(()=>{
      gsap.to(dissolve,{progress:1,duration:3,ease:'sine.inOut',onUpdate(){
        const progress=dissolve.progress,spread=progress*(.58+progress*.72)
        route.material.opacity=startOpacity*(1-progress)
        const position=route.line.geometry.attributes.position!,values=position.array as Float32Array
        for(let i=0;i<values.length;i++)values[i]=original[i]!+scatter[i]!*spread
        position.needsUpdate=true
      },onComplete(){
        retiringRoutes.delete(route)
        disposeCapturedRoute(route)
      }})
    })
  }
  function commitCapture(index:number){
    const material=new THREE.LineBasicMaterial({color:dark?'#85c8e2':'#416e67',transparent:true,opacity:dark?.16:.23,depthWrite:false})
    styleRoute(material)
    const paths:THREE.Vector3[][]=[],positions:number[]=[]
    const sourcePaths=captureLanePaths[index%captureLanePaths.length]!
    const retainedIndices=new Set([0,Math.round((sourcePaths.length-1)/2),sourcePaths.length-1])
    for(const [lane,sourcePath] of sourcePaths.entries()) {
      if(!retainedIndices.has(lane))continue
      const path=sourcePath.map(point=>point.clone())
      paths.push(resampleFlow([...path,...captureContinuations[index%captureContinuations.length]!.slice(1)]))
      for(let index=0;index<path.length-1;index++)positions.push(...path[index]!.toArray(),...path[index+1]!.toArray())
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
    bindStrength(geometry,index=>{
      const t=(index%256)/256
      return THREE.MathUtils.smoothstep(t,0,.2)*(.6+.4*Math.sin(t*Math.PI))
    })
    const line=new THREE.LineSegments(geometry,material);line.frustumCulled=false;network.add(line)
    capturedRoutes.forEach(route=>{route.material.opacity=Math.max(dark?.028:.065,route.material.opacity*.68)})
    capturedRoutes.push({line,paths,material})
    if(capturedRoutes.length>MAX_CAPTURED_ROUTES){
      const oldest=capturedRoutes.shift()!
      retireCapture(oldest)
    }
    flowPaths=[...baseFlowPaths,...branchFlowPaths.slice(0,visibleBranchCount),...capturedRoutes.flatMap(route=>route.paths)]
  }
  function colorFlow(){
    for(let i=0;i<count;i++){
      const c=new THREE.Color(Math.floor(i/4)%3===0?(dark?'#c5b5a0':'#946345'):(dark?'#afcbd3':'#355d70'))
      c.toArray(flowColors,i*3)
    }
    flowGeometry.attributes.color!.needsUpdate=true
  }
  colorFlow()
  function render(){
    if(disposed)return
    camera.position.set((mobile?.08:.65)+pointer.x*.26,3.6+pointer.y*.15,mobile?16.1:15.2)
    camera.lookAt(0,1.6,0)
    if(detailView==='room'){camera.position.set(roomX+.18,-.05,4.65);camera.lookAt(roomX,-1.53,-.24)}
    else if(detailView==='typing'){camera.position.set(roomX+1.22,-.02,1.55);camera.lookAt(roomX+.04,-1.53,-.22)}
    else if(detailView==='relay'){camera.position.set(.18,3.05,4.6);camera.lookAt(core)}
    roomOcclusion.visible=state.form>.995
    uniforms.uForm.value=state.form;uniforms.uUnfold.value=state.unfold
    uniforms.uGrip.value=0;uniforms.uTime.value=state.time;uniforms.uPresence.value=1
    handGripUniforms[0]!.value=signingIn?login.grip:state.gatherGrip
    handPresenceUniforms[0]!.value=signingIn?1:state.presence
    world.rotation.y=state.time*.065;world.scale.set(1+state.unfold*2.5,1-state.unfold*.8,1-state.unfold*.6)
    worldMaterial.opacity=(1-state.form)*(1-state.unfold)*.18;arcMaterial.opacity=(1-state.form)*(1-state.unfold)*.42
    trunkMaterial.opacity=state.trunkPresence*(dark?.40:.58)
    tree.presence.value=state.trunkPresence
    branchMaterial.opacity=state.trunkPresence*(dark?.22:.34)
    const branchProgress=THREE.MathUtils.clamp(state.branchGrowth,INITIAL_BRANCHES,MAX_BRANCHES)
    branchGeometry.setDrawRange(0,Math.floor(branchProgress*BRANCH_SEGMENTS*2))
    const activeBranches=Math.floor(branchProgress)
    if(activeBranches!==visibleBranchCount){
      visibleBranchCount=activeBranches
      flowPaths=[...baseFlowPaths,...branchFlowPaths.slice(0,visibleBranchCount),...capturedRoutes.flatMap(route=>route.paths)]
    }
    flowMaterial.opacity=flowPaths.length?THREE.MathUtils.smoothstep(state.form,.2,1)*state.trunkPresence*(dark?.78:.92):0
    fieldMaterial.opacity=THREE.MathUtils.smoothstep(state.form,.35,1)*(dark?.32:.38)
    const mapPresence=THREE.MathUtils.smoothstep(state.form,.38,1)
    mapMaterial.opacity=mapPresence*(mobile?(dark?.22:.25):(dark?.32:.34))
    countryNodeMaterial.opacity=mapPresence*(dark?.56:.68)
    field.rotation.y=state.time*.007;field.rotation.z=Math.sin(state.time*.035)*.006;field.position.y=Math.sin(state.time*.11)*.08
    const activeSource=Math.round(state.source)%captureCurves.length
    if(activeSource!==trailSource){
      const paths=captureLanePaths[activeSource]!,positions=trailGeometry.attributes.position!.array as Float32Array
      trailLaneCount=paths.length
      let offset=0
      for(let step=0;step<128;step++)for(let lane=0;lane<trailLaneCount;lane++){
        paths[lane]![step]!.toArray(positions,offset);offset+=3
        paths[lane]![step+1]!.toArray(positions,offset);offset+=3
      }
      trailGeometry.attributes.position!.needsUpdate=true
      const strengths=trailGeometry.attributes.routeStrength!.array as Float32Array
      for(let step=0;step<128;step++)for(let lane=0;lane<trailLaneCount;lane++){
        const strength=THREE.MathUtils.smoothstep(step/128,0,.18)*(lane===Math.floor(trailLaneCount/2)?1:.38)
        strengths[(step*trailLaneCount+lane)*2]=strength;strengths[(step*trailLaneCount+lane)*2+1]=strength
      }
      trailGeometry.attributes.routeStrength!.needsUpdate=true
      trailSource=activeSource
    }
    const trailCount=Math.max(0,Math.min(129,Math.floor(state.captureProgress*128)+1))
    trailGeometry.setDrawRange(0,Math.max(0,trailCount-1)*trailLaneCount*2)
    trailMaterial.opacity=signingIn?0:state.presence*(dark?.26:.28)
    const activeCurve=captureCurves[activeSource]!,captureProgress=THREE.MathUtils.clamp(state.captureProgress,0,1)
    const tangent=activeCurve.getTangentAt(captureProgress)
    currentGatherOffset.copy(activeCurve.getPointAt(captureProgress))
    moveWithFlow(currentGatherOffset).sub(b)
    const activeProvider = Math.round(state.provider) % providerMarks.length
    desiredGatherAnchor.copy(b).add(signingIn?v(login.x,login.y,login.z):currentGatherOffset)
    if(!signingIn){
      const handoffOffset=THREE.MathUtils.smoothstep(captureProgress,.72,1)*.16
      desiredGatherAnchor.addScaledVector(tangent,-handoffOffset)
    }
    const iconCenter = desiredGatherAnchor.clone()
    if(!signingIn)iconCenter.add(v(0,.015,.16))
    for (let markIndex = 0; markIndex < providerMarks.length; markIndex++) {
      const mark = providerMarks[markIndex]!
      if(signingIn||markIndex!==activeProvider){mark.points.visible=false;mark.material.opacity=0;continue}
      mark.points.visible=true
      const positions = mark.geometry.attributes.position!.array as Float32Array
      for (let i = 0; i < positions.length; i += 3) {
        const scatterWeight=(1-state.iconForm)*.55
        const localX=mark.final[i]!*state.iconForm+mark.scatter[i]!*scatterWeight
        const localY=mark.final[i+1]!*state.iconForm+mark.scatter[i+1]!*scatterWeight
        const localZ=mark.final[i+2]!*state.iconForm+mark.scatter[i+2]!*scatterWeight
        const continuation=captureContinuations[activeSource]!
        const progress=state.iconDisperse*(.035+i/positions.length*.16)
        const sample=progress*(continuation.length-1),pointIndex=Math.min(continuation.length-2,Math.floor(sample))
        const target=moveWithFlow(continuation[pointIndex]!.clone().lerp(continuation[pointIndex+1]!,sample-pointIndex))
        positions[i] = THREE.MathUtils.lerp(iconCenter.x+localX,target.x,state.iconDisperse)
        positions[i+1] = THREE.MathUtils.lerp(iconCenter.y+localY,target.y,state.iconDisperse)
        positions[i+2] = THREE.MathUtils.lerp(iconCenter.z+localZ,target.z,state.iconDisperse)
      }
      mark.geometry.attributes.position!.needsUpdate = true
      const absorptionFade=1-THREE.MathUtils.smoothstep(state.iconDisperse,.38,1)
      mark.material.size=(mobile?.046:.052)*(1-state.iconDisperse*.76)
      mark.material.opacity = state.iconForm*absorptionFade*(.62+Math.sin(state.time*.7+mark.phase)*.08)
    }
    const gatherer=handGroups[0]!
    gatherer.visible=signingIn||state.presence>.002
    let directionDelta=Math.atan2(tangent.y,tangent.x)-baseGatherAngle
    directionDelta=Math.atan2(Math.sin(directionDelta),Math.cos(directionDelta))
    const gatherAngle=signingIn?0:THREE.MathUtils.clamp(directionDelta*.52,-1.05,1.05)
    gatherer.rotation.z=gatherAngle;rotatedAnchor.copy(b).applyAxisAngle(zAxis,gatherAngle);gatherer.position.copy(desiredGatherAnchor).sub(rotatedAnchor)
    if(flowPaths.length)for(let i=0;i<count;i++){
      const packet=Math.floor(i/4),bead=i%4,pathIndex=packet%flowPaths.length,path=flowPaths[pathIndex]!,reverse=packet%3===0,pathEnd=path.length-1
      const direction=reverse?-1:1
      const t=((packet*.61803398875+state.time*direction*.028-bead*.0014*direction)%1+1)%1*pathEnd,index=Math.min(pathEnd-1,Math.floor(t)),f=t-index
      flowPositions[i*3]=THREE.MathUtils.lerp(path[index]!.x,path[index+1]!.x,f)
      flowPositions[i*3+1]=THREE.MathUtils.lerp(path[index]!.y,path[index+1]!.y,f)+(reverse?-.055:0)
      flowPositions[i*3+2]=THREE.MathUtils.lerp(path[index]!.z,path[index+1]!.z,f)
    }
    flowGeometry.attributes.position!.needsUpdate=true
    renderer.render(scene,camera);frames++
  }
  function tick(_time:number,delta:number){state.time+=Math.min(delta,50)/1000;render()}
  let intro:gsap.core.Timeline,ambient:gsap.core.Timeline,growth:gsap.core.Timeline,gesture:gsap.core.Timeline|undefined
  function sync(){
    const active=!disposed&&!reduced&&!paused&&visible&&document.visibilityState==='visible'
    if(active===running)return
    running=active
    if(active){
      gsap.ticker.add(tick)
      if(!signingIn){(settled?ambient:intro).resume();if(settled)growth.resume()}
      else gesture?.resume()
    }
    else{gsap.ticker.remove(tick);intro?.pause();ambient?.pause();growth?.pause();gesture?.pause()}
  }
  const ctx=gsap.context(()=>{
    const captureSequence=(sourceIndex:number)=>gsap.timeline({defaults:{ease:'sine.inOut'}})
      .addLabel('appear')
      .set(state,{source:sourceIndex,provider:sourceIndex%providerMarks.length,captureProgress:0,iconForm:0,iconDisperse:0,presence:0,gatherGrip:0},'appear')
      .to(state,{presence:1,iconForm:1,duration:1.6,ease:'sine.out'},'appear')
      .to(state,{captureProgress:1,duration:6.4,ease:'sine.inOut'},'appear+=.4')
      .to(state,{gatherGrip:CARRY_GRIP,duration:1.15,ease:'power2.inOut'},'appear+=1.05')
      .to(state,{iconDisperse:1,duration:3.1,ease:'power2.out'},'appear+=6.75')
      .call(()=>commitCapture(sourceIndex),[],'appear+=9.45')
      .to(state,{gatherGrip:0,presence:0,iconForm:0,duration:1.25,ease:'sine.in'},'appear+=9.45')
    ambient=gsap.timeline({paused:true,repeat:-1,defaults:{ease:'sine.inOut'}})
    ;captureSources.map((_,index)=>(index+1)%captureSources.length).forEach(index=>ambient.add(captureSequence(index)))
    growth=gsap.timeline({paused:true}).to(state,{branchGrowth:MAX_BRANCHES,duration:180,ease:'none'})
    intro=gsap.timeline({paused:true,defaults:{ease:'sine.inOut'},onComplete(){settled=true;onReady();if(running&&!signingIn){ambient.restart();growth.play()}}})
      .addLabel('globe').to(state,{form:0,duration:1.2},'globe')
      .addLabel('unfold').to(state,{unfold:1,duration:2.3},'unfold')
      .addLabel('gather',2.5).to(state,{form:1,duration:3},'gather')
      .to(state,{trunkPresence:1,duration:2.2,ease:'sine.out'},'gather+=1.2')
      .addLabel('connect',5.5).set(state,{source:0,provider:0,captureProgress:0,iconForm:0,iconDisperse:0,presence:0,gatherGrip:0},'connect')
      .to(state,{presence:1,iconForm:1,duration:1.6,ease:'sine.out'},'connect')
      .to(state,{captureProgress:1,duration:6.4,ease:'sine.inOut'},'connect+=.4')
      .to(state,{gatherGrip:CARRY_GRIP,duration:1.15,ease:'power2.inOut'},'connect+=1.05')
      .to(state,{iconDisperse:1,duration:3.1,ease:'power2.out'},'connect+=6.75')
      .call(()=>commitCapture(0),[], 'connect+=9.45')
      .to(state,{gatherGrip:0,presence:0,iconForm:0,duration:1.25,ease:'sine.in'},'connect+=9.45')
      .addLabel('ready')
  },host)
  const mm=gsap.matchMedia()
  mm.add({reduce:'(prefers-reduced-motion: reduce)',mobile:'(max-width: 700px)',desktop:'(min-width: 701px)'},context=>{
    reduced=!!context.conditions?.reduce;mobile=!!context.conditions?.mobile
    if(reduced){intro.pause();ambient.pause();growth.pause();gesture?.progress(1);state.form=1;state.unfold=1;state.trunkPresence=1;state.branchGrowth=MAX_BRANCHES;state.gatherGrip=0;state.captureProgress=1;state.presence=0;state.iconForm=0;state.iconDisperse=0;settled=true;onReady()}
    resize();sync()
  },host)
  function resize(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return
    renderer.setSize(w,h);camera.aspect=w/h;camera.fov=42;camera.updateProjectionMatrix();render()
  }
  const observer=new ResizeObserver(resize);observer.observe(host)
  const intersection=new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;sync()});intersection.observe(host)
  const onVisibility=()=>sync()
  const onContextLost=(e:Event)=>{e.preventDefault();paused=true;sync();onFailure()}
  document.addEventListener('visibilitychange',onVisibility)
  renderer.domElement.addEventListener('webglcontextlost',onContextLost)
  let moveX:ReturnType<typeof gsap.quickTo>,moveY:ReturnType<typeof gsap.quickTo>
  ctx.add(()=>{moveX=gsap.quickTo(pointer,'x',{duration:1.6,ease:'sine.out'});moveY=gsap.quickTo(pointer,'y',{duration:1.6,ease:'sine.out'})})
  const onPointer=(e:PointerEvent)=>{if(reduced||paused||e.pointerType!=='mouse')return;moveX(e.clientX/innerWidth-.5);moveY(e.clientY/innerHeight-.5)}
  window.addEventListener('pointermove',onPointer,{passive:true})
  resize();sync()
  return {
    setDark(value:boolean){
      dark=value;uniforms.uDark.value=value?1:0
      fibers.forEach(({material,layer})=>material.uniforms.uColor!.value.set(layer==='character'?(value?'#8da8ff':'#233d88'):(value?'#72c8ee':'#1e6078')))
      providerMarks.forEach(mark=>mark.material.color.set(value?mark.darkColor:mark.lightColor))
      worldMaterial.color.set(value?'#7ba2b2':'#668591');arcMaterial.color.set(value?'#83b6bf':'#69929a')
      fieldMaterial.color.set(value?'#78919c':'#72818b');mapMaterial.color.set(value?'#627c89':'#66798a');countryNodeMaterial.color.set(value?'#d1a776':'#9b6b4b')
      trunkMaterial.color.set(value?'#8eaebb':'#725369');branchMaterial.color.set(value?'#75919d':'#a17b91');trailMaterial.color.set(value?'#afc9d3':'#775772')
      ;[...capturedRoutes,...retiringRoutes].forEach(route=>route.material.color.set(value?'#85c8e2':'#416e67'))
      capturedRoutes.forEach((route,index)=>{route.material.opacity=Math.max(value?.028:.065,(value?.16:.23)*Math.pow(.68,capturedRoutes.length-index-1))})
      colorFlow();render()
    },
    setPaused(value:boolean){paused=value;sync();render()},
    setLogin(value:boolean,button?:DOMRect,immediate=false){
      signingIn=value;gesture?.kill();intro.pause();ambient.pause();growth.pause()
      if(value){
        settled=true;state.form=1;state.unfold=1;state.presence=1;onReady()
        login.x=currentGatherOffset.x;login.y=currentGatherOffset.y;login.z=currentGatherOffset.z;login.grip=state.gatherGrip
        if(immediate||reduced){
          login.x=-b.x;login.y=1.8-b.y;login.z=2;login.grip=CATCH_GRIP;paused=true;sync();render();return
        }
        const bounds=host.getBoundingClientRect()
        const target=new THREE.Vector3(button?(button.x+button.width/2-bounds.x)/bounds.width*2-1:.8,button?1-(button.y+button.height/2-bounds.y)/bounds.height*2:.8,.5).unproject(camera)
        const direction=target.sub(camera.position).normalize();const point=camera.position.clone().addScaledVector(direction,-camera.position.z/direction.z)
        ctx.add(()=>{gesture=gsap.timeline({defaults:{ease:'power2.inOut'},onComplete:()=>{paused=true;sync()}})
          .addLabel('reach').to(login,{x:point.x-b.x,y:point.y-b.y,z:0,grip:0,duration:.78,ease:'sine.inOut'},'reach')
          .addLabel('catch').to(login,{grip:CATCH_GRIP,duration:.26,ease:'power2.inOut'},'catch')
          .addLabel('bring').to(login,{x:-b.x,y:1.8-b.y,z:2,duration:.92,ease:'power3.inOut'},'bring')})
      }else{
        paused=false;login.x=0;login.y=0;login.z=0;login.grip=0;state.presence=0;state.gatherGrip=0;state.captureProgress=0;state.iconForm=0;state.iconDisperse=0;sync()
        if(running)ambient.restart()
      }
      if(!running)gesture?.pause();render()
    },
    inspect(){const source=Math.round(state.source)%captureSources.length;return{frames,running,reduced,settled,particles:particleCount+count+fieldCount+mapPositions.length/3+countryNodePositions.length/3,geometries:renderer.info.memory.geometries,form:state.form,trunkPresence:state.trunkPresence,visibleBranches:visibleBranchCount,maxBranches:MAX_BRANCHES,gatherGrip:state.gatherGrip,gather:currentGatherOffset.toArray(),capturedRoutes:capturedRoutes.length,retiringRoutes:retiringRoutes.size,maxCapturedRoutes:MAX_CAPTURED_ROUTES,trunkPaths:trunkFlowPathCount,providerCount:providerMarks.length,provider:Math.round(state.provider)%providerMarks.length,captureLanes:captureLanePaths[source]!.length,iconForm:state.iconForm,iconDisperse:state.iconDisperse}},
    finishIntro(){intro.progress(1);render()},
    reviewAt(seconds:number){paused=true;sync();intro.pause(Math.max(0,Math.min(seconds,intro.duration())));render()},
    reviewAmbientAt(seconds:number){paused=true;sync();intro.progress(1);ambient.pause(Math.max(0,Math.min(seconds,ambient.duration())));render()},
    reviewBranchGrowth(count:number){growth.pause();state.branchGrowth=THREE.MathUtils.clamp(count,INITIAL_BRANCHES,MAX_BRANCHES);render()},
    reviewDetail(view:'room'|'typing'|'relay'|null){detailView=view;render()},
    inspectConnections(){
      const junctions=trunkCenterPaths.map(path=>moveWithFlow(path.at(-1)!.clone()).toArray())
      const sources=trunkCenterPaths.map(path=>moveWithFlow(path[0]!.clone()).toArray())
      return {junctions,sources,
        throughEndpoints:through.map(path=>path.at(-1)!.distanceTo(core)),
        joinGaps:fieldPaths.joinGaps,
        joinAlignment:fieldPaths.joinAlignment,
        roomX,rootX:fieldPaths.rootBase.x,
      }
    },
    reviewMotionAt(seconds:number){paused=true;sync();state.time=Math.max(0,seconds);render()},
    reviewCaptureRetention(count:number){for(let index=0;index<count;index++)commitCapture(index);render()},
    dispose(){disposed=true;gsap.ticker.remove(tick);window.removeEventListener('pointermove',onPointer);document.removeEventListener('visibilitychange',onVisibility);renderer.domElement.removeEventListener('webglcontextlost',onContextLost);observer.disconnect();intersection.disconnect();mm.revert();ctx.revert();capturedRoutes.forEach(disposeCapturedRoute);retiringRoutes.forEach(disposeCapturedRoute);retiringRoutes.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()},
  }
}
