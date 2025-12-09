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
const SHEET_CSV_URL = "PEGA_AQUI_EL_MISMO_CSV_QUE USA TELEGRAM";

const OFFER_CHANNELS = [
  "ID_CANAL_1",
  "ID_CANAL_2"
];

const OFFER_INTERVAL = 1000 * 60 * 30;

// ==========================
// CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let products = [];
let index = 0;

// ==========================
// LIMPIEZA
// ==========================

function clean(v = "") {
  return String(v)
    .replace(/=HYPERLINK\("([^"]+)",.*?\)/gi, "$1")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ==========================
// CARGAR CSV (SIN HEADERS)
// ==========================

async function fetchProducts() {
  try {
    console.log("🔄 Descargando CSV…");
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();

    const parsed = Papa.parse(csv, {
      skipEmptyLines: true
    });

    // ❗ quitamos la primera fila (headers)
    const rows = parsed.data.slice(1);

    products = rows
      .map((row) => ({
        photo: clean(row[0]),      // FOTO
        name: clean(row[1]),       // NOMBRE
        price: clean(row[2]),      // PRECIO
        kakobuy: clean(row[3]),    // KAKOBUY
        usfans: clean(row[4]),     // USFANS
        cnfans: clean(row[5]),     // CNFANS
        category: clean(row[6]).toLowerCase() // CATEGORIA
      }))
      .filter(p => p.name && p.photo);

    console.log("✅ Productos cargados:", products.length);
  } catch (e) {
    console.error("❌ ERROR CSV:", e);
  }
}

// ==========================
// EMBED
// ==========================

function embed(p) {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(p.name)
    .setDescription(
      `${p.category ? `🏷️ ${p.category.toUpperCase()}\n` : ""}` +
      `${p.price ? `💰 ${p.price}` : ""}`
    )
    .setImage(p.photo);
}

function buttons(p) {
  const row = new ActionRowBuilder();

  if (p.usfans.startsWith("http"))
    row.addComponents(new ButtonBuilder().setLabel("USFANS").setStyle(ButtonStyle.Link).setURL(p.usfans));

  if (p.cnfans.startsWith("http"))
    row.addComponents(new ButtonBuilder().setLabel("CNFANS").setStyle(ButtonStyle.Link).setURL(p.cnfans));

  if (p.kakobuy.startsWith("http"))
    row.addComponents(new ButtonBuilder().setLabel("Kakobuy").setStyle(ButtonStyle.Link).setURL(p.kakobuy));

  return row.components.length ? [row] : [];
}

// ==========================
// ENVIO AUTOMATICO
// ==========================

async function sendOffer() {
  if (!products.length) {
    console.log("⚠️ NO PRODUCTS");
    return;
  }

  const p = products[index++ % products.length];
  console.log("📤 Enviando:", p.name);

  for (const id of OFFER_CHANNELS) {
    try {
      const ch = await client.channels.fetch(id);
      if (ch) {
        await ch.send({ embeds: [embed(p)], components: buttons(p) });
      }
    } catch (e) {
      console.error("❌ Canal error:", id);
    }
  }
}

// ==========================
// READY
// ==========================

client.once("ready", async () => {
  console.log("🔥 BOT ONLINE");
  await fetchProducts();

  // ENVIO FORZADO AL ARRANCAR
  sendOffer();
  setInterval(sendOffer, OFFER_INTERVAL);
});

// ==========================
// COMANDOS
// ==========================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.content.startsWith("!")) return;

  if (msg.content === "!oferta") {
    if (!products.length) return msg.reply("❌ No hay productos");
    const p = products[Math.floor(Math.random() * products.length)];
    return msg.channel.send({ embeds: [embed(p)], components: buttons(p) });
  }

  if (msg.content === "!ping") {
    return msg.reply("✅ Vivo");
  }
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
