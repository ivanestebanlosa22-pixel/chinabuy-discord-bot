require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

// ============================
// CONFIG
// ============================

// Usa una variable de entorno para el token.
// En Railway pondrás DISCORD_TOKEN con el token de ESTE bot.
const TOKEN = process.env.DISCORD_TOKEN;

// IDs de canales
const CANAL_BUSCAR_PRODUCTO_ID = "1513307409517645934";
const CANAL_CONVERTIR_LINK_ID = "1513307457110282400";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,            // info del servidor
    GatewayIntentBits.GuildMessages,     // mensajes
    GatewayIntentBits.MessageContent,    // ver contenido
    GatewayIntentBits.GuildMembers       // miembros
  ]
});

// ============================
// RESPUESTAS BASE
// ============================

function respuestaAgentes() {
  return new EmbedBuilder()
    .setColor(0x0ea5e9)
    .setTitle("🤝 Agentes recomendados y cómo usarlos")
    .setDescription(
      "Aquí tienes una guía rápida de los agentes más usados:\n\n" +
      "🇺🇸 **USFANS** (recomendado):\n" +
      "• Buen soporte, QC claro, pensado para compradores internacionales.\n" +
      "• Ideal si quieres algo más guiado y estable.\n\n" +
      "🇨🇳 **CNFANS**:\n" +
      "• Más flexible, bueno para quien ya controla plataformas chinas.\n" +
      "• Permite optimizar más, pero exige experiencia.\n\n" +
      "🛒 **Kakobuy**:\n" +
      "• Muy usado en la comunidad.\n" +
      "• Siempre revisa bien el QC y no tengas prisa al shippear.\n\n" +
      "✨ Otros (Joyagoo, Litbuy...):\n" +
      "• Úsalos como alternativa, siempre comparando fees, rutas y soporte."
    )
    .setFooter({ text: "Consejo general: empieza con pedidos pequeños y prueba el soporte antes de ir a lo grande." });
}

function respuestaTallas() {
  return new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("📏 Guía rápida de tallas (especial Zapatillas)")
    .setDescription(
      "Algunas pautas para elegir talla en reps:\n\n" +
      "1️⃣ **Nunca te fíes solo de la talla EU/US**, mira los CM.\n" +
      "2️⃣ Mide tu pie descalzo, de talón a punta, en cm.\n" +
      "3️⃣ Compara con la tabla del vendedor o del agente.\n" +
      "4️⃣ Si estás entre dos tallas, muchas veces compensa subir medio número.\n\n" +
      "💡 Consejo extra:\n" +
      "• Si ya tienes unas zapatillas del mismo modelo que te quedan perfectas, usa esa talla como referencia.\n" +
      "• En Jordan 1 y 4, mucha gente va **TTS o +0.5** dependiendo del ancho del pie."
    );
}

function respuestaQC() {
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle("🔍 QC (Quality Check) – Cómo revisar un producto")
    .setDescription(
      "Antes de aprobar un pedido, revisa bien el QC:\n\n" +
      "✅ Comprueba:\n" +
      "• Simetría entre zapatillas\n" +
      "• Colores, formas y proporciones\n" +
      "• Cosidos, pegamento, arrugas raras\n" +
      "• Logos y texto (alineación, grosor, posición)\n\n" +
      "❌ Red flags típicas:\n" +
      "• Fotos muy oscuras o borrosas\n" +
      "• QC incompleto (pocas fotos, ángulos dudosos)\n" +
      "• El agente se niega a mandar fotos extra\n\n" +
      "Si dudas, sube las fotos al canal de QC del servidor y pide opinión antes de aprobar."
    );
}

function respuestaSeguridad() {
  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle("🛡️ Seguridad y estafas – Reglas básicas")
    .setDescription(
      "Para evitar problemas y estafas:\n\n" +
      "• No pagues directamente a vendedores desconocidos.\n" +
      "• Usa siempre agentes y métodos de pago seguros.\n" +
      "• Desconfía de precios **demasiado buenos para ser verdad**.\n" +
      "• No compartas datos personales en canales públicos.\n" +
      "• Guarda capturas de chat, QC y pagos.\n\n" +
      "Si algo te huele raro, pregunta en el servidor antes de pagar."
    );
}

