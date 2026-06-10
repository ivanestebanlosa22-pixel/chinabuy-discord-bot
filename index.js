require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require("discord.js");

/* =========================
   CONFIG (Variables de entorno)
========================= */

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CATALOG_CHANNEL_ID = process.env.CATALOG_CHANNEL_ID || "1514340027432304660";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS;

const SHEET_RANGE = process.env.SHEET_RANGE || "MAIN!A:R";

const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.chinabuyhub.com/";
const SPREADSHEET_URL = process.env.SPREADSHEET_URL || "https://docs.google.com/spreadsheets/d/1YZmhCC4rBmGpv-IoIvjB8oMV6kVCgOpK4-1rDBa0Ha8";
const SPREADSHEET_PUBLISH_ID = process.env.SPREADSHEET_PUBLISH_ID;
const EXTENSION_URL = process.env.EXTENSION_URL || "https://chromewebstore.google.com/detail/lkbdnacknmpmcojllhlekighhchhknfd";

const CATALOG_BATCH = parseInt(process.env.CATALOG_BATCH) || 5;
const SEND_DELAY = parseInt(process.env.SEND_DELAY) || 2000;

// Auto-posting
const AUTO_POST_ENABLED = process.env.AUTO_POST_ENABLED !== "false";
const AUTO_POST_INTERVAL = parseInt(process.env.AUTO_POST_INTERVAL) || 18000000;
const AUTO_POST_BATCH = parseInt(process.env.AUTO_POST_BATCH) || 25;

/* =========================
   AGENTS CONFIG
========================= */

const AGENTS = [
  {
    name: "USFans",
    getUrl: (id) => `https://www.usfans.com/product/3/${id}?ref=RCGD5Y`
  },
  {
    name: "Joyagoo",
    getUrl: (id) => `https://joyagoo.com/product?platform=WEIDIAN&id=${id}&ref=300768147`
  },
  {
    name: "Litbuy",
    getUrl: (id) => `https://litbuy.net/product/weidian/${id}?inviteCode=YBMHFG55L`
  },
  {
    name: "OOPBUY",
    getUrl: (id) => `https://oopbuy.com/product/weidian/${id}?inviteCode=GH40R4J0O`
  },
  {
    name: "Mulebuy",
    getUrl: (id) => `https://mulebuy.com/product/?shop_type=weidian&id=${id}&ref=200642502`
  }
];

/* =========================
   STATE (PERSISTENT)
========================= */

const STATE_FILE = path.join(__dirname, "state.json");
let state = { catalogIndex: 0 };

if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.log("State file corrupted, resetting.");
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* =========================
   DATA
========================= */

let products = [];

/* =========================
   GOOGLE AUTH
========================= */

function cleanPrivateKey(key) {
  return key
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .trim();
}

function getCredentials() {
  if (!GOOGLE_CREDENTIALS) throw new Error("GOOGLE_CREDENTIALS not set");

  if (!GOOGLE_CREDENTIALS.trimStart().startsWith("{")) {
    const buf = Buffer.from(GOOGLE_CREDENTIALS, "base64");
    return JSON.parse(buf.toString("utf8"));
  }

  return typeof GOOGLE_CREDENTIALS === "string"
    ? JSON.parse(GOOGLE_CREDENTIALS)
    : GOOGLE_CREDENTIALS;
}

async function getAuth() {
  const creds = getCredentials();

  if (!creds.private_key) throw new Error("private_key missing in credentials");
  if (!creds.client_email) throw new Error("client_email missing in credentials");

  creds.private_key = cleanPrivateKey(creds.private_key);

  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
}

/* =========================
   FALLBACK: Fetch Google Sheet as public CSV
   (No authentication needed if sheet is published to web)
========================= */

