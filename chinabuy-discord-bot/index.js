require("dotenv").config();
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
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
const CATALOG_CHANNEL_ID = process.env.CATALOG_CHANNEL_ID || "1513307154495439009";
const CSV_FILENAME = process.env.CSV_FILENAME || "repsfinder - MAIN.csv";
const CSV_PATH = path.join(__dirname, "..", CSV_FILENAME);

const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.chinabuyhub.com/";
const SPREADSHEET_URL = process.env.SPREADSHEET_URL || "https://docs.google.com/spreadsheets/d/1YZmhCC4rBmGpv-IoIvjB8oMV6kVCgOpK4-1rDBa0Ha8";
const EXTENSION_URL = process.env.EXTENSION_URL || "https://chromewebstore.google.com/detail/lkbdnacknmpmcojllhlekighhchhknfd";

const CATALOG_BATCH = parseInt(process.env.CATALOG_BATCH) || 5;
const SEND_DELAY = parseInt(process.env.SEND_DELAY) || 2000;

// Auto-posting (envío automático de productos)
const AUTO_POST_ENABLED = process.env.AUTO_POST_ENABLED !== "false"; // true por defecto
const AUTO_POST_INTERVAL = parseInt(process.env.AUTO_POST_INTERVAL) || 3600000; // 1 hora por defecto
const AUTO_POST_BATCH = parseInt(process.env.AUTO_POST_BATCH) || 1; // 1 producto por intervalo

/* =========================
   AGENTS CONFIG
========================= */

const AGENTS = [
  {
    name: "USFans",
    emoji: "🇺🇸",
    getUrl: (id) => `https://www.usfans.com/product/3/${id}?ref=RCGD5Y`,
    registerUrl: "https://www.usfans.com/register?ref=RCGD5Y",
    bonus: "800¥ bono al registrarte"
  },
  {
    name: "Joyagoo",
    emoji: "🇯🇵",
    getUrl: (id) => `https://joyagoo.com/product?platform=WEIDIAN&id=${id}&ref=300768147`,
    registerUrl: "https://joyagoo.com/register?ref=300768147",
    bonus: "Bono de bienvenida"
  },
  {
    name: "Litbuy",
    emoji: "🔥",
    getUrl: (id) => `https://litbuy.net/product/weidian/${id}?inviteCode=YBMHFG55L`,
    registerUrl: "https://litbuy.com/register?inviteCode=YBMHFG55L",
    bonus: "Bono de bienvenida"
  },
  {
    name: "OOPBUY",
    emoji: "⚡",
    getUrl: (id) => `https://oopbuy.com/product/weidian/${id}?inviteCode=GH40R4J0O`,
    registerUrl: "https://oopbuy.com/register?inviteCode=GH40R4J0O",
    bonus: "Bono de bienvenida"
  },
  {
    name: "Mulebuy",
    emoji: "👟",
    getUrl: (id) => `https://mulebuy.com/product/?shop_type=weidian&id=${id}&ref=200642502`,
    registerUrl: "https://mulebuy.com/register?ref=200642502",
    bonus: "Bono de bienvenida"
  }
];

/* =========================
   STATE (PERSISTENT)
========================= */

const STATE_FILE = path.join(__dirname, "state.json");

let state = {
  catalogIndex: 0
};

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
let stats = {
  sent: 0,
  commands: 0,
  started: Date.now()
};

/* =========================
   LOAD PRODUCTS FROM CSV
========================= */

