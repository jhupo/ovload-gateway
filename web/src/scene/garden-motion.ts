import * as THREE from 'three'

/** Six butterflies and six staggered leaves share the scene clock and one draw. */
export function createGardenMotion(tips: THREE.Vector3[], mobile: boolean, random: () => number,
  time: { value: number }, dark: { value: number }, presence: { value: number }) {
  const positions: number[] = [], ids: number[] = [], hues: number[] = []
  function add(p: THREE.Vector3, id: number, hue: number) {
    positions.push(...p.toArray());ids.push(id);hues.push(hue)
  }
  const forewing=new THREE.Shape()
  forewing.moveTo(.025,.02)
  forewing.bezierCurveTo(.09,.17,.27,.34,.34,.23)
  forewing.bezierCurveTo(.42,.075,.24,-.035,.035,-.055)
  forewing.bezierCurveTo(.018,-.04,.018,0,.025,.02)
  const hindwing=new THREE.Shape()
  hindwing.moveTo(.025,-.045)
  hindwing.bezierCurveTo(.15,-.005,.28,-.07,.22,-.185)
  hindwing.bezierCurveTo(.1,-.30,.025,-.15,.018,-.08)
  hindwing.lineTo(.025,-.045)
  for(let butterfly=0;butterfly<6;butterfly++){
    for(const side of [-1,1])for(const upper of [true,false])for(let i=0;i<115;i++){
      const edge=(upper?forewing:hindwing).getPoint(random())!
      if(i>=42)edge.lerp(new THREE.Vector2(.12,upper?.10:-.11),1-Math.sqrt(random()))
      add(new THREE.Vector3(edge.x*side,edge.y,0).multiplyScalar(mobile?.62:.85),butterfly,upper?.24+(butterfly%3)*.22:.8)
    }
    for(let i=0;i<65;i++)add(new THREE.Vector3((random()-.5)*.025,(random()-.5)*.31,(random()-.5)*.02),butterfly,.85)
  }
  for(let leaf=0;leaf<6;leaf++){
    for(let i=0;i<100;i++){
      const y=(random()-.5)*.25,width=Math.sin((y/.25+.5)*Math.PI)*.065
      add(new THREE.Vector3((random()-.5)*width*2,y,0),leaf+6,.65+random()*.3)
    }
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('actor',new THREE.Float32BufferAttribute(ids,1))
  geometry.setAttribute('hue',new THREE.Float32BufferAttribute(hues,1))
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{time,dark,presence,dpr:{value:Math.min(devicePixelRatio,1.15)},mobile:{value:mobile?1:0},
      leafSources:{value:Array.from({length:12},(_,i)=>tips[Math.floor((i+.5)/12*tips.length)]!.clone())}},
    vertexShader:`attribute float actor,hue;uniform vec3 leafSources[12];
      uniform float time,dark,presence,dpr,mobile;varying float alpha;varying vec3 color;
      float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
      void main(){
        vec3 p=position;vec3 center=vec3(0.);
        float visibility=smoothstep(.78,1.,presence);
        if(actor<6.){
          float phase=actor*2.1;
          float flap=.3+(.5+.5*sin(time*7.+phase))*.95;
          p.z+=abs(p.x)*sin(flap);p.x*=cos(flap);
          float bank=sin(time*.65+phase)*.28;
          p.xy=mat2(cos(bank),-sin(bank),sin(bank),cos(bank))*p.xy;
          float elapsed=time-5.-actor*4.;
          float age=mod(max(0.,elapsed),36.),cycle=floor(max(0.,elapsed)/36.);
          float seed=actor*13.+cycle*71.;
          float side=mod(actor+floor(hash(cycle+4.)*2.),2.)<1.?-1.:1.;
          float t=clamp(age/24.,0.,1.),s=1.-t;
          float nearX=mix(side<0.?6.5:6.1,1.85,mobile),width=mix(2.3,.55,mobile);
          float y0=.25+hash(seed+2.)*mix(3.7,2.5,mobile);
          float y1=clamp(y0+(y0>2.?-1.:1.)*(1.9+hash(seed+3.)*1.5),.15,mix(5.3,3.6,mobile));
          vec3 a=vec3(side*(nearX+hash(seed+4.)*width),y0,hash(seed+5.)-.5);
          vec3 b=vec3(side*(nearX+hash(seed+6.)*width),y1,hash(seed+7.)-.2);
          vec3 c1=mix(a,b,.3)+vec3(side*width*.3,hash(seed+8.)-.5,.6);
          vec3 c2=mix(a,b,.7)+vec3(-side*width*.35,hash(seed+9.)-.5,-.4);
          center=a*s*s*s+3.*c1*s*s*t+3.*c2*s*t*t+b*t*t*t;
          center+=vec3(sin(t*12.+phase)*.1,sin(t*9.+phase)*.12,cos(t*8.+phase)*.15)*sin(t*3.14159);
          visibility*=step(0.,elapsed)*smoothstep(0.,2.8,age)*(1.-smoothstep(18.,24.,age));
        }else{
          float leaf=actor-6.,elapsed=max(0.,time-12.);
          float batch=floor(elapsed/26.),batchAge=mod(elapsed,26.);
          float amount=1.+floor(hash(batch*19.+91.)*6.);
          float age=batchAge-hash(batch*13.+leaf*5.+3.)*2.2;
          vec3 origin=leafSources[int(floor(hash(batch*17.+leaf*7.+5.)*12.))];
          center=origin;
          float fall=clamp(age/11.5,0.,1.);
          visibility*=step(12.,time)*step(leaf+.5,amount)*smoothstep(0.,1.2,age)*(1.-smoothstep(12.,16.,age));
          float roll=min(max(0.,age),11.5)*1.2+leaf*1.7;
          p.xy=mat2(cos(roll),-sin(roll),sin(roll),cos(roll))*p.xy;
          p.xz=mat2(cos(roll*.7),-sin(roll*.7),sin(roll*.7),cos(roll*.7))*p.xz;
          center.y=mix(origin.y,-2.75,fall);
          center.x+=sin(fall*6.28+leaf)*.65*fall+sin(leaf*2.4)*fall*.65;
          center.z+=sin(fall*3.14+leaf)*.5*fall;
        }
        vec3 night=mix(vec3(.08,.48,.62),vec3(.46,.28,.65),hue);
        vec3 day=mix(vec3(.015,.18,.27),vec3(.23,.10,.30),hue);
        night=mix(night,vec3(.65,.43,.16),smoothstep(.7,.9,hue));
        day=mix(day,vec3(.35,.18,.035),smoothstep(.7,.9,hue));
        if(actor>=6.)day=mix(vec3(.40,.07,.14),vec3(.24,.10,.30),hue);
        color=mix(day,night,dark);alpha=visibility*.85;
        vec4 mv=modelViewMatrix*vec4(center+p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(1.65*dpr*14./-mv.z,.9,2.5*dpr);
      }`,
    fragmentShader:`varying vec3 color;varying float alpha;
      void main(){float d=length(gl_PointCoord-.5);if(d>.5||alpha<.01)discard;
      gl_FragColor=vec4(color,alpha*(1.-smoothstep(.18,.5,d)));
      #include <colorspace_fragment>
      }`,
  })
  const points=new THREE.Points(geometry,material);points.frustumCulled=false
  return{points,geometry,material,count:ids.length}
}
