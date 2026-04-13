export async function GET(request, { params }) {
  const path = (await params).path.join('/');
  const url = new URL(request.url);
  const targetUrl = `https://api.muapi.ai/api/v1/${path}${url.search}`;
  const apiKey = request.headers.get('x-api-key');
  const response = await fetch(targetUrl, {
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  return Response.json(data, { status: response.status });
}

export async function POST(request, { params }) {
  const path = (await params).path.join('/');
  const targetUrl = `https://api.muapi.ai/api/v1/${path}`;
  const apiKey = request.headers.get('x-api-key');
  const contentType = request.headers.get('content-type') || '';
  let body, headers = { 'x-api-key': apiKey };
  if (contentType.includes('multipart/form-data')) {
    body = await request.formData();
  } else {
    body = await request.text();
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(targetUrl, { method: 'POST', headers, body });
  const data = await response.json();
  return Response.json(data, { status: response.status });
}
