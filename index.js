require("dotenv").config();

// =========================
// ChinaBuyHub VIP Discord Bot
// =========================

const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const fetch = require("node-fetch");

// =========================
// CONFIG
// =========================

// TOKEN DE TU BOT (AHORA SEGURO)
const TOKEN = process.env.DISCORD_TOKEN;

// URL CSV PÚBLICO DE TU GOOGLE SHEET
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcxnsKB9c1Zy9x3ajJw4cIm8-kgwHtEBj_LTqcSLpXtpltKMTqUdkg8XaOgNJunfVHyRnlTvqOxlap/pub?output=csv";

// NOMBRES DE CANAL
const CHANNEL_CATALOG = "catalog";
const CHANNEL_TOP = "top-products";
const CHANNEL_OFFERS = "offers";

// CUÁNTOS PRODUCTOS INICIALES
const INITIAL_CATALOG_COUNT = 50;
const INITIAL_TOP_COUNT = 5;

// =========================
// VARIABLES EN MEMORIA
// =========================

let products = [];
let offersIndex = 0;
let seedDone = false;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// =========================
// LÓGICA GOOGLE SHEETS
// =========================

async function fetchProductsFromSheet() {
    try {
        const res = await fetch(SHEET_CSV_URL);
        const csv = await res.text();

        const lines = csv.split("\n").filter(l => l.trim() !== "");
        if (lines.length < 2) {
            console.log("⚠️ No products found in sheet.");
            return;
        }

        const header = lines[0].split(",").map(h => h.trim().replace(/(^\"|\"$)/g, ""));
        const idxFoto       = header.indexOf("foto");
        const idxNombre     = header.indexOf("nombre");
        const idxPrecio     = header.indexOf("precio");
        const idxKakobuy    = header.indexOf("LINK kakobuy");
        const idxUsfans     = header.indexOf("link usfans");
        const idxCnfans     = header.indexOf("link de cnfans");
        const idxCategoria  = header.indexOf("CATEGRIAS");

        products = lines.slice(1).map(row => {
            const cols = row.split(",");
            const get = idx => idx >= 0 && idx < cols.length ? cols[idx].trim().replace(/(^\"|\"$)/g, "") : "";

            return {
                photo: get(idxFoto),
                name: get(idxNombre),
                price: get(idxPrecio),
                kakobuy: get(idxKakobuy),
                usfans: get(idxUsfans),
                cnfans: get(idxCnfans),
                category: get(idxCategoria),
            };
        }).filter(p => p.name && p.photo);

        console.log(`✅ Loaded ${products.length} products from sheet.`);
    } catch (err) {
        console.error("❌ Error fetching sheet:", err.message);
    }
}

// =========================
// HELPERS
// =========================

function formatProductMessage(p, { emphasizeTop = false } = {}) {
    const titleLine = emphasizeTop
        ? `💎 **TOP PICK – ${p.name}**`
        : `🛍️ **${p.name}**`;

    return (
        `${titleLine}\n\n` +
        (p.category ? `✨ Category: **${p.category}**\n` : "") +
        (p.price ? `💰 Price: **${p.price}**\n\n` : "\n") +
        `🔗 **Purchase options:**\n` +
        (p.usfans ? `🇺🇸 USFANS (recommended): ${p.usfans}\n` : "") +
        (p.cnfans ? `🇨🇳 CNFANS: ${p.cnfans}\n` : "") +
        (p.kakobuy ? `🛒 Kakobuy: ${p.kakobuy}\n` : "") +
        `\n🖼️ Preview:\n${p.photo}\n\n` +
        `🔒 This recommendation is based on curated quality and community standards.`
    );
}

function getTextChannelByName(guild, name) {
    return guild.channels.cache.find(
        ch => ch.type === ChannelType.GuildText && ch.name === name
    );
}

// =========================
// SEMILLA INICIAL
// =========================

async function seedInitialContent(guild) {
    if (seedDone) return;
    if (!products.length) return console.log("⚠️ No products to seed yet.");

    const catalogChannel = getTextChannelByName(guild, CHANNEL_CATALOG);
    const topChannel = getTextChannelByName(guild, CHANNEL_TOP);

    if (!catalogChannel || !topChannel) return console.log("⚠️ Seed skipped: channels not found.");

    console.log("🌱 Seeding initial catalog and top products...");

    const top = products.slice(0, INITIAL_TOP_COUNT);
    for (const p of top) {
        await topChannel.send(formatProductMessage(p, { emphasizeTop: true })).catch(() => {});
    }

    const catalogList = products.slice(0, INITIAL_CATALOG_COUNT);
    for (const p of catalogList) {
        await catalogChannel.send(formatProductMessage(p)).catch(() => {});
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
    if (!channel) return console.log(`⚠️ Offers channel '${CHANNEL_OFFERS}' not found.`);

    const p = products[offersIndex % products.length];
    offersIndex++;

    const msg = `💸 **Premium Offer Highlight**\n\n` + formatProductMessage(p, { emphasizeTop: true });
    await channel.send(msg).catch(() => {});
    console.log(`📤 Offer sent: ${p.name}`);
}

// =========================
// MENSAJES MOTIVACIONALES
// =========================

const motivationMessages = [
    "🧠 **Smart buying beats impulsive buying.**",
    "💡 **Good replicas require good information.**",
    "🛡️ **Safety first.**",
    "🎯 **Your goal is to buy better, not buy more.**",
];

async function sendMotivation(guild) {
    const chat = getTextChannelByName(guild, "chat");
    if (!chat) return;
    const msg = motivationMessages[Math.floor(Math.random() * motivationMessages.length)];
    await chat.send(msg).catch(() => {});
}

// =========================
// READY
// =========================

client.once("ready", async () => {
    console.log(`🔥 Bot logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) return console.log("⚠️ Bot is not in any guild.");

    await fetchProductsFromSheet();

    const seedInterval = setInterval(async () => {
        if (seedDone) return clearInterval(seedInterval);
        await seedInitialContent(guild);
    }, 30000);

    setInterval(() => sendNextOffer(guild), 2 * 60 * 60 * 1000);
    setInterval(() => sendMotivation(guild), 6 * 60 * 60 * 1000);

    console.log("✅ Schedulers active.");
});

// ==========================
// BIENVENIDA AUTOMÁTICA
// ==========================

client.on("guildMemberAdd", member => {
    const channel = member.guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === "welcome"
    );
    if (!channel) return;

    channel.send(
        `🎉 **New member joined: ${member.user.username}**\n\nWelcome to ChinaBuyHub!`
    ).catch(() => {});
});

// ==========================
// LOGIN (SEGURO)
// ==========================

client.login(TOKEN);