async function loadProducts() {
  return new Promise((resolve, reject) => {
    products = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", (row) => {
        if (row["weidian_id"] && row["link weidian"] && row["foto portada"]) {
          products.push({
            id: row["id"],
            nombre: row["nombre"],
            marca: row["marca"],
            categoria: row["Categoria"],
            precio: row["precio"],
            ranking: row["ranking"],
            weidianId: row["weidian_id"],
            linkWeidian: row["link weidian"],
            fotoPortada: row["foto portada"],
            fotos: [
              row["foto 1"],
              row["foto 2"],
              row["foto 3"],
              row["foto 4"],
              row["foto 5"],
              row["foto6"]
            ].filter(f => f && f.startsWith("http")),
            descripcionEs: row["descripcion"],
            descripcionEn: row["descripcion ingles"]
          });
        }
      })
      .on("end", () => {
        console.log(`Products loaded: ${products.length}`);
        resolve();
      })
      .on("error", (err) => {
        console.error("Error loading CSV:", err.message);
        reject(err);
      });
  });
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

function getLinkButtons() {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setLabel("🌐 Website")
      .setStyle(ButtonStyle.Link)
      .setURL(WEBSITE_URL),
    new ButtonBuilder()
      .setLabel("📊 Spreadsheet")
      .setStyle(ButtonStyle.Link)
      .setURL(SPREADSHEET_URL),
    new ButtonBuilder()
      .setLabel("🧩 Extension")
      .setStyle(ButtonStyle.Link)
      .setURL(EXTENSION_URL)
  );

  return row;
}

function productEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(p.nombre)
    .setImage(p.fotoPortada)
    .setDescription(
      `💰 **Precio / Price:** $${p.precio || "N/A"}\n` +
      `⭐ **Rating:** ${p.ranking || "N/A"}/10\n` +
      `📦 **Categoría / Category:** ${p.categoria || "N/A"}\n` +
      `🏷️ **Marca / Brand:** ${p.marca || "N/A"}\n\n` +
      `─────────────────────\n\n` +
      `🇪🇸 **${p.descripcionEs ? p.descripcionEs.substring(0, 400) + "..." : "Descripción no disponible"}**\n\n` +
      `🇺🇸 **${p.descripcionEn ? p.descripcionEn.substring(0, 400) + "..." : "Description not available"}**`
    )
    .setFooter({
      text: `📸 ${p.fotos.length + 1} fotos • ChinaBuyHub • Verified Products`
    })
    .setTimestamp();
}

function photoEmbed(photoUrl, photoNumber, totalPhotos, productName) {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(`📸 ${productName} - Foto ${photoNumber}/${totalPhotos}`)
    .setImage(photoUrl)
    .setFooter({ text: "ChinaBuyHub • Verified Products" });
}

/* =========================
   SEND CATALOG
========================= */

