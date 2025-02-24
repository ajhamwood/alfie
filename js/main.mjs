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

  manifold; population; visualiser; interacter; params; size
  pausePromise; pauseResolver
  constructor ({ manifold, population, visualiser, interacter, params }) {
    this.params = params;
    if (!(Manifold.prototype.isPrototypeOf(manifold))) throw new ErrorCode({ code: 1, data: "Manifold" });
    this.manifold = manifold.bind(this);
    if (!(Population.prototype.isPrototypeOf(population))) throw new ErrorCode({ code: 1, data: "Population" });
    this.population = population.bind(this);
    if (!(Visualiser.prototype.isPrototypeOf(visualiser))) throw new ErrorCode({ code: 1, data: "Visualiser" });
    this.visualiser = visualiser.bind(this);
    if (!(Interacter.prototype.isPrototypeOf(interacter))) throw new ErrorCode({ code: 1, data: "Interacter" });
    this.interacter = interacter.bind(this)
  }

  initialise () { this.population.seed() }

  async run (steps) {
    for (let t = 0; t < steps; t++) {
      const expressed = this.manifold.step();
      this.visualiser.draw(expressed);
      await this.pausePromise;
      await new Promise(requestAnimationFrame)
    }
  }

  pause () { this.pausePromise = new Promise(r => this.pauseResolver = r) }

}



// mapping from coordinate to local expression

class Manifold {

  // Global structures
  static SquareTorus = univ => {
    univ.size = univ.params[0] * univ.params[1];
    return () => {
      const { manifold, population, params: [ dimX, dimY ] } = univ;
      for (let x = 0; x < dimX; x++) for (let y = 0; y < dimY; y++) {
        const neighbourhood = manifold.nbh((dx, dy) => population.content(Common.mod(x + dx, dimX) * dimY + Common.mod(y + dy, dimY)).state);
        population.content(x * dimY + y).state = manifold.conv(neighbourhood)
      }
      population.flush();
      return function * () {
        for (let x = 0; x < dimX; x++) for (let y = 0; y < dimY; y++) yield { x, y, state: population.content(x * dimY + y).state }
      }
    }
  }

  // Local structures
  static MooreNeighbourhood = (() => {
    const conv1D = [-1, 0, 1];
    return getRelative => conv1D.map(dx => conv1D.map(dy => getRelative(dx, dy)))
  })()

  #universe; #globalShape
  step; nbh; conv
  constructor ({ globalShape, localShape, convolutionFn }) {
    if (!(Function.prototype.isPrototypeOf(globalShape))) throw new ErrorCode({ code: 2 });
    this.#globalShape = globalShape;
    if (!(Function.prototype.isPrototypeOf(localShape))) throw new ErrorCode({ code: 2 });
    this.nbh = localShape;
    if (!(Function.prototype.isPrototypeOf(convolutionFn))) throw new ErrorCode({ code: 2 });
    this.conv = convolutionFn
  }

  bind (universe) {
    this.#universe = universe;
    this.step = this.#globalShape(universe);
    return this
  }
}



// data structure identifying contentful individuals with coordinate of manifold

class Population {

  // Perfect information populations
  static BinaryPopulation = univ => {
    const { size } = univ, words = Math.ceil(size / 8), array = new Uint8Array(words), tempAr = new Uint8Array(words);
    return {
      // TODO: batch (for parallelisation)
      seed: () => {
        for (let i = 0; i < words; i++) array[i] = Math.floor(Math.random() * 256)
      },
      content: (() => {
        let rem, quot;
        const vObj = {
          set state (b) { tempAr[quot] |= b << rem },
          get state () { return (array[quot] >> rem) & 1 }
        };
        return address => {
          rem = address % 8, quot = (address - rem) / 8
          return vObj
        }
      })(),
      flush: () => {
        array.set(tempAr);
        tempAr.fill(0, 0, words - 1)
      },
      stats: {
        set size (_) {},
        get size () {
          let c = 0;
          for (let v of array) for (; v; c++) v &= v - 1;
          return c
        }
      }
    }
  }

