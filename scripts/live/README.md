# Live-check kit (`scripts/live/kit.mjs`)

Every live check against the owner's shared browser (CDP 9333) uses this kit.
It opens its own tab, blocks writes except during a save, waits for the page
instead of sleeping, checks the owner's tabs afterwards, and always exits.

## Rules (TESTING.md section 4)

- The browser on 9333 is the owner's. Never set a page size, zoom, emulation,
  route or script on a tab you did not open, and never close the browser or a
  context. `runLive` closes only the tab it opened.
- Write-lock: all non-GET requests are aborted and recorded; wrap the one
  deliberate save in `ctx.allowWrites(fn)`.
- Wait for conditions, not clocks. A `waitForTimeout` above 300 ms is a bug.
- `runLive` exits 0 on success and 1 if the body threw or a tab check failed.

## Example — insert a library chart, save, assert, delete

```js
import { runLive, openBoard, openNewDraw, openLibrary, insertLibraryItem, closeLibrary, saveDrawing, deletePost } from './kit.mjs';

runLive('drawing-library-roundtrip', async (ctx) => {
  await openBoard(ctx, 'af02972f-dfde-4545-9fc8-5fcbccb007c3');
  ctx.timing('board open');
  await openNewDraw(ctx);
  ctx.timing('draw open');
  await openLibrary(ctx);
  await insertLibraryItem(ctx, 0);
  await closeLibrary(ctx);

  const saved = await saveDrawing(ctx);
  ctx.timing('saved');
  if (saved.status !== 201 || !saved.id) throw new Error(`save failed: ${JSON.stringify(saved)}`);
  if (saved.elements.length === 0) throw new Error('the saved drawing has no elements');

  await openBoard(ctx, 'af02972f-dfde-4545-9fc8-5fcbccb007c3');
  const status = await deletePost(ctx, saved.id);
  if (status !== 204 && status !== 200) throw new Error(`delete failed: ${status}`);
});
```

`ctx` is `{ page, net, log, allowWrites, timing }`. `net` holds every non-GET
`/rest/v1/padlets` response as `{ method, status, url, id, requestBody }`.
`ctx.timing(label)` logs seconds since the body started, so the output shows
where the time went.
