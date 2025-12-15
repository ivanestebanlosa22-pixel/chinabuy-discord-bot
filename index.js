require("dotenv").config();

const { google } = require("googleapis");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require("discord.js");

// ==========================
// CONFIG
// ==========================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_RANGE = "MAIN!A:H";

// IDs de canales (TUS IDs)
const OFFER_CHANNEL_ID = "1447213635889004648";
const WELCOME_CHANNEL_ID = "1447213627995197622";

// Intervalo de ofertas (cada 2 horas)
const OFFER_INTERVAL = parseInt(process.env.OFFER_INTERVAL) || 1000 * 60 * 120;

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ==========================
// ESTADO
// ==========================

let productos = [];
let filaActual = 0;
let stats = {
  productosEnviados: 0,
  miembrosTotal: 0,
  comandosUsados: 0,
  inicioBot: new Date()
};

// ==========================
// GOOGLE AUTH
// ==========================

async function getAuthClient() {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS;
  if (!credentialsJSON) {
    throw new Error("GOOGLE_CREDENTIALS no configurado");
  }
  const credentials = JSON.parse(credentialsJSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
}

// ==========================
// CARGAR PRODUCTOS
// ==========================

async function cargarProductos() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE
    });

    const filas = res.data.values || [];
    productos = filas.slice(1).filter(p => p[0] && p[1]);

    console.log("Productos cargados:", productos.length);
    return productos.length;
  } catch (error) {
    console.error("Error cargando productos:", error.message);
    return 0;
  }
}

// ==========================
// UTILIDADES
// ==========================

function clean(v) {
  if (!v) return "";
  return String(v).replace(/^_+|_+$/g, "").trim();
}

function getRandomProduct() {
  if (!productos.length) return null;
  return productos[Math.floor(Math.random() * productos.length)];
}

// ==========================
// EMBEDS
// ==========================

function crearEmbedProducto(p, tipo) {
  if (!tipo) tipo = "oferta";

  return new EmbedBuilder()
    .setColor(tipo === "oferta" ? 0x00ff00 : 0x0ea5e9)
    .setTitle(clean(p[1]))
    .setDescription(
      "💰 **Precio:** " + clean(p[2]) +
      "\n\n✨ **Máxima calidad garantizada**"
    )
    .setImage(clean(p[0]))
    .setFooter({
      text: tipo === "oferta"
        ? "🔥 Oferta exclusiva"
        : "ChinaBuyHub - Productos de calidad"
    })
    .setTimestamp();
}

function crearBotonesProducto(p) {
  const row = new ActionRowBuilder();

  const agentes = [
    { label: "🛒 Comprar en USFans", url: clean(p[4]) },
    { label: "🛒 Comprar en Kakobuy", url: clean(p[3]) },
    { label: "🛒 Comprar en CNFans", url: clean(p[5]) }
  ];

  agentes.forEach(a => {
    if (a.url && a.url.startsWith("http")) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel(a.label)
          .setStyle(ButtonStyle.Link)
          .setURL(a.url)
      );
    }
  });

  return row.components.length ? [row] : [];
}

// ==========================
// ENVIAR OFERTA
// ==========================

async function enviarOferta() {
  if (!productos.length) {
    console.log("No hay productos disponibles");
    return;
  }

  if (filaActual >= productos.length) {
    filaActual = 0;
    await cargarProductos();
  }

  const p = productos[filaActual++];

  try {
    const channel = await client.channels.fetch(OFFER_CHANNEL_ID);
    if (!channel) return;

    const mensaje = await channel.send({
      content:
        "🔥 **¡NUEVA OFERTA!** 🔥\n\n" +
        "👉 **Nuevo usuario:** Regístrate y obtén hasta **800€ en bonos**\n" +
        "🎁 https://www.usfans.com/register?ref=RCGD5Y",
      embeds: [crearEmbedProducto(p, "oferta")],
      components: crearBotonesProducto(p)
    });

    await mensaje.react("🔥");
    await mensaje.react("❤️");

    stats.productosEnviados++;
  } catch (error) {
    console.error("Error enviando oferta:", error.message);
  }
}

// ==========================
// COMANDOS
// ==========================

const comandos = {
  "!producto": async (msg) => {
    const p = getRandomProduct();
    if (!p) return msg.reply("❌ No hay productos disponibles");

    await msg.reply({
      embeds: [crearEmbedProducto(p, "busqueda")],
      components: crearBotonesProducto(p)
    });

    stats.comandosUsados++;
  },

  "!stats": async (msg) => {
    const uptime = Math.floor((Date.now() - stats.inicioBot) / 60000);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("📊 Estadísticas del Bot")
      .addFields(
        { name: "📦 Productos", value: String(productos.length), inline: true },
        { name: "🔥 Ofertas", value: String(stats.productosEnviados), inline: true },
        { name: "⚡ Comandos", value: String(stats.comandosUsados), inline: true },
        { name: "⏱️ Uptime", value: uptime + " min", inline: true }
      )
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
    stats.comandosUsados++;
  },

  "!ping": async (msg) => {
    await msg.reply("🏓 Pong: " + client.ws.ping + "ms");
  }
};

// ==========================
// BOT LISTO (SIN ADVERTENCIA)
// ==========================

client.once("clientReady", async () => {
  console.log("BOT ONLINE:", client.user.tag);

  client.user.setPresence({
    activities: [{ name: "!ayuda | ChinaBuyHub", type: ActivityType.Watching }],
    status: "online"
  });

  await cargarProductos();

  setTimeout(enviarOferta, 5000);
  setInterval(enviarOferta, OFFER_INTERVAL);
});

// ==========================
// BIENVENIDA
// ==========================

client.on("guildMemberAdd", async member => {
  try {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel) return;

    await channel.send(`👋 Bienvenido ${member}`);
  } catch (e) {
    console.error("Error bienvenida:", e.message);
  }
});

// ==========================
// MENSAJES
// ==========================

client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  const args = msg.content.trim().split(/\s+/);
  const comando = args.shift().toLowerCase();

  if (comandos[comando]) {
    try {
      await comandos[comando](msg, args);
    } catch (e) {
      console.error("Error comando:", e.message);
    }
  }
});

// ==========================
// LOGIN
// ==========================

client.login(DISCORD_TOKEN);
