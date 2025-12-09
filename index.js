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

// TOKEN DEL BOT (desde variables de entorno)
const TOKEN = process.env.DISCORD_TOKEN;

// URL CSV PÚBLICO DE TU GOOGLE SHEET
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcxnsKB9c1Zy9x3ajJw4cIm8-kgwHtEBj_LTqcSLpXtpltKMTqUdkg8XaOgNJunfVHyRnlTvqOxlap/pub?output=csv";

// NOMBRES DE CANAL
const CHANNEL_CATALOG = "catalog";
const CHANNEL_TOP = "top-products";
const CHANNEL_OFFERS = "offers";
const CHANNEL_CHAT = "chat";

// CUÁNTOS PRODUCTOS INICIALES
const INITIAL_CATALOG_COUNT = 50;
const INITIAL_TOP_COUNT = 5;

// ROLES AUTOMÁTICOS
const ROLE_CONFIG = [
  { name: "Activo 🟢", threshold: 10 },
  { name: "Colaborador 🔥", threshold: 30 },
  { name: "VIP 💎", threshold: 100 },
];

// =========================
// PARSER CSV PRO
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
// VARIABLES EN MEMORIA
// =========================

let products = [];
let offersIndex = 0;
let seedDone = false;
let dailyIndex = 0;
let guildGlobal = null;
const activityMap = new Map(); // conteo de mensajes por usuario

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// =========================
// LÓGICA GOOGLE SHEETS
// =========================

async function fetchProductsFromSheet() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();

    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) {
      console.log("⚠️ No products found in sheet.");
      return;
    }

    const header = parseCSVRow(lines[0]).map((h) =>
      h.trim().replace(/(^\"|\"$)/g, "")
    );

    const idxFoto = header.indexOf("foto");
    const idxNombre = header.indexOf("nombre");
    const idxPrecio = header.indexOf("precio");
    const idxKakobuy = header.indexOf("LINK kakobuy");
    const idxUsfans = header.indexOf("link usfans"); // OJO: sin espacio inicial
    const idxCnfans = header.indexOf("link de cnfans");
    const idxCategoria = header.indexOf("CATEGRIAS");

    products = lines
      .slice(1)
      .map((row) => {
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
          category: get(idxCategoria),
        };
      })
      .filter((p) => p.name && p.photo);

    console.log(`✅ Loaded ${products.length} products from sheet.`);
  } catch (err) {
    console.error("❌ Error fetching sheet:", err.message);
  }
}

// =========================
// HELPERS
// =========================

function getTextChannelByName(guild, name) {
  return guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildText && ch.name === name
  );
}