const SHEET_NAME = (process.env.SHEET_RANGE || "MAIN!A:R").split("!")[0];
const SPREADSHEET_PUBLIC_URL = SPREADSHEET_PUBLISH_ID
  ? `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_PUBLISH_ID}/pub?output=csv`
  : `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

function parseCSVRow(row) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '"') {
      inQuotes = !inQuotes;
    } else if (row[i] === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += row[i];
    }
  }
  result.push(current);
  return result;
}

async function loadProductsFromCSV() {
  console.log("Loading products from published CSV...");
  const res = await fetch(SPREADSHEET_PUBLIC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const csv = await res.text();
  const rows = csv.split("\n").map(r => parseCSVRow(r));
  if (rows.length < 2) throw new Error("No data rows in CSV");

  products = rows.slice(1)
    .filter(r => r[0] && r[1])
    .map((r, idx) => {
      const p = {
        id: r[0] || String(idx + 1),
        nombre: r[1] || "",
        marca: r[2] || "",
        categoria: r[3] || "",
        precio: r[4] || "N/A",
        ranking: r[5] || "N/A",
        weidianId: r[7] || "",
        linkWeidian: r[8] || "",
        fotoPortada: (r[9] || "").trim() || null,
        fotos: [r[10], r[11], r[12], r[13], r[14], r[15]].filter(f => f && f.trim().startsWith("http")).map(f => f.trim()),
        descripcionEs: r[16] || "",
        descripcionEn: r[17] || ""
      };
      if (idx < 3) console.log(`DEBUG product ${idx}: id="${r[0]}" nombre="${r[1]}" col9="${(r[9]||"").substring(0,50)}"`);
      return p;
    });

  console.log(`Products loaded from CSV: ${products.length}`);
}

/* =========================
   LOAD PRODUCTS FROM GOOGLE SHEETS
========================= */

async function loadProducts() {
  // Try published CSV first (no authentication needed)
  try {
    await loadProductsFromCSV();
    return;
  } catch (e) {
    console.log("CSV loading skipped or failed:", e.message);
  }

  // Fallback: Google Sheets API with service account
  try {
    console.log("Loading products from Google Sheets API...");
    const auth = await getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE
    });

    const rows = res.data.values || [];
    console.log(`Total rows from sheet: ${rows.length}`);

    products = rows.slice(1)
      .filter(r => r[0] && r[1])
      .map((r, idx) => ({
        id: r[0] || String(idx + 1),
        nombre: r[1] || "",
        marca: r[2] || "",
        categoria: r[3] || "",
        precio: r[4] || "N/A",
        ranking: r[5] || "N/A",
        weidianId: r[7] || "",
        linkWeidian: r[8] || "",
        fotoPortada: (r[9] || "").trim() || null,
        fotos: [r[10], r[11], r[12], r[13], r[14], r[15]].filter(f => f && f.trim().startsWith("http")).map(f => f.trim()),
        descripcionEs: r[16] || "",
        descripcionEn: r[17] || ""
      }));

    console.log(`Products loaded: ${products.length}`);
    return;
  } catch (e) {
    console.error("Google Sheets API failed:", e.message);
  }

  console.error("Could not load products from any source");
}

/* =========================
   HELPERS
========================= */

const wait = ms => new Promise(r => setTimeout(r, ms));

function getAgentButtons(weidianId) {
  const row = new ActionRowBuilder();
  AGENTS.forEach(agent => {
    row.addComponents(
      new ButtonBuilder()
        .setLabel(`🛒 ${agent.name}`)
        .setStyle(ButtonStyle.Link)
        .setURL(agent.getUrl(weidianId))
    );
  });
  return row;
}

function productEmbed(p) {
  const descLines = [];

  if (p.precio && p.precio !== "N/A") {
    descLines.push(`💰 **Precio:** $${p.precio}`);
  }
  if (p.ranking && p.ranking !== "N/A") {
    descLines.push(`⭐ **Rating:** ${p.ranking}/10`);
  }
  if (p.categoria) {
    descLines.push(`📦 **Categoría:** ${p.categoria}`);
  }
  if (p.marca) {
    descLines.push(`🏷️ **Marca:** ${p.marca}`);
  }

  if (p.descripcionEs) {
    descLines.push(`\n🇪🇸 ${p.descripcionEs.substring(0, 300)}`);
  }
  if (p.descripcionEn) {
    descLines.push(`🇺🇸 ${p.descripcionEn.substring(0, 300)}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(p.nombre)
    .setDescription(descLines.join("\n") || "Sin descripción");

  if (p.fotoPortada) {
    embed.setImage(p.fotoPortada);
  }

  return embed
    .setFooter({ text: `ChinaBuyHub • Verified Products` })
    .setTimestamp();
}

