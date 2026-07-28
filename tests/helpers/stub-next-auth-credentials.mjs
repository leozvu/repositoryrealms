// Minimal provider factory required while evaluating the real lib/auth.js.
export default function CredentialsProvider(options = {}) {
  return { id: 'credentials', type: 'credentials', ...options };
}
