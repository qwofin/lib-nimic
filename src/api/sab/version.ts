export async function version(ctx): Promise<void> {
  ctx.body = {
    version: '4.2.1',
  }
}
