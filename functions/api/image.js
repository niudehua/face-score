// 导入模块
import { getImage } from '../lib/storage.js';
import { rateLimit, addRateLimitHeaders } from '../lib/rate-limit.js';

export async function onRequestGet(context) {
    // 实施限流
    const rateLimitResult = await rateLimit(context.request, context, {
        path: '/api/image',
        limit: 50, // 每分钟50次请求
        windowSeconds: 60
    });

    if (rateLimitResult.limited) {
        return rateLimitResult.response;
    }

    const url = new URL(context.request.url);
    const md5 = url.searchParams.get('md5');

    if (!md5) {
        let response = new Response('Missing md5 parameter', { status: 400 });
        response = addRateLimitHeaders(response, rateLimitResult);
        return response;
    }

    const r2 = context.env.FACE_IMAGES;
    if (!r2) {
        let response = new Response('R2 not configured', { status: 500 });
        response = addRateLimitHeaders(response, rateLimitResult);
        return response;
    }

    try {
        const object = await getImage(r2, md5);

        if (!object) {
            let response = new Response('Image not found', { status: 404 });
            response = addRateLimitHeaders(response, rateLimitResult);
            return response;
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000');

        let response = new Response(object.body, {
            headers,
        });
        response = addRateLimitHeaders(response, rateLimitResult);
        return response;
    } catch (error) {
        let response = new Response(`Error: ${error.message}`, { status: 500 });
        response = addRateLimitHeaders(response, rateLimitResult);
        return response;
    }
}
