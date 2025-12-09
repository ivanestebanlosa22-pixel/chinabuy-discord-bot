require("dotenv").config();

const fs = require("fs");
const { google } = require("googleapis");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

// ==========================
// CONFIG
// ==========================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Hoja y rango (IGUAL que Telegram)
const SHEET_RANGE = "MAIN!A:H";

// ID(s) de canal de Discord donde mandar ofertas
const OFFER_CHANNELS = [
  "PEGA_AQUI_ID_CANAL_DISCORD"
];

// Cada cuánto enviar (1 hora)
const OFFER_INTERVAL = 1000 * 60 * 60;

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
// ESTADO
// ==========================

let datos = [];
let filaActual = 1;

// ==========================
// GOOGLE AUTH (LEE ARCHIVO)
// ==========================

async function getAuthClient() {
  // Railway File Secret -> variable contiene la RUTA al archivo
  const credentialsPath = process.env.GOOGLE_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error("GOOGLE_CREDENTIALS no existe en Railway");
  }

  const json = fs.readFileSync(credentialsPath, "utf8");
  const credentials = JSON.parse(json);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
}

// ==========================
// LEER SHEET (IGUAL QUE TELEGRAM)
// ==========================

async function cargarDatos() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE
  });

  const filas = res.data.values || [];

  // Quitamos headers
  datos = filas.slice(1);

  console.log("✅ Filas cargadas:", datos.length);
}

// ==========================
// LIMPIEZA
// ==========================

function clean(v = "") {
  return String(v).replace(/^_+|_+$/g, "").trim();
}

// ==========================
// EMBED + BOTONES
// ==========================

function buildEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(clean(p[1]))       // nombre
    .setDescription(`💰 ${clean(p[2])}`) // precio
    .setImage(clean(p[0]))       // foto
    .setFooter({ text: "🔥 Oferta automática" });
}

function buildButtons(p) {
  const row = new ActionRowBuilder();

  // Kakobuy (col 3)
  if (p[3]?.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Kakobuy")
        .setStyle(ButtonStyle.Link)
        .setURL(p[3])
    );
  }

  // USFans (col 4)
  if (p[4]?.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("USFANS")
        .setStyle(ButtonStyle.Link)
        .setURL(p[4])
    );
  }

  // CNFans (col 5)
  if (p[5]?.startsWith("http")) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("CNFans")
        .setStyle(ButtonStyle.Link)
        .setURL(p[5])
    );
  }

  return row.components.length ? [row] : [];
}

// ==========================
// ENVIAR OFERTA
// ==========================

async function enviarOferta() {
  if (!datos.length) {
    console.log("❌ No hay productos");
    return;
  }

  if (filaActual >= datos.length) {
    filaActual = 1;
  }

  const p = datos[filaActual++];
  console.log("📤 Enviando:", clean(p[1]));

  for (const channelId of OFFER_CHANNELS) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      await channel.send({
        embeds: [buildEmbed(p)],
        components: buildButtons(p)
      });
    } catch (e) {
      console.error("❌ Error enviando a canal", channelId, e.message);
    }
  }
}

// ==========================
// READY
// ==========================

client.once("ready", async () => {
  console.log("🔥 BOT DISCORD ONLINE:", client.user.tag);

  try {
    await cargarDatos();

    // Envío inmediato de prueba
    await enviarOferta();

    // Envíos automáticos
    setInterval(enviarOferta, OFFER_INTERVAL);
  } catch (e) {
    console.error("❌ ERROR GENERAL:", e.message);
  }
});

// ==========================
// COMANDOS
// ==========================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (msg.content === "!ping") {
    msg.reply("✅ Vivo");
  }

  if (msg.content === "!oferta") {
    await enviarOferta();
  }
});

// ==========================
// LOGIN
// ==========================

client.login(DISCORD_TOKEN);
