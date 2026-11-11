import "./_env";

import { startMockUpstream } from "../tests/helpers/mock-upstream";

async function main(): Promise<void> {
  const upstream = await startMockUpstream({ port: 4010 });
  console.log(`Mock upstream listening at ${upstream.baseUrl}`);
  const shutdown = () => {
    void upstream.close().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
