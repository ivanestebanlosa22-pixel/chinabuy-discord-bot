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

// IDs de canales (configura estos IDs)
const OFFER_CHANNEL_ID = process.env.OFFER_CHANNEL_ID || "PEGA_ID_CANAL_OFERTAS";
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || "PEGA_ID_CANAL_BIENVENIDA";

// Intervalo de ofertas (cada 2 horas por defecto)
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
    
    console.log("Productos cargados: " + productos.length);
    return productos.length;
  } catch (error) {
    console.error("Error cargando productos: " + error.message);
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
// CREAR EMBED DE PRODUCTO
// ==========================

function crearEmbedProducto(p, tipo) {
  if (!tipo) tipo = "oferta";
  
  const embed = new EmbedBuilder()
    .setColor(tipo === "oferta" ? 0x00ff00 : 0x0ea5e9)
    .setTitle(clean(p[1]))
    .setDescription("💰 **Precio:** " + clean(p[2]) + "\n\n✨ **Máxima calidad garantizada**")
    .setImage(clean(p[0]))
    .setFooter({ 
      text: tipo === "oferta" ? "🔥 Oferta exclusiva" : "ChinaBuyHub - Productos de calidad"
    })
    .setTimestamp();
  
  return embed;
}

function crearBotonesProducto(p) {
  const row = new ActionRowBuilder();
  
  const agentes = [
    { label: "🛒 Comprar en USFans", url: clean(p[4]) },
    { label: "🛒 Comprar en Kakobuy", url: clean(p[3]) },
    { label: "🛒 Comprar en CNFans", url: clean(p[5]) }
  ];
  
  agentes.forEach(agente => {
    if (agente.url && agente.url.startsWith("http")) {
      const btn = new ButtonBuilder()
        .setLabel(agente.label)
        .setStyle(ButtonStyle.Link)
        .setURL(agente.url);
      row.addComponents(btn);
    }
  });
  
  return row.components.length ? [row] : [];
}

// ==========================
// ENVIAR OFERTA AUTOMÁTICA
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
    if (!channel) {
      console.error("Canal de ofertas no encontrado");
      return;
    }
    
    const mensaje = await channel.send({
      content: "🔥 **¡NUEVA OFERTA!** 🔥\n\n👉 **Nuevo usuario:** Regístrate y obtén hasta **800€ en bonos**\n🎁 [Registrarse en USFans](https://www.usfans.com/register?ref=RCGD5Y)",
      embeds: [crearEmbedProducto(p, "oferta")],
      components: crearBotonesProducto(p)
    });
    
    try {
      await mensaje.react("🔥");
      await mensaje.react("❤️");
    } catch (err) {
      console.log("No se pudieron añadir reacciones");
    }
    
    stats.productosEnviados++;
    console.log("Oferta enviada: " + clean(p[1]) + " (Total: " + stats.productosEnviados + ")");
    
  } catch (error) {
    console.error("Error enviando oferta: " + error.message);
  }
}

// ==========================
// COMANDOS
// ==========================

