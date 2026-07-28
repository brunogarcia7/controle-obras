import { createHandler } from './core.js';

const handler = createHandler({
    env: Deno.env.toObject(),
    fetchImpl: fetch,
    logger: console
});

Deno.serve(handler);
