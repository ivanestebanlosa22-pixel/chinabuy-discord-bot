require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const Papa = require("papaparse");
const fetch = require("node-fetch");

// ==========================
// CONFIG
// ==========================

const TOKEN = process.env.DISCORD_TOKEN;

// 👉 CSV PUBLICADO
const SHEET_CSV_URL =
  "PEGA_AQUI_TU_URL_CSV_PUBLICA";

// 👉 CANALES DONDE MANDAR OFERTAS (IDs)
const OFFER_CHANNELS = [
  "123456789012345678",
  "987654321098765432"
];

// 👉 CADA CUÁNTO MANDAR OFERTAS (ms)
const OFFER_INTERVAL = 1000 * 60 * 30; // 30 minutos

// 👉 CUÁNTOS PRODUCTOS POR ENVÍO
const PRODUCTS_PER_POST = 1;

let products = [];
let offerIndex = 0;

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==========================
// LIMPIEZA ROBUSTA
// ==========================

function clean(text = "") {
  return String(text)
    .replace(/=HYPERLINK\("([^"]+)",.*?\)/gi, "$1")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^"|"$/g, "")
    .trim();
}

function get(row, key) {
  return clean(
    row[key] ??
    row[key.toLowerCase()] ??
    row[key.toUpperCase()] ??
    ""
  );
}

// ==========================
// CARGAR PRODUCTOS
// ==========================

async function fetchProducts() {
  try {
    console.log("🔄 Descargando CSV…");
    const res = await fetch(SHEET_CSV_URL);
    const csvText = await res.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    console.log("🧾 HEADERS:", parsed.meta.fields);

    products = parsed.data
      .map((row) => ({
        photo: get(row, "foto"),
        name: get(row, "nombre"),
        price: get(row, "precio"),
        kakobuy: get(row, "link kakobuy"),
        usfans: get(row, "link usfans"),
        cnfans: get(row, "link de cnfans"),
        category: get(row, "categorias").toLowerCase()
      }))
      .filter((p) => p.name && p.photo);

    console.log("✅ Productos cargados:", products.length);
  } catch (err) {
    console.error("❌ ERROR CSV:", err);
  }
}

// ==========================
// EMBEDS + BOTONES
// ==========================

function buildEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(p.name)
    .setDescription(
      `${p.category ? `🏷️ **${p.category.toUpperCase()}**\n` : ""}` +
      `${p.price ? `💰 **${p.price}**` : ""}`
    )
    .setImage(p.photo)
    .setFooter({ text: "🔥 Oferta automática" });
}

function buildButtons(p) {
  const row = new ActionRowBuilder();

  if (p.usfans.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("USFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.usfans)
    );
  }

  if (p.cnfans.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("CNFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.cnfans)
    );
  }

  if (p.kakobuy.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Kakobuy")
        .setStyle(ButtonStyle.Link)
        .setURL(p.kakobuy)
    );
  }

  return row.components.length ? [row] : [];
}

// ==========================
// ENVIAR OFERTAS AUTOMÁTICAS
// ==========================

async function sendAutoOffers() {
  if (!products.length) return;

  const product = products[offerIndex % products.length];
  offerIndex++;

  for (const channelId of OFFER_CHANNELS) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      await channel.send({
        embeds: [buildEmbed(product)],
        components: buildButtons(product)
      });
    } catch (err) {
      console.error("❌ Error enviando a canal", channelId, err.message);
    }
  }
}

// ==========================
// READY
// ==========================

client.once("ready", async () => {
  console.log("🔥 BOT ONLINE:", client.user.tag);
  await fetchProducts();

  setInterval(sendAutoOffers, OFFER_INTERVAL);
});

// ==========================
// COMANDOS
// ==========================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.content.startsWith("!")) return;

  const [cmd, ...args] = msg.content.slice(1).split(" ");

  if (cmd === "ping") {
    return msg.reply("🏓 Pong! Bot activo.");
  }

  if (cmd === "buscar") {
    const term = args.join(" ").toLowerCase();
    if (!term) return msg.reply("🔎 Usa: `!buscar jordan`");

    const results = products
      .filter((p) => p.name.toLowerCase().includes(term))
      .slice(0, 5);

    if (!results.length)
      return msg.reply("❌ No encontré productos.");

    for (const p of results) {
      await msg.channel.send({
        embeds: [buildEmbed(p)],
        components: buildButtons(p)
      });
    }
  }

  if (cmd === "categoria") {
    const cat = args.join(" ").toLowerCase();
    if (!cat) return msg.reply("🏷️ Usa: `!categoria zapatillas`");

    const results = products
      .filter((p) => p.category.includes(cat))
      .slice(0, 5);

    if (!results.length)
      return msg.reply("❌ No hay productos en esa categoría.");

    for (const p of results) {
      await msg.channel.send({
        embeds: [buildEmbed(p)],
        components: buildButtons(p)
      });
    }
  }
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
