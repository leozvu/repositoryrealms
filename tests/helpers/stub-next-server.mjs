// Test stub for 'next/server': just enough NextResponse for route handlers to
// return inspectable { status, body, headers } objects under node --test.
export class NextResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = init.headers ?? {};
  }
  static json(body, init = {}) {
    return new NextResponse(body, init);
  }
}
