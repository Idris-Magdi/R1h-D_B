// ============================================
// Real Hub Worker - Full Code (English)
// Supports: /hit, /count, /api/active, video proxy
// و مسار جديد /twitter/video لجلب رابط الفيديو من X
// ============================================

let activeVisitors = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For') || 
               'unknown';
    
    // ============================================
    // Handle OPTIONS requests (for CORS)
    // ============================================
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // ============================================
    // Route 1: Active visitors API (GET /hit)
    // ============================================
    if (url.pathname === '/hit') {
      const visitorKey = `${ip}`;
      activeVisitors.set(visitorKey, Date.now());
      
      const now = Date.now();
      for (let [key, time] of activeVisitors) {
        if (now - time > 300000) {
          activeVisitors.delete(key);
        }
      }
      
      return new Response(JSON.stringify({ 
        active: activeVisitors.size,
        timestamp: now
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'no-cache'
        }
      });
    }
    
    // ============================================
    // Route 2: Read count only (GET /count)
    // ============================================
    if (url.pathname === '/count') {
      const now = Date.now();
      for (let [key, time] of activeVisitors) {
        if (now - time > 300000) {
          activeVisitors.delete(key);
        }
      }
      
      return new Response(JSON.stringify({ 
        active: activeVisitors.size,
        timestamp: now
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // ============================================
    // Route 3: Active visitors API (legacy compatibility - /api/active)
    // ============================================
    if (url.pathname === '/api/active') {
      const visitorKey = `${ip}`;
      activeVisitors.set(visitorKey, Date.now());
      
      const now = Date.now();
      for (let [key, time] of activeVisitors) {
        if (now - time > 300000) {
          activeVisitors.delete(key);
        }
      }
      
      if (url.searchParams.get('clean') === 'true') {
        for (let [key, time] of activeVisitors) {
          if (now - time > 3600000) {
            activeVisitors.delete(key);
          }
        }
      }
      
      return new Response(JSON.stringify({ 
        active: activeVisitors.size,
        timestamp: now
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // ============================================
    // Route 4: Media Proxy (GET ?url=...)
    // ============================================
    let proxyUrl = url.searchParams.get('url');
    
    if (proxyUrl) {
      if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
        return new Response(JSON.stringify({ 
          error: 'Invalid URL protocol. Only HTTP/HTTPS allowed.' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      try {
        const fetchOptions = {
          headers: {
            'Referer': 'https://twitter.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        };
        
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          fetchOptions.headers['Range'] = rangeHeader;
        }
        
        const response = await fetch(proxyUrl, fetchOptions);
        
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type');
        
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
          newHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
        } else if (contentType.startsWith('image/')) {
          newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
        
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: 'Proxy error', 
          message: error.message,
          url: proxyUrl
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ============================================
    // Route 5: Twitter Video API (GET /twitter/video?tweetId=...)
    // ============================================
    if (url.pathname === '/twitter/video') {
      const tweetId = url.searchParams.get('tweetId');
      if (!tweetId) {
        return new Response(JSON.stringify({ error: 'Missing tweetId parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const BEARER_TOKEN = env.X_BEARER_TOKEN;
      if (!BEARER_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server misconfiguration: missing token' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      try {
        const apiUrl = `https://api.x.com/2/tweets/${tweetId}?expansions=attachments.media_keys&media.fields=variants,type,duration_ms`;
        
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`X API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const media = data.includes?.media?.[0];
        if (!media || media.type !== 'video') {
          throw new Error('التويتة لا تحتوي على فيديو');
        }

        const variants = media.variants || [];
        const mp4Variants = variants.filter(v => v.content_type === 'video/mp4' && v.url);
        if (mp4Variants.length === 0) {
          throw new Error('لا يوجد رابط فيديو بصيغة MP4');
        }

        const best = mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        let finalUrl = best.url;

        // تنظيف الرابط
        if (finalUrl.includes('?')) {
          const urlObj = new URL(finalUrl);
          urlObj.search = '';
          finalUrl = urlObj.toString();
        }
        if (finalUrl.startsWith('http://')) {
          finalUrl = 'https://' + finalUrl.slice(7);
        }

        // تمرير عبر البروكسي لتجنب CORS
        const proxiedUrl = `${url.origin}?url=${encodeURIComponent(finalUrl)}`;

        return new Response(JSON.stringify({
          success: true,
          url: proxiedUrl,
          originalUrl: best.url,
          bitrate: best.bitrate,
          contentType: best.content_type,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message || 'فشل في جلب الفيديو',
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    // ============================================
    // Route 6: Default response (بدون HTML ثقيل)
    // ============================================
    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Real Hub Worker is running',
      endpoints: [
        '/hit', '/count', '/api/active',
        '/twitter/video?tweetId=...',
        '?url=... (proxy)'
      ]
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      }
    });
  }
};
