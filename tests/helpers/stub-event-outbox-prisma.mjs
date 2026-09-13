// Any accidental global-client access in a durable handler fails the test.
export const prisma = new Proxy({}, { get() { throw new Error('Unexpected global Prisma access'); } });
