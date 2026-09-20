import * as THREE from 'three'
import { gsap } from 'gsap'
import { buildClouds, gripAnchors, random } from './models'

const pointVertex = `
attribute vec3 closed, globe, shadeNormal, closedNormal, particleColor;
attribute float seed;
uniform float uForm, uUnfold, uGrip, uTime, uDpr, uSize, uDark, uHand, uPresence, uAlpha, uPhaseStart, uPhaseEnd;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float f=smoothstep(uPhaseStart,uPhaseEnd,uForm);
  vec3 g=globe;
  float a=uTime*.065*(1.-f);
  g.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*g.xz;
  float longitude=atan(g.z,g.x)/3.14159265;
  float latitude=asin(clamp(g.y/2.28,-1.,1.))/(3.14159265*.5);
  vec3 ribbon=vec3(longitude*5.7,latitude*2.75,.10*cos(longitude*3.14159265)+sin(seed*18.)*.025);
  vec3 p=mix(mix(g,ribbon,uUnfold)+vec3(0.,1.8,0.),mix(position,closed,uGrip),f);
  float disperse=uHand*(1.-uPresence)*f;
  float assembly=sin(f*3.14159);
  p+=assembly*vec3(sin(seed*36.+uTime*.3),cos(seed*21.),sin(seed*28.))*mix(.13,.28,uHand);
  p+=disperse*vec3(sin(seed*53.+uTime*.1)*2.2,cos(seed*71.)*1.3,sin(seed*27.));
  vec3 initialNormal=normalize(mix(normalize(g),vec3(0.,0.,1.),uUnfold));
  vec3 normal=normalize(mix(initialNormal,mix(shadeNormal,closedNormal,uGrip),f));
  vec3 vn=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float front=dot(vn,normalize(-mv.xyz));
  float light=.50+.50*max(0.,dot(normal,normalize(vec3(-.4,.8,1.))));
  vec3 ink=mix(vec3(.10,.30,.42),vec3(.48,.78,.94),uDark);
  vec3 color=mix(particleColor,ink,uHand);
  vColor=mix(mix(vec3(.12,.22,.29),vec3(.53,.69,.79),uDark),color,f)*light;
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
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0, 0)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 60)
  const REST_GRIP=.22, CARRY_GRIP=.56, CATCH_GRIP=.74
  const state = { form: 0, unfold: 0, grip: REST_GRIP, centerPresence: 0, trunkPresence: 0, gatherGrip: 0, presence: 0, captureProgress: 0, source: 0, provider: 0, iconForm: 0, iconDisperse: 0, time: 0 }
  const pointer = { x: 0, y: 0 }
  const login = { x: 0, y: 0, z: 0, grip: 0 }
  let reduced = false, mobile = innerWidth < 700, visible = true, paused = false, disposed = false, running = false, signingIn = false, settled = false
  let dark = false, frames = 0
  const uniforms = {
    uForm: { value: 0 }, uUnfold: { value: 0 }, uGrip: { value: 0 }, uTime: { value: 0 },
    uDpr: { value: renderer.getPixelRatio() }, uDark: { value: 0 }, uPresence: { value: 1 },
  }
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const handGroups: THREE.Group[] = []
  const handGripUniforms: Array<{value:number}> = []
  const handPresenceUniforms: Array<{value:number}> = []
  const fibers: THREE.ShaderMaterial[] = []
  let particleCount = 0
  const clouds = buildClouds()
  for (const cloud of clouds) {
    const isHand = cloud.layer === 'hands'
    const handIndex = isHand ? handGroups.length : -1
    const gripUniform = isHand ? { value: 0 } : uniforms.uGrip
    const presenceUniform = isHand ? { value: 1 } : uniforms.uPresence
    const group = new THREE.Group()
    scene.add(group)
    if (isHand) { handGroups.push(group); handGripUniforms.push(gripUniform); handPresenceUniforms.push(presenceUniform) }
    const attrs: Record<string, number[]> = {position: [],closed: [],shadeNormal: [],closedNormal: [],particleColor: [],globe: [],seed: []}
    const sampleStride=cloud.layer==='character'?3:6
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
    const pointAlpha=handIndex===0?.60:handIndex===1?.76:1
    const fiberAlpha=handIndex===0?.88:handIndex===1?.92:1
    const pointSize=cloud.layer==='character'?2.62:isHand?(handIndex===0?1.52:1.64):3.18
    const material=new THREE.ShaderMaterial({vertexShader:pointVertex,fragmentShader:pointFragment,uniforms:{...uniforms,...phaseUniforms,uGrip:gripUniform,uPresence:presenceUniform,uSize:{value:pointSize},uHand:{value:isHand?1:0},uAlpha:{value:pointAlpha}},transparent:true,depthWrite:false})
    const points=new THREE.Points(geometry,material); points.frustumCulled=false; group.add(points)
    geometries.push(geometry); materials.push(material); particleCount+=attrs.seed!.length
    if(cloud.lines.length){
      const g=new THREE.BufferGeometry()
      g.setAttribute('position',new THREE.Float32BufferAttribute(cloud.lines,3));g.setAttribute('closed',new THREE.Float32BufferAttribute(cloud.closedLines,3))
      const m=new THREE.ShaderMaterial({vertexShader:fiberVertex,fragmentShader:fiberFragment,uniforms:{...uniforms,...phaseUniforms,uGrip:gripUniform,uPresence:presenceUniform,uColor:{value:new THREE.Color('#4d90aa')},uAlpha:{value:fiberAlpha}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})
      const lines=new THREE.LineSegments(g,m);lines.frustumCulled=false;group.add(lines)
      geometries.push(g);materials.push(m);fibers.push(m)
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
  // travel with it, then scatter at the central hand.
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
  const centerAnchor=gripAnchors[0]!,b=gripAnchors[1]!,core=v(0,2.72,.55)
  const trunkMaterial=new THREE.LineBasicMaterial({color:'#52798b',transparent:true,opacity:0,depthWrite:false})
  const taskMaterial=new THREE.LineBasicMaterial({color:'#6678a2',transparent:true,opacity:0,depthWrite:false})
  materials.push(trunkMaterial,taskMaterial)
  const baseFlowPaths:THREE.Vector3[][]=[]
  const span=mobile?6.3:11
  const trunkSources=[
    v(-span,6.15+random()*.85,-2.8+random()*.65),
    v(-span,1.05+random()*.72,-1.75+random()*.72),
    v(span,5.25+random()*.95,-2.7+random()*.72),
    v(span,.95+random()*.82,-1.65+random()*.68),
  ]
  const trunkCenterPaths=trunkSources.map((source,index)=>{
    const delta=core.clone().sub(source),distance=delta.length(),direction=delta.clone().normalize()
    const radial=source.clone().sub(core).setZ(0).normalize()
    const swirl=v(-radial.y,radial.x,0)
    const bend=(2.15+random()*1.55)*(index%2===0?1:-1)
    const controlA=source.clone().addScaledVector(direction,distance*(.19+random()*.09)).addScaledVector(swirl,bend).add(v(0,.38+random()*.58,.18))
    const nearDirection=radial.multiplyScalar(.48).addScaledVector(swirl,1.05).normalize()
    const controlB=core.clone().addScaledVector(nearDirection,1.08+random()*.48).add(v(0,0,.36))
    return new THREE.CubicBezierCurve3(source,controlA,controlB,core).getPoints(176)
  })
  const addFlowPath=(path:THREE.Vector3[])=>{
    baseFlowPaths.push(path)
  }
  for(const centerPath of trunkCenterPaths){
    for(let lane=0;lane<3;lane++){
      const laneOffset=lane-1
      const path=centerPath.map((point,index)=>{
        const t=index/(centerPath.length-1),next=centerPath[Math.min(centerPath.length-1,index+1)]!
        const tangent=next.clone().sub(point).normalize(),normal=v(-tangent.y,tangent.x,0).normalize()
        const spread=Math.sin(t*Math.PI)*laneOffset*.105
        return point.clone().addScaledVector(normal,spread).add(v(0,0,spread*.34))
      })
      addFlowPath(path)
    }
  }
  const branchSources=[
    v(-span*.34,8.0,-2.9),
    v(-span,3.75,-2.0),
    v(span*.38,7.75,-2.85),
    v(span,3.35,-1.7),
  ]
  const branchMerges=[[0,.46],[1,.56],[2,.48],[3,.58]] as const
  branchSources.forEach((source,index)=>{
    const [routeIndex,mergeAt]=branchMerges[index]!,trunk=trunkCenterPaths[routeIndex]!
    const mergeIndex=Math.round((trunk.length-1)*mergeAt),merge=trunk[mergeIndex]!,next=trunk[mergeIndex+1]!
    const mergeTangent=next.clone().sub(merge).normalize(),direction=merge.clone().sub(source).normalize(),distance=merge.distanceTo(source)
    const perpendicular=v(-direction.y,direction.x,0).normalize().multiplyScalar((index%2===0?1:-1)*(1.15+random()*.85))
    const controlA=source.clone().addScaledVector(direction,distance*.36).add(perpendicular).add(v(0,.35,.16))
    const controlB=merge.clone().addScaledVector(mergeTangent,-.95)
    const branch=new THREE.CubicBezierCurve3(source,controlA,controlB,merge).getPoints(72)
    addFlowPath([...branch,...trunk.slice(mergeIndex+1)])
  })
  const trunkFlowPathCount=baseFlowPaths.length
  const taskSource=v(0,-1.04,-.62)
  const taskCurve=new THREE.CubicBezierCurve3(taskSource,v(-.18,.15,.22),core.clone().add(v(-.42,-1.1,.48)),core)
  const taskCenterPath=taskCurve.getPoints(128)
  for(let lane=0;lane<3;lane++){
    const laneOffset=lane-1
    const path=taskCenterPath.map((point,index)=>{
      const spread=Math.sin(index/(taskCenterPath.length-1)*Math.PI)
      return point.clone().add(v(spread*laneOffset*.055,0,spread*laneOffset*.045))
    })
    baseFlowPaths.push(path)
  }
  const addLineBatch=(paths:THREE.Vector3[][],material:THREE.LineBasicMaterial)=>{
    const positions:number[]=[]
    for(const path of paths)for(let index=0;index<path.length-1;index++)positions.push(...path[index]!.toArray(),...path[index+1]!.toArray())
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometries.push(geometry)
    const lines=new THREE.LineSegments(geometry,material);lines.frustumCulled=false;network.add(lines)
  }
  addLineBatch(baseFlowPaths.slice(0,trunkFlowPathCount),trunkMaterial)
  addLineBatch(baseFlowPaths.slice(trunkFlowPathCount),taskMaterial)
  let flowPaths: THREE.Vector3[][]=[...baseFlowPaths]
  const count=mobile?700:1200, flowPositions=new Float32Array(count*3), flowColors=new Float32Array(count*3)
  const flowGeometry=new THREE.BufferGeometry();flowGeometry.setAttribute('position',new THREE.BufferAttribute(flowPositions,3));flowGeometry.setAttribute('color',new THREE.BufferAttribute(flowColors,3))
  const flowMaterial=new THREE.PointsMaterial({size:.032,vertexColors:true,transparent:true,opacity:0,depthWrite:false});materials.push(flowMaterial);geometries.push(flowGeometry)
  const flowPoints=new THREE.Points(flowGeometry,flowMaterial);flowPoints.frustumCulled=false;network.add(flowPoints)
  const fieldCount=mobile?900:1800,fieldPositions=new Float32Array(fieldCount*3)
  for(let i=0;i<fieldCount;i++){
    fieldPositions[i*3]=(random()-.5)*23
    fieldPositions[i*3+1]=(random()-.5)*13+1.7
    fieldPositions[i*3+2]=(random()-.5)*7-1.7
  }
  const fieldGeometry=new THREE.BufferGeometry();fieldGeometry.setAttribute('position',new THREE.BufferAttribute(fieldPositions,3));geometries.push(fieldGeometry)
  const fieldMaterial=new THREE.PointsMaterial({size:.026,color:'#6f91a2',transparent:true,opacity:0,depthWrite:false});materials.push(fieldMaterial)
  const field=new THREE.Points(fieldGeometry,fieldMaterial);field.frustumCulled=false;scene.add(field)
  const mapPolygons:Array<Array<[number,number]>>=[
    [[-.95,.27],[-.80,.48],[-.55,.50],[-.39,.34],[-.48,.20],[-.62,.11],[-.55,.01],[-.72,.05],[-.86,.17]],
    [[-.56,.02],[-.38,-.04],[-.29,-.19],[-.38,-.43],[-.50,-.31],[-.59,-.10]],
    [[-.19,.34],[.02,.43],[.18,.33],[.10,.19],[-.05,.17],[-.19,.25]],
    [[-.16,.15],[.15,.17],[.25,.01],[.12,-.28],[-.03,-.41],[-.18,-.15]],
    [[.06,.40],[.56,.48],[.95,.30],[.77,.14],[.58,.09],[.43,.19],[.28,.07],[.11,.19]],
    [[.55,-.18],[.83,-.18],[.89,-.34],[.68,-.41],[.54,-.30]],
    [[-.58,.51],[-.39,.57],[-.31,.43],[-.48,.37]],
  ]
  const insidePolygon=(x:number,y:number,polygon:Array<[number,number]>)=>{
    let inside=false
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [xi,yi]=polygon[i]!,[xj,yj]=polygon[j]!
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside
    }
    return inside
  }
  const mapTarget=mobile?650:1400,mapPositions:number[]=[]
  const mapScaleX=mobile?5.35:9.8,mapScaleY=mobile?5.75:6.6
  for(let attempts=0;mapPositions.length/3<mapTarget&&attempts<mapTarget*28;attempts++){
    const x=random()*2-1,y=random()*1.02-.46
    if(!mapPolygons.some(polygon=>insidePolygon(x,y,polygon)))continue
    mapPositions.push(x*mapScaleX+(random()-.5)*.05,y*mapScaleY+2.25+(random()-.5)*.05,-3.05+(random()-.5)*.12)
  }
  const mapGeometry=new THREE.BufferGeometry();mapGeometry.setAttribute('position',new THREE.Float32BufferAttribute(mapPositions,3));geometries.push(mapGeometry)
  const mapMaterial=new THREE.PointsMaterial({size:mobile?1.35:1.55,sizeAttenuation:false,color:'#607c88',transparent:true,opacity:0,depthWrite:false});materials.push(mapMaterial)
  const mapPoints=new THREE.Points(mapGeometry,mapMaterial);mapPoints.frustumCulled=false;scene.add(mapPoints)
  const corePositions:number[]=[]
  for(let i=0;i<(mobile?190:300);i++){
    const orbit=i%3,theta=random()*Math.PI*2,r=.12+orbit*.055+(random()-.5)*.028
    const point=v(Math.cos(theta)*r,Math.sin(theta)*r*.66,Math.sin(theta*2+orbit)*.055)
    point.applyAxisAngle(v(1,0,0),(.32+orbit*.22)*(orbit===1?-1:1))
    point.add(v((random()-.5)*.018,(random()-.5)*.018,(random()-.5)*.018))
    corePositions.push(...point.toArray())
  }
  const coreGeometry=new THREE.BufferGeometry();coreGeometry.setAttribute('position',new THREE.Float32BufferAttribute(corePositions,3));geometries.push(coreGeometry)
  const coreMaterial=new THREE.PointsMaterial({size:.029,color:'#6e97aa',transparent:true,opacity:0,depthWrite:false});materials.push(coreMaterial)
  const relayCore=new THREE.Points(coreGeometry,coreMaterial);relayCore.frustumCulled=false;relayCore.position.copy(core);scene.add(relayCore)
  const MAX_CAPTURED_ROUTES=20
  const MAX_CAPTURE_LANES=10
  // Each cycle samples edge and upper-field targets procedurally. The lower-center
  // safe zone stays clear for the character, desk and laptop.
  const horizontalLimit=mobile?4.35:8.4,topY=mobile?5.15:6.35
  const captureSources=Array.from({length:32},(_,index)=>{
    const zone=index%4
    let target:THREE.Vector3
    if(zone===0)target=v(-horizontalLimit*(.72+random()*.26),1.7+random()*3.8,(random()-.5)*1.4)
    else if(zone===1)target=v(horizontalLimit*(.72+random()*.26),1.6+random()*4.0,(random()-.5)*1.4)
    else if(zone===2)target=v((random()-.5)*horizontalLimit*1.55,topY+random()*.9,(random()-.5)*1.5)
    else{
      const side=index%8===3?-1:1
      target=v(side*horizontalLimit*(.66+random()*.25),1.25+random()*1.6,(random()-.5)*1.5)
    }
    return target.sub(b)
  })
  const captureCurves=captureSources.map((offset,index)=>{
    const source=b.clone().add(offset)
    const delta=core.clone().sub(source),distance=delta.length(),direction=delta.clone().normalize()
    const side=index%2===0?1:-1
    const perpendicular=new THREE.Vector3(-direction.y,direction.x,.12).normalize()
    const bend=Math.min(1.25,distance*.16)*side,lift=.38+(index%3)*.18
    const controlA=source.clone().addScaledVector(direction,distance*.28).addScaledVector(perpendicular,bend).add(v(0,lift,.18))
    const controlB=source.clone().addScaledVector(direction,distance*.72).addScaledVector(perpendicular,bend*.62).add(v(0,lift*.72,.42))
    return new THREE.CubicBezierCurve3(source,controlA,controlB,core)
  })
  const captureLaneCounts=captureCurves.map(()=>5+Math.floor(random()*6))
  const captureLanePaths=captureCurves.map((curve,sourceIndex)=>Array.from({length:captureLaneCounts[sourceIndex]!},(_,lane)=>{
    const laneOffset=lane-(captureLaneCounts[sourceIndex]!-1)/2
    return curve.getPoints(128).map((point,pointIndex)=>{
      const t=pointIndex/128
      const spread=Math.sin(t*Math.PI)
      return point.clone().add(v(0,spread*laneOffset*.055,spread*laneOffset*.032))
    })
  }))
  const currentGatherOffset=new THREE.Vector3()
  const zAxis=new THREE.Vector3(0,0,1),rotatedAnchor=new THREE.Vector3(),desiredGatherAnchor=new THREE.Vector3()
  const baseGatherAngle=Math.atan2(core.y-b.y,core.x-b.x)
  const trailMaterial=new THREE.LineBasicMaterial({color:'#5e8799',transparent:true,opacity:0,depthWrite:false})
  materials.push(trailMaterial)
  const trailGeometry=new THREE.BufferGeometry()
  trailGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAX_CAPTURE_LANES*128*2*3),3))
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
    const material=new THREE.LineBasicMaterial({color:dark?'#85c8e2':'#47768c',transparent:true,opacity:dark?.16:.11,depthWrite:false})
    const paths:THREE.Vector3[][]=[],positions:number[]=[]
    const sourcePaths=captureLanePaths[index%captureLanePaths.length]!
    const retainedIndices=new Set([0,Math.round((sourcePaths.length-1)/2),sourcePaths.length-1])
    for(const [lane,sourcePath] of sourcePaths.entries()) {
      if(!retainedIndices.has(lane))continue
      const path=sourcePath.map(point=>point.clone())
      paths.push(path)
      for(let index=0;index<path.length-1;index++)positions.push(...path[index]!.toArray(),...path[index+1]!.toArray())
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
    const line=new THREE.LineSegments(geometry,material);line.frustumCulled=false;network.add(line)
    capturedRoutes.forEach(route=>{route.material.opacity=Math.max(dark?.028:.018,route.material.opacity*.58)})
    capturedRoutes.push({line,paths,material})
    if(capturedRoutes.length>MAX_CAPTURED_ROUTES){
      const oldest=capturedRoutes.shift()!
      retireCapture(oldest)
    }
    flowPaths=[...baseFlowPaths,...capturedRoutes.flatMap(route=>route.paths)]
  }
  function colorFlow(){
    for(let i=0;i<count;i++){
      const c=new THREE.Color(i%3===0?(dark?'#c5bcff':'#7b74b6'):(dark?'#9fc7dc':'#3b697e'))
      c.toArray(flowColors,i*3)
    }
    flowGeometry.attributes.color!.needsUpdate=true
  }
  colorFlow()
  function render(){
    if(disposed)return
    camera.position.set((mobile?.25:.65)+pointer.x*.26,3.6+pointer.y*.15,mobile?18:13.2)
    camera.lookAt(0,1.6,0)
    uniforms.uForm.value=state.form;uniforms.uUnfold.value=state.unfold
    uniforms.uGrip.value=state.grip;uniforms.uTime.value=state.time;uniforms.uPresence.value=1
    handGripUniforms[0]!.value=state.grip
    handGripUniforms[1]!.value=signingIn?login.grip:state.gatherGrip
    handPresenceUniforms[0]!.value=state.centerPresence
    handPresenceUniforms[1]!.value=signingIn?1:state.presence
    world.rotation.y=state.time*.065;world.scale.set(1+state.unfold*2.5,1-state.unfold*.8,1-state.unfold*.6)
    worldMaterial.opacity=(1-state.form)*(1-state.unfold)*.18;arcMaterial.opacity=(1-state.form)*(1-state.unfold)*.42
    trunkMaterial.opacity=state.trunkPresence*(dark?.16:.15)
    taskMaterial.opacity=state.trunkPresence*(dark?.28:.24)
    flowMaterial.opacity=flowPaths.length?THREE.MathUtils.smoothstep(state.form,.2,1)*state.trunkPresence*.76:0
    fieldMaterial.opacity=THREE.MathUtils.smoothstep(state.form,.35,1)*(dark?.27:.11)
    mapMaterial.opacity=THREE.MathUtils.smoothstep(state.form,.45,1)*(mobile?(dark?.17:.13):(dark?.36:.27))
    coreMaterial.opacity=state.centerPresence*(dark?.54:.46);relayCore.scale.setScalar(.94+Math.sin(state.time*.72)*.045);relayCore.rotation.z=state.time*.075
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
      trailSource=activeSource
    }
    const trailCount=Math.max(0,Math.min(129,Math.floor(state.captureProgress*128)+1))
    trailGeometry.setDrawRange(0,Math.max(0,trailCount-1)*trailLaneCount*2)
    trailMaterial.opacity=signingIn?0:state.presence*(dark?.26:.18)
    const activeCurve=captureCurves[activeSource]!,captureProgress=THREE.MathUtils.clamp(state.captureProgress,0,1)
    const tangent=activeCurve.getTangentAt(captureProgress)
    currentGatherOffset.copy(activeCurve.getPointAt(captureProgress)).sub(b)
    const activeProvider = Math.round(state.provider) % providerMarks.length
    desiredGatherAnchor.copy(b).add(signingIn?v(login.x,login.y,login.z):currentGatherOffset)
    if(!signingIn){
      const handoffOffset=THREE.MathUtils.smoothstep(captureProgress,.72,1)*.34
      desiredGatherAnchor.addScaledVector(tangent,-handoffOffset)
    }
    const iconCenter = desiredGatherAnchor.clone()
    if(!signingIn)iconCenter.lerp(core,state.iconDisperse)
    if(!signingIn)iconCenter.add(v(0,.015,.16))
    for (let markIndex = 0; markIndex < providerMarks.length; markIndex++) {
      const mark = providerMarks[markIndex]!
      if(signingIn||markIndex!==activeProvider){mark.points.visible=false;mark.material.opacity=0;continue}
      mark.points.visible=true
      const positions = mark.geometry.attributes.position!.array as Float32Array
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = iconCenter.x + mark.final[i]! * state.iconForm + mark.scatter[i]! * ((1-state.iconForm)*.55+state.iconDisperse*1.55)
        positions[i+1] = iconCenter.y + mark.final[i+1]! * state.iconForm + mark.scatter[i+1]! * ((1-state.iconForm)*.55+state.iconDisperse*1.55)
        positions[i+2] = iconCenter.z + mark.final[i+2]! * state.iconForm + mark.scatter[i+2]! * ((1-state.iconForm)*.55+state.iconDisperse*1.55)
      }
      mark.geometry.attributes.position!.needsUpdate = true
      mark.material.opacity = state.iconForm*(1-state.iconDisperse)*(.62+Math.sin(state.time*.7+mark.phase)*.08)
    }
    const centerHand=handGroups[0]!,gatherer=handGroups[1]!
    centerHand.visible=state.centerPresence>.002
    gatherer.visible=signingIn||state.presence>.002
    const centerAngle=-.10+Math.sin(state.time*.34)*.022
    centerHand.rotation.z=centerAngle;rotatedAnchor.copy(centerAnchor).applyAxisAngle(zAxis,centerAngle);centerHand.position.copy(core).sub(rotatedAnchor)
    let directionDelta=Math.atan2(tangent.y,tangent.x)-baseGatherAngle
    directionDelta=Math.atan2(Math.sin(directionDelta),Math.cos(directionDelta))
    const gatherAngle=signingIn?0:THREE.MathUtils.clamp(directionDelta*.52,-1.05,1.05)
    gatherer.rotation.z=gatherAngle;rotatedAnchor.copy(b).applyAxisAngle(zAxis,gatherAngle);gatherer.position.copy(desiredGatherAnchor).sub(rotatedAnchor)
    if(flowPaths.length)for(let i=0;i<count;i++){
      const pathIndex=i%flowPaths.length,path=flowPaths[pathIndex]!,reverse=pathIndex<trunkFlowPathCount&&i%3===0,pathEnd=path.length-1
      const t=((i/count+state.time*(reverse?-.026:.035))%1+1)%1*pathEnd,index=Math.min(pathEnd-1,Math.floor(t)),f=t-index
      flowPositions[i*3]=THREE.MathUtils.lerp(path[index]!.x,path[index+1]!.x,f)
      flowPositions[i*3+1]=THREE.MathUtils.lerp(path[index]!.y,path[index+1]!.y,f)+(reverse?-.055:0)
      flowPositions[i*3+2]=THREE.MathUtils.lerp(path[index]!.z,path[index+1]!.z,f)
    }
    flowGeometry.attributes.position!.needsUpdate=true
    renderer.render(scene,camera);frames++
  }
  function tick(_time:number,delta:number){state.time+=Math.min(delta,50)/1000;render()}
  let intro:gsap.core.Timeline,ambient:gsap.core.Timeline,gesture:gsap.core.Timeline|undefined
  function sync(){
    const active=!disposed&&!reduced&&!paused&&visible&&document.visibilityState==='visible'
    if(active===running)return
    running=active
    if(active){gsap.ticker.add(tick);if(!signingIn)(settled?ambient:intro).resume();else gesture?.resume()}
    else{gsap.ticker.remove(tick);intro?.pause();ambient?.pause();gesture?.pause()}
  }
  const ctx=gsap.context(()=>{
    const captureSequence=(sourceIndex:number)=>gsap.timeline({defaults:{ease:'sine.inOut'}})
      .addLabel('appear')
      .set(state,{source:sourceIndex,provider:sourceIndex%providerMarks.length,captureProgress:0,iconForm:0,iconDisperse:0,presence:0,gatherGrip:0},'appear')
      .to(state,{presence:1,iconForm:1,duration:1.6,ease:'sine.out'},'appear')
      .to(state,{captureProgress:1,duration:6.4,ease:'sine.inOut'},'appear+=.4')
      .to(state,{gatherGrip:CARRY_GRIP,duration:1.15,ease:'power2.inOut'},'appear+=1.05')
      .to(state,{grip:CATCH_GRIP,duration:.9,ease:'power2.inOut'},'appear+=6.05')
      .to(state,{iconDisperse:1,duration:2.5,ease:'power2.out'},'appear+=6.95')
      .to(state,{grip:REST_GRIP,duration:1.3,ease:'sine.inOut'},'appear+=8.0')
      .call(()=>commitCapture(sourceIndex),[],'appear+=9.45')
      .to(state,{gatherGrip:0,presence:0,iconForm:0,iconDisperse:0,duration:1.25,ease:'sine.in'},'appear+=9.45')
    ambient=gsap.timeline({paused:true,repeat:-1,defaults:{ease:'sine.inOut'}})
    ;captureSources.map((_,index)=>(index+1)%captureSources.length).forEach(index=>ambient.add(captureSequence(index)))
    intro=gsap.timeline({paused:true,defaults:{ease:'sine.inOut'},onComplete(){settled=true;onReady();if(running&&!signingIn)ambient.restart()}})
      .addLabel('globe').to(state,{form:0,duration:1.2},'globe')
      .addLabel('unfold').to(state,{unfold:1,duration:2.3},'unfold')
      .addLabel('gather',2.5).to(state,{form:1,duration:3},'gather')
      .to(state,{centerPresence:1,trunkPresence:1,duration:2.2,ease:'sine.out'},'gather+=1.2')
      .addLabel('connect',5.5).set(state,{source:0,provider:0,captureProgress:0,iconForm:0,iconDisperse:0,presence:0,gatherGrip:0},'connect')
      .to(state,{presence:1,iconForm:1,duration:1.6,ease:'sine.out'},'connect')
      .to(state,{captureProgress:1,duration:6.4,ease:'sine.inOut'},'connect+=.4')
      .to(state,{gatherGrip:CARRY_GRIP,duration:1.15,ease:'power2.inOut'},'connect+=1.05')
      .to(state,{grip:CATCH_GRIP,duration:.9,ease:'power2.inOut'},'connect+=6.05')
      .to(state,{iconDisperse:1,duration:2.5,ease:'power2.out'},'connect+=6.95')
      .to(state,{grip:REST_GRIP,duration:1.3,ease:'sine.inOut'},'connect+=8.0')
      .call(()=>commitCapture(0),[], 'connect+=9.45')
      .to(state,{gatherGrip:0,presence:0,iconForm:0,iconDisperse:0,duration:1.25,ease:'sine.in'},'connect+=9.45')
      .addLabel('ready')
  },host)
  const mm=gsap.matchMedia()
  mm.add({reduce:'(prefers-reduced-motion: reduce)',mobile:'(max-width: 700px)',desktop:'(min-width: 701px)'},context=>{
    reduced=!!context.conditions?.reduce;mobile=!!context.conditions?.mobile
    if(reduced){intro.pause();ambient.pause();gesture?.progress(1);state.form=1;state.unfold=1;state.grip=REST_GRIP;state.centerPresence=1;state.trunkPresence=1;state.gatherGrip=0;state.captureProgress=1;state.presence=0;state.iconForm=0;state.iconDisperse=0;settled=true;onReady()}
    resize();sync()
  },host)
  function resize(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return
    renderer.setSize(w,h);camera.aspect=w/h;camera.fov=mobile?49:42;camera.updateProjectionMatrix();render()
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
      fibers.forEach(m=>m.uniforms.uColor!.value.set(value?'#72c8ee':'#2e7898'))
      providerMarks.forEach(mark=>mark.material.color.set(value?mark.darkColor:mark.lightColor))
      worldMaterial.color.set(value?'#7ba2b2':'#668591');arcMaterial.color.set(value?'#83b6bf':'#69929a')
      fieldMaterial.color.set(value?'#789cad':'#667d86');mapMaterial.color.set(value?'#668493':'#55717a');coreMaterial.color.set(value?'#9bd7ee':'#3f778d');trunkMaterial.color.set(value?'#74a8bd':'#456d7e');taskMaterial.color.set(value?'#a5a9ed':'#596b98');trailMaterial.color.set(value?'#80bfd7':'#4f8195')
      ;[...capturedRoutes,...retiringRoutes].forEach(route=>{route.material.color.set(value?'#85c8e2':'#47768c');route.material.opacity=Math.max(route.material.opacity,value ? .028 : .018)})
      colorFlow();render()
    },
    setPaused(value:boolean){paused=value;sync();render()},
    setLogin(value:boolean,button?:DOMRect,immediate=false){
      signingIn=value;gesture?.kill();intro.pause();ambient.pause()
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
        paused=false;login.x=0;login.y=0;login.z=0;login.grip=0;state.presence=0;state.grip=REST_GRIP;state.gatherGrip=0;state.captureProgress=0;state.iconForm=0;state.iconDisperse=0;sync()
        if(running)ambient.restart()
      }
      if(!running)gesture?.pause();render()
    },
    inspect(){const source=Math.round(state.source)%captureSources.length;return{frames,running,reduced,settled,particles:particleCount+count+fieldCount+mapPositions.length/3+corePositions.length/3,geometries:renderer.info.memory.geometries,form:state.form,centerPresence:state.centerPresence,trunkPresence:state.trunkPresence,gatherGrip:state.gatherGrip,gather:currentGatherOffset.toArray(),capturedRoutes:capturedRoutes.length,retiringRoutes:retiringRoutes.size,maxCapturedRoutes:MAX_CAPTURED_ROUTES,trunkPaths:trunkFlowPathCount,taskPaths:baseFlowPaths.length-trunkFlowPathCount,providerCount:providerMarks.length,provider:Math.round(state.provider)%providerMarks.length,captureLanes:captureLanePaths[source]!.length,iconForm:state.iconForm,iconDisperse:state.iconDisperse}},
    finishIntro(){intro.progress(1);render()},
    reviewAt(seconds:number){paused=true;sync();intro.pause(Math.max(0,Math.min(seconds,intro.duration())));render()},
    reviewAmbientAt(seconds:number){paused=true;sync();intro.progress(1);ambient.pause(Math.max(0,Math.min(seconds,ambient.duration())));render()},
    reviewCaptureRetention(count:number){for(let index=0;index<count;index++)commitCapture(index);render()},
    dispose(){disposed=true;gsap.ticker.remove(tick);window.removeEventListener('pointermove',onPointer);document.removeEventListener('visibilitychange',onVisibility);renderer.domElement.removeEventListener('webglcontextlost',onContextLost);observer.disconnect();intersection.disconnect();mm.revert();ctx.revert();capturedRoutes.forEach(disposeCapturedRoute);retiringRoutes.forEach(disposeCapturedRoute);retiringRoutes.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()},
  }
}
