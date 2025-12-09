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

const TOKEN = process.env.DISCORD_TOKEN;
const SHEET_CSV_URL = "PEGA_AQUI_EL_CSV_REAL";

const OFFER_CHANNELS = ["ID_CANAL_1"];
const OFFER_INTERVAL = 1000 * 60 * 30;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let products = [];
let cursor = 0;

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
// PARSE CSV ROBUSTO
// ==========================
function parseCSV(text) {
  let parsed = Papa.parse(text, { skipEmptyLines: true });

  // si solo hay 1 columna → usar ;
  if (parsed.data[0]?.length === 1) {
    parsed = Papa.parse(text, {
      delimiter: ";",
      skipEmptyLines: true
    });
  }

  return parsed.data;
}

// ==========================
// CARGAR PRODUCTOS
// ==========================
async function fetchProducts() {
  try {
    console.log("🔄 Descargando CSV...");
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();

    const rows = parseCSV(csv);

    console.log("🧪 COLUMNAS:", rows[0]?.length);
    console.log("🧪 TOTAL FILAS:", rows.length);

    const data = rows.slice(1); // quitar headers

    products = data
      .map(r => ({
        photo: clean(r[0]),
        name: clean(r[1]),
        price: clean(r[2]),
        kakobuy: clean(r[3]),
        usfans: clean(r[4]),
        cnfans: clean(r[5]),
        category: clean(r[6]).toLowerCase()
      }))
      .filter(p => p.name && p.photo);

    console.log("✅ PRODUCTOS CARGADOS:", products.length);
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

  if (p.usfans?.startsWith("http"))
    row.addComponents(new ButtonBuilder().setLabel("USFANS").setStyle(ButtonStyle.Link).setURL(p.usfans));

  if (p.cnfans?.startsWith("http"))
    row.addComponents(new ButtonBuilder().setLabel("CNFANS").setStyle(ButtonStyle.Link).setURL(p.cnfans));

  if (p.kakobuy?.startsWith("http"))
    row.addComponents(new ButtonBuilder().setLabel("Kakobuy").setStyle(ButtonStyle.Link).setURL(p.kakobuy));

  return row.components.length ? [row] : [];
}

// ==========================
// ENVIO
// ==========================
async function sendOffer() {
  if (!products.length) {
    console.log("⚠️ NO PRODUCTS");
    return;
  }

  const p = products[cursor++ % products.length];
  console.log("📤 Enviando:", p.name);

  for (const id of OFFER_CHANNELS) {
    const ch = await client.channels.fetch(id);
    if (ch) {
      await ch.send({ embeds: [embed(p)], components: buttons(p) });
    }
  }
}

// ==========================
// READY
// ==========================
client.once("ready", async () => {
  console.log("🔥 BOT ONLINE");
  await fetchProducts();

  sendOffer(); // forzado
  setInterval(sendOffer, OFFER_INTERVAL);
});

// ==========================
// COMANDOS
// ==========================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (msg.content === "!oferta") {
    if (!products.length) return msg.reply("❌ No hay productos");
    const p = products[Math.floor(Math.random() * products.length)];
    return msg.channel.send({ embeds: [embed(p)], components: buttons(p) });
  }

  if (msg.content === "!ping") {
    msg.reply("✅ Vivo");
  }
});

client.login(TOKEN);
