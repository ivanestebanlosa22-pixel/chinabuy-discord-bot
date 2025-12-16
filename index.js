require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

/* =========================
   CONFIG
========================= */

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS;

const CATALOG_CHANNEL_ID = "1447213633368096900";

const WEBSITE_URL = "https://www.chinabuyhub.com/";
const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1fxzvxQBmqgNlR1QkfJRuWVg7ic_nT_5-k_Y4fBPg5bY";
const EXTENSION_URL =
  "https://chromewebstore.google.com/detail/lkbdnacknmpmcojllhlekighhchhknfd";

const SHEET_RANGE = "MAIN!A:H";
const CATALOG_BATCH = 50;
const SEND_DELAY = 1500;

/* =========================
   STATE (PERSISTENT)
========================= */

const STATE_FILE = path.join(__dirname, "state.json");

let state = {
  catalogIndex: 0
};

if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.log("State file corrupted, resetting.");
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* =========================
   DATA
========================= */

let products = [];
let stats = {
  sent: 0,
  commands: 0,
  started: Date.now()
};

/* =========================
   GOOGLE AUTH
========================= */

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
}

/* =========================
   LOAD PRODUCTS
========================= */

async function loadProducts() {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE
    });

    const rows = res.data.values || [];
    products = rows.slice(1).filter(r => r[0] && r[1]);

    console.log(`Products loaded: ${products.length}`);
  } catch (e) {
    console.error("Error loading products:", e.message);
  }
}

/* =========================
   HELPERS
========================= */

const wait = ms => new Promise(r => setTimeout(r, ms));

function productEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle(p[1])
    .setImage(p[0])
    .setDescription(
      `💰 **Price:** ${p[2] || "N/A"}\n\n` +
      `✅ Verified product by **ChinaBuyHub**\n\n` +
      `🔗 **Useful links:**\n` +
      `🌐 [Website](${WEBSITE_URL})\n` +
      `📊 [Spreadsheet](${SPREADSHEET_URL})\n` +
      `🧩 [Chrome Extension](${EXTENSION_URL})`
    )
    .setFooter({ text: "ChinaBuyHub • Community & Tools" })
    .setTimestamp();
}

function productButtons(p) {
  const row = new ActionRowBuilder();
  const links = [
    { label: "🛒 Buy on USFans", url: p[4] },
    { label: "🛒 Buy on Kakobuy", url: p[3] },
    { label: "🛒 Buy on CNFans", url: p[5] }
  ];

  links.forEach(l => {
    if (l.url && l.url.startsWith("http")) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel(l.label)
          .setStyle(ButtonStyle.Link)
          .setURL(l.url)
      );
    }
  });

  return row.components.length ? [row] : [];
}

/* =========================
   SEND CATALOG (NO REPEATS)
========================= */

async function sendCatalog(amount = CATALOG_BATCH) {
  if (!products.length) return;

  const channel = await client.channels.fetch(CATALOG_CHANNEL_ID);
  if (!channel) return;

  let sent = 0;

  while (sent < amount) {
    if (state.catalogIndex >= products.length) {
      state.catalogIndex = 0; // restart only after full cycle
    }

    const p = products[state.catalogIndex];

    await channel.send({
      content: "🛍️ **NEW PRODUCT ADDED TO THE CATALOG**",
      embeds: [productEmbed(p)],
      components: productButtons(p)
    });

    state.catalogIndex++;
    sent++;
    stats.sent++;

    saveState();
    await wait(SEND_DELAY);
  }
}

/* =========================
   COMMANDS
========================= */

client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === "!ping") return msg.reply(`🏓 Pong: ${client.ws.ping}ms`);

  if (cmd === "!catalog") {
    stats.commands++;
    await msg.reply("📦 Sending catalog...");
    return sendCatalog();
  }

  if (cmd === "!product") {
    const p = products[state.catalogIndex];
    if (!p) return msg.reply("No products available.");
    return msg.reply({ embeds: [productEmbed(p)], components: productButtons(p) });
  }

  if (cmd === "!website") return msg.reply(`[Website](${WEBSITE_URL})`);
  if (cmd === "!extension") return msg.reply(`[Chrome Extension](${EXTENSION_URL})`);
  if (cmd === "!spreadsheet") return msg.reply(`[Spreadsheet](${SPREADSHEET_URL})`);

  if (cmd === "!help") {
    return msg.reply(
      "**Available commands:**\n" +
      "`!catalog` – Send next catalog batch\n" +
      "`!product` – Next product\n" +
      "`!website`\n" +
      "`!extension`\n" +
      "`!spreadsheet`\n" +
      "`!ping`"
    );
  }
});

/* =========================
   READY
========================= */

client.once("clientReady", async () => {
  console.log(`Bot online: ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "ChinaBuyHub Catalog", type: ActivityType.Watching }],
    status: "online"
  });

  await loadProducts();
});

/* =========================
   LOGIN
========================= */

client.login(DISCORD_TOKEN);
