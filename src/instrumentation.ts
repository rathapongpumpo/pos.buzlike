export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { preservePublicVary } = await import("./lib/public-vary-node");
    preservePublicVary();
  }
}
