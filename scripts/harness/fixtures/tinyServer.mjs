import http from 'node:http';

const port = Number(process.env.HARNESS_TEST_PORT ?? 0);
const delay = Number(process.env.HARNESS_RESPONSE_DELAY_MS ?? 0);
const server = http.createServer((_, response) => {
  setTimeout(() => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}'); }, delay);
});
server.listen(port, '127.0.0.1');
process.once('SIGTERM', () => server.close(() => process.exit(0)));
process.once('SIGINT', () => server.close(() => process.exit(0)));
