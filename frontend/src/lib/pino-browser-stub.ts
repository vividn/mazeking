// Browser stub for pino logger - provides a no-op implementation
const noop = () => {};
const noopLogger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  silent: noop,
  child: () => noopLogger,
  level: 'silent',
};

function pino() {
  return noopLogger;
}

pino.destination = noop;
pino.transport = noop;
pino.multistream = noop;
pino.stdSerializers = {};
pino.levels = { values: {}, labels: {} };

export { pino };
export default pino;
