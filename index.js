require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fetch = require("node-fetch");

// ==========================
// CONFIG
// ==========================

// Token del bot (Railway)
const TOKEN = process.env.DISCORD_TOKEN;

// Tu nueva URL CSV (muy estable)
const SHEET_CSV_URL =
  "https://doc-0c-50-sheets.googleusercontent.com/pub/h6sqfrlg9m3sbhs0jjmh9nmhns/j1786hcqekfmhamb874ih5tr24/1765114880000/100573730801597486798/100573730801597486798/e@2PACX-1vRcxnsKB9c1Zy9x3ajJw4cIm8-kgwHtEBj_LTqcSLpXtpltKMTqUdkg8XaOgNJunfVHyRnlTvqOxlap?output=csv";

let products = [];

// ==========================
// CLIENT DISCORD — INTENTS CORRECTOS
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
// CSV PARSER ROBUSTO
// ==========================
function parseCSVRow(row) {
  const cols = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const c = row[i];

    if (c === '"' && row[i + 1] === '"') {
      current += '"';
      i++;
    } else if (c === '"') {
      insideQuotes = !insideQuotes;
    } else if (c === "," && !insideQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }

  cols.push(current.trim());
  return cols;
}

// ==========================
// FUNCIÓN DE LIMPIEZA
// ==========================

function clean(text) {
  if (!text) return "";
  return text
    .replace(/\r?\n/g, " ")      // eliminar saltos de línea
    .replace(/""/g, '"')         // desdoblar comillas
    .replace(/(^"|"$)/g, "")     // quitar comillas externas
    .replace(/\s+/g, " ")        // compactar espacios
    .trim();
}

// ==========================
// CARGADOR DE PRODUCTOS
// ==========================

async function fetchProducts() {
  try {
    console.log("🔄 Descargando CSV…");
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();

    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const header = parseCSVRow(clean(lines[0]));

    const idxFoto = header.indexOf("foto");
    const idxNombre = header.indexOf("nombre");
    const idxPrecio = header.indexOf("precio");
    const idxKakobuy = header.indexOf("LINK kakobuy");
    const idxUsfans = header.indexOf(" link usfans");
    const idxCnfans = header.indexOf("link de cnfans");
    const idxCat = header.indexOf("CATEGRIAS");

    products = lines.slice(1).map((line) => {
      const cols = parseCSVRow(line).map(clean);

      const get = (idx) =>
        idx >= 0 && idx < cols.length ? cols[idx] : "";

      return {
        name: clean(get(idxNombre)),
        photo: clean(get(idxFoto)),
        price: clean(get(idxPrecio)),
        kakobuy: clean(get(idxKakobuy)),
        usfans: clean(get(idxUsfans)),
        cnfans: clean(get(idxCnfans)),
        category: clean(get(idxCat)).toLowerCase()
      };
    });

    products = products.filter((p) => p.name && p.photo);

    console.log("✅ Productos cargados correctamente:", products.length);
  } catch (err) {
    console.error("❌ ERROR cargando CSV:", err.message);
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
  console.log("🔥 BOT ONLINE como:", client.user.tag);
  await fetchProducts();
});

// ==========================
// COMANDOS
// ==========================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!")) return;

  const [command, ...args] = msg.content.slice(1).split(" ");

  // ================
  // !ping
  // ================
  if (command === "ping") {
    return msg.reply("🏓 Pong! El bot está funcionando.");
  }

  // ================
  // !buscar
  // ================
  if (command === "buscar") {
    const term = args.join(" ").toLowerCase().trim();

    if (!term) return msg.reply("🔎 Usa: `!buscar jordan`");

    const results = products
      .filter((p) =>
        p.name.toLowerCase().includes(term)
      )
      .slice(0, 5);

    if (!results.length)
      return msg.reply("❌ No encontré productos con ese nombre.");

    for (const p of results) {
      await msg.channel.send({
        embeds: [buildEmbed(p)],
        components: buildButtons(p)
      });
    }
  }

  // ================
  // !categoria
  // ================
  if (command === "categoria") {
    const cat = args.join(" ").toLowerCase().trim();

    if (!cat) return msg.reply("🏷️ Usa: `!categoria zapatillas`");

    const results = products
      .filter((p) => p.category.includes(cat))
      .slice(0, 5);

    if (!results.length)
      return msg.reply(`❌ Nada encontrado en la categoría: **${cat}**`);

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
