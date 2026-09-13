// Keep the same key after timeout/error when retrying unchanged user input.
// Clear the attempt only after the server acknowledges the result.
export function paymentAttempt(previous, body, newKey = () => globalThis.crypto.randomUUID()) {
  const signature = JSON.stringify(body);
  return previous?.signature === signature ? previous : { signature, body, key: newKey() };
}
