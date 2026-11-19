// Return the error document directly: its HTTP status must not depend on an SSR redirect or stream.
export function notFoundResponse() {
  return new Response(
    `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ไม่พบหน้านี้ | BUZLIKE POS</title>
<style>html{background:#fff9f5;color:#2d3436;font-family:system-ui,sans-serif}body{margin:0;padding:24px 20px;line-height:1.8}main{max-width:800px;margin:0 auto}header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:28px}a{color:#a84412;overflow-wrap:anywhere;display:inline-flex;align-items:center;min-height:44px}header a:first-child{font-size:23px;font-weight:700;text-decoration:none;color:#2d3436}article{padding:clamp(20px,5vw,36px);border:1px solid #eedbd0;border-radius:18px;background:#fff}h1{font-size:clamp(25px,4vw,34px);line-height:1.5;text-wrap:balance;margin:0 0 16px}p{font-size:16px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:24px}</style></head><body><main><header><a href="/">BUZLIKE POS</a><a href="/">กลับหน้าแรก</a></header><article><h1>404 — ไม่พบหน้านี้</h1><p>ลิงก์นี้อาจไม่ถูกต้อง หรือหน้านี้ไม่มีอยู่แล้ว</p><p>กลับหน้าแรกเพื่อดูข้อมูลบริการ หรือติดต่อทีมผ่านหน้าช่วยเหลือ</p></article><nav aria-label="ข้อมูลบริการ"><a href="/about">เกี่ยวกับเรา</a><a href="/support">ติดต่อและแจ้งปัญหา</a></nav></main></body></html>`,
    {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    },
  );
}
