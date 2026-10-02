const catalog = {
  "Dior Sauvage": 850,
  "YSL Libre": 900,
  "Bleu de Chanel": 970,
  "Miss Dior": 920,
  "Terre d’Hermès": 880,
};

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function cleanText(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "Méthode non autorisée.");
  }

  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    return sendError(res, 403, "Origine non autorisée.");
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return sendError(res, 503, "La réception des commandes n’est pas configurée.");
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return sendError(res, 400, "La commande est invalide.");
    }
  }

  const customer = payload?.customer;
  const items = payload?.items;
  if (!customer || typeof customer !== "object" || !Array.isArray(items) || items.length < 1 || items.length > 20) {
    return sendError(res, 400, "La commande est invalide.");
  }

  const name = typeof customer.name === "string" ? cleanText(customer.name) : "";
  const phone = typeof customer.phone === "string" ? cleanText(customer.phone) : "";
  const address = typeof customer.address === "string" ? cleanText(customer.address) : "";
  if (!name || name.length > 100 || !/^[+0-9().\s-]{6,30}$/.test(phone) || !address || address.length > 300) {
    return sendError(res, 400, "Vérifiez votre nom, votre téléphone et votre adresse.");
  }

  const lines = [];
  let total = 0;
  for (const item of items) {
    if (!item || typeof item.name !== "string" || !Object.hasOwn(catalog, item.name)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      return sendError(res, 400, "Un article de la commande est invalide.");
    }
    const lineTotal = catalog[item.name] * item.quantity;
    total += lineTotal;
    lines.push(`- ${item.name} x${item.quantity} : ${lineTotal.toLocaleString("fr-FR")} MAD`);
  }

  const message = [
    "Nouvelle commande PARFUMÉLITE",
    "",
    `Client : ${name}`,
    `Téléphone : ${phone}`,
    `Adresse : ${address}`,
    "",
    ...lines,
    "",
    `Total : ${total.toLocaleString("fr-FR")} MAD`,
  ].join("\n");

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await telegramResponse.json();
    if (!telegramResponse.ok || !result.ok) {
      return sendError(res, 502, "La commande n’a pas pu être transmise. Réessayez dans un instant.");
    }
  } catch {
    return sendError(res, 502, "La commande n’a pas pu être transmise. Réessayez dans un instant.");
  }

  return res.status(200).json({ success: true });
};