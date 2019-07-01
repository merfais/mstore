import { terser } from 'rollup-plugin-terser'

export default [{
  input: 'src/index.js',
  output: {
    name: 'mlodash',
    file: 'dist/index.js',
    format: 'umd',
  },
  plugins: [
    terser(),
  ]
}, {
  input: 'src/index.js',
  output: {
    name: 'mlodash',
    file: 'index.js',
    format: 'umd',
  },
  plugins: [
  ]
}]