function buildProductEmbed(p, { emphasizeTop = false } = {}) {
  const title = emphasizeTop ? `💎 ${p.name}` : `🛍️ ${p.name}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      (p.category ? `🏷️ **${p.category}**\n` : "") +
        (p.price ? `💰 **${p.price}**\n` : "")
    )
    .setColor(0x111827); // estilo catálogo oscuro

  if (p.photo && p.photo.startsWith("http")) {
    embed.setImage(p.photo);
  }

  embed.addFields({
    name: "Compra segura",
    value:
      (p.usfans ? `🇺🇸 USFANS (recomendado)\n` : "") +
      (p.cnfans ? `🇨🇳 CNFANS\n` : "") +
      (p.kakobuy ? `🛒 Kakobuy\n` : "") ||
      "Sin enlaces disponibles.",
  });

  embed.setFooter({
    text:
      "Recomendación basada en catálogo curado y estándares de la comunidad.",
  });

  return embed;
}

function buildProductButtons(p) {
  const buttons = [];

  if (p.usfans && p.usfans.startsWith("http")) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("USFANS (recomendado)")
        .setStyle(ButtonStyle.Link)
        .setURL(p.usfans)
    );
  }

  if (p.cnfans && p.cnfans.startsWith("http")) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("CNFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p.cnfans)
    );
  }

  if (p.kakobuy && p.kakobuy.startsWith("http")) {
    buttons.push(
      new ButtonBuilder()
        .setLabel("Kakobuy")
        .setStyle(ButtonStyle.Link)
        .setURL(p.kakobuy)
    );
  }

  if (!buttons.length) return [];

  const row = new ActionRowBuilder().addComponents(buttons);
  return [row];
}

// =========================
// SEMILLA INICIAL
// =========================

async function seedInitialContent(guild) {
  if (seedDone) return;
  if (!products.length) return console.log("⚠️ No products to seed yet.");

  const catalogChannel = getTextChannelByName(guild, CHANNEL_CATALOG);
  const topChannel = getTextChannelByName(guild, CHANNEL_TOP);

  if (!catalogChannel || !topChannel)
    return console.log("⚠️ Seed skipped: catalog/top channels not found.");

  console.log("🌱 Seeding initial catalog and top products...");

  const top = products.slice(0, INITIAL_TOP_COUNT);
  for (const p of top) {
    const embed = buildProductEmbed(p, { emphasizeTop: true });
    const components = buildProductButtons(p);
    await topChannel
      .send({ embeds: [embed], components })
      .catch(() => {});
  }

  const catalogList = products.slice(0, INITIAL_CATALOG_COUNT);
  for (const p of catalogList) {
    const embed = buildProductEmbed(p);
    const components = buildProductButtons(p);
    await catalogChannel
      .send({ embeds: [embed], components })
      .catch(() => {});
  }

  seedDone = true;
  console.log("✅ Initial seeding done.");
}

// =========================
// OFERTAS CADA 2 HORAS
// =========================

async function sendNextOffer(guild) {
  if (!products.length) return console.log("⚠️ No products for offers.");

  const channel = getTextChannelByName(guild, CHANNEL_OFFERS);
  if (!channel)
    return console.log(`⚠️ Offers channel '${CHANNEL_OFFERS}' not found.`);

  const p = products[offersIndex % products.length];
  offersIndex++;

  const header = "💸 **Premium Offer Highlight**";
  const embed = buildProductEmbed(p, { emphasizeTop: true });
  const components = buildProductButtons(p);

  await channel
    .send({ content: header, embeds: [embed], components })
    .catch(() => {});
  console.log(`📤 Offer sent: ${p.name}`);
}

// =========================
// PRODUCTO DESTACADO DEL DÍA (1 vez cada 24h)
// =========================

async function sendDailyHighlight(guild) {
  if (!products.length) return;
  const topChannel = getTextChannelByName(guild, CHANNEL_TOP);
  if (!topChannel) return;

  const p = products[dailyIndex % products.length];
  dailyIndex++;

  const header = "📆 **Producto destacado del día**";
  const embed = buildProductEmbed(p, { emphasizeTop: true });
  const components = buildProductButtons(p);

  await topChannel
    .send({ content: header, embeds: [embed], components })
    .catch(() => {});
  console.log(`🌟 Daily highlight: ${p.name}`);
}

// =========================
// MENSAJES MOTIVACIONALES & NOTICIAS
// =========================

const motivationMessages = [
  "🧠 *Comprar inteligente > comprar impulsivo.* Tómate tu tiempo, pregunta y usa la comunidad.",
  "💡 *Buena réplica = buena información.* No dudes en pedir segunda opinión.",
  "🛡️ *Primero seguridad.* Si algo huele raro, frena y pregunta.",
  "🎯 *No es comprar más, es comprar mejor.* Calidad y claridad siempre ganan.",
  "📚 *Cada pedido es experiencia.* Compartirla ayuda a que el siguiente no cometa tu error.",
];

const newsMessages = [
  "📢 *Tip rápido:* Revisa siempre bien las fotos QC antes de aceptar un pedido.",
  "📢 *Recordatorio:* Guarda capturas de tus chats y QCs con los agentes.",
  "📢 *Consejo:* Si es tu primer pedido, empieza con algo pequeño para probar.",
  "📢 *Info:* Activa notificaciones en canales de catálogo si no quieres perder ofertas.",
];

async function sendMotivation(guild) {
  const chat = getTextChannelByName(guild, CHANNEL_CHAT);
  if (!chat) return;
  const msg =
    motivationMessages[
      Math.floor(Math.random() * motivationMessages.length)
    ];
  await chat.send(msg).catch(() => {});
}

async function sendNews(guild) {
  const chat = getTextChannelByName(guild, CHANNEL_CHAT);
  if (!chat) return;
  const msg =
    newsMessages[Math.floor(Math.random() * newsMessages.length)];
  await chat.send(msg).catch(() => {});
}

// =========================
// ROLES AUTOMÁTICOS
// =========================

async function ensureRoles(guild) {
  for (const cfg of ROLE_CONFIG) {
    let role = guild.roles.cache.find((r) => r.name === cfg.name);
    if (!role) {
      role = await guild.roles.create({
        name: cfg.name,
        color: "Random",
        reason: "Auto role for activity",
      });
      console.log(`🔧 Created role: ${cfg.name}`);
    }
  }
}

async function handleActivity(message) {
  const { guild, member } = message;
  if (!guild || !member || member.user.bot) return;

  const key = member.id;
  const current = activityMap.get(key) || 0;
  const next = current + 1;
  activityMap.set(key, next);

  for (const cfg of ROLE_CONFIG) {
    if (current < cfg.threshold && next >= cfg.threshold) {
      const role = guild.roles.cache.find((r) => r.name === cfg.name);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
        console.log(
          `🏷️ Assigned role ${cfg.name} to ${member.user.username}`
        );
      }
    }
  }
}

// =========================
// BÚSQUEDA Y CATEGORÍAS
// =========================

function searchProductsByTerm(term) {
  if (!products.length) return [];
  const q = term.toLowerCase();
  return products.filter(
    (p) =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
  );
}

function searchProductsByCategory(cat) {
  if (!products.length) return [];
  const q = cat.toLowerCase();
  return products.filter(
    (p) => p.category && p.category.toLowerCase().includes(q)
  );
}

// =========================
// READY
// =========================

client.once("ready", async () => {
  console.log(`🔥 Bot logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.log("⚠️ Bot is not in any guild.");
    return;
  }

  guildGlobal = guild;

  await ensureRoles(guild);
  await fetchProductsFromSheet();

  // Semilla inicial (intenta varias veces hasta conseguirlo)
  const seedInterval = setInterval(async () => {
    if (seedDone) return clearInterval(seedInterval);
    await seedInitialContent(guild);
  }, 30_000);

  // OFERTAS CADA 2 HORAS
  setInterval(() => {
    if (guildGlobal) sendNextOffer(guildGlobal);
  }, 2 * 60 * 60 * 1000);

  // MOTIVACIÓN CADA 6 HORAS
  setInterval(() => {
    if (guildGlobal) sendMotivation(guildGlobal);
  }, 6 * 60 * 60 * 1000);

  // NOTICIAS / TIPS CADA 12 HORAS
  setInterval(() => {
    if (guildGlobal) sendNews(guildGlobal);
  }, 12 * 60 * 60 * 1000);

  // PRODUCTO DESTACADO CADA 24 HORAS
  setInterval(() => {
    if (guildGlobal) sendDailyHighlight(guildGlobal);
  }, 24 * 60 * 60 * 1000);

  console.log("✅ Schedulers active (offers, motivation, news, daily highlight).");
});

