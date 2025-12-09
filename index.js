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

// Token del bot (desde Railway)
const TOKEN = process.env.DISCORD_TOKEN;

// Nueva URL CSV que enviaste
const SHEET_CSV_URL =
  "https://doc-0c-50-sheets.googleusercontent.com/pub/h6sqfrlg9m3sbhs0jjmh9nmhns/j1786hcqekfmhamb874ih5tr24/1765114880000/100573730801597486798/100573730801597486798/e@2PACX-1vRcxnsKB9c1Zy9x3ajJw4cIm8-kgwHtEBj_LTqcSLpXtpltKMTqUdkg8XaOgNJunfVHyRnlTvqOxlap?output=csv";

// Lista de productos cargados
let products = [];

// ==========================
// CLIENTE DISCORD — INTENTS CORRECTOS
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
// CSV PARSER
// ==========================
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

// ==========================
// CARGAR CSV
// ==========================

async function fetchProducts() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();

    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const header = parseCSVRow(lines[0]);

    const idxFoto = header.indexOf("foto");
    const idxNombre = header.indexOf("nombre");
    const idxPrecio = header.indexOf("precio");
    const idxKakobuy = header.indexOf("LINK kakobuy");
    const idxUsfans = header.indexOf("link usfans");
    const idxCnfans = header.indexOf("link de cnfans");
    const idxCat = header.indexOf("CATEGRIAS");

    products = lines.slice(1).map((line) => {
      const cols = parseCSVRow(line);

      const get = (idx) =>
        idx >= 0 && idx < cols.length
          ? cols[idx].replace(/(^\"|\"$)/g, "").trim()
          : "";

      return {
        name: get(idxNombre),
        photo: get(idxFoto),
        price: get(idxPrecio),
        kakobuy: get(idxKakobuy),
        usfans: get(idxUsfans),
        cnfans: get(idxCnfans),
        category: get(idxCat).toLowerCase().trim()
      };
    });

    console.log("✅ Productos cargados:", products.length);
  } catch (err) {
    console.log("❌ Error cargando hoja CSV:", err.message);
  }
}

// ==========================
// EMBEDS
// ==========================
function buildEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x111827)
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
  console.log("🔄 Cargando productos…");
  await fetchProducts();
});

// ==========================
// COMANDOS
// ==========================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!")) return;

  const [command, ...args] = msg.content.slice(1).split(" ");

  // --------------------
  // !ping
  // --------------------
  if (command === "ping") {
    return msg.reply("🏓 *Pong!* El bot está vivo y funcionando.");
  }

  // --------------------
  // !buscar
  // --------------------
  if (command === "buscar") {
    const text = args.join(" ").toLowerCase().trim();
    if (!text) return msg.reply("🔎 Usa: `!buscar jordan`");

    const results = products
      .filter((p) => p.name.toLowerCase().includes(text))
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

  // --------------------
  // !categoria
  // --------------------
  if (command === "categoria") {
    const cat = args.join(" ").toLowerCase().trim();
    if (!cat) return msg.reply("🏷️ Usa: `!categoria zapatillas`");

    const results = products
      .filter((p) => p.category.includes(cat))
      .slice(0, 5);

    if (!results.length)
      return msg.reply(`❌ No encontré productos en la categoría: **${cat}**`);

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
