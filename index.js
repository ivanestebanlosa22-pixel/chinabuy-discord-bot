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

// CSV PUBLICO DE GOOGLE SHEETS
const SHEET_CSV_URL = "PEGA_AQUI_TU_URL_CSV";

// IDS DE CANALES PARA OFERTAS
const OFFER_CHANNELS = [
  "ID_CANAL_1",
  "ID_CANAL_2"
];

// CADA CUANTO ENVIAR OFERTAS
const OFFER_INTERVAL = 1000 * 60 * 30; // 30 minutos

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
// LIMPIEZA SEGURA
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
    row[key?.toLowerCase()] ??
    row[key?.toUpperCase()] ??
    ""
  );
}

// ==========================
// CARGAR CSV
// ==========================

async function fetchProducts() {
  try {
    console.log("🔄 Descargando CSV...");
    const res = await fetch(SHEET_CSV_URL);
    const csvText = await res.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    console.log("🧾 HEADERS CSV:", parsed.meta.fields);

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
    console.error("❌ ERROR cargando CSV:", err);
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

  if (p.usfans?.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("USFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.usfans)
    );
  }

  if (p.cnfans?.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("CNFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.cnfans)
    );
  }

  if (p.kakobuy?.startsWith("http")) {
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
// ENVIO AUTOMATICO
// ==========================

async function sendAutoOffers() {
  if (!products.length) {
    console.log("⚠️ No hay productos para enviar");
    return;
  }

  const product = products[offerIndex % products.length];
  offerIndex++;

  console.log("📤 Enviando oferta:", product.name);

  for (const channelId of OFFER_CHANNELS) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      await channel.send({
        embeds: [buildEmbed(product)],
        components: buildButtons(product)
      });
    } catch (err) {
      console.error("❌ Error canal", channelId, err.message);
    }
  }
}

// ==========================
// READY
// ==========================

client.once("ready", async () => {
  console.log("🔥 BOT ONLINE:", client.user.tag);

  await fetchProducts();

  // ENVIO FORZADO AL ARRANCAR (TEST)
  sendAutoOffers();

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

  // FORZAR OFERTA MANUAL
  if (cmd === "oferta") {
    if (!products.length)
      return msg.reply("❌ No hay productos cargados.");

    const product = products[Math.floor(Math.random() * products.length)];

    return msg.channel.send({
      embeds: [buildEmbed(product)],
      components: buildButtons(product)
    });
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
