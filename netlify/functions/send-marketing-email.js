async function getGraphToken() {
  const tenantId = process.env.AZURE_MAILER_TENANT_ID;
  const clientId = process.env.AZURE_MAILER_CLIENT_ID;
  const clientSecret = process.env.AZURE_MAILER_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure mailer credentials not configured");
  }

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Azure token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { to, subject, html } = payload;
  if (!to || !subject || !html) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing to/subject/html" }) };
  }

  const sender = process.env.MAIL_SENDER_ADDRESS;
  if (!sender) {
    return { statusCode: 500, body: JSON.stringify({ error: "MAIL_SENDER_ADDRESS not configured" }) };
  }

  try {
    const token = await getGraphToken();
    const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    });

    if (resp.status === 202) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    const text = await resp.text();
    return { statusCode: resp.status, body: text || JSON.stringify({ error: "sendMail failed" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
