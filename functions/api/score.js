export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET } = context.env;
  const body = await context.request.json();
  const imageBase64 = body.image;

  const formData = new FormData();
  formData.append("api_key", FACEPP_KEY);
  formData.append("api_secret", FACEPP_SECRET);
  formData.append("image_base64", imageBase64);
  formData.append("return_attributes", "beauty");

  try {
    const resp = await fetch("https://api-cn.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    });
    const result = await resp.json();

    let score = 0;
    if (result.faces && result.faces.length > 0) {
      score = result.faces[0].attributes.beauty.male_score;
    }

    return new Response(JSON.stringify({ score }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Face++ 调用失败喵～" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
