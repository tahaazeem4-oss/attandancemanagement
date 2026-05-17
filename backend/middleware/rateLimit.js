const stores = new Map();

function cleanupExpired(store, now) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

function makeRateLimiter({ windowMs, max, keyFn, message }) {
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    cleanupExpired(store, now);

    const key = keyFn ? keyFn(req) : `${req.ip || 'unknown'}:${req.path}`;
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message: message || 'Too many requests. Please try again later.' });
    }

    current.count += 1;
    store.set(key, current);
    next();
  };
}

function ipRateLimit(options) {
  return makeRateLimiter({
    ...options,
    keyFn: options?.keyFn || ((req) => req.ip || 'unknown'),
  });
}

stores.set('makeRateLimiter', makeRateLimiter);

module.exports = {
  makeRateLimiter,
  ipRateLimit,
};