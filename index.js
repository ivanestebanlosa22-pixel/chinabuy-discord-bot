require("dotenv").config();

// =========================
// ChinaBuyHub VIP Discord Bot
// =========================

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const fetch = require("node-fetch");

// =========================
// CONFIG
// =========================

// TOKEN DEL BOT (Railway variable)
const TOKEN = process.env.DISCORD_TOKEN;

// CSV de Google Sheets
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcxnsKB9c1Zy9x3ajJw4cIm8-kgwHtEBj_LTqcSLpXtpltKMTqUdkg8XaOgNJunfVHyRnlTvqOxlap/pub?output=csv";

// Nombres de canales
const CHANNEL_CATALOG = "catalog";
const CHANNEL_TOP = "top-products";
const CHANNEL_OFFERS = "offers";
const CHANNEL_CHAT = "chat";

// Configuración inicial
const INITIAL_CATALOG_COUNT = 50;
const INITIAL_TOP_COUNT = 5;

// Roles automáticos
const ROLE_CONFIG = [
  { name: "Activo 🟢", threshold: 10 },
  { name: "Colaborador 🔥", threshold: 30 },
  { name: "VIP 💎", threshold: 100 },
];

// =========================
// CSV PRO PARSER
// =========================

function parseCSVRow(row) {
  const cols = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"' && row[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cols.push(current.trim());
  return cols;
}

// =========================
// VARIABLES DEL BOT
// =========================

let products = [];
let offersIndex = 0;
let seedDone = false;
let dailyIndex = 0;
let guildGlobal = null;

const activityMap = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

// =========================
// CARGAR PRODUCTOS
// =========================