// ==========================
// BIENVENIDA AUTOMÁTICA
// ==========================

client.on("guildMemberAdd", (member) => {
  const channel = member.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === "welcome"
  );
  if (!channel) return;

  channel
    .send(
      `🎉 **New member joined: ${member.user.username}**\n\n` +
        "Welcome to ChinaBuyHub – un espacio privado centrado en compras seguras e inteligentes desde China.\n" +
        "Lee **#rules** y luego preséntate en **#chat**. 🤝"
    )
    .catch(() => {});
});

// ==========================
// COMANDOS (!buscar, !categoria) + actividad
// ==========================

client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;

  // Contador de actividad y roles
  await handleActivity(message);

  const content = message.content.trim();
  if (!content.startsWith("!")) return;

  const [rawCmd, ...args] = content.slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  if (cmd === "buscar") {
    if (!args.length) {
      return message.reply(
        "🔎 Uso: `!buscar <texto>` (por nombre o categoría)"
      );
    }
    const term = args.join(" ");
    if (!products.length) await fetchProductsFromSheet();
    const results = searchProductsByTerm(term).slice(0, 5);

    if (!results.length) {
      return message.reply(
        `❌ No se encontraron productos que coincidan con: **${term}**`
      );
    }

    await message.reply(
      `✅ Encontrados **${results.length}** resultados para: **${term}**`
    );

    for (const p of results) {
      const embed = buildProductEmbed(p);
      const components = buildProductButtons(p);
      await message.channel
        .send({ embeds: [embed], components })
        .catch(() => {});
    }
  }

  if (cmd === "categoria") {
    if (!args.length) {
      return message.reply("🏷️ Uso: `!categoria <nombre>`");
    }
    const cat = args.join(" ");
    if (!products.length) await fetchProductsFromSheet();
    const results = searchProductsByCategory(cat).slice(0, 5);

    if (!results.length) {
      return message.reply(
        `❌ No se encontraron productos en la categoría: **${cat}**`
      );
    }

    await message.reply(
      `✅ Mostrando productos de la categoría: **${cat}**`
    );

    for (const p of results) {
      const embed = buildProductEmbed(p);
      const components = buildProductButtons(p);
      await message.channel
        .send({ embeds: [embed], components })
        .catch(() => {});
    }
  }
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
