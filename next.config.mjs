/** Build pages in one worker so the per-league fetch memo is shared (keeps football-data.org calls to 1 per league). */
export default { experimental: { workerThreads: false, cpus: 1 } };