/* =========================
   SEND CATALOG
========================= */

async function sendCatalog(amount = CATALOG_BATCH) {
  console.log(`sendCatalog called: ${amount} products, ${products.length} loaded`);
  if (!products.length) return;

  const channel = await client.channels.fetch(CATALOG_CHANNEL_ID).catch(err => {
    console.error("Error fetching channel:", err.message);
    return null;
  });
  if (!channel) {
    console.log("Channel not found!");
    return;
  }

  let sent = 0;

  while (sent < amount) {
    if (state.catalogIndex >= products.length) {
      state.catalogIndex = 0;
    }

    const p = products[state.catalogIndex];
    console.log(`Sending product ${sent + 1}/${amount}: ${p.nombre}`);

    const allPhotos = [p.fotoPortada, ...p.fotos].filter(f => f);

    const embeds = [productEmbed(p)];
    const photoCount = allPhotos.length;

    if (photoCount > 1) {
      const additionalPhotos = allPhotos.slice(1, 10);
      for (let i = 0; i < additionalPhotos.length && embeds.length < 10; i++) {
        const photo = additionalPhotos[i];
        embeds.push(
          new EmbedBuilder()
            .setColor(0x0ea5e9)
            .setImage(photo)
        );
      }
    }

    await channel.send({
      embeds,
      components: [getAgentButtons(p.weidianId)]
    }).catch(err => console.error("Error sending:", err.message));

    state.catalogIndex++;
    sent++;
    saveState();
    await wait(SEND_DELAY);
  }

  console.log(`Finished sending ${sent} products`);
}

/* =========================
   COMMANDS
========================= */

client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === "!ping") return msg.reply(`🏓 Pong: ${client.ws.ping}ms`);

  if (cmd === "!catalog") {
    const num = parseInt(args[0]) || CATALOG_BATCH;
    await msg.reply(`📦 Enviando ${num} producto(s)...`);
    return sendCatalog(num);
  }

  if (cmd === "!next") {
    state.catalogIndex = (state.catalogIndex + 1) % products.length;
    saveState();
  }

  if (cmd === "!debug") {
    const p = products[state.catalogIndex];
    if (!p) return msg.reply("No hay productos.");
    return msg.reply(
      `**${p.nombre}**\n\`\`\`\n` +
      `precio: "${p.precio}"\n` +
      `ranking: "${p.ranking}"\n` +
      `categoria: "${p.categoria}"\n` +
      `marca: "${p.marca}"\n` +
      `weidianId: "${p.weidianId}"\n` +
      `fotoPortada: ${p.fotoPortada ? "SI" : "NO"}\n` +
      `fotos: ${p.fotos.length}\n` +
      `descEs: ${p.descripcionEs.length} chars\n` +
      `descEn: ${p.descripcionEn.length} chars\n\`\`\``
    );
  }

  if (cmd === "!product" || cmd === "!prev") {
    const p = products[state.catalogIndex];
    if (!p) return msg.reply("No hay productos disponibles.");
    const allPhotos = [p.fotoPortada, ...p.fotos].filter(f => f);
    const embeds = [productEmbed(p)];
    if (allPhotos.length > 1) {
      for (const photo of allPhotos.slice(1, 10)) {
        embeds.push(new EmbedBuilder().setColor(0x0ea5e9).setImage(photo));
      }
    }
    return msg.reply({
      embeds,
      components: [getAgentButtons(p.weidianId)]
    });
  }

  if (cmd === "!buscar" || cmd === "!search") {
    const query = args.join(" ").toLowerCase();
    if (!query) return msg.reply("Usa: `!buscar [nombre]`");

    const results = products.filter(p =>
      p.nombre.toLowerCase().includes(query) ||
      p.marca.toLowerCase().includes(query)
    ).slice(0, 5);

    if (results.length === 0) return msg.reply("No se encontraron productos.");

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle(`🔍 Resultados para "${query}"`)
      .setDescription(
        results.map((p, i) =>
          `**${i + 1}.** ${p.nombre}\n💰 $${p.precio} | ⭐ ${p.ranking}/10\n`
        ).join("\n")
      );

    return msg.reply({ embeds: [embed] });
  }

  if (cmd === "!help") {
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("⚙️ FindsES Bot — Help / Ayuda")
      .setDescription(
        "📦 **`!catalog [num]`**\n" +
        "• Envía productos al canal (por defecto 5)\n\n" +
        "🖼️ **`!product`**\n" +
        "• Muestra el producto actual con todas las fotos\n\n" +
        "⏭️ **`!next`**\n" +
        "• Avanza al siguiente producto\n\n" +
        "🔍 **`!buscar [producto]`**\n" +
        "• Busca productos en la base de datos\n\n" +
        "🐛 **`!debug`**\n" +
        "• Muestra datos crudos del producto actual\n\n" +
        "📋 **`!help`**\n" +
        "• Muestra este mensaje"
      );
    return msg.reply({ embeds: [embed] });
  }

  if (cmd === "!website") return msg.reply(`[Website](${WEBSITE_URL})`);
  if (cmd === "!extension") return msg.reply(`[Extension](${EXTENSION_URL})`);
});