async function sendCatalog(amount = CATALOG_BATCH) {
  if (!products.length) return;

  const channel = await client.channels.fetch(CATALOG_CHANNEL_ID);
  if (!channel) return;

  let sent = 0;

  while (sent < amount) {
    if (state.catalogIndex >= products.length) {
      state.catalogIndex = 0;
    }

    const p = products[state.catalogIndex];
    const allPhotos = [p.fotoPortada, ...p.fotos].filter(f => f);

    // Send main embed with agent buttons
    await channel.send({
      content: "🛍️ **NUEVO PRODUCTO / NEW PRODUCT**",
      embeds: [productEmbed(p)],
      components: [getAgentButtons(p.weidianId)]
    });

    // Send additional photos as separate embeds with images
    if (allPhotos.length > 1) {
      const additionalPhotos = allPhotos.slice(1, 6);

      // Send photos in batches of 3 (Discord limit)
      for (let i = 0; i < additionalPhotos.length; i += 3) {
        const batch = additionalPhotos.slice(i, i + 3);
        const photoEmbeds = batch.map((photo, idx) =>
          photoEmbed(photo, i + idx + 2, allPhotos.length, p.nombre)
        );

        await channel.send({ embeds: photoEmbeds });
      }
    }

    state.catalogIndex++;
    sent++;
    stats.sent++;

    saveState();
    await wait(SEND_DELAY);
  }
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
    stats.commands++;
    await msg.reply("📦 Enviando catálogo / Sending catalog...");
    return sendCatalog();
  }

  if (cmd === "!product") {
    const p = products[state.catalogIndex];
    if (!p) return msg.reply("No hay productos disponibles / No products available.");

    const allPhotos = [p.fotoPortada, ...p.fotos].filter(f => f);
    const embeds = [productEmbed(p)];

    // Add additional photos as embeds
    if (allPhotos.length > 1) {
      const additionalPhotos = allPhotos.slice(1, 3);
      additionalPhotos.forEach((photo, idx) => {
        embeds.push(photoEmbed(photo, idx + 2, allPhotos.length, p.nombre));
      });
    }

    return msg.reply({
      embeds: embeds,
      components: [getAgentButtons(p.weidianId)]
    });
  }

  if (cmd === "!search" || cmd === "!buscar") {
    const query = args.join(" ").toLowerCase();
    if (!query) return msg.reply("Usa: `!buscar [nombre del producto]` / Use: `!search [product name]`");

    const results = products.filter(p =>
      p.nombre.toLowerCase().includes(query) ||
      p.marca.toLowerCase().includes(query)
    ).slice(0, 5);

    if (results.length === 0) {
      return msg.reply("No se encontraron productos / No products found.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle(`🔍 Resultados para "${query}"`)
      .setDescription(
        results.map((p, i) =>
          `**${i + 1}.** ${p.nombre}\n💰 $${p.precio} | ⭐ ${p.ranking}/10\n`
        ).join("\n")
      )
      .setFooter({ text: `${results.length} productos encontrados / products found` });

    return msg.reply({ embeds: [embed] });
  }

  if (cmd === "!help") {
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("⚙️ FindsES Bot — Help / Ayuda")
      .setDescription(
        "🇪🇸 Aquí tienes la lista de comandos disponibles y dónde puedes utilizarlos para exprimir al máximo nuestras herramientas:\n" +
        "🇺🇸 Here is the list of available commands and where you can use them to get the most out of our tools:\n\n" +
        "🔍 **`!buscar [producto]`**\n" +
        "• 🇪🇸 **Uso:** En el canal #buscar-producto. Busca al instante en nuestra base de datos web.\n" +
        "• 🇺🇸 **Usage:** In the #buscar-producto channel. Search our web database instantly.\n" +
        "• Example: !buscar nike air force\n\n" +
        "📦 **`!catalog`**\n" +
        "• 🇪🇸 Envía un lote de productos al catálogo.\n" +
        "• 🇺🇸 Sends a batch of products to the catalog.\n\n" +
        "📋 **`!help`**\n" +
        "• 🇪🇸 Muestra este mensaje de ayuda en el chat.\n" +
        "• 🇺🇸 Shows this help message in the chat."
      );

    return msg.reply({ embeds: [embed] });
  }

  if (cmd === "!website") return msg.reply(`[Website](${WEBSITE_URL})`);
  if (cmd === "!extension") return msg.reply(`[Chrome Extension](${EXTENSION_URL})`);
  if (cmd === "!spreadsheet") return msg.reply(`[Spreadsheet](${SPREADSHEET_URL})`);
});

/* =========================
   READY
========================= */

client.once("clientReady", async () => {
  console.log(`Bot online: ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "ChinaBuyHub Catalog", type: ActivityType.Watching }],
    status: "online"
  });

  await loadProducts();

  // Auto-posting: envía productos automáticamente cada X tiempo
  if (AUTO_POST_ENABLED && products.length > 0) {
    console.log(`Auto-posting enabled: every ${AUTO_POST_INTERVAL / 1000 / 60} minutes`);

    // Enviar primer producto inmediatamente
    await sendCatalog(AUTO_POST_BATCH);

    // Programar envíos automáticos
    setInterval(async () => {
      console.log(`Auto-posting ${AUTO_POST_BATCH} products...`);
      await sendCatalog(AUTO_POST_BATCH);
    }, AUTO_POST_INTERVAL);
  }
});

/* =========================
   LOGIN
========================= */

client.login(DISCORD_TOKEN);
