import 'three/addons/math/MeshSurfaceSampler.js'

// Present in Three.js 0.186.0, omitted by its matching DefinitelyTyped declaration.
declare module 'three/addons/math/MeshSurfaceSampler.js' {
  interface MeshSurfaceSampler {
    setRandomGenerator(generator: () => number): this
  }
}
