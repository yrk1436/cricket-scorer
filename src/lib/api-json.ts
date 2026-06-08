export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function ok(data: unknown) {
  return Response.json(data);
}