const comandos = {
  
  "!producto": async (msg) => {
    const p = getRandomProduct();
    if (!p) {
      return msg.reply("❌ No hay productos disponibles");
    }
    
    await msg.reply({
      embeds: [crearEmbedProducto(p, "busqueda")],
      components: crearBotonesProducto(p)
    });
    stats.comandosUsados++;
  },
  
  "!buscar": async (msg, args) => {
    if (!args.length) {
      return msg.reply("❌ Usa: `!buscar nombre_producto`\nEjemplo: `!buscar jordan`");
    }
    
    const busqueda = args.join(" ").toLowerCase();
    const resultados = productos.filter(p => 
      clean(p[1]).toLowerCase().includes(busqueda)
    );
    
    if (!resultados.length) {
      return msg.reply("❌ No encontré productos con \"" + busqueda + "\"\n💡 Prueba con otro término o usa `!producto` para ver uno aleatorio");
    }
    
    const p = resultados[0];
    await msg.reply({
      content: "✅ Encontré **" + resultados.length + "** resultado(s) para \"" + busqueda + "\":",
      embeds: [crearEmbedProducto(p, "busqueda")],
      components: crearBotonesProducto(p)
    });
    stats.comandosUsados++;
  },
  
  "!guia": async (msg) => {
    const guiaEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("📚 Guía de Compra - ChinaBuyHub")
      .setDescription("**¿Cómo comprar en agentes chinos?**\n\nSigue estos pasos:")
      .addFields(
        { 
          name: "1️⃣ Regístrate", 
          value: "[Crear cuenta en USFans](https://www.usfans.com/register?ref=RCGD5Y)\n🎁 Obtén hasta 800€ en bonos de bienvenida" 
        },
        { 
          name: "2️⃣ Encuentra tu producto", 
          value: "Usa `!producto` o `!buscar` para ver productos\nCopia el link del agente que prefieras" 
        },
        { 
          name: "3️⃣ Realiza tu pedido", 
          value: "Pega el link en tu agente y completa el pedido\nEllos compran por ti en China" 
        },
        { 
          name: "4️⃣ Envío internacional", 
          value: "Cuando llegue a su almacén, ellos te lo envían\nSuele tardar 10-20 días" 
        }
      )
      .addFields(
        {
          name: "💰 Agentes Recomendados",
          value: "⭐ **USFans** (código: RCGD5Y)\n🔹 **CNFans** (código: 5267649)\n🔹 **Kakobuy** (código: hc9hz)"
        },
        {
          name: "🌐 Más información",
          value: "[Visita ChinaBuyHub](https://www.chinabuyhub.com/)"
        }
      )
      .setFooter({ text: "¿Dudas? Pregunta en el servidor" });
    
    await msg.reply({ embeds: [guiaEmbed] });
    stats.comandosUsados++;
  },
  
  "!stats": async (msg) => {
    const uptime = Math.floor((Date.now() - stats.inicioBot) / 1000 / 60);
    const guild = msg.guild;
    
    const statsEmbed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("📊 Estadísticas del Bot")
      .addFields(
        { name: "👥 Miembros", value: String(guild.memberCount), inline: true },
        { name: "📦 Productos", value: String(productos.length), inline: true },
        { name: "🔥 Ofertas enviadas", value: String(stats.productosEnviados), inline: true },
        { name: "⚡ Comandos usados", value: String(stats.comandosUsados), inline: true },
        { name: "⏱️ Uptime", value: uptime + " minutos", inline: true },
        { name: "📡 Ping", value: client.ws.ping + "ms", inline: true }
      )
      .setFooter({ text: "ChinaBuyHub Bot" })
      .setTimestamp();
    
    await msg.reply({ embeds: [statsEmbed] });
    stats.comandosUsados++;
  },
  
  "!ayuda": async (msg) => {
    const ayudaEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🤖 Comandos Disponibles")
      .setDescription("**Lista de comandos de ChinaBuyHub Bot:**")
      .addFields(
        { name: "!producto", value: "Ver un producto aleatorio" },
        { name: "!buscar <nombre>", value: "Buscar producto específico\nEj: `!buscar jordan`" },
        { name: "!guia", value: "Ver guía de compra completa" },
        { name: "!stats", value: "Estadísticas del bot y servidor" },
        { name: "!ping", value: "Ver latencia del bot" },
        { name: "!ayuda", value: "Mostrar este mensaje" }
      )
      .addFields({
        name: "🎁 Códigos de descuento",
        value: "**USFans:** RCGD5Y\n**CNFans:** 5267649\n**Kakobuy:** hc9hz"
      })
      .setFooter({ text: "Usa los comandos en cualquier canal" });
    
    await msg.reply({ embeds: [ayudaEmbed] });
    stats.comandosUsados++;
  },
  
  "!ping": async (msg) => {
    const ping = client.ws.ping;
    const embed = new EmbedBuilder()
      .setColor(ping < 100 ? 0x00ff00 : ping < 200 ? 0xffa500 : 0xff0000)
      .setTitle("🏓 Pong!")
      .setDescription("**Latencia:** " + ping + "ms")
      .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
    stats.comandosUsados++;
  }
};

// ==========================
// EVENTO: BOT LISTO
// ==========================

client.once("ready", async () => {
  console.log("===========================================");
  console.log("   BOT DISCORD ONLINE");
  console.log("   Usuario: " + client.user.tag);
  console.log("   Servidores: " + client.guilds.cache.size);
  console.log("===========================================");
  
  client.user.setPresence({
    activities: [{ name: "!ayuda | ChinaBuyHub", type: ActivityType.Watching }],
    status: "online"
  });
  
  const total = await cargarProductos();
  console.log("Productos listos: " + total);
  
  client.guilds.cache.forEach(guild => {
    stats.miembrosTotal += guild.memberCount;
  });
  
  setTimeout(enviarOferta, 5000);
  
  setInterval(enviarOferta, OFFER_INTERVAL);
  console.log("Ofertas automaticas cada " + (OFFER_INTERVAL / 1000 / 60) + " minutos");
  
  setInterval(cargarProductos, 1000 * 60 * 60 * 6);
});

// ==========================
// EVENTO: NUEVO MIEMBRO
// ==========================

client.on("guildMemberAdd", async (member) => {
  try {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel) return;
    
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("¡Bienvenido/a " + member.user.username + "! 🎉")
      .setDescription(
        "Gracias por unirte a **ChinaBuyHub**\n\n" +
        "🛍️ Aquí encontrarás las mejores ofertas en réplicas\n" +
        "📱 Usa `!ayuda` para ver todos los comandos\n" +
        "🎁 Usa `!guia` para aprender a comprar\n\n" +
        "🔥 ¡Disfruta de nuestras ofertas exclusivas!"
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: "Miembro #" + member.guild.memberCount })
      .setTimestamp();
    
    await channel.send({ 
      content: member.toString(), 
      embeds: [welcomeEmbed] 
    });
    
    stats.miembrosTotal++;
  } catch (error) {
    console.error("Error mensaje bienvenida: " + error.message);
  }
});

// ==========================
// EVENTO: MENSAJES
// ==========================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  
  const args = msg.content.trim().split(/\s+/);
  const comando = args.shift().toLowerCase();
  
  if (comandos[comando]) {
    try {
      await comandos[comando](msg, args);
    } catch (error) {
      console.error("Error ejecutando " + comando + ": " + error.message);
      msg.reply("❌ Hubo un error ejecutando el comando. Inténtalo de nuevo.");
    }
  }
});

// ==========================
// MANEJO DE ERRORES
// ==========================

client.on("error", error => {
  console.error("Error del cliente: " + error.message);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection: " + error.message);
});

// ==========================
// LOGIN
// ==========================

client.login(DISCORD_TOKEN).catch(error => {
  console.error("Error de login: " + error.message);
  process.exit(1);
});
