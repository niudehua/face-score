export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const md5 = url.searchParams.get('md5');

    if (!md5) {
        return new Response('Missing md5 parameter', { status: 400 });
    }

    const r2 = context.env.FACE_IMAGES;
    if (!r2) {
        return new Response('R2 not configured', { status: 500 });
    }

    try {
        const key = `images/${md5}.jpg`;
        const object = await r2.get(key);

        if (!object) {
            return new Response('Image not found', { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000');

        return new Response(object.body, {
            headers,
        });
    } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}