  #universe
  seed; flush = () => {}; #content; stats
  constructor ({ content }) {
    if (!(Function.prototype.isPrototypeOf(content))) throw new ErrorCode({ code: 2 });
    this.#content = content
  }

  bind (universe) {
    this.#universe = universe;
    const { content, flush, seed, stats } = this.#content(universe);
    this.content = content;
    this.flush = flush;
    this.seed = seed;
    this.stats = stats;
    return this
  }
}



// draw the universe to screen

class Visualiser {

  // Visualisation region
  static Context2D = class {

    canvas; #context; unit; #lastGen
    constructor (cvs) {
      this.canvas = cvs;
      this.#context = cvs.getContext('2d')
    }

    resize ([ dimX, dimY ]) { // Unit is naturals and reciprocal of naturals
      const { canvas: cvs } = this;
      cvs.removeAttribute("height");
      cvs.removeAttribute("width");
      cvs.parentNode.host.style.width = "100%";
      cvs.style.width = "100%";
      const { offsetHeight, offsetWidth } = cvs, unit = offsetHeight < dimX && offsetWidth < dimY ?
        1 / Math.max(Math.ceil(dimX / offsetHeight), Math.ceil(dimY / offsetWidth)) :
        Math.min(Math.floor(offsetHeight / dimX), Math.floor(offsetWidth / dimY));
      cvs.parentNode.host.style.width = "";
      cvs.style.width = "";
      this.unit = unit;
      cvs.height = unit * dimX;
      cvs.width = unit * dimY
    }

    draw (colouring, gen = this.#lastGen) {
      this.#lastGen = gen;
      const { unit } = this, ctx = this.#context;
      colouring(ctx, fn => {
        for (const { x, y, state } of gen()) fn(state, x, y, unit)
      })
    }

  }

  // Visualisation style
  static Colouring2State = (ctx, cb) => {
    ctx.reset();
    ctx.fillStyle = "#000";
    cb((value, x, y, unit) => value && ctx.fillRect(x * unit, y * unit, unit, unit))
  }

  #universe
  context; colouring
  constructor ({ context, colouring }) {
    this.context = context;
    this.colouring = colouring
  }

  bind (universe) {
    this.#universe = universe;
    this.context.resize(universe.params);
    return this
  }

  resize () {
    this.context.resize(this.#universe.params);
    // TODO: await intersection callback (latest only)
    this.context.draw(this.colouring)
  }
  draw (gen) { this.context.draw(this.colouring, gen) }
}



// Define interactive parameters

class Interacter {
  #universe
  constructor ({}) {}

  bind (universe) {
    this.#universe = universe;
    this.createUI();
    return this
  }

  async createUI () {
    const univ = this.#universe
  }
}



const app = self.app = new $.Machine({
  examples: []
});

$.targets({

  load () { app.emit("init") },

  resize () { for (const example of app.examples) example.visualiser.resize() },

  app: {
    init () {
      const
        convolutionFn = ar => {
          const [s] = ar[1].splice(1, 1), c = ar.flat().reduce((a, v) => a + v, 0);
          return c === 3 || s && c === 2
        },
        globalShape = Manifold.SquareTorus,
        localShape = Manifold.MooreNeighbourhood,
        manifold = new Manifold({ globalShape, localShape, convolutionFn }),
        content = Population.BinaryPopulation,
        population = new Population({ content }),
        context = new Visualiser.Context2D($("canvas", $("#iu1-1").shadowRoot)),
        colouring = Visualiser.Colouring2State,
        visualiser = new Visualiser({ context, colouring }),
        interacter = new Interacter({}),
        params = [ 1000, 1000 ],
        universe = new Universe({ manifold, population, visualiser, interacter, params });
      this.examples.push(universe);
      console.log(this.state());
      universe.initialise();
      universe.run(500)
    }
  }

});

$.queries({
  "#master-pause": {
    click () { for (const example of app.examples) example.pause() }
  }
});

$.loadWc("interactive-universe", {
  constructor () {}
})