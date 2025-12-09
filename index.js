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

const SHEET_CSV_URL =
  "https://doc-0c-50-sheets.googleusercontent.com/pub/h6sqfrlg9m3sbhs0jjmh9nmhns/j1786hcqekfmhamb874ih5tr24/1765114880000/100573730801597486798/100573730801597486798/e@2PACX-1vRcxnsKB9c1Zy9x3ajJw4cIm8-kgwHtEBj_LTqcSLpXtpltKMTqUdkg8XaOgNJunfVHyRnlTvqOxlap?output=csv";

let products = [];

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// ==========================
// LIMPIEZA DE CAMPOS
// ==========================

function clean(text = "") {
  return String(text)
    .replace(/\r?\n/g, " ") 
    .replace(/""/g, '"')
    .replace(/(^"|"$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ==========================
// CARGAR CSV — AHORA CON PAPAPARSE
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

    products = parsed.data.map((row) => ({
      photo: clean(row["foto"]),
      name: clean(row["nombre"]),
      price: clean(row["precio"]),
      kakobuy: clean(row["LINK kakobuy"]),
      usfans: clean(row[" link usfans"]),
      cnfans: clean(row["link de cnfans"]),
      category: clean(row["CATEGRIAS"]).toLowerCase()
    }));

    products = products.filter((p) => p.name && p.photo);

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
      (p.category ? `🏷️ **${p.category.toUpperCase()}**\n` : "") +
      (p.price ? `💰 **${p.price}**` : "")
    )
    .setImage(p.photo);
}

function buildButtons(p) {
  const row = new ActionRowBuilder();

  if (p.usfans?.startsWith("http"))
    row.addComponents(
      new ButtonBuilder()
        .setLabel("USFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.usfans)
    );

  if (p.cnfans?.startsWith("http"))
    row.addComponents(
      new ButtonBuilder()
        .setLabel("CNFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.cnfans)
    );

  if (p.kakobuy?.startsWith("http"))
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Kakobuy")
        .setStyle(ButtonStyle.Link)
        .setURL(p.kakobuy)
    );

  return [row];
}

// ==========================
// READY
// ==========================

client.once("ready", async () => {
  console.log("🔥 BOT ACTIVO como:", client.user.tag);
  await fetchProducts();
});

// ==========================
// COMANDOS
// ==========================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!")) return;

  const [command, ...args] = msg.content.slice(1).split(" ");

  // !ping
  if (command === "ping") {
    return msg.reply("🏓 Pong! Estoy funcionando.");
  }

  // !buscar
  if (command === "buscar") {
    const term = args.join(" ").toLowerCase().trim();
    if (!term) return msg.reply("🔎 Usa: `!buscar jordan`");

    const results = products
      .filter((p) => p.name.toLowerCase().includes(term))
      .slice(0, 5);

    if (!results.length)
      return msg.reply("❌ No encontré productos con ese nombre.");

    for (const p of results) {
      msg.channel.send({
        embeds: [buildEmbed(p)],
        components: buildButtons(p)
      });
    }
  }

  // !categoria
  if (command === "categoria") {
    const cat = args.join(" ").toLowerCase().trim();
    if (!cat) return msg.reply("🏷️ Usa: `!categoria zapatillas`");

    const results = products
      .filter((p) => p.category.includes(cat))
      .slice(0, 5);

    if (!results.length)
      return msg.reply(`❌ Nada encontrado en la categoría: **${cat}**`);

    for (const p of results) {
      msg.channel.send({
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
