// Test-only NextAuth boundary: the LEOZOPS bearer header is not a NextAuth
// session, so getServerSession resolves to no authenticated employee.
export async function getServerSession() {
  return null;
}
