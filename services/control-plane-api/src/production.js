const { loadConfig } = require('./config');

// Validate supplied configuration too: dependency injection is not a production bypass.
function runtimeConfig(options = {}) {
  const source = options.config || options.env || process.env;
  if (process.env.NODE_ENV === 'production' && source.NODE_ENV !== 'production')
    throw new Error('Production mode cannot be overridden');
  return loadConfig({ ...source, ...(Array.isArray(source.JWT_ALGORITHMS) ? { JWT_ALGORITHMS: source.JWT_ALGORITHMS.join(',') } : {}) });
}

function requireDurableOverrides(config, options, implementations) {
  if (config.NODE_ENV !== 'production') return;
  for (const [name, implementation] of Object.entries(implementations)) {
    if (options[name] !== undefined && (!implementation || options[name]?.constructor !== implementation))
      throw new Error(`Production requires the durable ${name} implementation`);
  }
}
module.exports = { runtimeConfig, requireDurableOverrides };
