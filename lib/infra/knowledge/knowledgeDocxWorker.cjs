// The untrusted half of DOCX extraction, in a worker that can actually be stopped.
//
// WHY A WORKER AT ALL. Everything before this ran in the request: a ZIP was
// decompressed and its XML parsed, both driven by a file someone uploaded, and
// the only protection was a promise race. A promise race bounds the WAIT and
// not the work -- mammoth offers no cancellation, so a pathological document
// kept a core busy and kept allocating long after the user had been answered.
// Checks that run after decompression cannot prevent exhaustion DURING it.
//
// A worker fixes exactly that and nothing else: `resourceLimits` makes V8
// enforce the heap ceiling from inside, and `terminate()` actually stops the
// thread. Both are real limits rather than deadlines the work can ignore.
//
// WHY THIS FILE IS PLAIN CommonJS AND HOLDS NO RULES. It is loaded by Node
// directly, outside the TypeScript build, so it deliberately contains no part
// of the extraction contract -- no separators, no heading rule, nothing that
// could drift from the domain copy. It does the dangerous, unbounded step and
// returns a string. The contract walk stays in the main thread, where it
// operates on HTML that is already bounded.
const { parentPort, workerData } = require('node:worker_threads');
const mammoth = require('mammoth');

async function run() {
  // Images are counted and dropped rather than converted. mammoth's default
  // inlines every image as a base64 data URI, which for an image-heavy file is
  // megabytes of markup built in memory to be discarded one step later -- the
  // single largest way this step can blow its own ceiling.
  let imageCount = 0;

  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(workerData.bytes) },
    {
      convertImage: mammoth.images.imgElement(async () => {
        imageCount += 1;
        return { src: '' };
      }),
    },
  );

  return { html: result.value, imageCount };
}

run().then(
  (value) => { parentPort.postMessage({ ok: true, value }); },
  // The message only, never the stack: this is a parse failure on user input,
  // and the caller turns it into one authored sentence.
  (cause) => {
    parentPort.postMessage({
      ok: false,
      message: cause && typeof cause.message === 'string' ? cause.message : 'unreadable',
    });
  },
);
