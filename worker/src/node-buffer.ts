// jpeg-js is CommonJS and expects Buffer. Inject only when referenced by its codec.
export {Buffer} from 'node:buffer';