/* =========================
   READY
========================= */

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1QtZjzS2QKycTxLdJIbldisLxP9lmBNo8NlIzcXaWeZk/edit?gid=1553707851#gid=1553707851";

async function sendProductMessage(channel, p) {
  const imageUrls = [p.fotoPortada, p.fotos[0], p.fotos[1]].filter(f => f);
  let attachments = [];
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const res = await fetch(imageUrls[i]);
      const buf = Buffer.from(await res.arrayBuffer());
      attachments.push({ attachment: buf, name: `photo_${i+1}.jpg` });
    } catch (e) {
      console.log("Failed to download image:", e.message);
    }
  }

  const usfans = `https://www.usfans.com/product/3/${p.weidianId}?ref=RCGD5Y`;
  const litbuy = `https://litbuy.com/product/2/${p.weidianId}?inviteCode=YBMHFG55L`;
  const kakobuy = `https://www.kakobuy.com/item/details?url=${encodeURIComponent(`https://weidian.com/item.html?itemID=${p.weidianId}`)}&affcode=hc9hzs`;

  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(`🛍️ ${p.nombre}`)
    .setDescription(
      `💰 **Precio:** $${p.precio}\n\n` +
      `🔥 [USFans](${usfans})\n` +
      `⚡ [Litbuy](${litbuy})\n` +
      `🚀 [KakoBuy](${kakobuy})\n\n` +
      `📊 [Spreadsheet](${SHEET_URL})`
    )
    .setFooter({ text: "ChinaBuyHub" })
    .setTimestamp();

  await channel.send({ files: attachments, embeds: [embed] });
}

client.once("clientReady", async () => {
  console.log(`Bot online: ${client.user.tag}`);

  await loadProducts();

  if (!products.length) {
    console.log("No products loaded, skipping");
    return;
  }

  console.log(`Using channel ID: ${CATALOG_CHANNEL_ID}`);
  const channel = await client.channels.fetch(CATALOG_CHANNEL_ID).catch(err => {
    console.error("Error fetching channel:", err.message);
    return null;
  });
  if (!channel) {
    console.log("Channel not found or no access");
    return;
  }

  async function sendFirstFive() {
    const valid = products.filter(p => p.fotoPortada || p.fotos.length > 0);
    const toSend = valid.slice(0, 5);
    for (let i = 0; i < toSend.length; i++) {
      try {
        await sendProductMessage(channel, toSend[i]);
        console.log(`Sent product ${i + 1}/${toSend.length}: ${toSend[i].nombre}`);
        if (i < toSend.length - 1) await wait(2000);
      } catch (e) {
        console.error(`Error sending product ${i}:`, e.message);
      }
    }
  }

  await sendFirstFive();
  setInterval(sendFirstFive, 2 * 60 * 60 * 1000);
});

/* =========================
   LOGIN
========================= */

client.login(DISCORD_TOKEN);
