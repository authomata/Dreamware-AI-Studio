export async function GET(request, { params }) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const url = new URL(request.url);
  const targetUrl = `https://api.muapi.ai/${path}${url.search}`;
  const apiKey = request.headers.get('x-api-key');
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const targetUrl = `https://api.muapi.ai/${path}`;
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
  const text = await response.text();
  if (process.env.NODE_ENV !== 'production') {
    console.log('PROXY:', targetUrl, '| STATUS:', response.status, '| BODY:', text.slice(0, 200));
  }
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}
