import $ from "./machine.mjs";

class Common {
  static mod = (n, m) => ((n % m) + m) % m
}

class ErrorCode {
  constructor ({ code, data }) {
    switch (code) {
      case 1: return new Error(`Must provide ${data} instance`);
      case 2: return new Error(`Must provide function`);
      default: return new Error("Malformed error")
    }
  }
}



class Universe {
  manifold; population; visualiser
  constructor ({ manifold, population, visualiser }) {
    if (!(Manifold.prototype.isPrototypeOf(manifold))) throw new ErrorCode({ code: 1, data: "Manifold" });
    this.manifold = manifold;
    if (!(Population.prototype.isPrototypeOf(population))) throw new ErrorCode({ code: 1, data: "Population" });
    this.population = population;
    if (!(Visualiser.prototype.isPrototypeOf(visualiser))) throw new ErrorCode({ code: 1, data: "Visualiser" });
    this.visualiser = visualiser
  }
  initialise () { this.population.seed() }
  async run (steps) {
    for (let t = 0; t < steps; t++) {
      const expressed = this.manifold.step(this.manifold.conv, this.population);
      this.visualiser.draw(expressed);
      await new Promise(requestAnimationFrame)
    }
  }
}



// mapping from coordinate to local expression

class Manifold {

  // Global structures
  static WrappedGrid = (dimX, dimY, convFn) => (getLocal, pop) => {
    for (let x = 0; x < dimX; x++) for (let y = 0; y < dimY; y++) {
      const neighbourhood = getLocal((dx, dy) => pop.content(Common.mod(x + dx, dimX) * dimY + Common.mod(y + dy, dimY)).get());
      pop.content(x * dimY + y).set(convFn(neighbourhood))
    }
    pop.flush();
    return function * () {
      for (let x = 0; x < dimX; x++) for (let y = 0; y < dimY; y++) yield { x, y, value: pop.content(x * dimY + y).get() }
    }
  }

  // Local structures
  static GridDiagAdjacency = (() => {
    const conv1D = [-1, 0, 1];
    return getRelative => conv1D.map(dx => conv1D.map(dy => getRelative(dx, dy)))
  })()

  step; conv
  constructor ({ globalShape, localShape }) {
    if (!(Function.prototype.isPrototypeOf(globalShape))) throw new ErrorCode({ code: 2 });
    this.step = globalShape;
    if (!(Function.prototype.isPrototypeOf(localShape))) throw new ErrorCode({ code: 2 });
    this.conv = localShape
  }
}



// data structure identifying contentful individuals with coordinate of manifold

class Population {

  // Perfect information populations
  static BinaryPopulation = size => {
    const words = Math.ceil(size / 8), array = new Uint8Array(words), tempAr = new Uint8Array(words);
    return {
      seed: () => {
        for (let i = 0; i < words; i++) array[i] = Math.floor(Math.random() * 256);
      },
      content: address => {
        const rem = address % 8, quot = (address - rem) / 8;
        return {
          set (b) { tempAr[quot] |= b << rem },
          get () { return (array[quot] >> rem) & 1 }
        }
      },
      flush: () => {
        array.set(tempAr);
        tempAr.fill(0, 0, words - 1)
      }
    }
  }

  seed; flush = () => {}; content
  constructor ({ content: { content, flush, seed } }) {
    if (!(Function.prototype.isPrototypeOf(content))) throw new ErrorCode({ code: 2 });
    this.content = content;
    this.flush = flush;
    this.seed = seed
  }
}



// draw the universe to screen

class Visualiser {

  // Visualisation region
  static Context2D = class {
    canvas; #context
    dimX; dimY; unit
    constructor (dimX, dimY, cvs) {
      this.canvas = cvs
      this.#context = cvs.getContext('2d');
      this.dimX = dimX;
      this.dimY = dimY;
      const { height, width } = cvs, unit = Math.min(Math.round(height / dimX), Math.round(width / dimY));
      this.unit = unit;
      cvs.height = unit * dimX;
      cvs.width = unit * dimY
    }
    draw (gen, colouring) {
      const { unit } = this, ctx = this.#context;
      colouring(ctx, fn => {
        for (const { x, y, value } of gen()) fn(value, x, y, unit)
      })
    }
  }

  // Visualisation style
  static Colouring2State = (ctx, cb) => {
    ctx.reset();
    ctx.fillStyle = "#000";
    cb((value, x, y, unit) => value && ctx.fillRect(x * unit, y * unit, unit, unit))
  }

  context; colouring
  constructor ({ context, colouring }) {
    this.context = context;
    this.colouring = colouring
  }
  draw (gen) {
    this.context.draw(gen, this.colouring)
  }
}



const app = self.app = new $.Machine({
  universe: null
});

$.targets({
  load () { app.emit("init") },
  app: {
    init () {
      const
        dimX = 100, dimY = 100,
        convFn = ar => {
          const [s] = ar[1].splice(1, 1), c = ar.flat().reduce((a, v) => a + v, 0);
          return c === 3 || s && c === 2
        },
        globalShape = Manifold.WrappedGrid(dimX, dimY, convFn),
        localShape = Manifold.GridDiagAdjacency,
        manifold = new Manifold({ globalShape, localShape }),
        content = Population.BinaryPopulation(dimX * dimY),
        population = new Population({ content }),
        context = new Visualiser.Context2D(dimX, dimY, $("canvas")),
        colouring = Visualiser.Colouring2State,
        visualiser = new Visualiser({ context, colouring }),
        universe = this.universe = new Universe({ manifold, population, visualiser });
      console.log(this.state());
      universe.initialise();
      universe.run(500)
    }
  }
})