function respuestaAyuda() {
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle("⚙️ FindsES Bot — Help / Ayuda")
    .setDescription(
      "🇪🇸 Aquí tienes la lista de comandos disponibles y dónde puedes utilizarlos para exprimir al máximo nuestras herramientas:\n" +
      "🇺🇸 Here is the list of available commands and where you can use them to get the most out of our tools:\n\n" +
      "🔍 **`!buscar [producto]`**\n" +
      "• 🇪🇸 **Uso:** En el canal #buscar-producto. Busca al instante en nuestra base de datos web.\n" +
      "• 🇺🇸 **Usage:** In the #buscar-producto channel. Search our web database instantly.\n" +
      "• Example: !buscar nike air force\n\n" +
      "🔄 **`!convertir [enlace]`**\n" +
      "• 🇪🇸 **Uso:** En el canal #convertir-link. Convierte cualquier enlace al agente que tú uses.\n" +
      "• 🇺🇸 **Usage:** In the #convertir-link channel. Converts any link to your preferred agent.\n" +
      "• Example: !convertir https://weidian.com/...\n\n" +
      "📋 **`!help`**\n" +
      "• 🇪🇸 Muestra este mensaje de ayuda en el chat.\n" +
      "• 🇺🇸 Shows this help message in the chat."
    );
}

// ============================
// LÓGICA AL MENCIONAR AL BOT
// ============================

function escogerRespuestaPorTexto(textoPlano) {
  const t = textoPlano.toLowerCase();

  if (t.includes("agente") || t.includes("usfans") || t.includes("cnfans") || t.includes("kakobuy")) {
    return respuestaAgentes();
  }

  if (t.includes("talla") || t.includes("size") || t.includes("numero") || t.includes("número")) {
    return respuestaTallas();
  }

  if (t.includes("qc") || t.includes("quality") || t.includes("calidad") || t.includes("legit")) {
    return respuestaQC();
  }

  if (t.includes("estafa") || t.includes("scam") || t.includes("seguridad") || t.includes("seguro")) {
    return respuestaSeguridad();
  }

  return respuestaAyuda();
}

// ============================
// EVENTO READY
// ============================

client.once("ready", () => {
  console.log(`🔥 Helper bot online como: ${client.user.tag}`);
});

// ============================
// MENSAJES
// ============================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // 1) ACTIVACIÓN POR MENCIÓN (lo que tú querías)
  if (message.mentions.has(client.user)) {
    const texto = message.content.replace(/<@!?\d+>/g, "").trim();
    const embed = escogerRespuestaPorTexto(texto);
    return message.reply({ embeds: [embed] });
  }

  // 2) COMANDOS OPCIONALES (por si quieres usarlos)
  if (!message.content.startsWith("!")) return;

  const [cmdRaw, ...args] = message.content.slice(1).split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  if (cmd === "ping") {
    return message.reply("🏓 Estoy vivo y listo para ayudarte.");
  }

  if (cmd === "buscar") {
    if (message.channel.id !== CANAL_BUSCAR_PRODUCTO_ID) {
      return message.reply("⚠️ 🇪🇸 Usa este comando solo en #buscar-producto / 🇺🇸 Use this command only in #buscar-producto");
    }
    return message.reply("🔍 Buscando producto... (conecta aquí tu lógica de búsqueda)");
  }

  if (cmd === "convertir") {
    if (message.channel.id !== CANAL_CONVERTIR_LINK_ID) {
      return message.reply("⚠️ 🇪🇸 Usa este comando solo en #convertir-link / 🇺🇸 Use this command only in #convertir-link");
    }
    return message.reply("🔄 Convirtiendo enlace... (conecta aquí tu lógica de conversión)");
  }

  if (cmd === "ayuda" || cmd === "help") {
    const embed = respuestaAyuda();
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "agentes") {
    const embed = respuestaAgentes();
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "tallas") {
    const embed = respuestaTallas();
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "qc") {
    const embed = respuestaQC();
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "seguridad") {
    const embed = respuestaSeguridad();
    return message.reply({ embeds: [embed] });
  }
});

// ============================
// LOGIN
// ============================

client.login(TOKEN);