async function fetchProductsFromSheet() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();

    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const header = parseCSVRow(lines[0]).map((h) =>
      h.trim().replace(/(^\"|\"$)/g, "")
    );

    const idxFoto = header.indexOf("foto");
    const idxNombre = header.indexOf("nombre");
    const idxPrecio = header.indexOf("precio");
    const idxKakobuy = header.indexOf("LINK kakobuy");
    const idxUsfans = header.indexOf("link usfans");
    const idxCnfans = header.indexOf("link de cnfans");
    const idxCategoria = header.indexOf("CATEGRIAS");

    products = lines.slice(1).map((row) => {
      const cols = parseCSVRow(row);

      const get = (idx) =>
        idx >= 0 && idx < cols.length
          ? cols[idx].trim().replace(/(^\"|\"$)/g, "")
          : "";

      return {
        photo: get(idxFoto),
        name: get(idxNombre),
        price: get(idxPrecio),
        kakobuy: get(idxKakobuy),
        usfans: get(idxUsfans),
        cnfans: get(idxCnfans),
        category: get(idxCategoria)
          .replace(/[\n\r\t]/g, "")
          .trim()
          .toLowerCase(),
      };
    });

    console.log(`✅ Productos cargados: ${products.length}`);
  } catch (err) {
    console.log("❌ Error leyendo CSV:", err.message);
  }
}

// =========================
// HELPERS DE EMBEDS
// =========================

function buildProductEmbed(p, { emphasizeTop = false } = {}) {
  return new EmbedBuilder()
    .setColor(0x111827)
    .setTitle(emphasizeTop ? `💎 ${p.name}` : `🛍️ ${p.name}`)
    .setDescription(
      (p.category ? `🏷️ **${p.category.toUpperCase()}**\n` : "") +
        (p.price ? `💰 **${p.price}**` : "")
    )
    .setImage(p.photo)
    .setFooter({
      text: "Recomendación basada en catálogo curado y estándares de la comunidad.",
    });
}

function buildProductButtons(p) {
  const row = new ActionRowBuilder();

  if (p.usfans?.startsWith("http"))
    row.addComponents(
      new ButtonBuilder()
        .setLabel("USFANS (recomendado)")
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

// =========================
// SEMILLA INICIAL
// =========================

async function seedInitialContent(guild) {
  if (seedDone || !products.length) return;

  const catalog = guild.channels.cache.find((c) => c.name === CHANNEL_CATALOG);
  const top = guild.channels.cache.find((c) => c.name === CHANNEL_TOP);

  if (!catalog || !top) return;

  console.log("🌱 Iniciando carga inicial...");

  for (const p of products.slice(0, INITIAL_TOP_COUNT)) {
    await top.send({
      embeds: [buildProductEmbed(p, { emphasizeTop: true })],
      components: buildProductButtons(p),
    });
  }

  for (const p of products.slice(0, INITIAL_CATALOG_COUNT)) {
    await catalog.send({
      embeds: [buildProductEmbed(p)],
      components: buildProductButtons(p),
    });
  }

  seedDone = true;
  console.log("✅ Semilla completada");
}

// =========================
// PUBLICACIÓN AUTOMÁTICA
// =========================

async function sendNextOffer(guild) {
  if (!products.length) return;
  const ch = guild.channels.cache.find((c) => c.name === CHANNEL_OFFERS);
  if (!ch) return;

  const p = products[offersIndex % products.length];
  offersIndex++;

  await ch.send({
    content: "💸 **OFERTA PREMIUM**",
    embeds: [buildProductEmbed(p, { emphasizeTop: true })],
    components: buildProductButtons(p),
  });
}

async function sendDailyHighlight(guild) {
  if (!products.length) return;
  const ch = guild.channels.cache.find((c) => c.name === CHANNEL_TOP);
  if (!ch) return;

  const p = products[dailyIndex % products.length];
  dailyIndex++;

  await ch.send({
    content: "📆 **Producto destacado del día**",
    embeds: [buildProductEmbed(p, { emphasizeTop: true })],
    components: buildProductButtons(p),
  });
}

async function sendMotivation(guild) {
  const ch = guild.channels.cache.find((c) => c.name === CHANNEL_CHAT);
  if (!ch) return;

  const messages = [
    "🧠 Comprar inteligente > comprar impulsivo.",
    "💡 Buena réplica = buena información.",
    "🛡️ Seguridad primero siempre.",
    "🎯 No es comprar más, es comprar mejor.",
  ];

  await ch.send(messages[Math.floor(Math.random() * messages.length)]);
}

async function sendNews(guild) {
  const ch = guild.channels.cache.find((c) => c.name === CHANNEL_CHAT);
  if (!ch) return;

  const updates = [
    "📢 Tip: revisa siempre bien las fotos QC.",
    "📢 Info: guarda capturas de tus chats con agentes.",
    "📢 Consejo: empieza con algo pequeño en tu primer pedido.",
  ];

  await ch.send(updates[Math.floor(Math.random() * updates.length)]);
}

// =========================
// ROLES AUTOMÁTICOS
// =========================

async function ensureRoles(guild) {
  for (const cfg of ROLE_CONFIG) {
    let role = guild.roles.cache.find((r) => r.name === cfg.name);
    if (!role) {
      await guild.roles.create({
        name: cfg.name,
        color: "Random",
      });
    }
  }
}

async function handleActivity(message) {
  const member = message.member;
  if (!member || member.user.bot) return;

  const key = member.id;
  const count = (activityMap.get(key) || 0) + 1;

  activityMap.set(key, count);

  for (const cfg of ROLE_CONFIG) {
    if (count === cfg.threshold) {
      const role = message.guild.roles.cache.find((r) => r.name === cfg.name);
      if (role) await member.roles.add(role).catch(() => {});
    }
  }
}

// =========================
// COMANDOS
// =========================

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!")) return;
  if (message.author.bot) return;

  await handleActivity(message);

  const args = message.content.slice(1).split(" ");
  const command = args.shift().toLowerCase();

  if (command === "buscar") {
    const term = args.join(" ").toLowerCase();
    if (!term) return message.reply("🔎 Usa: `!buscar <texto>`");

    const results = products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term)
      )
      .slice(0, 5);

    if (!results.length)
      return message.reply(`❌ Sin resultados para: **${term}**`);

    for (const p of results) {
      await message.channel.send({
        embeds: [buildProductEmbed(p)],
        components: buildProductButtons(p),
      });
    }
  }

  if (command === "categoria") {
    const cat = args.join(" ").toLowerCase().trim();
    if (!cat) return message.reply("🏷️ Usa: `!categoria <nombre>`");

    const results = products
      .filter((p) => p.category.includes(cat))
      .slice(0, 5);

    if (!results.length)
      return message.reply(`❌ No se encontraron productos en: **${cat}**`);

    for (const p of results) {
      await message.channel.send({
        embeds: [buildProductEmbed(p)],
        components: buildProductButtons(p),
      });
    }
  }
});

// =========================
// READY
// =========================

client.once("ready", async () => {
  console.log(`🔥 Bot conectado como: ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  guildGlobal = guild;

  await ensureRoles(guild);
  await fetchProductsFromSheet();

  // Semilla inicial
  const interval = setInterval(async () => {
    if (seedDone) return clearInterval(interval);
    await seedInitialContent(guild);
  }, 30000);

  // Schedulers
  setInterval(() => sendNextOffer(guild), 2 * 60 * 60 * 1000);
  setInterval(() => sendDailyHighlight(guild), 24 * 60 * 60 * 1000);
  setInterval(() => sendMotivation(guild), 6 * 60 * 60 * 1000);
  setInterval(() => sendNews(guild), 12 * 60 * 60 * 1000);

  console.log("✅ Tareas automáticas activadas");
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
