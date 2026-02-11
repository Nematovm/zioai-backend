// ZIYOAI SERVER - GEMINI VERSION

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Tesseract = require('tesseract.js');

// Common Modules
const express = require("express");
// const path = require("path");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@deepgram/sdk");
const fs = require("fs").promises; // ✅ Bu qatorni qo'shing
const pdfParse = require("pdf-parse");
const path = require("path");
// Line ~30 atrofida (global variables bilan):
let articlesCache = null; // ✅ CACHE for vocabulary
let articlesCacheTimestamp = null;
const CACHE_EXPIRY_HOURS = 24; // 24 soat keyin qayta analyze qilsin


// Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;


// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Gemini API call function
async function callGemini(prompt, maxTokens = 4096) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.candidates[0].content.parts[0].text;
}

// ============================================
// 🆓 BEPUL API LARNI BIRLASHTIRISH
// ============================================

// ============================================
// DEEPSEEK R1 API (with reasoning!) ✅
// ============================================
async function callDeepSeekR1(prompt, maxTokens = 16000) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY yo'q");
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: "deepseek-reasoner", // ✅ R1 REASONING MODEL
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3 // Lower = more accurate for math
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  // ✅ R1 returns REASONING + ANSWER
  const reasoning = data.choices[0].message.reasoning_content || "";
  const answer = data.choices[0].message.content;
  
  // Combine reasoning with answer for better explanations
  if (reasoning) {
    console.log("🧠 DeepSeek R1 reasoning:", reasoning.substring(0, 200) + "...");
  }
  
  return answer; // Return just the answer (reasoning is internal)
}

// ============================================
// GROQ API (6000 req/min bepul) ⚡
// ============================================
const Groq = require("groq-sdk");

// ============================================
// GROQ + LLAMA 3.3 70B (BEST FREE!) ⚡
// ============================================
async function callGroq(prompt, maxTokens = 4096) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY yo'q");
  }

  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const chatCompletion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.3-70b-versatile", // ✅ BEST MODEL
    max_tokens: maxTokens,
    temperature: 0.2, // ✅ Lower for math accuracy
    top_p: 0.9
  });

  return chatCompletion.choices[0].message.content;
}

async function callSmartAI(prompt, maxTokens = 4096) {
  // 🥇 PRIORITY 1: DEEPSEEK R1 (best for math + FREE!)
  if (process.env.GROQ_API_KEY) {
    try {
    console.log(`🤖 [1/3] Groq ishga tushirilmoqda (${maxTokens} tokens)...`);
    const result = await callGroq(prompt, maxTokens);
    console.log("✅ Groq muvaffaqiyatli!");
    return result;
  } catch (groqError) {
    console.log("❌ Groq ishlamadi:", groqError.message);
  }
  }

  // 🥈 PRIORITY 2: GEMINI
  try {
    console.log(`🤖 [2/3] Gemini ishga tushirilmoqda (${maxTokens} tokens)...`);
    const result = await callGemini(prompt, maxTokens);
    console.log("✅ Gemini muvaffaqiyatli!");
    return result;
  } catch (geminiError) {
    console.log("⚠️ Gemini ishlamadi:", geminiError.message);
  }

  // 🥉 PRIORITY 3: GROQ
  try {
    console.log(`🤖 [3/3] DeepSeek R1 ishga tushirilmoqda (${maxTokens} tokens)...`);
    const result = await callDeepSeekR1(prompt, maxTokens);
    console.log("✅ DeepSeek R1 muvaffaqiyatli!");
    return result;
  } catch (deepseekError) {
    console.log("⚠️ DeepSeek R1 ishlamadi:", deepseekError.message);
  }
  throw new Error("⚠️ Hozirda barcha AI xizmatlari band.");
}

// ============================================
// RASMLAR BILAN ISHLASH (faqat Gemini) 🖼️
// ============================================
async function callSmartAIWithImage(prompt, base64Image, mediaType) {
  // Rasmlar bilan faqat Gemini ishlaydi
  try {
    console.log("🤖 [IMAGE] Gemini (rasmli) ishga tushirilmoqda...");
    const result = await callGeminiWithImage(prompt, base64Image, mediaType);
    console.log("✅ Gemini (rasmli) muvaffaqiyatli!");
    return result;
  } catch (error) {
    console.error("❌ Gemini (rasmli) ishlamadi:", error.message);
    
    // Rasmlar bilan boshqa API ishlamaydi, shuning uchun foydalanuvchiga xabar beramiz
    if (error.message.includes('quota')) {
      throw new Error("⚠️ Rasmlarni tahlil qilish vaqtincha mavjud emas. Iltimos, matn formatida yuboring yoki keyinroq urinib ko'ring.");
    }
    
    throw error;
  }
}

// ============================================
// OCR - IMAGE TO TEXT (FALLBACK) 🔤
// ============================================
async function extractTextFromImage(base64Image, mediaType) {
  try {
    console.log('🔍 OCR: Converting image to text...');
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Use Tesseract OCR
    const { data: { text } } = await Tesseract.recognize(
      imageBuffer,
      'eng', // Language: English
      {
        logger: m => console.log('OCR Progress:', m)
      }
    );
    
    console.log('✅ OCR extracted text:', text.substring(0, 100) + '...');
    return text.trim();
    
  } catch (error) {
    console.error('❌ OCR error:', error);
    throw new Error('Rasmdan matn ajratib olinmadi. Iltimos, aniqroq rasm yuklang.');
  }
}

// ============================================
// SMART IMAGE PROCESSING WITH FALLBACK 🧠
// ============================================
async function processImageWithFallback(prompt, base64Image, mediaType) {
  // 1️⃣ TRY GEMINI (with image)
  try {
    console.log('🤖 [1/2] Trying Gemini with image...');
    const result = await callGeminiWithImage(prompt, base64Image, mediaType);
    console.log('✅ Gemini (image) successful!');
    return result;
  } catch (geminiError) {
    console.error('⚠️ Gemini (image) failed:', geminiError.message);
    
    // 2️⃣ FALLBACK: OCR + DeepSeek/Groq
    try {
      console.log('🔄 [2/2] Falling back to OCR + Text AI...');
      
      // Extract text from image
      const extractedText = await extractTextFromImage(base64Image, mediaType);
      
      if (!extractedText || extractedText.length < 10) {
        throw new Error('Rasmdan matn aniqlanmadi. Iltimos, tozaroq rasm yuklang yoki matn ko\'rinishida yuboring.');
      }
      
      // Add extracted text to prompt
      const enhancedPrompt = `${prompt}\n\n📸 RASMDAGI MATN (OCR orqali aniqlandi):\n${extractedText}`;
      
      // Use text-based AI (DeepSeek or Groq)
      const result = await callSmartAI(enhancedPrompt, 4096);
      console.log('✅ OCR + Text AI successful!');
      
      return result;
      
    } catch (ocrError) {
      console.error('❌ OCR fallback failed:', ocrError.message);
      throw new Error(
        '⚠️ Rasmni tahlil qilishda xatolik yuz berdi.\n\n' +
        '📝 Iltimos, quyidagilardan birini qiling:\n' +
        '1️⃣ Vazifani MATN ko\'rinishida yuboring\n' +
        '2️⃣ Aniqroq/tozaroq rasm yuklang\n' +
        '3️⃣ Keyinroq qayta urinib ko\'ring'
      );
    }
  }
}

// Gemini with image
async function callGeminiWithImage(prompt, base64Image, mediaType) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Image } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.candidates[0].content.parts[0].text;
}

// CORS MIDDLEWARE - FIXED ✅
app.use(
  cors({
    origin: [
      "https://ziyo-ai.uz",              // ✅ PRODUCTION DOMAIN
      "https://www.ziyo-ai.uz",          // ✅ WWW VERSION
      "https://zioai-frontend.onrender.com",
      "http://localhost:3000",
      "http://127.0.0.1:5500",
      "http://127.0.0.1:5501",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));


// HELPER FUNCTION - TEXT FORMATTING
function formatAIResponse(text) {
  let html = text;
  let sectionOpen = false;

  html = html.replace(/\*\*(\d+)\.\s*([^*]+)\*\*/g, (match, number, title) => {
    const icons = {
      1: "🔍",
      2: "✅",
      3: "📐",
      4: "📝",
      5: "💡",
      6: "📖",
      7: "🚀",
    };
    let close = sectionOpen ? "</div></div>" : "";
    sectionOpen = true;
    return (
      close +
      `<div class="ai-section"><div class="ai-heading"><span class="ai-icon">${
        icons[number] || "📌"
      }</span><span class="ai-number">${number}</span><span class="ai-title">${title.trim()}</span></div><div class="ai-body">`
    );
  });

  html = html.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="ai-bold">$1</strong>'
  );
  html = html.replace(/^[-•]\s+(.+)$/gm, '<div class="ai-bullet">$1</div>');
  html = html.replace(/`([^`]+)`/g, '<code class="ai-code">$1</code>');
  html = html.replace(
    /(\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\d+)/g,
    '<span class="ai-formula">$1</span>'
  );
  html = html.replace(/\n\n+/g, "<br><br>");
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/^[#>\s]+/gm, "");
  html = html.replace(/##/g, "");
  html = html.replace(/#+\s*$/gm, "");
  html = html.replace(/---|```|`/g, "");

  if (sectionOpen) html += "</div></div>";
  return html;
}

// ============================================
// ROOT ENDPOINT - ✅ YANGI QO'SHILDI
// ============================================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🎓 ZiyoAI Backend Server ishlamoqda!",
    version: "1.0.0",
    endpoints: {
      test: "/api/test",
      homework: "/api/fix-homework",
      grammar: "/api/check-writing",
      vocabulary: "/api/vocabulary",
      motivation: "/api/motivation",
      quiz: "/api/generate-quiz",
      quizStats: "/api/quiz-stats",
      studyAssistant: "/api/study-assistant",
      audioToText: "/api/audio-to-text",
      speakingFeedback: "/api/speaking-feedback",
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// TEST ENDPOINT
// ============================================
app.get("/api/test", (req, res) => {
  res.json({
    status: "OK",
    message: "Server ishlayapti ✅ (Gemini)",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// HOMEWORK FIXER API - SUBJECT DETECTOR UPGRADE ✅
// ============================================
app.post("/api/fix-homework", async (req, res) => {
  try {
    const { homework, image, type, language = "uz" } = req.body;

    // ✅ STEP 1: DETECT SUBJECT (Fan aniqlash)
    let detectedSubject = "general";
    let subjectEmoji = "📚";
    
    if (type === "text" && homework) {
      detectedSubject = detectSubject(homework);
    }
    
    // Subject emoji mapping
    const subjectEmojis = {
      math: "📐",
      physics: "⚗️",
      chemistry: "🧪",
      literature: "📖",
      english: "🇬🇧",
      history: "🏛️",
      geography: "🌍",
      biology: "🧬",
      computer: "💻",
      general: "📚"
    };
    
    subjectEmoji = subjectEmojis[detectedSubject] || "📚";

    // ✅ STEP 2: SUBJECT-SPECIFIC PROMPTS
    const subjectPrompts = {
      math: {
        uz: `Sen professional MATEMATIKA o'qituvchisisisan.`,
        ru: `Ты профессиональный учитель МАТЕМАТИКИ.`,
        en: `You are a professional MATHEMATICS teacher.`
      },
      physics: {
        uz: `Sen professional FIZIKA o'qituvchisisisan.`,
        ru: `Ты профессиональный учитель ФИЗИКИ.`,
        en: `You are a professional PHYSICS teacher.`
      },
      chemistry: {
        uz: `Sen professional KIMYO o'qituvchisisisan.`,
        ru: `Ты профессиональный учитель ХИМИИ.`,
        en: `You are a professional CHEMISTRY teacher.`
      },
      literature: {
        uz: `Sen professional ADABIYOT o'qituvchisisisan.`,
        ru: `Ты профессиональный учитель ЛИТЕРАТУРЫ.`,
        en: `You are a professional LITERATURE teacher.`
      },
      english: {
        uz: `Sen professional INGLIZ TILI o'qituvchisisisan.`,
        ru: `Ты профессиональный учитель АНГЛИЙСКОГО ЯЗЫКА.`,
        en: `You are a professional ENGLISH LANGUAGE teacher.`
      },
      general: {
        uz: `Sen professional o'qituvchisisisan.`,
        ru: `Ты профессиональный учитель.`,
        en: `You are a professional teacher.`
      }
    };

    const prompts = {
      uz: {
        instruction: subjectPrompts[detectedSubject]?.uz || subjectPrompts.general.uz,
sections: `📋 JAVOBINGIZDA QUYIDAGILARNI YOZING:

**1. TEKSHIRISH NATIJASI:**
Vazifa to'g'ri yoki noto'g'ri ekanligini yoz agar xato qilgan bo'lsa aynan qayerda xato qilganini ko'rsat.

**2. TO'G'RI JAVOB:**
❓ Savol: [Savolni takrorla]
✅ Javob: [To'g'ri javobni yoz]

**3. FORMULA/QOIDA:**
📐 Ishlatiladigan formula: [Formula]
💡 Qoida: [Qisqa tushuntirish]

**4. QADAM-BA-QADAM YECHIM:**
Bu eng muhim qism! Har bir qadamni alohida, batafsil yoz:

🔢 QADAM 1: [Birinchi qadam]
📊 Natija: [Bu qadamdan keyin nima chiqqani]
💭 Nima uchun: [Bu qadamni nima uchun shunday qilganingni tushuntir]

🔢 QADAM 2: [Ikkinchi qadam]
📊 Natija: [Bu qadamdan keyin nima chiqqani]
💭 Nima uchun: [Bu qadamni nima uchun shunday qilganingni tushuntir]

🔢 QADAM 3: [Uchinchi qadam]
📊 Natija: [Bu qadamdan keyin nima chiqqani]
💭 Nima uchun: [Bu qadamni nima uchun shunday qilganingni tushuntir]

[Kerakli barcha qadamlarni shunday davom ettir]

🎯 YAKUNIY JAVOB: [Oxirgi natija]

**5. VIZUAL TUSHUNTIRISH:**
Agar mumkin bo'lsa, diagramma yoki rasm ko'rinishida tushuntir (matn orqali):
\`\`\`
[Bu yerda ASCII art yoki oddiy vizual ko'rinish]
\`\`\`

**6. UMUMIY XATOLAR:**
⚠️ Ko'p odamlar bu yerda qanday xato qilishadi:
- Xato 1: [Tushuntirish]
- Xato 2: [Tushuntirish]
- Xato 3: [Tushuntirish]

**7. O'XSHASH MISOL:**
📝 Mashq uchun o'xshash misol:
Savol: [Yangi savol]
To'g'ri javob: [Javob]
Qisqa yechim: [Qadam-ba-qadam qisqacha]

**8. MASLAHAT:**
🎓 Ko'nikma rivojlantirish uchun:
- Maslahat 1
- Maslahat 2
- Maslahat 3

**9. QAYERDA ISHLATILADI:**
🌍 Real hayotda bu bilim qayerda kerak bo'ladi:
- Misol 1
- Misol 2

⚠️ JAVOBNI FAQAT O'ZBEK TILIDA YOZ! 🇺🇿`,
      },
      ru: {
        instruction: subjectPrompts[detectedSubject]?.ru || subjectPrompts.general.ru,
        sections: `📋 В ОТВЕТЕ УКАЖИ:


**1. РЕЗУЛЬТАТ ПРОВЕРКИ:**
Правильное задание или нет.

**2. ПРАВИЛЬНЫЙ ОТВЕТ:**
❓ Вопрос: [Повтори вопрос]
✅ Ответ: [Правильный ответ]

**3. ФОРМУЛА/ПРАВИЛО:**
📐 Используемая формула: [Формула]
💡 Правило: [Краткое объяснение]

**4. ПОШАГОВОЕ РЕШЕНИЕ:**
Это самая важная часть! Опиши каждый шаг отдельно, подробно:

🔢 ШАГ 1: [Первый шаг]
📊 Результат: [Что получилось после этого шага]
💭 Почему так: [Объясни, почему сделал этот шаг]

🔢 ШАГ 2: [Второй шаг]
📊 Результат: [Что получилось после этого шага]
💭 Почему так: [Объясни, почему сделал этот шаг]

🔢 ШАГ 3: [Третий шаг]
📊 Результат: [Что получилось после этого шага]
💭 Почему так: [Объясни, почему сделал этот шаг]

[Продолжай так со всеми необходимыми шагами]

🎯 ИТОГОВЫЙ ОТВЕТ: [Конечный результат]

**5. ВИЗУАЛЬНОЕ ОБЪЯСНЕНИЕ:**
Если возможно, объясни в виде диаграммы или рисунка (через текст):
\`\`\`
[Здесь ASCII art или простое визуальное представление]
\`\`\`

**6. ЧАСТЫЕ ОШИБКИ:**
⚠️ Какие ошибки часто делают люди:
- Ошибка 1: [Объяснение]
- Ошибка 2: [Объяснение]
- Ошибка 3: [Объяснение]

**7. ПОХОЖИЙ ПРИМЕР:**
📝 Похожий пример для практики:
Вопрос: [Новый вопрос]
Правильный ответ: [Ответ]
Краткое решение: [Пошагово кратко]

**8. СОВЕТ:**
🎓 Для развития навыка:
- Совет 1
- Совет 2
- Совет 3

**9. ГДЕ ИСПОЛЬЗУЕТСЯ:**
🌍 Где в реальной жизни нужны эти знания:
- Пример 1
- Пример 2

⚠️ ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ! 🇷🇺`,
      },
      en: {
        instruction: subjectPrompts[detectedSubject]?.en || subjectPrompts.general.en,
        sections: `📋 IN YOUR ANSWER INCLUDE:


**1. CHECK RESULT:**
Is the task correct or incorrect.

**2. CORRECT ANSWER:**
❓ Question: [Repeat the question]
✅ Answer: [Correct answer]

**3. FORMULA/RULE:**
📐 Formula used: [Formula]
💡 Rule: [Brief explanation]

**4. STEP-BY-STEP SOLUTION:**
This is the most important part! Describe each step separately, in detail:

🔢 STEP 1: [First step]
📊 Result: [What you get after this step]
💭 Why: [Explain why you did this step]

🔢 STEP 2: [Second step]
📊 Result: [What you get after this step]
💭 Why: [Explain why you did this step]

🔢 STEP 3: [Third step]
📊 Result: [What you get after this step]
💭 Why: [Explain why you did this step]

[Continue with all necessary steps]

🎯 FINAL ANSWER: [Final result]

**5. VISUAL EXPLANATION:**
If possible, explain as a diagram or picture (through text):
\`\`\`
[Here ASCII art or simple visual representation]
\`\`\`

**6. COMMON MISTAKES:**
⚠️ Common mistakes people make:
- Mistake 1: [Explanation]
- Mistake 2: [Explanation]
- Mistake 3: [Explanation]

**7. SIMILAR EXAMPLE:**
📝 Similar example for practice:
Question: [New question]
Correct answer: [Answer]
Brief solution: [Step-by-step briefly]

**8. TIP:**
🎓 For skill development:
- Tip 1
- Tip 2
- Tip 3

**9. WHERE IT'S USED:**
🌍 Where in real life is this knowledge needed:
- Example 1
- Example 2

⚠️ ANSWER ONLY IN ENGLISH! 🇬🇧`,
      },
    };

    const selectedPrompt = prompts[language] || prompts["uz"];
    let rawResponse;

    if (type === "image") {
  // ✅ Image data validation
  if (!image || !image.includes('base64,')) {
    throw new Error('Invalid image data format');
  }
  
  const base64Data = image.split(",")[1];
  const mediaType = image.split(";")[0].split(":")[1];
  
  console.log('🖼️ Image processing:', {
    mediaType,
    base64Length: base64Data.length,
    language
  });
  
  const prompt = `${selectedPrompt.instruction}\n\nRasmdagi uy vazifani tekshir va batafsil tushuntir.\n\n${selectedPrompt.sections}`;
  
  // ✅ Use smart fallback system
  try {
    rawResponse = await processImageWithFallback(prompt, base64Data, mediaType);
    console.log('✅ Image processed successfully');
  } catch (imageError) {
    console.error('❌ Image processing failed:', imageError.message);
    throw imageError;
  }
} else {
      const prompt = `${selectedPrompt.instruction}\n\n📝 UY VAZIFA:\n${homework}\n\n${selectedPrompt.sections}`;
      rawResponse = await callSmartAI(prompt, 4096);
    }

// ✅ Clean AI response - remove "FAN: MATH" from AI output
let cleanedResponse = rawResponse;

// Remove subject line from AI response (since we show it as badge)
cleanedResponse = cleanedResponse.replace(/\*\*1\.\s*FAN:\s*\w+\s*[^\*]+\*\*/gi, '');
cleanedResponse = cleanedResponse.replace(/1\.\s*FAN:\s*\w+.+?(?=\*\*|$)/gi, '');
cleanedResponse = cleanedResponse.replace(/Aniqlangan fan nomi\.?/gi, '');

const formattedResponse = formatAIResponse(cleanedResponse);

// ✅ Return with detected subject
res.json({ 
  success: true, 
  correctedHomework: formattedResponse,
  detectedSubject: detectedSubject,
  subjectEmoji: subjectEmoji
});

  } catch (error) {
    console.error("❌ Error:", error);
    
    let errorMsg = error.message;
    
    // Gemini quota xatosini aniqroq ko'rsatish
    if (errorMsg.includes('quota')) {
      errorMsg = "⚠️ Gemini API limit tugagan. Iltimos, keyinroq urinib ko'ring.";
    } else if (errorMsg.includes('lowertext is not defined')) {
      errorMsg = "Iltimos, to'liq vazifa matnini kiriting.";
    }
    
    // Foydalanuvchiga xabar yuborish
    res.status(500).json({ 
      success: false, 
      error: errorMsg 
    });
  }
});


// ============================================
// HELPER: DETECT SUBJECT (Fan aniqlash) ✅
// ============================================
function detectSubject(text) {
  const lowerText = text.toLowerCase();
  
  // Matematika
  if (/equation|solve|calculate|algebra|geometry|trigonometry|\+|\-|\*|\/|=|x\s*=|y\s*=|sin|cos|tan|integral|derivative|formula|number|математика|уравнение|решить|вычислить|формула|tenglamani|hisoblang|formulani|sonni/.test(lowerText)) {
    return "math";
  }
  
  // Fizika
  if (/physics|force|velocity|acceleration|energy|momentum|массу|скорость|ускорение|энергия|kuch|tezlik|tezlanish|energiya|fizika/.test(lowerText)) {
    return "physics";
  }
  
  // Kimyo
  if (/chemistry|molecule|atom|reaction|element|compound|химия|молекула|атом|реакция|molekula|atom|reaksiya|kimyo|element/.test(lowerText)) {
    return "chemistry";
  }
  
// Biologiya
if (/biology|cell|organism|dna|gene|evolution|биология|клетка|организм|hujayra|organizm|biologiya/.test(lowerText)) {
  return "biology";
}
  
  // Adabiyot
  if (/literature|poem|story|novel|author|литература|поэма|рассказ|роман|автор|she'r|hikoya|roman|muallif|adabiyot/.test(lowerText)) {
    return "literature";
  }
  
  // Ingliz tili
  if (/translate|grammar|english|sentence|verb|noun|adjective|перевести|грамматика|английский|tarjima|grammatika|ingliz|gap|fe'l/.test(lowerText)) {
    return "english";
  }
  
  // Tarix
  if (/history|historical|century|war|империя|история|век|война|tarix|asr|urush|davlat|империя/.test(lowerText)) {
    return "history";
  }
  
  // Geografiya
  if (/geography|country|continent|ocean|mountain|география|страна|континент|океан|гора|geografiya|mamlakat|qit'a|okean|tog'/.test(lowerText)) {
    return "geography";
  }
  
  // Informatika
  if (/program|code|algorithm|computer|software|программа|код|алгоритм|компьютер|dastur|kod|algoritm|kompyuter|informatika/.test(lowerText)) {
    return "computer";
  }
  
  
  return "general";
}

// ============================================
// MATH OCR MODULE - server.js ga qo'shing
// ============================================

const math = require('mathjs'); // npm install mathjs

// LaTeX formula parser
async function parseLatexFormula(ocrText) {
  try {
    let formattedText = ocrText;

    // ✅ IMPROVED PATTERN MATCHING
    formattedText = formattedText
      // Square roots: √x³ → \sqrt{x^3}
      .replace(/√\s*([a-zA-Z])(\d+)/g, '\\sqrt{$1^{$2}}')
      .replace(/√\s*([a-zA-Z0-9]+)/g, '\\sqrt{$1}')
      
      // Fractions with roots: √x⁴ / √x⁵ → \frac{\sqrt{x^4}}{\sqrt{x^5}}
      .replace(/√\s*([a-zA-Z])(\d+)\s*[\/÷]\s*√\s*([a-zA-Z])(\d+)/g, 
               '\\frac{\\sqrt{$1^{$2}}}{\\sqrt{$3^{$4}}}')
      
      // Complex fractions: (√x³ · ⁵√x) / (⁵√x⁴ · √x⁵)
      .replace(/\(([^)]+)\)\s*[\/÷]\s*\(([^)]+)\)/g, '\\frac{$1}{$2}')
      
      // Powers: x³ → x^3
      .replace(/([a-zA-Z])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (match, base, exp) => {
        const normalExp = exp
          .replace(/⁰/g, '0').replace(/¹/g, '1').replace(/²/g, '2')
          .replace(/³/g, '3').replace(/⁴/g, '4').replace(/⁵/g, '5')
          .replace(/⁶/g, '6').replace(/⁷/g, '7').replace(/⁸/g, '8')
          .replace(/⁹/g, '9');
        return `${base}^{${normalExp}}`;
      })
      
      // Roots with index: ⁵√x → \sqrt[5]{x}
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)√\s*([a-zA-Z0-9]+)/g, (match, idx, val) => {
        const normalIdx = idx
          .replace(/⁰/g, '0').replace(/¹/g, '1').replace(/²/g, '2')
          .replace(/³/g, '3').replace(/⁴/g, '4').replace(/⁵/g, '5');
        return `\\sqrt[${normalIdx}]{${val}}`;
      })
      
      // Multiplication: · → \cdot
      .replace(/·/g, '\\cdot')
      
      // Division: : → \div
      .replace(/:/g, '\\div');

    return {
      original: ocrText,
      latex: formattedText,
      readable: convertLatexToReadable(formattedText),
      structured: parseStructuredFormula(formattedText)
    };
  } catch (error) {
    console.error('LaTeX parsing error:', error);
    return {
      original: ocrText,
      latex: ocrText,
      readable: ocrText,
      structured: null
    };
  }
}

// Convert LaTeX to readable text
function convertLatexToReadable(latex) {
  return latex
    .replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, '$1-root of ($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1) / ($2)')
    .replace(/\^\\{([^}]+)\}/g, '^$1')
    .replace(/\\cdot/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\times/g, '×');
}

// Parse formula structure
function parseStructuredFormula(latex) {
  try {
    // Extract components
    const numerator = latex.match(/\\frac\{([^}]+)\}/)?.[1];
    const denominator = latex.match(/\\frac\{[^}]+\}\{([^}]+)\}/)?.[1];
    
    return {
      type: numerator && denominator ? 'fraction' : 'expression',
      numerator: numerator || null,
      denominator: denominator || null,
      simplified: simplifyExpression(latex)
    };
  } catch (error) {
    return null;
  }
}

// Simplify mathematical expression
function simplifyExpression(latex) {
  try {
    // Use mathjs to simplify
    // This is a placeholder - implement actual simplification
    return latex;
  } catch (error) {
    return latex;
  }
}

// ============================================
// IMPROVED OCR FOR MATH
// ============================================
async function extractMathFromImage(base64Image, mediaType) {
  try {
    console.log('🔍 OCR: Extracting mathematical formulas...');
    
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Enhanced Tesseract config for math
    const { data: { text } } = await Tesseract.recognize(
      imageBuffer,
      'eng',
      {
        logger: m => console.log('OCR Progress:', m.status),
        tessedit_char_whitelist: '0123456789+-*/=()[]{}xyzabcXYZ√^.:÷×⁰¹²³⁴⁵⁶⁷⁸⁹·',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      }
    );
    
    console.log('📝 Raw OCR text:', text);
    
    // Parse formulas
    const parsed = await parseLatexFormula(text);
    
    console.log('✅ Parsed formula:', {
      latex: parsed.latex,
      readable: parsed.readable
    });
    
    return parsed;
    
  } catch (error) {
    console.error('❌ Math OCR error:', error);
    throw new Error('Formulani o\'qishda xatolik. Iltimos, aniqroq rasm yuklang.');
  }
}

// ============================================
// IMPROVED MATH PROMPT - CLEAN & SIMPLE ✅
// ============================================
function getCleanMathPrompt(mathData, language = 'uz') {
  const prompt = `Sen professional MATEMATIKA o'qituvchisisisan.

📸 RASMDAGI MASALA:
${mathData.original}

⚠️ MUHIM QOIDALAR:
1. Javobni ODDIY va TUSHUNARLI yoz
2. LaTeX kod YOZMA - faqat oddiy matn
3. Formulalarni oddiy ko'rinishda yoz: √2, x², a/b
4. Qisqa va aniq yoz
5. Keraksiz matematik belgilar ishlatma

📋 JAVOBNI QUYIDAGI FORMATDA BER:

**1. MASALA TAHLILI:**
[1-2 jumlada masala haqida qisqa ma'lumot]

**2. TO'G'RI JAVOB:**
✅ Javob: [faqat yakuniy javob - masalan: √2/2 yoki 0.707]

**3. YECHIM QADAMLARI:**

🔢 QADAM 1: [Birinchi qadam - oddiy tilida]
Natija: [bu qadamdan chiqqan natija]

🔢 QADAM 2: [Ikkinchi qadam]
Natija: [natija]

🔢 QADAM 3: [Uchinchi qadam]
Natija: [natija]

[3-5 ta qadam yetarli - ortiqcha uzaytirma!]

**4. XULOSA:**
🎯 Yakuniy javob: [aniq javob]

**5. MASLAHAT:**
💡 [1-2 ta qisqa maslahat]

⚠️ ESLATMA:
- LaTeX kod yozma (\\frac, \\sqrt, etc.)
- Faqat oddiy matn: √2, x², a/b
- Qisqa va lo'nda yoz
- Keraksiz matematik belgilar yozma
- 3-5 qadam yetarli

⚠️ JAVOBNI FAQAT O'ZBEK TILIDA YOZ! 🇺🇿`;

  return prompt;
}

// ============================================
// CLEAN AI RESPONSE - REMOVE LATEX JUNK ✅
// ============================================
function cleanMathResponse(rawResponse) {
  let cleaned = rawResponse;
  
  // ✅ REMOVE ALL LaTeX COMMANDS
  cleaned = cleaned
    // Remove LaTeX fractions: \frac{a}{b} → a/b
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    
    // Remove LaTeX sqrt: \sqrt{x} → √x
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, '$1√($2)')
    
    // Remove LaTeX powers: x^{2} → x²
    .replace(/\^\{(\d+)\}/g, (match, num) => {
      const superscripts = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
      return num.split('').map(d => superscripts[d] || d).join('');
    })
    
    // Remove other LaTeX commands
    .replace(/\\cdot/g, '×')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\approx/g, '≈')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    
    // Remove LaTeX blocks: \(...\) or $$...$$
    .replace(/\\\[[\s\S]*?\\\]/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\\\([\s\S]*?\\\)/g, '')
    
    // Remove LaTeX text commands
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    
    // Remove remaining backslashes
    .replace(/\\(?![√×÷±≈≤≥≠])/g, '')
    
    // Clean up multiple spaces and newlines
    .replace(/\s{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    
    // Remove empty LaTeX remnants
    .replace(/\{\s*\}/g, '')
    .replace(/\(\s*\)/g, '')
    
    // ✅ REMOVE ITALIAN/LATIN MATH TERMS
    .replace(/Butalo'g'ri\./gi, '')
    .replace(/Shundayqilib,/gi, '')
    .replace(/Shungao'xshash,/gi, '')
    .replace(/Endiburunito'g'riyechishusulini/gi, '')
    .replace(/Masalan,/gi, 'Masalan:')
    .replace(/maxrajniratsionallashtirish/gi, 'maxrajni ratsionallashtirish')
    .replace(/dangulqigarishdanoldin/gi, '')
    
    // ✅ FIX COMMON OCR MISTAKES
    .replace(/\s+va\s+3-2/g, ' va √(3-2')
    .replace(/nitekshiramiz/g, 'ni tekshiramiz')
    .replace(/bo'lsa,undaqayerdaxato/g, "bo'lsa, qayerda xato")
    .replace(/Keling,yanabrirusulnisina/g, "Keling, boshqa usulni sinab")
    
    .trim();
  
  return cleaned;
}




// ============================================
// HELPER: Get Standard Prompts ✅
// ============================================
function getStandardPrompts(language) {
  const prompts = {
    uz: {
      instruction: "Sen professional o'qituvchisisisan.",
      sections: `📋 JAVOBINGIZDA QUYIDAGILARNI YOZING:

**1. TEKSHIRISH NATIJASI:**
Vazifa to'g'ri yoki noto'g'ri.

**2. TO'G'RI JAVOB:**
❓ Savol: [Savolni takrorla]
✅ Javob: [To'g'ri javob]

**3. YECHIM:**
Qadam-ba-qadam tushuntirish (3-5 qadam).

**4. MASLAHAT:**
Yaxshilash uchun tavsiya.

⚠️ JAVOBNI ODDIY VA QISQA YOZ!
⚠️ LaTeX kod yozma - faqat oddiy matn!`
    }
  };
  
  return prompts;
}

// ============================================
// EXPORT MODULES
// ============================================
module.exports = {
  parseLatexFormula,
  convertLatexToReadable,
  extractMathFromImage
};


// ============================================
// WRITING CHECKER API - IELTS TASK 1/2
// ============================================
// ============================================
// WRITING CHECKER API - IMPROVED BAND SCORING ✅
// ============================================
app.post("/api/check-writing", async (req, res) => {
  try {
    const { text, taskType, language = "uz", topic, topicImage, chartImage } = req.body;

    // ✅ VALIDATION
    if (!text || text.trim() === "") {
      return res.status(400).json({ 
        error: "Text yuborilmadi", 
        success: false 
      });
    }

    if (!topic && !topicImage) {
      return res.status(400).json({ 
        error: "Topic is required / Topic kiriting", 
        success: false 
      });
    }

    const wordCount = text.trim().split(/\s+/).length;

    if (wordCount < 150) {
      return res.status(400).json({
        error: `Minimum 150 so'z kerak (hozirda ${wordCount} so'z)`,
        success: false
      });
    }

    console.log('📝 Writing Check Request:', {
      taskType,
      wordCount,
      language,
      hasTopic: !!topic,
      hasTopicImage: !!topicImage,
      hasChartImage: !!chartImage
    });

    // ✅ IMPROVED PROMPTS WITH STRICT BAND SCORING
    const prompts = {
      uz: `Sen professional IELTS Writing examiner san va 10+ yillik tajribaga egasan. Quyidagi ${taskType} javobini juda ANIQ va OBJEKTIV baholab ber.

📝 MAVZU/SAVOL:
${topic || '[Rasm orqali berilgan]'}

${topicImage ? '📊 MAVZU RASMI: Rasmda berilgan savol/mavzuni ko\'rib tahlil qil.\n' : ''}
${taskType === 'Task 1' && chartImage ? '📈 GRAFIK/DIAGRAMMA: Talaba bu grafik/diagramma bo\'yicha yozgan. Rasmni diqqat bilan ko\'r va talaba haqiqatda rasmda ko\'rsatilgan ma\'lumotlarni to\'g\'ri tasvirlaganmi tekshir.\n' : ''}

🎤 TALABANING JAVOBI:
${text}

📊 SO'ZLAR SONI: ${wordCount}

⚠️ MUHIM BAND BAHOLASH QOIDALARI:

**BAND 9.0:** 
- NOLGA TENG grammatika xatolari
- Murakkab lug'at TAKRORLANISHSIZ
- Mukammal izchillik va tabiiy oqim
- Turli tuzilmali murakkab gaplar
- Barcha topshiriq talablari to'liq bajarilgan va ajoyib ishlab chiqilgan

**BAND 8.0-8.5:**
- Juda kam grammatika xatolari (maksimum 1-2 ta kichik xato)
- Keng lug'at doirasi, kamdan-kam takrorlanish
- Kuchli izchillik va ajoyib bog'lovchilar
- Tez-tez murakkab gaplar
- Barcha topshiriq talablari yaxshi bajarilgan
${taskType === 'Task 1' ? '- Aniq ma\'lumotlar tavsifi va ajoyib taqqoslashlar' : '- Yaxshi ishlab chiqilgan dalillar va tegishli misollar'}

**BAND 7.0-7.5:**
- Ba'zi grammatika xatolari (3-5 ta xato) lekin muloqotga xalaqit bermaydi
- Yaxshi lug'at doirasi, vaqti-vaqti bilan takrorlanish
- Umuman izchil, yaxshi bog'lovchilar
- Oddiy va murakkab gaplar aralashmasi
- Topshiriq talablari bajarilgan, lekin ko'proq ishlab chiqilishi mumkin edi
${taskType === 'Task 1' ? '- Umuman aniq ma\'lumotlar, ba\'zi taqqoslashlar' : '- Aniq pozitsiya, ba\'zi ishlab chiqish'}

**BAND 6.0-6.5:**
- Sezilarli grammatika xatolari (6-10 ta xato)
- Yetarli lug'at, takrorlanishlar bilan
- Izchil, lekin oddiy bog'lovchilar
- Asosan oddiy gaplar, kam murakkab
- Topshiriq qisman bajarilgan
${taskType === 'Task 1' ? '- Oddiy ma\'lumotlar tavsifi, cheklangan taqqoslashlar' : '- Pozitsiya ko\'rsatilgan, lekin cheklangan ishlab chiqish'}

**BAND 5.0-5.5:**
- Tez-tez grammatika xatolari (10+ xato)
- Cheklangan lug'at, ko'p takrorlanish
- Oddiy yoki noaniq tashkilot
- Asosan oddiy gaplar
- Topshiriq yetarli darajada bajarilmagan

${taskType === 'Task 1' && chartImage ? `
**TASK 1 UCHUN MAXSUS TALABLAR:**
1. GRAFIK ANIQLIGI: Talaba rasmda ko'rsatilgan aniq ma'lumotlarni to'g'ri yozganmi?
2. MA'LUMOTLARNI TEKSHIRISH: Raqamlar, foizlar, joy nomlari to'g'rimi?
3. ASOSIY XUSUSIYATLAR: Rasmda ko'rsatilgan muhim ma'lumotlar yozilganmi?
4. TAQQOSLASHLAR: Taqqoslashlar qilinganmi?
5. UMUMIY KO'RINISH: Umumiy trend/naqsh tasvirlanganmi?
` : ''}

⚠️ MUHIM: Agar insho haqiqatan ham Band 8+ darajasida bo'lsa (0-2 xato, murakkab lug'at, mukammal izchillik), BALDAN KAMAYTRIMA!

JAVOBNI QUYIDAGI FORMATDA BER:

**1. MAVZUGA MUVOFIQLIKNI TEKSHIRISH ✅:**
Javob mavzuga mos keladimi? (Ha/Yo'q)
${taskType === 'Task 1' && chartImage ? 'Rasmda ko\'rsatilgan ma\'lumotlar to\'g\'ri tasvirlanganmi? (Ha/Yo\'q)\n' : ''}

**2. UMUMIY BAND BALI:**
Band X.X/9.0 (ANIQ BAL - agar insho haqiqatan ham yaxshi bo'lsa, 8.0+ ber)

**3. BATAFSIL BALLAR:**
✅ Task Achievement: X.X/9 (har bir mezoni alohida tekshir)
📝 Coherence & Cohesion: X.X/9
📚 Lexical Resource: X.X/9
✏️ Grammatical Range & Accuracy: X.X/9

**4. BATAFSIL TAHLIL:**

📖 **LUG'AT SIFATI:**
🎯 Daraja: (A1/A2/B1/B2/C1/C2)
📚 Kuchli So'zlar: [5+ ta murakkab so'zlar]
⚠️ Takrorlanuvchi: [takrorlangan so'zlar]
💡 Sinonimlar Kerak: [kerakli sinonimlar]
🔥 Ilg'or Kollokatsiyalar: [agar band 8+ bo'lsa, qanday kollokatsiyalar ishlatilgan]

**5. GRAMMATIKA TAHLILI:**
❌ Jami Xatolar: X ta (ANIQ SON)
📊 Xato Turlari: [xato turlari: artikl, zamon, kelishish va h.k.]

[Faqat MUHIM xatolarni ko'rsat - agar 0-2 xato bo'lsa, barchasini yoz:]
**#1:** "noto'g'ri" → "to'g'ri" (Qoida: ...)

${taskType === 'Task 1' ? `
**6. TASK 1 TALABLARI:**
- Umumiy ko'rinish mavjudmi? Ha/Yo'q ✓/✗
- Asosiy xususiyatlar tasvirlanganni? Ha/Yo'q ✓/✗
- Ma'lumotlar aniqligi (agar grafik bo'lsa)? Ha/Yo'q ✓/✗
- Taqqoslashlar qilinganmi? Ha/Yo'q ✓/✗
- Mos uzunlik (150+)? Ha/Yo'q ✓/✗
` : `
**6. TASK 2 TALABLARI:**
- Aniq pozitsiya? Ha/Yo'q ✓/✗
- Yaxshi ishlab chiqilgan dalillar? Ha/Yo'q ✓/✗
- Tegishli misollar? Ha/Yo'q ✓/✗
- Mantiqiy tuzilma? Ha/Yo'q ✓/✗
- Mos uzunlik (250+)? Ha/Yo'q ✓/✗
`}

**7. COHERENCE & COHESION:**
- Ishlatilgan bog'lovchi vositalar: [ro'yxat]
- Paragraflar tashkili: [baholash]
- Mantiqiy oqim: [baholash]

**8. YAXSHILASH UCHUN GRAMMATIK NAQSHLAR:**
- Tavsiya etilgan tuzilmalar: [complex sentences, conditionals, passive, etc.]
- Umumiy xatolar: [recommendations to reduce common mistakes]

**9. NEGA BU BAND? (ASOSLASH):**
[Nega aynan shu band balini berganingni tushuntir - bu juda muhim!]
- Grammatika: [sabab]
- Lug'at: [sabab]
- Izchillik: [sabab]
- Topshiriqni Bajarish: [sabab]

**10. KEYINGI BANDGA YETISH:**
[Hozirgi band ballidan +1.0 yuqori bandga yetish uchun aniq ko'rsatmalar. Masalan agar 7.0 bergan bo'lsang, "BAND 7.0 → 8.0" deb yoz]
- Tuzatish: [nimani tuzatish kerak]
- Qo'shish: [nimani qo'shish kerak]
- Yaxshilash: [nimani yaxshilash kerak]

**11. YAKUNIY VERDICT:**
${wordCount < 250 && taskType === 'Task 2' ? '⚠️ So\'zlar soni juda kam - maksimal band 6.5' : ''}
[Umumiy xulosa - insho band 8+ ga loyiqmi yoki yo'qmi, aniq sabab bilan]

⚠️ JAVOBNI FAQAT O'ZBEK TILIDA BER! 🇺🇿
⚠️ Band balini ADOLATLI qo'y - agar insho haqiqatan ham yaxshi bo'lsa, 8.0+ ber!`,

      ru: `Ты профессиональный IELTS Writing examiner с опытом 10+ лет. Оцени следующий ${taskType} ответ ТОЧНО и ОБЪЕКТИВНО.

📝 ТЕМА/ВОПРОС:
${topic || '[Дано через изображение]'}

${topicImage ? '📊 ИЗОБРАЖЕНИЕ ТЕМЫ: Проанализируй вопрос/тему, данную на картинке.\n' : ''}
${taskType === 'Task 1' && chartImage ? '📈 ГРАФИК/ДИАГРАММА: Студент писал по этому графику/диаграмме. Внимательно посмотри на картинку и проверь, правильно ли студент описал данные, показанные на изображении.\n' : ''}

🎤 ОТВЕТ СТУДЕНТА:
${text}

📊 КОЛИЧЕСТВО СЛОВ: ${wordCount}

⚠️ КРИТИЧЕСКИЕ ПРАВИЛА ОЦЕНКИ ПО BAND:

**BAND 9.0:** 
- НОЛЬ грамматических ошибок
- Сложная лексика БЕЗ повторений
- Идеальная связность и естественный поток
- Сложные предложения с разнообразными структурами
- Все требования задания полностью выполнены с отличной проработкой

**BAND 8.0-8.5:**
- Очень мало грамматических ошибок (максимум 1-2 незначительные ошибки)
- Широкий диапазон лексики с редкими повторениями
- Сильная связность с отличными linking words
- Частые сложные предложения
- Все требования задания хорошо выполнены
${taskType === 'Task 1' ? '- Точное описание данных с отличными сравнениями' : '- Хорошо развитые аргументы с релевантными примерами'}

**BAND 7.0-7.5:**
- Некоторые грамматические ошибки (3-5 ошибок), но не мешают коммуникации
- Хороший диапазон лексики с редкими повторениями
- В целом связно с хорошими linking words
- Смесь простых и сложных предложений
- Требования задания выполнены, но могли быть лучше проработаны
${taskType === 'Task 1' ? '- В целом точные данные с некоторыми сравнениями' : '- Четкая позиция с некоторой проработкой'}

**BAND 6.0-6.5:**
- Заметные грамматические ошибки (6-10 ошибок)
- Адекватная лексика с повторениями
- Связно, но базовые linking words
- В основном простые предложения, мало сложных
- Задание выполнено частично
${taskType === 'Task 1' ? '- Базовое описание данных, ограниченные сравнения' : '- Позиция заявлена, но ограниченная проработка'}

**BAND 5.0-5.5:**
- Частые грамматические ошибки (10+ ошибок)
- Ограниченная лексика с большим количеством повторений
- Базовая или неясная организация
- В основном простые предложения
- Задание выполнено неадекватно

${taskType === 'Task 1' && chartImage ? `
**СПЕЦИФИЧЕСКИЕ ТРЕБОВАНИЯ ДЛЯ TASK 1:**
1. ТОЧНОСТЬ ГРАФИКА: Правильно ли студент описал точные данные, показанные на картинке?
2. ПРОВЕРКА ДАННЫХ: Правильны ли цифры, проценты, названия мест?
3. КЛЮЧЕВЫЕ ОСОБЕННОСТИ: Описаны ли важные данные, показанные на картинке?
4. СРАВНЕНИЯ: Сделаны ли сравнения?
5. ОБЗОР: Описан ли общий тренд/паттерн?
` : ''}

⚠️ ВАЖНО: Если эссе действительно на уровне Band 8+ (0-2 ошибки, сложная лексика, идеальная связность), НЕ ЗАНИЖАЙ БАЛЛ!

ДАЙ ОТВЕТ В СЛЕДУЮЩЕМ ФОРМАТЕ:

**1. ПРОВЕРКА СООТВЕТСТВИЯ ТЕМЕ ✅:**
Соответствует ли ответ теме? (Да/Нет)
${taskType === 'Task 1' && chartImage ? 'Правильно ли описаны данные, показанные на картинке? (Да/Нет)\n' : ''}

**2. ОБЩИЙ БАЛЛ BAND:**
Band X.X/9.0 (ТОЧНЫЙ БАЛЛ - если эссе действительно хорошее, ставь 8.0+)

**3. ДЕТАЛЬНЫЕ БАЛЛЫ:**
✅ Task Achievement: X.X/9 (проверяй каждый критерий отдельно)
📝 Coherence & Cohesion: X.X/9
📚 Lexical Resource: X.X/9
✏️ Grammatical Range & Accuracy: X.X/9

**4. ДЕТАЛЬНЫЙ АНАЛИЗ:**

📖 **КАЧЕСТВО ЛЕКСИКИ:**
🎯 Уровень: (A1/A2/B1/B2/C1/C2)
📚 Сильные слова: [5+ сложных слов]
⚠️ Повторяющиеся: [повторяющиеся слова]
💡 Нужны синонимы: [необходимые синонимы]
🔥 Продвинутые коллокации: [если band 8+, какие коллокации использованы]

**5. ГРАММАТИЧЕСКИЙ АНАЛИЗ:**
❌ Всего ошибок: X штук (ТОЧНОЕ КОЛИЧЕСТВО)
📊 Типы ошибок: [типы ошибок: артикли, времена, согласование и т.д.]

[Показывай только ВАЖНЫЕ ошибки - если 0-2 ошибки, пиши все:]
**#1:** "неправильно" → "правильно" (Правило: ...)

${taskType === 'Task 1' ? `
**6. ТРЕБОВАНИЯ TASK 1:**
- Overview присутствует? Да/Нет ✓/✗
- Ключевые особенности описаны? Да/Нет ✓/✗
- Точность данных (если график)? Да/Нет ✓/✗
- Сделаны сравнения? Да/Нет ✓/✗
- Подходящая длина (150+)? Да/Нет ✓/✗
` : `
**6. ТРЕБОВАНИЯ TASK 2:**
- Четкая позиция? Да/Нет ✓/✗
- Хорошо развитые аргументы? Да/Нет ✓/✗
- Релевантные примеры? Да/Нет ✓/✗
- Логическая структура? Да/Нет ✓/✗
- Подходящая длина (250+)? Да/Нет ✓/✗
`}

**7. COHERENCE & COHESION:**
- Использованные linking devices: [список]
- Организация параграфов: [оценка]
- Логический поток: [оценка]

**8. ГРАММАТИЧЕСКИЕ ПАТТЕРНЫ ДЛЯ УЛУЧШЕНИЯ:**
- Предлагаемые структуры: [complex sentences, conditionals, passive, etc.]
- Частые ошибки: [recommendations to reduce errors]

**9. ПОЧЕМУ ЭТОТ BAND? (ОБОСНОВАНИЕ):**
[Объясни, почему поставил именно этот балл - это очень важно!]
- Грамматика: [причина]
- Лексика: [причина]
- Связность: [причина]
- Task Response: [причина]

**10. ДЛЯ ДОСТИЖЕНИЯ СЛЕДУЮЩЕГО BAND:**
[Точные инструкции для достижения band на +1.0 выше текущего. Например, если поставил 7.0, напиши "BAND 7.0 → 8.0"]
- Исправить: [что нужно исправить]
- Добавить: [что нужно добавить]
- Улучшить: [что нужно улучшить]

**11. ИТОГОВЫЙ ВЕРДИКТ:**
${wordCount < 250 && taskType === 'Task 2' ? '⚠️ Количество слов слишком мало - максимальный band 6.5' : ''}
[Общий вывод - заслуживает ли эссе band 8+ или нет, с четкой причиной]

⚠️ ДАЙ ОТВЕТ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ! 🇷🇺
⚠️ Ставь балл СПРАВЕДЛИВО - если эссе действительно хорошее, ставь 8.0+!`,

      en: `You are a professional IELTS Writing examiner with 10+ years experience. Evaluate this ${taskType} response ACCURATELY and OBJECTIVELY.

📝 TOPIC/QUESTION:
${topic || '[Given through image]'}

${topicImage ? '📊 TOPIC IMAGE: Analyze the question/topic given in the picture.\n' : ''}
${taskType === 'Task 1' && chartImage ? '📈 CHART/DIAGRAM: The student wrote about this chart/diagram. Look carefully at the picture and check if the student correctly described the data shown in the image.\n' : ''}

🎤 STUDENT'S ANSWER:
${text}

📊 WORD COUNT: ${wordCount}

⚠️ CRITICAL BAND SCORING RULES:

**BAND 9.0:** 
- ZERO grammar errors
- Sophisticated vocabulary with NO repetition
- Perfect coherence and natural flow
- Complex sentences with varied structures
- All task requirements fully addressed with excellent development

**BAND 8.0-8.5:**
- Very few grammar errors (1-2 minor mistakes maximum)
- Wide range of vocabulary with rare repetition
- Strong coherence with excellent linking
- Frequent complex sentences
- All task requirements well addressed
${taskType === 'Task 1' ? '- Accurate data description with excellent comparisons' : '- Well-developed arguments with relevant examples'}

**BAND 7.0-7.5:**
- Some grammar errors (3-5 mistakes) but don't impede communication
- Good vocabulary range with occasional repetition
- Generally coherent with good linking
- Mix of simple and complex sentences
- Task requirements addressed but could be more developed
${taskType === 'Task 1' ? '- Generally accurate data with some comparisons' : '- Clear position with some development'}

**BAND 6.0-6.5:**
- Noticeable grammar errors (6-10 mistakes)
- Adequate vocabulary with repetition
- Coherent but basic linking
- Mostly simple sentences, few complex
- Task partially addressed
${taskType === 'Task 1' ? '- Basic data description, limited comparisons' : '- Position stated but limited development'}

**BAND 5.0-5.5:**
- Frequent grammar errors (10+ mistakes)
- Limited vocabulary with much repetition
- Basic or unclear organization
- Mostly simple sentences
- Task inadequately addressed

${taskType === 'Task 1' && chartImage ? `
**TASK 1 SPECIFIC REQUIREMENTS:**
1. CHART ACCURACY: Did the student correctly write the exact data shown in the picture?
2. DATA VERIFICATION: Are the numbers, percentages, place names correct?
3. KEY FEATURES: Are the important data shown in the picture written?
4. COMPARISONS: Are comparisons made?
5. OVERVIEW: Is the overall trend/pattern described?
` : ''}

⚠️ IMPORTANT: If the essay is truly at Band 8+ level (0-2 errors, complex vocabulary, perfect coherence), DON'T REDUCE THE SCORE!

GIVE YOUR ANSWER IN THE FOLLOWING FORMAT:

**1. TOPIC RELEVANCE CHECK ✅:**
Does the answer match the topic? (Yes/No)
${taskType === 'Task 1' && chartImage ? 'Are the data shown in the picture correctly described? (Yes/No)\n' : ''}

**2. OVERALL BAND SCORE:**
Band X.X/9.0 (EXACT SCORE - if the essay is truly good, give 8.0+)

**3. DETAILED SCORES:**
✅ Task Achievement: X.X/9 (check each criterion separately)
📝 Coherence & Cohesion: X.X/9
📚 Lexical Resource: X.X/9
✏️ Grammatical Range & Accuracy: X.X/9

**4. DETAILED ANALYSIS:**

📖 **VOCABULARY QUALITY:**
🎯 Level: (A1/A2/B1/B2/C1/C2)
📚 Strong Words: [5+ sophisticated words]
⚠️ Repetitive: [repeated words]
💡 Synonyms Needed: [necessary synonyms]
🔥 Advanced Collocations: [if band 8+, what collocations were used]

**5. GRAMMAR ANALYSIS:**
❌ Total Errors: X (EXACT NUMBER)
📊 Error Types: [error types: articles, tenses, agreement, etc.]

[Show only IMPORTANT errors - if 0-2 errors, write all:]
**#1:** "incorrect" → "correct" (Rule: ...)

${taskType === 'Task 1' ? `
**6. TASK 1 REQUIREMENTS:**
- Overview present? Yes/No ✓/✗
- Key features described? Yes/No ✓/✗
- Data accuracy (if chart)? Yes/No ✓/✗
- Comparisons made? Yes/No ✓/✗
- Appropriate length (150+)? Yes/No ✓/✗
` : `
**6. TASK 2 REQUIREMENTS:**
- Clear position? Yes/No ✓/✗
- Well-developed arguments? Yes/No ✓/✗
- Relevant examples? Yes/No ✓/✗
- Logical structure? Yes/No ✓/✗
- Appropriate length (250+)? Yes/No ✓/✗
`}

**7. COHERENCE & COHESION:**
- Linking devices used: [list]
- Paragraph organization: [evaluation]
- Logical flow: [evaluation]

**8. GRAMMAR PATTERNS TO IMPROVE:**
- Suggested Structures: [complex sentences, conditionals, passive, etc.]
- Common Mistakes: [recommendations to reduce errors]

**9. WHY THIS BAND? (JUSTIFICATION):**
[Explain why you gave this band score - this is very important!]
- Grammar: [reason]
- Vocabulary: [reason]
- Coherence: [reason]
- Task Response: [reason]

**10. TO REACH THE NEXT BAND:**
[Exact instructions to reach +1.0 band higher than current. For example, if you gave 7.0, write "BAND 7.0 → 8.0"]
- Fix: [what needs to be fixed]
- Add: [what needs to be added]
- Improve: [what needs to be improved]

**11. FINAL VERDICT:**
${wordCount < 250 && taskType === 'Task 2' ? '⚠️ Word count too low - maximum band 6.5' : ''}
[Overall conclusion - does the essay deserve band 8+ or not, with clear reason]

⚠️ GIVE YOUR ANSWER ONLY IN ENGLISH! 🇬🇧🇺🇸
⚠️ Give the band score FAIRLY - if the essay is truly good, give 8.0+!`
    };

    const selectedPrompt = prompts[language] || prompts["uz"];

    let rawResponse;

    // ✅ IMAGE PROCESSING
    if (topicImage || (taskType === 'Task 1' && chartImage)) {
      try {
        const imageParts = [];
        
        if (topicImage) {
          const base64Data = topicImage.split(",")[1];
          const mediaType = topicImage.split(";")[0].split(":")[1];
          imageParts.push({
            inline_data: { mime_type: mediaType, data: base64Data }
          });
        }
        
        if (taskType === 'Task 1' && chartImage) {
          const base64Data = chartImage.split(",")[1];
          const mediaType = chartImage.split(";")[0].split(":")[1];
          imageParts.push({
            inline_data: { mime_type: mediaType, data: base64Data }
          });
        }

        const response = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  ...imageParts,
                  { text: selectedPrompt }
                ]
              }
            ],
            generationConfig: { 
              maxOutputTokens: 8192,
              temperature: 0.3 // ✅ Lower temperature for more consistent scoring
            }
          })
        });

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error.message || 'Gemini error');
        }

        rawResponse = data.candidates[0].content.parts[0].text;
        
      } catch (geminiError) {
        console.error('⚠️ Gemini failed, using fallback...');
        const enhancedPrompt = selectedPrompt + '\n\n⚠️ Images uploaded but could not process. Evaluate based on text only.';
        rawResponse = await callSmartAI(enhancedPrompt, 8192);
      }
      
    } else {
      rawResponse = await callSmartAI(selectedPrompt, 8192);
    }

    const formattedResponse = formatAIResponse(rawResponse);

    res.json({ 
      success: true, 
      result: formattedResponse,
      wordCount: wordCount,
      taskType: taskType,
      topic: topic,
      hasImages: !!(topicImage || (taskType === 'Task 1' && chartImage))
    });

  } catch (error) {
    console.error("❌ Writing Checker API error:", error);
    res.status(500).json({ 
      error: error.message, 
      success: false 
    });
  }
});

// ============================================
// MODEL ANSWER API - TASK 1/2 FIXED ✅
// ============================================
app.post("/api/generate-model-answer", async (req, res) => {
  try {
    const { topic, taskType, topicImage, chartImage } = req.body;

    if (!topic && !topicImage) {
      return res.status(400).json({
        error: "Topic yoki topicImage yuborilmadi",
        success: false
      });
    }

    if (!taskType) {
      return res.status(400).json({
        error: "taskType yuborilmadi",
        success: false
      });
    }

    console.log('📝 Generating model answer for:', taskType);
    console.log('📋 Topic:', topic || '[Image]');
    console.log('🖼️ Has Topic Image:', !!topicImage);
    console.log('📊 Has Chart Image:', !!chartImage);

    const wordTarget = taskType === 'Task 2' ? '250-280' : '150-170';

    // ✅ TASK-SPECIFIC PROMPTS
    const prompt = `You are a Band 9 IELTS examiner. Write a perfect ${taskType} model answer.

📝 TOPIC:
${topic || '[Given in image]'}

${topicImage ? '📊 TOPIC IMAGE: Look at the topic/question image carefully.\n' : ''}
${taskType === 'Task 1' && chartImage ? `
📈 CHART/DIAGRAM IMAGE: Look at the chart/diagram carefully.

CRITICAL RULES FOR TASK 1 WITH CHART:
1. Use EXACT names from the chart (cities, countries, categories, etc.)
2. If chart shows "Tokyo, London, Berlin, Moscow" - write THESE exact names, NOT "City A, City B"
3. Include EXACT numbers, percentages, dates from the chart
4. Describe KEY FEATURES visible in the chart
5. Make accurate COMPARISONS between data points
6. Describe TRENDS (increasing, decreasing, fluctuating, etc.)
7. Write OVERVIEW paragraph mentioning the most significant features

NEVER use generic labels like "City A, City B" - ALWAYS use actual names from the chart!
` : taskType === 'Task 2' ? `
CRITICAL RULES FOR TASK 2 ESSAY:
1. Write a clear THESIS STATEMENT in introduction
2. Develop 2-3 main arguments with specific examples
3. Use advanced vocabulary and complex grammar structures
4. Include cohesive devices (however, moreover, consequently, etc.)
5. Write a strong conclusion summarizing your position
6. DO NOT describe any charts or diagrams (Task 2 is opinion/discussion essay)
7. Focus on argumentation, examples, and logical reasoning

STRUCTURE:
- Introduction: Paraphrase question + Clear thesis statement
- Body Paragraph 1: Main argument + Supporting details + Example
- Body Paragraph 2: Second argument + Supporting details + Example
- Conclusion: Summarize position without introducing new ideas
` : ''}

CRITICAL REQUIREMENTS:
- Write ONLY in English (no other language)
- Band 8-9 level vocabulary and grammar
- Exactly ${wordTarget} words
- ${taskType === 'Task 2' 
  ? 'Clear thesis statement with strong arguments, relevant examples, and logical conclusion' 
  : chartImage 
    ? 'Accurate description with overview, specific data from chart (cities, numbers, dates), comparisons, and trends - USE EXACT NAMES FROM CHART' 
    : 'Accurate description with overview, key features, comparisons, and data'}
- Use advanced vocabulary (sophisticated, intricate, substantial, considerable, pronounced, etc.)
- Use complex sentences with subordinate clauses
- Use perfect grammar: conditionals, passive voice, relative clauses
- Use excellent linking words (however, moreover, furthermore, nevertheless, consequently, whereas, notwithstanding)
- ${taskType === 'Task 2' 
  ? '4 paragraphs: Introduction (paraphrase + thesis), Body 1 (argument 1 + example), Body 2 (argument 2 + example), Conclusion (summarize without new ideas)' 
  : '3-4 paragraphs: Overview (main trend/feature), Body 1 (detailed description with exact data), Body 2 (comparisons and contrasts), Conclusion (summary of main trend)'}

${chartImage && taskType === 'Task 1' ? `
⚠️ REMEMBER: If the chart shows specific names (cities, companies, products, etc.) - YOU MUST USE THOSE EXACT NAMES in your answer. Do NOT use "City A", "Category 1", etc.
` : taskType === 'Task 2' ? `
⚠️ REMEMBER: This is Task 2 (opinion/discussion essay). DO NOT describe any charts, diagrams, or visual data. Focus on argumentation and examples.
` : ''}

Write ONLY the essay now (no extra text, no title, no labels):`;

    let rawResponse;

    // ✅ IMAGE PROCESSING WITH FALLBACK
    if (topicImage || (taskType === 'Task 1' && chartImage)) {
      console.log('🖼️ Generating model answer with images...');
      
      try {
        // TRY GEMINI FIRST
        const imageParts = [];
        
        if (topicImage) {
          const base64Data = topicImage.split(",")[1];
          const mediaType = topicImage.split(";")[0].split(":")[1];
          imageParts.push({
            inline_data: { mime_type: mediaType, data: base64Data }
          });
        }
        
        // ✅ ONLY ADD CHART FOR TASK 1
        if (taskType === 'Task 1' && chartImage) {
          const base64Data = chartImage.split(",")[1];
          const mediaType = chartImage.split(";")[0].split(":")[1];
          imageParts.push({
            inline_data: { mime_type: mediaType, data: base64Data }
          });
        }

        console.log('🤖 [1/2] Trying Gemini with images...');

        const response = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  ...imageParts,
                  { text: prompt }
                ]
              }
            ],
            generationConfig: { maxOutputTokens: 2048 }
          })
        });

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error.message || 'Gemini error');
        }

        rawResponse = data.candidates[0].content.parts[0].text;
        console.log('✅ Gemini (with images) successful!');
        
      } catch (geminiError) {
        console.error('⚠️ Gemini (images) failed:', geminiError.message);
        
        // FALLBACK: OCR + DeepSeek/Groq
        console.log('🔄 [2/2] Falling back to OCR + Text AI...');
        
        let extractedText = '';
        
        // ✅ ONLY USE OCR FOR TASK 1 WITH CHART
        if (taskType === 'Task 1' && chartImage) {
          try {
            const base64Data = chartImage.split(",")[1];
            const chartText = await extractTextFromImage(base64Data, 'image/png');
            
            extractedText += `\n\n📈 CHART DATA (extracted via OCR):
${chartText}

⚠️ CRITICAL INSTRUCTIONS FOR WRITING MODEL ANSWER:

1. OCR EXTRACTION: The above text was extracted from a chart/diagram
2. IDENTIFY KEY ELEMENTS:
   - City/Location names (e.g., Tokyo, London, New York, Berlin)
   - Numbers and values (temperatures, percentages, etc.)
   - Time periods (months, years)
   - Units of measurement (°C, %, etc.)

3. USE EXACT NAMES: If you identify city names like "Tokyo, New York, Berlin, London" - USE THESE EXACT NAMES throughout your model answer. NEVER use generic labels like "City A, City B".

4. LOGICAL VALUES: If OCR gives unclear numbers, use LOGICAL estimates:
   - Tokyo summer: ~25-30°C, winter: ~5-10°C
   - New York summer: ~25-28°C, winter: ~0-5°C
   - London: generally mild, ~10-20°C range
   - Berlin: ~0-25°C across the year

5. WRITE MINIMUM 150-170 WORDS with this structure:
   
   PARAGRAPH 1 (Overview): 
   - State what the chart shows (type of chart, time period, locations)
   - Mention the most striking overall trend or pattern (2-3 sentences)
   
   PARAGRAPH 2 (Detailed description):
   - Describe specific data points with approximate values
   - Use EXACT city/location names from OCR
   - Include at least 4-5 specific data comparisons (3-4 sentences)
   
   PARAGRAPH 3 (Comparisons & Contrasts):
   - Compare different locations/categories
   - Highlight similarities and differences
   - Use advanced linking words (whereas, in contrast, similarly) (2-3 sentences)

6. ADVANCED VOCABULARY: Use Band 8-9 words like:
   - considerable, substantial, pronounced, fluctuate, exhibit
   - notwithstanding, whereas, in contrast, considerably
   - demonstrate, indicate, reveal, illustrate

7. EXAMPLE STRUCTURE:
   "The chart illustrates temperature variations across four major cities—Tokyo, New York, Berlin, and London—over a twelve-month period. Overall, Tokyo and New York exhibited considerably higher temperatures during summer months, reaching approximately 28°C and 26°C respectively in August, whereas Berlin and London demonstrated more moderate patterns..."

IMPORTANT: Your model answer MUST be 150-170 words minimum and use EXACT names from the chart!`;
            
          } catch (ocrError) {
            console.error('OCR failed for chart:', ocrError.message);
            extractedText += `\n\n⚠️ CHART IMAGE UPLOADED BUT OCR FAILED

Write a high-quality Band 8-9 Task 1 model answer based on the topic description.
Since chart data is unavailable:
- Use plausible data for the topic
- Follow proper Task 1 structure (overview + detailed paragraphs)
- Write 150-170 words
- Use advanced vocabulary and grammar`;
          }
        }
        
        // Topic image OCR
        if (topicImage) {
          try {
            const base64Data = topicImage.split(",")[1];
            const topicText = await extractTextFromImage(base64Data, 'image/png');
            extractedText += `\n\n📋 TOPIC (OCR extracted):\n${topicText}`;
          } catch (ocrError) {
            console.error('OCR failed for topic:', ocrError.message);
          }
        }
        
        const enhancedPrompt = prompt + extractedText;
        rawResponse = await callSmartAI(enhancedPrompt, 2048);
        console.log('✅ OCR + Text AI successful!');
      }
      
    } else {
      // ✅ Text only
      rawResponse = await callSmartAI(prompt, 2048);
    }
    
    // Clean response
    let modelAnswer = rawResponse
      .replace(/```markdown/g, '')
      .replace(/```/g, '')
      .replace(/Model Answer:|IELTS|Band [0-9]|Task [0-9]:/gi, '')
      .replace(/\*\*Introduction\*\*|\*\*Body\*\*|\*\*Conclusion\*\*/gi, '')
      .trim();

    const wordCount = modelAnswer.split(/\s+/).filter(w => w.length > 0).length;

    console.log(`✅ Model answer generated: ${wordCount} words`);

    res.json({
      success: true,
      modelAnswer: modelAnswer,
      wordCount: wordCount,
      hasImages: !!(topicImage || (taskType === 'Task 1' && chartImage))
    });

  } catch (error) {
    console.error("❌ Model Answer API xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// 3. VOCABULARY BUILDER
app.post("/api/vocabulary", async (req, res) => {
  try {
    const { word, language = "uz" } = req.body;

    if (!word || word.trim() === "") {
      return res
        .status(400)
        .json({ error: "So'z yuborilmadi", success: false });
    }

    const prompts = {
      uz: `Sen lug'at mutaxassisisisan. Quyidagi so'z haqida to'liq ma'lumot ber:

SO'Z: ${word}

JAVOBDA QUYIDAGILARNI YOZ:

**1. MA'NOSI:**
So'zning asosiy ma'nosi.

**2. TALAFFUZ:**
So'zni oddiy o'qilishi bo'yicha yoz.

**3. SO'Z TURKUMI:**
Noun, verb, adjective va h.k.

**4. MISOLLAR:**
Kamida 3 ta gap misoli.

**5. SINONIMLAR:**
O'xshash ma'noli so'zlar.

**6. ANTONIMLAR:**
Qarama-qarshi ma'noli so'zlar.

**7. ESLAB QOLISH UCHUN TIP:**
So'zni eslab qolish uchun qulay usul.

⚠️ Javobni faqat o'zbek tilida yoz.`,
      ru: `Ты эксперт по словарю. Предоставь полную информацию о следующем слове:

СЛОВО: ${word}

В ОТВЕТЕ УКАЖИ:

**1. ЗНАЧЕНИЕ:**
Основное значение слова.

**2. ПРОИЗНОШЕНИЕ:**
Напиши слово так, как оно произносится.

**3. ЧАСТЬ РЕЧИ:**
Noun, verb, adjective и т.д.

**4. ПРИМЕРЫ:**
Минимум 3 примера предложений.

**5. СИНОНИМЫ:**
Слова с похожим значением.

**6. АНТОНИМЫ:**
Слова с противоположным значением.

**7. СОВЕТ ДЛЯ ЗАПОМИНАНИЯ:**
Удобный способ запомнить слово.

⚠️ Отвечай только на русском языке.`,
      en: `You are a dictionary expert. Provide complete information about the following word:

WORD: ${word}

IN YOUR ANSWER INCLUDE:

**1. MEANING:**
Main definition of the word.

**2. PRONUNCIATION:**
Write the pronunciation in a simple, readable form.

**3. PART OF SPEECH:**
Noun, verb, adjective, etc.

**4. EXAMPLES:**
At least 3 sentence examples.

**5. SYNONYMS:**
Words with similar meanings.

**6. ANTONYMS:**
Words with opposite meanings.

**7. MEMORY TIP:**
Easy way to remember the word.

⚠️ Answer ONLY in English.`,
    };

    const rawResponse = await callSmartAI(prompts[language] || prompts["uz"], 2048);
    const formattedResponse = formatAIResponse(rawResponse);
    res.json({ success: true, result: formattedResponse, word: word });
  } catch (error) {
    console.error("❌ Vocabulary API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});


// ✅ Line ~1850 atrofida - /api/article-vocabulary endpointini almashtiring
app.post("/api/article-vocabulary", async (req, res) => {
  try {
    const { word, language = "uz", level = "B1" } = req.body; // ✅ ADD LEVEL

    if (!word || word.trim() === "") {
      return res
        .status(400)
        .json({ error: "So'z yuborilmadi", success: false });
    }

    console.log(`🔍 Fetching vocabulary for word: "${word}" (Level: ${level}, Lang: ${language})`);

    // ✅ LEVEL-BASED PROMPTS
    const levelInstructions = {
      'B1': {
        uz: "ODDIY tushuntirish ber - boshlang'ich o'quvchi uchun",
        ru: "ДАЙ ПРОСТОЕ объяснение - для начинающих",
        en: "GIVE SIMPLE explanation - for beginners"
      },
      'B2': {
        uz: "O'RTACHA murakkablik - kontekst va sinonimlar qo'sh",
        ru: "СРЕДНЯЯ сложность - добавь контекст и синонимы",
        en: "MEDIUM complexity - add context and synonyms"
      },
      'C1': {
        uz: "MURAKKAB akademik tushuntirish - nuance, connotation, usage ko'rsat",
        ru: "СЛОЖНОЕ академическое объяснение - покажи нюансы, коннотацию, использование",
        en: "ADVANCED academic explanation - show nuance, connotation, usage patterns"
      }
    };

    const levelInstruction = levelInstructions[level]?.[language] || levelInstructions['B1'][language];

    const prompts = {
      uz: `Sen professional lug'at mutaxassisisisan. "${word}" so'zi uchun FAQAT quyidagi formatda ma'lumot ber:

⚠️ DARAJA: ${level} (${levelInstruction})

📖 DEFINITION: [Bir jumlada inglizcha definition]
🇺🇿 O'ZBEK: [1-3 so'zda o'zbekcha tarjima]
🇷🇺 РУССКИЙ: [1-3 so'zda ruscha tarjima - FAQAT KIRILL HARFLARDA]
💬 EXAMPLE: "[To'liq inglizcha gap "${word}" so'zi bilan]"

${level === 'C1' ? `
🎯 NUANCE: [Qanday kontekstda ishlatiladi - formal/informal/academic]
🔄 SYNONYMS: [2-3 ta sinonim]
⚠️ COMMON MISTAKES: [Tez-tez qilinadigan xatolar]
` : ''}

QOIDALAR:
1. DEFINITION faqat inglizcha${level === 'B1' ? ' va juda oddiy' : ''}
2. O'ZBEK juda qisqa (1-3 so'z)
3. РУССКИЙ juda qisqa (1-3 so'z) va FAQAT kirill harflarda
4. EXAMPLE to'liq gap
5. Hech qanday qo'shimcha matn yozma

NAMUNA:
📖 DEFINITION: To examine something carefully
🇺🇿 O'ZBEK: Tekshirish
🇷🇺 РУССКИЙ: Проверять
💬 EXAMPLE: "The teacher will review your homework tomorrow"`,

      // ... (ru va en uchun ham xuddi shunday)
    };

    const rawResponse = await callSmartAI(prompts[language] || prompts["uz"], level === 'C1' ? 1200 : 800);
    
    console.log(`✅ ${level} vocab response received`);
    
    res.json({ 
      success: true, 
      result: rawResponse.trim(),
      word: word,
      language: language,
      level: level
    });
    
  } catch (error) {
    console.error("❌ Article Vocabulary API xatosi:", error);
    res.status(500).json({ 
      error: error.message, 
      success: false 
    });
  }
});


// 4. MOTIVATION QUOTES API
// ============================================
// MOTIVATION QUOTES API - TUZATILGAN ✅
// ============================================
app.get("/api/motivation", async (req, res) => {
  try {
    const motivationalQuotes = [
      {
        quote:
          "The more that you read, the more things you will know. The more that you learn, the more places you'll go.",
        author: "— Dr. Seuss",
      },
      {
        quote:
          "Education is the most powerful weapon which you can use to change the world.",
        author: "— Nelson Mandela",
      },
      {
        quote:
          "A reader lives a thousand lives before he dies. The man who never reads lives only one.",
        author: "— George R.R. Martin",
      },
      {
        quote:
          "The only thing that you absolutely have to know, is the location of the library.",
        author: "— Albert Einstein",
      },
      {
        quote:
          "Education is not the filling of a pail, but the lighting of a fire.",
        author: "— William Butler Yeats",
      },
      {
        quote:
          "Live as if you were to die tomorrow. Learn as if you were to live forever.",
        author: "— Mahatma Gandhi",
      },
      { quote: "The book you don't read won't help.", author: "— Jim Rohn" },
      {
        quote: "Reading is to the mind what exercise is to the body.",
        author: "— Joseph Addison",
      },
      {
        quote: "There is no friend as loyal as a book.",
        author: "— Ernest Hemingway",
      },
      {
        quote: "Today a reader, tomorrow a leader.",
        author: "— Margaret Fuller",
      },
      {
        quote: "Books are a uniquely portable magic.",
        author: "— Stephen King",
      },
      {
        quote:
          "The man who does not read has no advantage over the man who cannot read.",
        author: "— Mark Twain",
      },
      { quote: "Knowledge is power.", author: "— Francis Bacon" },
      {
        quote: "An investment in knowledge pays the best interest.",
        author: "— Benjamin Franklin",
      },
      {
        quote: "Learning never exhausts the mind.",
        author: "— Leonardo da Vinci",
      },
      {
        quote: "Education is the passport to the future.",
        author: "— Malcolm X",
      },
      {
        quote: "Once you learn to read, you will be forever free.",
        author: "— Frederick Douglass",
      },
      {
        quote:
          "The beautiful thing about learning is that nobody can take it away from you.",
        author: "— B.B. King",
      },
      {
        quote:
          "Reading is essential for those who seek to rise above the ordinary.",
        author: "— Jim Rohn",
      },
      {
        quote: "A book is a dream that you hold in your hand.",
        author: "— Neil Gaiman",
      },
    ];

    // ✅ Random quote tanlash
    const random =
      motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

    // ✅ CORS headers qo'shish (agar kerak bo'lsa)
    res.setHeader("Cache-Control", "no-cache");

    res.json({
      success: true,
      quote: random.quote, // ✅ Faqat quote, qo'shtirnoqsiz
      author: random.author, // ✅ "— Author" formatida
      timestamp: new Date().toISOString(),
    });

    console.log("✅ Motivatsiya yuborildi:", random.author);
  } catch (error) {
    console.error("❌ Motivation API xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// 5. QUIZ GENERATOR API
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { article, questionCount, difficulty, language = "uz" } = req.body;

    if (!article || article.trim() === "") {
      return res
        .status(400)
        .json({ error: "Matn yuborilmadi", success: false });
    }

    const difficultyNames = {
      uz: { easy: "oson", medium: "o'rtacha", hard: "qiyin" },
      ru: { easy: "легкий", medium: "средний", hard: "сложный" },
      en: { easy: "easy", medium: "medium", hard: "hard" },
    };

    const prompt = `Sen professional test tuzuvchisissan. Quyidagi matndan ${questionCount} ta ${
      difficultyNames[language]?.[difficulty] || "o'rtacha"
    } darajali test savollarini yarat.

📖 MATN:
${article}

📋 QOIDALAR:
- Har bir savol 4 ta variant bilan
- To'g'ri javobni aniq belgilang (0-3 orasida index)
- Har bir savolga qisqa tushuntirish qo'shing

⚠️ JAVOBNI FAQAT JSON FORMATDA BER:
{
  "questions": [
    {
      "question": "Savol matni?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Tushuntirish"
    }
  ]
}`;

    let rawResponse = await callSmartAI(prompt, 4096);

    rawResponse = rawResponse
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/^[^{]*/, "")
      .replace(/[^}]*$/, "")
      .trim();

    const quizData = JSON.parse(rawResponse);

    const validQuestions = quizData.questions.filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctAnswer === "number" &&
        q.correctAnswer >= 0 &&
        q.correctAnswer < 4
    );

    res.json({
      success: true,
      questions: validQuestions,
      totalQuestions: validQuestions.length,
    });
  } catch (error) {
    console.error("❌ Quiz API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// 6. QUIZ STATISTICS API
app.post("/api/quiz-stats", async (req, res) => {
  try {
    const { score, totalQuestions } = req.body;
    const percentage = ((score / totalQuestions) * 100).toFixed(0);

    let message = "",
      emoji = "";
    if (percentage >= 90) {
      message = "Ajoyib! 🎉";
      emoji = "🏆";
    } else if (percentage >= 70) {
      message = "Yaxshi! 💪";
      emoji = "⭐";
    } else if (percentage >= 50) {
      message = "Yomon emas! 📚";
      emoji = "📖";
    } else {
      message = "Mashq qiling! 🎯";
      emoji = "💡";
    }

    res.json({
      success: true,
      message,
      emoji,
      percentage: parseInt(percentage),
    });
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// ============================================
// STUDY ASSISTANT API
// ============================================
app.post("/api/study-assistant", async (req, res) => {
  try {
    const { mode, content, language = "uz" } = req.body;

    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ error: "Content yuborilmadi", success: false });
    }

    const prompts = {
      // 1. EXPLAIN ANY TOPIC
      explain: {
        uz: `Sen professional o'qituvchisan. Quyidagi mavzuni tushuntir:

MAVZU: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**1. SODDA TUSHUNTIRISH:**
Juda oddiy, bolaga tushuntirgandek.

**2. ILMIY TUSHUNTIRISH:**
To'liq ilmiy tarzda.

**3. MISOLLAR:**
3 ta real hayotiy misol.

**4. MINI-QUIZ:**
5 ta savol (javoblari bilan).

**5. ESLAB QOLISH UCHUN 3 TA LIFEHACK:**
Oson yodlash usullari.

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный учитель. Объясни следующую тему:

ТЕМА: ${content}

В ОТВЕТЕ УКАЖИ:

**1. ПРОСТОЕ ОБЪЯСНЕНИЕ:**
Очень просто, как ребенку.

**2. НАУЧНОЕ ОБЪЯСНЕНИЕ:**
Полное научное объяснение.

**3. ПРИМЕРЫ:**
3 примера из реальной жизни.

**4. МИНИ-ТЕСТ:**
5 вопросов (с ответами).

**5. 3 ЛАЙФХАКА ДЛЯ ЗАПОМИНАНИЯ:**
Легкие способы запомнить.

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional teacher. Explain the following topic:

TOPIC: ${content}

IN YOUR ANSWER INCLUDE:

**1. SIMPLE EXPLANATION:**
Very simple, like explaining to a child.

**2. SCIENTIFIC EXPLANATION:**
Full scientific explanation.

**3. EXAMPLES:**
3 real-life examples.

**4. MINI-QUIZ:**
5 questions (with answers).

**5. 3 MEMORY LIFEHACKS:**
Easy ways to remember.

⚠️ Answer only in English.`,
      },

      // 2. MAKE NOTES / SUMMARY
      notes: {
        uz: `Sen professional konspekt yozuvchisan. Quyidagi matndan konspekt yarat:

MATN: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**1. QISQA KONSPEKT:**
Eng muhim ma'lumotlar.

**2. MINDMAP:**
Asosiy tushuncha → bog'liq tushunchalar (matn ko'rinishida).

**3. 5 TA ASOSIY IDEA:**
Eng muhim 5 ta fikr.

**4. 10 TA TEZ-TEZ BERILADIGAN SAVOL:**
Imtihonda chiqishi mumkin bo'lgan savollar.

**5. FLASHCARDLAR (10 ta):**
Savol → Javob formatida.

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный составитель конспектов. Создай конспект из следующего текста:

ТЕКСТ: ${content}

В ОТВЕТЕ УКАЖИ:

**1. КРАТКИЙ КОНСПЕКТ:**
Самая важная информация.

**2. MINDMAP:**
Главное понятие → связанные понятия (в текстовом виде).

**3. 5 ГЛАВНЫХ ИДЕЙ:**
5 самых важных мыслей.

**4. 10 ЧАСТЫХ ВОПРОСОВ:**
Вопросы, которые могут быть на экзамене.

**5. ФЛЭШКАРТЫ (10 шт):**
В формате Вопрос → Ответ.

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional note-taker. Create notes from the following text:

TEXT: ${content}

IN YOUR ANSWER INCLUDE:

**1. SHORT SUMMARY:**
Most important information.

**2. MINDMAP:**
Main concept → related concepts (in text format).

**3. 5 KEY IDEAS:**
5 most important points.

**4. 10 FREQUENTLY ASKED QUESTIONS:**
Questions that might appear on exams.

**5. FLASHCARDS (10):**
In Question → Answer format.

⚠️ Answer only in English.`,
      },

      // 3. QUIZ MAKER
      quiz: {
        uz: `Sen professional test tuzuvchisan. Quyidagi mavzudan 3 darajali test yarat:

MAVZU: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**1. EASY (5 ta savol):**
Oson savollar, 4 ta variant, to'g'ri javob belgilangan.

**2. MEDIUM (5 ta savol):**
O'rtacha qiyinlikdagi savollar.

**3. HARD / OLYMPIAD (5 ta savol):**
Qiyin, olimpiada darajasidagi savollar.

Har bir savolda:
- Savol matni
- A, B, C, D variantlar
- ✅ To'g'ri javob
- 💡 Tushuntirish

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный составитель тестов. Создай тест 3 уровней сложности:

ТЕМА: ${content}

В ОТВЕТЕ УКАЖИ:

**1. EASY (5 вопросов):**
Легкие вопросы, 4 варианта, правильный ответ отмечен.

**2. MEDIUM (5 вопросов):**
Вопросы средней сложности.

**3. HARD / OLYMPIAD (5 вопросов):**
Сложные, олимпиадные вопросы.

Для каждого вопроса:
- Текст вопроса
- Варианты A, B, C, D
- ✅ Правильный ответ
- 💡 Объяснение

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional test creator. Create a 3-level quiz:

TOPIC: ${content}

IN YOUR ANSWER INCLUDE:

**1. EASY (5 questions):**
Easy questions, 4 options, correct answer marked.

**2. MEDIUM (5 questions):**
Medium difficulty questions.

**3. HARD / OLYMPIAD (5 questions):**
Difficult, olympiad-level questions.

For each question:
- Question text
- Options A, B, C, D
- ✅ Correct answer
- 💡 Explanation

⚠️ Answer only in English.`,
      },

      // 4. LEARNING PLAN
      plan: {
        uz: `Sen professional o'quv reja tuzuvchisan. Quyidagi mavzu uchun 7 kunlik reja tuz:

MAVZU: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**1-KUN:** (Mavzu nomi)
⏰ Vaqt: 1 soat
📚 O'rganish: ...
✏️ 3 ta mashq
🎯 Maqsad: ...

**2-KUN:** ...
**3-KUN:** ...
**4-KUN:** (REVIEW DAY - takrorlash)
**5-KUN:** ...
**6-KUN:** ...
**7-KUN:** (FINAL TEST)

**UMUMIY MASLAHATLAR:**
Samarali o'qish uchun 3 ta maslahat.

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный составитель учебных планов. Составь план на 7 дней:

ТЕМА: ${content}

В ОТВЕТЕ УКАЖИ:

**ДЕНЬ 1:** (Название темы)
⏰ Время: 1 час
📚 Изучить: ...
✏️ 3 упражнения
🎯 Цель: ...

**ДЕНЬ 2:** ...
**ДЕНЬ 3:** ...
**ДЕНЬ 4:** (REVIEW DAY - повторение)
**ДЕНЬ 5:** ...
**ДЕНЬ 6:** ...
**ДЕНЬ 7:** (ФИНАЛЬНЫЙ ТЕСТ)

**ОБЩИЕ СОВЕТЫ:**
3 совета для эффективной учебы.

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional learning plan creator. Create a 7-day plan:

TOPIC: ${content}

IN YOUR ANSWER INCLUDE:

**DAY 1:** (Topic name)
⏰ Time: 1 hour
📚 Learn: ...
✏️ 3 exercises
🎯 Goal: ...

**DAY 2:** ...
**DAY 3:** ...
**DAY 4:** (REVIEW DAY)
**DAY 5:** ...
**DAY 6:** ...
**DAY 7:** (FINAL TEST)

**GENERAL TIPS:**
3 tips for effective studying.

⚠️ Answer only in English.`,
      },

      // 5. EXPLAIN MISTAKES
      mistakes: {
        uz: `Sen professional o'qituvchisan. O'quvchining xatosini tushuntir:

XATO/SAVOL: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**1. XATO TAHLILI:**
Qayerda xato qilgan.

**2. NOTO'G'RI QADAM:**
Qaysi qadamda adashgan.

**3. TO'G'RI YECHIM:**
Qadam-ba-qadam to'g'ri yechim.

**4. QOIDA/FORMULA:**
Qaysi qoidani bilishi kerak.

**5. O'XSHASH MISOL:**
Mashq qilish uchun yana bir misol.

**6. MASLAHAT:**
Bunday xatolardan qochish uchun.

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный учитель. Объясни ошибку ученика:

ОШИБКА/ВОПРОС: ${content}

В ОТВЕТЕ УКАЖИ:

**1. АНАЛИЗ ОШИБКИ:**
Где была ошибка.

**2. НЕПРАВИЛЬНЫЙ ШАГ:**
На каком шаге ошибся.

**3. ПРАВИЛЬНОЕ РЕШЕНИЕ:**
Пошаговое правильное решение.

**4. ПРАВИЛО/ФОРМУЛА:**
Какое правило нужно знать.

**5. ПОХОЖИЙ ПРИМЕР:**
Еще один пример для практики.

**6. СОВЕТ:**
Как избежать таких ошибок.

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional teacher. Explain the student's mistake:

MISTAKE/QUESTION: ${content}

IN YOUR ANSWER INCLUDE:

**1. ERROR ANALYSIS:**
Where the mistake was made.

**2. WRONG STEP:**
Which step went wrong.

**3. CORRECT SOLUTION:**
Step-by-step correct solution.

**4. RULE/FORMULA:**
What rule they need to know.

**5. SIMILAR EXAMPLE:**
Another example for practice.

**6. TIP:**
How to avoid such mistakes.

⚠️ Answer only in English.`,
      },

      // 6. FLASHCARD GENERATOR
      flashcards: {
        uz: `Sen professional flashcard yaratuvchisan. Quyidagi mavzudan flashcardlar yarat:

MAVZU: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**FLASHCARDLAR (20 ta):**

1. ❓ Savol: ...
   ✅ Javob: ...

2. ❓ Savol: ...
   ✅ Javob: ...

(20 tagacha davom et)

**MINI-TEST (5 ta):**
Flashcardlardan 5 ta test savol.

**YODLASH STRATEGIYASI:**
Bu flashcardlarni qanday yodlash kerak.

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный создатель флэшкарт. Создай флэшкарты по теме:

ТЕМА: ${content}

В ОТВЕТЕ УКАЖИ:

**ФЛЭШКАРТЫ (20 шт):**

1. ❓ Вопрос: ...
   ✅ Ответ: ...

2. ❓ Вопрос: ...
   ✅ Ответ: ...

(продолжай до 20)

**МИНИ-ТЕСТ (5 шт):**
5 тестовых вопросов из флэшкарт.

**СТРАТЕГИЯ ЗАПОМИНАНИЯ:**
Как запомнить эти флэшкарты.

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional flashcard creator. Create flashcards on the topic:

TOPIC: ${content}

IN YOUR ANSWER INCLUDE:

**FLASHCARDS (20):**

1. ❓ Question: ...
   ✅ Answer: ...

2. ❓ Question: ...
   ✅ Answer: ...

(continue to 20)

**MINI-TEST (5):**
5 test questions from flashcards.

**MEMORIZATION STRATEGY:**
How to memorize these flashcards.

⚠️ Answer only in English.`,
      },

      // 7. SPEAKING/WRITING SCRIPT
      script: {
        uz: `Sen professional IELTS/yozuv mutaxassisisisan. Quyidagi mavzu uchun script yarat:

MAVZU: ${content}

JAVOBDA QUYIDAGILARNI YOZ:

**1. SPEAKING SAMPLE ANSWER:**
To'liq namuna javob (2-3 daqiqalik).

**2. WRITING OUTLINE:**
Yozma ish strukturasi.

**3. GOOD EXAMPLE:**
Yaxshi yozilgan paragraf namunasi.

**4. BAD EXAMPLE:**
Yomon yozilgan paragraf (xatolar bilan).

**5. XATOLAR TAHLILI:**
Bad exampledagi xatolar tushuntirishi.

**6. FOYDALI IBORALAR:**
10 ta foydali ibora shu mavzu uchun.

⚠️ Javobni faqat o'zbek tilida yoz.`,
        ru: `Ты профессиональный эксперт IELTS/письма. Создай скрипт по теме:

ТЕМА: ${content}

В ОТВЕТЕ УКАЖИ:

**1. SPEAKING SAMPLE ANSWER:**
Полный образец ответа (2-3 минуты).

**2. WRITING OUTLINE:**
Структура письменной работы.

**3. GOOD EXAMPLE:**
Хорошо написанный параграф.

**4. BAD EXAMPLE:**
Плохо написанный параграф (с ошибками).

**5. АНАЛИЗ ОШИБОК:**
Объяснение ошибок в bad example.

**6. ПОЛЕЗНЫЕ ФРАЗЫ:**
10 полезных фраз для этой темы.

⚠️ Отвечай только на русском языке.`,
        en: `You are a professional IELTS/writing expert. Create a script for the topic:

TOPIC: ${content}

IN YOUR ANSWER INCLUDE:

**1. SPEAKING SAMPLE ANSWER:**
Full sample answer (2-3 minutes).

**2. WRITING OUTLINE:**
Structure for written work.

**3. GOOD EXAMPLE:**
Well-written paragraph sample.

**4. BAD EXAMPLE:**
Poorly written paragraph (with errors).

**5. ERROR ANALYSIS:**
Explanation of errors in bad example.

**6. USEFUL PHRASES:**
10 useful phrases for this topic.

⚠️ Answer only in English.`,
      },
    };

    if (!prompts[mode]) {
      return res.status(400).json({ error: "Noto'g'ri mode", success: false });
    }

    const selectedPrompt = prompts[mode][language] || prompts[mode]["uz"];
    const rawResponse = await callSmartAI(selectedPrompt, 4096);
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      result: formattedResponse,
      mode: mode,
    });
  } catch (error) {
    console.error("❌ Study Assistant API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// TEST ENDPOINT
app.get("/api/test", (req, res) => {
  res.json({
    status: "OK",
    message: "Server ishlayapti ✅ (Gemini)",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// AUDIO TO TEXT API - DEEPGRAM ✅ TUZATILGAN
// ============================================
app.post("/api/audio-to-text", upload.single("audio"), async (req, res) => {
  try {
    console.log("📥 Audio request received");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("File:", req.file ? "✅" : "❌");

    if (!req.file) {
      return res.status(400).json({
        error: "Audio file yuborilmadi",
        success: false,
        details: "Multer did not receive file",
      });
    }

    console.log("📥 Audio file received:", {
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      buffer: req.file.buffer ? "✅" : "❌",
    });

    // Deepgram API Key tekshirish
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY .env faylida topilmadi");
    }

    console.log(
      "🔑 Deepgram API Key:",
      process.env.DEEPGRAM_API_KEY ? "✅" : "❌"
    );

    // Deepgram clientni yaratish
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    console.log("📤 Deepgram ga yuborilmoqda...");

    // Audio buffer ni transcribe qilish
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      req.file.buffer,
      {
        model: "nova-2",
        language: "en",
        smart_format: true,
        punctuate: true,
        diarize: false,
      }
    );

    if (error) {
      console.error("❌ Deepgram API Error:", error);
      throw new Error(error.message || "Deepgram API xatosi");
    }

    console.log("📄 Deepgram raw result:", JSON.stringify(result, null, 2));

    // Transcriptni olish
    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    console.log("✅ Deepgram transcript:", transcript);

    if (!transcript || transcript.trim().length < 10) {
      throw new Error(
        "Ovoz tanilmadi. Iltimos, aniqroq gapiring va qayta urinib ko'ring."
      );
    }

    res.json({
      success: true,
      transcript: transcript,
    });
  } catch (error) {
    console.error("❌ Audio-to-text xatosi:", error);

    res.status(500).json({
      error: error.message || "Audio tahlil qilishda xatolik yuz berdi",
      success: false,
      stack: error.stack, // ← Debugging uchun
    });
  }
});

// ============================================
// SPEAKING FEEDBACK API
// ============================================
app.post("/api/speaking-feedback", async (req, res) => {
  try {
    const { transcript, topic, examType, language = "uz" } = req.body;

    if (!transcript || transcript.trim() === "") {
      return res
        .status(400)
        .json({ error: "Transcript yuborilmadi", success: false });
    }

    if (!topic || topic.trim() === "") {
      return res
        .status(400)
        .json({ error: "Topic yuborilmadi", success: false });
    }

    const prompts = {
      uz: `Sen professional ${examType} speaking examiner san. Quyidagi speaking javobini baholab, batafsil feedback ber:

📝 TOPIC: ${topic}

🎤 FOYDALANUVCHI JAVOBI:
${transcript}

JAVOBDA QUYIDAGILARNI YOZ:

**1. UMUMIY BAHOLASH:**
${
  examType === "IELTS"
    ? "IELTS Band Score (1-9)"
    : "CEFR Ball (0-75) va Level (A1-C2)"
}

**2. BATAFSIL BALLAR:**
${
  examType === "IELTS"
    ? `
- Fluency & Coherence: X/9
- Lexical Resource: X/9
- Grammatical Range & Accuracy: X/9
- Pronunciation: X/9
- OVERALL BAND: X/9`
    : `
- Fluency (Ravonlik): X/15
- Vocabulary (Lug'at): X/15
- Grammar (Grammatika): X/15
- Pronunciation (Talaffuz): X/15
- Content (Mazmun): X/15
- JAMI BALL: X/75
- LEVEL: (0-37: A1-A2 | 38-50: B1 | 51-64: B2 | 65-75: C1)

📊 MULTILEVEL BALL TIZIMI:
• 0-37 ball = A1-A2 (Boshlang'ich)
• 38-50 ball = B1 (O'rta)
• 51-64 ball = B2 (O'rta-yuqori)
• 65-75 ball = C1 (Yuqori)`
}

**3. KUCHLI TOMONLAR ✅:**
Nima yaxshi qilgan - 3-5 ta punkt.

**4. YAXSHILASH KERAK ⚠️:**
Nima ustida ishlash kerak - 3-5 ta punkt.

**5. XATOLAR TAHLILI ❌:**
Grammatik va leksik xatolar ro'yxati va to'g'ri varianti.

**6. SAMPLE ANSWER 📝:**
Shu topic uchun ${
        examType === "IELTS" ? "Band 8-9" : "C1-C2"
      } darajadagi namuna javob.

**7. FOYDALI IBORALAR 💡:**
Shu topic uchun 10 ta foydali ibora.

**8. TAVSIYALAR 🎯:**
- Ko'proq qilish kerak: ...
- Kamroq qilish kerak: ...
- Tashlab ketish kerak: ...
- Mashq qilish uchun: ...

⚠️ Javobni faqat o'zbek tilida yoz!`,

      ru: `Ты профессиональный ${examType} speaking examiner. Оцени следующий speaking ответ и дай подробный фидбэк:

📝 ТЕМА: ${topic}

🎤 ОТВЕТ ПОЛЬЗОВАТЕЛЯ:
${transcript}

В ОТВЕТЕ УКАЖИ:

**1. ОБЩАЯ ОЦЕНКА:**
${
  examType === "IELTS"
    ? "IELTS Band Score (1-9)"
    : "CEFR Балл (0-75) и Уровень (A1-C2)"
}

**2. ДЕТАЛЬНЫЕ БАЛЛЫ:**
${
  examType === "IELTS"
    ? `
- Fluency & Coherence: X/9
- Lexical Resource: X/9
- Grammatical Range & Accuracy: X/9
- Pronunciation: X/9
- OVERALL BAND: X/9`
    : `
- Fluency (Беглость): X/15
- Vocabulary (Словарный запас): X/15
- Grammar (Грамматика): X/15
- Pronunciation (Произношение): X/15
- Content (Содержание): X/15
- ОБЩИЙ БАЛЛ: X/75
- УРОВЕНЬ: A1/A2/B1/B2/C1/C2`
}

**3. СИЛЬНЫЕ СТОРОНЫ ✅:**
Что хорошо - 3-5 пунктов.

**4. НУЖНО УЛУЧШИТЬ ⚠️:**
Над чем работать - 3-5 пунктов.

**5. АНАЛИЗ ОШИБОК ❌:**
Список грамматических и лексических ошибок с правильными вариантами.

**6. SAMPLE ANSWER 📝:**
Образец ответа уровня ${
        examType === "IELTS" ? "Band 8-9" : "C1-C2"
      } для этой темы.

**7. ПОЛЕЗНЫЕ ФРАЗЫ 💡:**
10 полезных фраз для этой темы.

**8. РЕКОМЕНДАЦИИ 🎯:**
- Делать больше: ...
- Делать меньше: ...
- Перестать делать: ...
- Для практики: ...

⚠️ Отвечай только на русском языке!`,

      en: `You are a professional ${examType} speaking examiner. Evaluate the following speaking response and provide detailed feedback:

📝 TOPIC: ${topic}

🎤 USER'S RESPONSE:
${transcript}

IN YOUR ANSWER INCLUDE:

**1. OVERALL ASSESSMENT:**
${
  examType === "IELTS"
    ? "IELTS Band Score (1-9)"
    : "CEFR Score (0-75) and Level (A1-C2)"
}

**2. DETAILED SCORES:**
${
  examType === "IELTS"
    ? `
- Fluency & Coherence: X/9
- Lexical Resource: X/9
- Grammatical Range & Accuracy: X/9
- Pronunciation: X/9
- OVERALL BAND: X/9`
    : `
- Fluency: X/15
- Vocabulary: X/15
- Grammar: X/15
- Pronunciation: X/15
- Content: X/15
- TOTAL SCORE: X/75
- LEVEL: A1/A2/B1/B2/C1/C2`
}

**3. STRENGTHS ✅:**
What was done well - 3-5 points.

**4. AREAS FOR IMPROVEMENT ⚠️:**
What needs work - 3-5 points.

**5. ERROR ANALYSIS ❌:**
List of grammatical and lexical errors with corrections.

**6. SAMPLE ANSWER 📝:**
A ${
        examType === "IELTS" ? "Band 8-9" : "C1-C2"
      } level sample answer for this topic.

**7. USEFUL PHRASES 💡:**
10 useful phrases for this topic.

**8. RECOMMENDATIONS 🎯:**
- Do more of: ...
- Do less of: ...
- Stop doing: ...
- Practice by: ...

⚠️ Answer only in English!`,
    };

    const selectedPrompt = prompts[language] || prompts["uz"];
    const rawResponse = await callSmartAI(selectedPrompt, 4096);
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      result: formattedResponse,
      examType: examType,
    });
  } catch (error) {
    console.error("❌ Speaking Feedback API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Articles papkasi path
const ARTICLES_DIR = path.join(__dirname, "articles");

// ============================================
// LOAD ARTICLES WITH CACHE - Line ~2200 atrofida
// ============================================
async function loadArticlesFromPDF() {
  try {
    const ARTICLES_DIR = path.join(__dirname, "articles");
    await fs.access(ARTICLES_DIR);
    
    console.log(`📚 Loading articles from: ${ARTICLES_DIR}`);
    
    // ✅ CHECK CACHE FIRST
    if (articlesCache && articlesCacheTimestamp) {
      const now = Date.now();
      const hoursPassed = (now - articlesCacheTimestamp) / (1000 * 60 * 60);
      
      if (hoursPassed < CACHE_EXPIRY_HOURS) {
        console.log(`✅ Using cached articles (${Math.round(hoursPassed)}h old)`);
        return articlesCache;
      } else {
        console.log(`⏰ Cache expired (${Math.round(hoursPassed)}h > ${CACHE_EXPIRY_HOURS}h), reloading...`);
      }
    }
    
    console.log('🔄 Loading fresh articles from PDFs...');
    
    const articles = [];
    const LEVEL_FOLDERS = ['B1', 'B2', 'C1'];
    
    for (const levelFolder of LEVEL_FOLDERS) {
      const levelPath = path.join(ARTICLES_DIR, levelFolder);
      
      try {
        await fs.access(levelPath);
        const files = await fs.readdir(levelPath);
        const pdfFiles = files.filter((file) => file.endsWith(".pdf"));
        
        console.log(`📂 ${levelFolder} folder: ${pdfFiles.length} PDFs found`);
        
        for (const file of pdfFiles) {
          try {
            const filePath = path.join(levelPath, file);
            const dataBuffer = await fs.readFile(filePath);
            const pdfData = await pdfParse(dataBuffer);
            
            const rawContent = pdfData.text;
            const cleanedContent = cleanContent(rawContent);
            if (cleanedContent.includes('">') || cleanedContent.includes('"&gt;')) {
  console.warn(`⚠️ ${file} still has HTML artifacts after cleaning!`);
  console.log('First 200 chars:', cleanedContent.substring(0, 200));
}
            
            // ✅ Generate vocabulary with AI (ONLY ONCE!)
            const vocabulary = await generateAdvancedVocabulary(cleanedContent, levelFolder);
            
            const article = {
              id: file.replace(".pdf", "").toLowerCase().replace(/\s+/g, "-"),
              title: extractTitle(file, cleanedContent),
              level: levelFolder,
              readTime: calculateReadTime(cleanedContent),
              category: detectCategory(file, cleanedContent),
              description: extractDescription(cleanedContent),
              content: cleanedContent,
              vocabulary: vocabulary,
              folderLevel: levelFolder
            };
            
            articles.push(article);
            console.log(`✅ Loaded: ${article.title} (${levelFolder} - ${vocabulary.length} words)`);
            
          } catch (error) {
            console.error(`❌ Error loading ${file}:`, error.message);
          }
        }
        
      } catch (error) {
        console.log(`⚠️ ${levelFolder} folder not found, skipping...`);
      }
    }
    
    // ✅ SAVE TO CACHE
    articlesCache = articles;
    articlesCacheTimestamp = Date.now();
    
    console.log(`✅ Total articles loaded and cached: ${articles.length}`);
    return articles;
    
  } catch (error) {
    console.error("❌ Articles directory not found:", error.message);
    return [];
  }
}

// ============================================
// CLEAR CACHE FUNCTION (optional - admin use)
// ============================================
function clearArticlesCache() {
  articlesCache = null;
  articlesCacheTimestamp = null;
  console.log('🗑️ Articles cache cleared');
}



// ============================================
// IMPROVED TITLE EXTRACTION - CLEANER ✅
// ============================================
function extractTitle(filename, content) {
  // ✅ STEP 1: Clean content more aggressively
  let cleanedContent = content
    .replace(/IELTS\s+ZONE\s*#?\s*\w+/gi, "")
    .replace(/@\w+/g, "")
    .replace(/\d{2,3}-\d{2,3}-\d{2,3}-\d{2,3}/g, "")
    .replace(/[a-z\s,\-]+["']\s*>/gi, ' ') // ✅ Remove tooltip artifacts
    .replace(/["']\s*>/g, ' ')
    .trim();

  // ✅ STEP 2: Get first clean line as title
  const lines = cleanedContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      // Valid title: 10-100 chars, starts with letter, has spaces
      return l.length > 10 && 
             l.length < 100 && 
             /^[A-Z]/.test(l) &&
             /\s/.test(l) &&
             !/^\d/.test(l); // Not starting with number
    });

  if (lines.length > 0) {
    return lines[0]
      .replace(/["'>]/g, '') // Remove remaining quotes/brackets
      .trim();
  }

  // ✅ STEP 3: Fallback - clean filename
  return filename
    .replace(".pdf", "")
    .replace(/-/g, " ")
    .replace(/\d+/g, "")
    .replace(/[_]/g, " ")
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function detectLevel(content) {
  const wordCount = content.split(/\s+/).length;
  const avgWordLength = content.replace(/\s+/g, "").length / wordCount;

  if (avgWordLength < 4.5) return "A1";
  if (avgWordLength < 5) return "A2";
  if (avgWordLength < 5.5) return "B1";
  if (avgWordLength < 6) return "B2";
  if (avgWordLength < 6.5) return "C1";
  return "C2";
}

function calculateReadTime(content) {
  const wordCount = content.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / 200);
  return `${minutes} min`;
}

function detectCategory(filename, content) {
  const categories = {
    technology: /tech|ai|computer|internet|digital/i,
    science: /science|research|study|experiment/i,
    environment: /environment|climate|nature|green/i,
    sports: /sport|game|race|competition|le mans/i,
    education: /education|learn|teach|school|university/i,
    culture: /culture|art|music|literature/i,
  };

  const text = filename + " " + content.substring(0, 500);

  for (const [category, regex] of Object.entries(categories)) {
    if (regex.test(text)) {
      return category.charAt(0).toUpperCase() + category.slice(1);
    }
  }

  return "General";
}

function extractDescription(content) {
  const cleaned = content.replace(/\n+/g, " ").trim();
  return cleaned.substring(0, 150) + "...";
}

// ============================================
// CLEAN CONTENT - SUPER IMPROVED ✅
// ============================================
function cleanContent(content) {
  return (
    content
      // ✅ STEP 1: Remove ALL tooltip/HTML artifacts
      // Pattern: 'some text description">' before a word
      .replace(/[a-z\s,\-]+["']\s*>\s*/gi, ' ')
      
      // ✅ STEP 2: Remove orphaned quotes and angle brackets
      .replace(/["']\s*>/g, ' ')
      .replace(/>\s*["']/g, ' ')
      
      // ✅ STEP 3: Decode HTML entities
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      
      // ✅ STEP 4: Remove IELTS ZONE artifacts
      .replace(/IELTS\s+ZONE\s*#?\s*\w+/gi, "")
      .replace(/@\w+/g, "")
      .replace(/\d{2,3}-\d{2,3}-\d{2,3}-\d{2,3}/g, "")
      .replace(/Death and Petrol/gi, "")
      .replace(/aimforthehighest/gi, "")
      
      // ✅ STEP 5: Fix spacing and punctuation
      .replace(/\s{2,}/g, ' ')           // Multiple spaces → single space
      .replace(/\n{3,}/g, "\n\n")        // Multiple newlines → double newline
      .replace(/([.!?])\s*([A-Z])/g, '$1 $2') // Ensure space after punctuation
      
      // ✅ STEP 6: Remove control characters
      .replace(/\r/g, "")
      .replace(/\f/g, "")
      
      // ✅ STEP 7: Final cleanup
      .replace(/^\s+|\s+$/g, '') // Trim start and end
      .replace(/\s+\./g, '.')    // Remove space before period
      .replace(/\s+,/g, ',')     // Remove space before comma
      
      .trim()
  );
}

// ============================================
// MANUAL VOCABULARY EXTRACTION (FALLBACK)
// ============================================
// Line ~2300 atrofida - generateAdvancedVocabulary funksiyasini ALMASHTIRING
async function generateAdvancedVocabulary(content, level = 'B1') {
  const vocabCounts = {
    'B1': { min: 5, max: 7 },
    'B2': { min: 8, max: 10 },
    'C1': { min: 10, max: 15 }
  };
  
  const { min, max } = vocabCounts[level] || vocabCounts['B1'];
  
  console.log(`🤖 AI generating ${min}-${max} vocab words for ${level} level...`);
  
  // ✅ IMPROVED PROMPT - STRICTER FORMAT
  const prompt = `Extract EXACTLY ${max} ADVANCED vocabulary words from this text.

⚠️ LEVEL: ${level}

CRITICAL RULES:
1. Extract ONLY words that ACTUALLY appear in the text below
2. Words must be ${level === 'C1' ? 'C1-C2' : level === 'B2' ? 'B2-C1' : 'B1-B2'} level
3. Return EXACTLY ${max} words, no more, no less
4. Each word MUST use this EXACT format (no variations!)

FORMAT (COPY THIS EXACTLY):

WORD 1: [word from text]
DEFINITION: [short definition]
UZBEK: [1-3 word translation]
RUSSIAN: [1-3 word translation in Cyrillic]
EXAMPLE: "[full sentence using the word]"

WORD 2: [word from text]
DEFINITION: [short definition]
UZBEK: [1-3 word translation]
RUSSIAN: [1-3 word translation in Cyrillic]
EXAMPLE: "[full sentence using the word]"

... continue for ${max} words

⚠️ IMPORTANT:
- Use ONLY words from the text below
- NO emojis (📖, 🇺🇿, 🇷🇺, 💬)
- NO extra text or explanations
- Follow the format EXACTLY

TEXT (first 3000 chars):
${content.substring(0, 3000)}`;

  try {
    const response = await callSmartAI(prompt, 2500);
    
    console.log('✅ AI vocab response:', response.substring(0, 200) + '...');
    
    // ✅ IMPROVED PARSER
    const vocabulary = parseVocabResponseImproved(response, content);
    
    console.log(`✅ Parsed ${vocabulary.length} words from AI response`);
    
    // ✅ IMPROVED VALIDATION - FLEXIBLE MATCHING
    const validated = vocabulary.filter(vocab => {
      const word = vocab.word.toLowerCase().trim();
      
      // Check if word exists in text (flexible matching)
      const patterns = [
        new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi'),  // Exact word
        new RegExp(`\\b${escapeRegex(word)}s\\b`, 'gi'), // Plural
        new RegExp(`\\b${escapeRegex(word)}ed\\b`, 'gi'), // Past tense
        new RegExp(`\\b${escapeRegex(word)}ing\\b`, 'gi'), // Present continuous
      ];
      
      const found = patterns.some(pattern => pattern.test(content));
      
      if (!found) {
        console.log(`⚠️ Word "${word}" not found in text, removing...`);
      }
      
      return found;
    });
    
    console.log(`✅ Validated ${validated.length}/${vocabulary.length} words`);
    
    // ✅ Ensure min-max range
    if (validated.length < min) {
      console.warn(`⚠️ Only ${validated.length} words found, expected min ${min}`);
      // Fallback to manual extraction if too few
      if (validated.length === 0) {
        console.log('🔄 Falling back to manual extraction...');
        return extractVocabularyManually(content, level);
      }
    }
    
    return validated.slice(0, max);
    
  } catch (error) {
    console.error('❌ AI vocab generation failed:', error);
    
    // Fallback: manual extraction
    return extractVocabularyManually(content, level);
  }
}

// ✅ IMPROVED PARSER - HANDLES BOTH OLD AND NEW FORMATS
function parseVocabResponseImproved(response, content) {
  const vocabulary = [];
  
  console.log('📝 Parsing vocab response...');
  
  // ✅ METHOD 1: Try new format (WORD 1: ...)
  const wordBlocks = response.split(/WORD \d+:/i).filter(block => block.trim());
  
  if (wordBlocks.length > 0) {
    console.log(`✅ Found ${wordBlocks.length} word blocks`);
    
    for (const block of wordBlocks) {
      try {
        // Extract word (first line before DEFINITION)
        const lines = block.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) continue;
        
        const wordLine = lines[0].trim();
        const word = wordLine.replace(/^[:\s]+/, '').trim();
        
        if (!word || word.length < 2) continue;
        
        // Extract definition
        const defMatch = block.match(/DEFINITION[:\s]*([^\n]+)/i);
        const definition = defMatch ? defMatch[1].trim() : 'Advanced vocabulary word';
        
        // Extract Uzbek
        const uzMatch = block.match(/(?:UZBEK|O'ZBEK)[:\s]*([^\n]+)/i);
        const translation_uz = uzMatch ? uzMatch[1].trim() : word;
        
        // Extract Russian
        const ruMatch = block.match(/(?:RUSSIAN|РУССКИЙ)[:\s]*([^\n]+)/i);
        let translation_ru = ruMatch ? ruMatch[1].trim() : word;
        
        // Validate Russian (must have Cyrillic)
        if (!/[а-яА-ЯёЁ]/.test(translation_ru)) {
          translation_ru = `${word} (перевод не найден)`;
        }
        
        // Extract example
        const exMatch = block.match(/EXAMPLE[:\s]*["""']([^"""'\n]+)["""']/i);
        const example = exMatch ? exMatch[1].trim() : `Example with "${word}"`;
        
        vocabulary.push({
          word,
          definition,
          translation_uz,
          translation_ru,
          example
        });
        
        console.log(`✅ Parsed word: ${word}`);
        
      } catch (error) {
        console.error('❌ Parse error for block:', error);
      }
    }
  }
  
  // ✅ METHOD 2: Try old format with emojis (fallback)
  if (vocabulary.length === 0) {
    console.log('🔄 Trying old format with emojis...');
    
    const oldBlocks = response.split(/📖 WORD \d+:/i).filter(block => block.trim());
    
    for (const block of oldBlocks) {
      try {
        const wordMatch = block.match(/^([a-z]+)/i);
        if (!wordMatch) continue;
        const word = wordMatch[1].trim();
        
        const defMatch = block.match(/DEFINITION[:\s]*([^\n]+)/i);
        const definition = defMatch ? defMatch[1].trim() : 'Advanced vocabulary word';
        
        const uzMatch = block.match(/🇺🇿\s*(?:O['']?ZBEK|UZBEK)[:\s]*([^\n]+)/i);
        const translation_uz = uzMatch ? uzMatch[1].trim() : word;
        
        const ruMatch = block.match(/🇷🇺\s*(?:РУССКИЙ|RUSSIAN)[:\s]*([^\n]+)/i);
        let translation_ru = ruMatch ? ruMatch[1].trim() : word;
        
        if (!/[а-яА-ЯёЁ]/.test(translation_ru)) {
          translation_ru = `${word} (перевод не найден)`;
        }
        
        const exMatch = block.match(/💬\s*EXAMPLE[:\s]*["""']([^"""']+)["""']/i);
        const example = exMatch ? exMatch[1].trim() : `Example with "${word}"`;
        
        vocabulary.push({
          word,
          definition,
          translation_uz,
          translation_ru,
          example
        });
        
      } catch (error) {
        console.error('❌ Parse error (old format):', error);
      }
    }
  }
  
  console.log(`✅ Total parsed: ${vocabulary.length} words`);
  
  return vocabulary;
}

// ✅ IMPROVED MANUAL FALLBACK
function extractVocabularyManually(content, level = 'B1') {
  const vocabCounts = {
    'B1': { min: 5, max: 7 },
    'B2': { min: 8, max: 10 },
    'C1': { min: 10, max: 15 }
  };
  
  const { max } = vocabCounts[level] || vocabCounts['B1'];
  
  console.log(`📚 Manual extraction: ${max} vocab words for ${level}`);
  
  // Advanced word patterns by level
  const advancedWordSets = {
    'B1': ['important', 'different', 'develop', 'increase', 'consider', 'provide', 'require'],
    'B2': ['significant', 'demonstrate', 'establish', 'contribute', 'participate', 'achieve', 'maintain', 'organize'],
    'C1': ['sophisticated', 'inherent', 'paradigm', 'ambiguous', 'exemplify', 'ubiquitous', 'meticulous', 'pragmatic', 'profound', 'substantial']
  };
  
  const advancedWords = advancedWordSets[level] || advancedWordSets['B1'];

  // Extract words from text (8+ letters)
  const words = content.match(/\b[a-z]{7,}\b/gi) || [];
  const uniqueWords = [...new Set(words.map((w) => w.toLowerCase()))];

  // Filter by level
  const filtered = uniqueWords
    .filter((word) => {
      return advancedWords.some((adv) => word.includes(adv)) || word.length >= 9;
    })
    .slice(0, max);

  console.log(`✅ Manual extraction found: ${filtered.length} words`);

  return filtered.map((word) => ({
    word: word,
    definition: `${level} level academic vocabulary`,
    translation_uz: `murakkab so'z`,
    translation_ru: `сложное слово`,
    example: `This word appears in academic contexts.`,
  }));
}
// GET ALL ARTICLES
app.get("/api/articles", async (req, res) => {
  try {
    console.log("📚 GET /api/articles - Loading PDFs...");
    const articles = await loadArticlesFromPDF();

    res.json({
      success: true,
      articles: articles,
      count: articles.length,
    });

    console.log(`✅ Sent ${articles.length} articles`);
  } catch (error) {
    console.error("❌ Get articles error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load articles: " + error.message,
    });
  }
});

// ============================================
// ARTICLE SUMMARY API - ✅ FIXED
// ============================================
// ✅ Line ~2100 atrofida - /api/article-summary endpointiga level qo'shing
app.post('/api/article-summary', async (req, res) => {
  try {
    const { article, userSummary, language, articleTitle, level = 'B1' } = req.body; // ✅ ADD LEVEL

    // ✅ Validation
    if (!article || !userSummary) {
      console.error('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Article and summary are required'
      });
    }

    if (userSummary.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Summary should be at least 50 characters long'
      });
    }

    console.log('✅ Data validated:', {
      articleTitle,
      articleLength: article.length,
      summaryLength: userSummary.length,
      language
    });

    // ✅ LEVEL-BASED FEEDBACK DEPTH
    const feedbackDepth = {
      'B1': {
        uz: "ODDIY feedback - asosiy xatolar va umumiy tavsiyalar",
        ru: "ПРОСТОЙ фидбэк - основные ошибки и общие советы",
        en: "SIMPLE feedback - main errors and general tips"
      },
      'B2': {
        uz: "STRUKTURALI feedback - batafsil tahlil va yaxshilash yo'llari",
        ru: "СТРУКТУРНЫЙ фидбэк - подробный анализ и пути улучшения",
        en: "STRUCTURED feedback - detailed analysis and improvement paths"
      },
      'C1': {
        uz: "PROFESSIONAL feedback - chuqur tahlil, nuance, akademik tavsiyalar",
        ru: "ПРОФЕССИОНАЛЬНЫЙ фидбэк - глубокий анализ, нюансы, академические советы",
        en: "PROFESSIONAL feedback - deep analysis, nuance, academic recommendations"
      }
    };

    const depthInstruction = feedbackDepth[level]?.[language] || feedbackDepth['B1'][language];

    const prompt = `You are an expert English teacher evaluating a student's article summary.

⚠️ ARTICLE LEVEL: ${level} (${depthInstruction})

Original Article Title: "${articleTitle || 'Untitled Article'}"

Original Article (first 2000 chars):
${article.substring(0, 2000)}

Student's Summary:
${userSummary}

Provide ${level === 'C1' ? 'ADVANCED DETAILED' : level === 'B2' ? 'STRUCTURED' : 'SIMPLE'} feedback in ${language}.

**IMPORTANT: Format your response EXACTLY like this:**

**SCORE: X/100**

**1. STRENGTHS ✅:**
${level === 'C1' ? '- (5-7 detailed points with examples)' : '- (3-5 points)'}

**2. KEY POINTS MISSED ⚠️:**
${level === 'C1' ? '- (With importance ranking)' : '- (Basic list)'}

**3. GRAMMAR & VOCABULARY 📝:**
${level === 'C1' ? '- Grammar: (Advanced analysis)\n- Vocabulary: (Sophistication level + suggestions)\n- Style: (Tone, register, coherence)' : '- (Basic corrections)'}

${level === 'C1' ? `
**4. ADVANCED ANALYSIS 🎓:**
- Critical Thinking: (How well analyzed)
- Argumentation: (Logic and structure)
- Academic Writing: (Formality, precision)
` : ''}

**${level === 'C1' ? '5' : '4'}. SUGGESTIONS 💡:**
${level === 'C1' ? '- (Specific, actionable, prioritized)' : '- (General tips)'}

Score criteria:
${level === 'C1' ? `
- 90-100: Excellent C1 summary with critical analysis
- 80-89: Very good C1 summary, minor analytical gaps
- 70-79: Good B2+ summary, needs more depth
- 60-69: B2 summary, lacks C1 sophistication
- Below 60: Needs significant C1 development
` : level === 'B2' ? `
- 90-100: Excellent B2 summary with good structure
- 80-89: Very good summary, minor points missed
- 70-79: Good B1+ summary
- 60-69: Satisfactory, needs more detail
- Below 60: Needs improvement
` : `
- 90-100: Perfect simple summary
- 80-89: Very good basic summary
- 70-79: Good effort
- 60-69: Acceptable
- Below 60: Practice more
`}`;



    console.log('🤖 Calling Gemini API...');
    
    const result = await callSmartAI(prompt, level === 'C1' ? 3000 : 2000);
    
    console.log('✅ Gemini response received:', result.substring(0, 100) + '...');
    
    // ✅ Extract score with multiple regex patterns
    let score = 75; // Default score
    
    const scorePatterns = [
      /SCORE[:\s]*(\d+)/i,
      /Ball[:\s]*(\d+)/i,
      /Оценка[:\s]*(\d+)/i,
      /(\d+)\/100/,
      /Score[:\s]*(\d+)/i
    ];
    
    for (const pattern of scorePatterns) {
      const match = result.match(pattern);
      if (match) {
        score = parseInt(match[1]);
        console.log(`✅ Score extracted: ${score} using pattern: ${pattern}`);
        break;
      }
    }

    const formattedFeedback = formatAIResponse(result);

    console.log('📊 Analysis complete - Score:', score);

    res.json({
      success: true,
      feedback: formattedFeedback,
      score: score,
      level: level // ✅ RETURN LEVEL
    });

  } catch (error) {
    console.error('❌ Article summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze summary: ' + error.message
    });
  }
});

// ============================================
// DEBUG ENDPOINT - ARTICLE CLEANING TEST ✅
// ============================================
app.get('/api/test-clean', async (req, res) => {
  try {
    const testContent = `The Power of Cultural typically held periodically, to celebrate or commemorate something">Festivals Cultural typically held periodically, to celebrate or commemorate something">festivals are some of the most joyful and colorful events in the world.`;
    
    const cleaned = cleanContent(testContent);
    
    res.json({
      success: true,
      original: testContent,
      cleaned: cleaned,
      comparison: {
        originalLength: testContent.length,
        cleanedLength: cleaned.length,
        artifactsRemoved: testContent.length - cleaned.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



function extractVocabulary(content) {
  // Advanced C1/C2 words to look for
  const advancedPatterns = [
    "sophisticated",
    "inherent",
    "paradigm",
    "ambiguous",
    "convoluted",
    "exemplify",
    "juxtapose",
    "ubiquitous",
    "meticulous",
    "pragmatic",
    "eloquent",
    "resilient",
    "phenomenon",
    "unprecedented",
    "compelling",
    "intricate",
    "profound",
    "substantial",
    "comprehensive",
    "inevitable",
    "perpetual",
    "autonomous",
    "cultivate",
    "endeavor",
    "enhance",
    "facilitate",
    "implement",
    "advocate",
    "allocate",
    "compensate",
  ];

  const words = content.match(/\b[a-z]{7,}\b/gi) || [];
  const uniqueWords = [...new Set(words.map((w) => w.toLowerCase()))];

  // Filter advanced words
  const filtered = uniqueWords
    .filter((word) => {
      return (
        advancedPatterns.some((pattern) => word.includes(pattern)) ||
        word.length >= 10
      );
    })
    .slice(0, 20);

  return filtered.map((word) => ({
    word: word,
    definition: `Advanced academic vocabulary word`,
    translation_uz: `${word} (murakkab akademik so'z)`,
    translation_ru: `${word} (сложное академическое слово)`,
    example: `This word is commonly used in academic contexts.`,
  }));
}

// ✅ Helper function (keep existing)
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ============================================
// ADVANCED VOCABULARY EXTRACTION - IMPROVED ✅
// ============================================
async function extractAdvancedVocabulary(content) {
  const prompt = `Extract EXACTLY 10-15 ADVANCED vocabulary words from this text.

CRITICAL RULES:
1. Extract ONLY words that actually appear in the text
2. Words must be C1-C2 or B2 level (sophisticated, academic, complex)
3. Return EXACTLY the words found in the text (same spelling, same form)
4. Maximum 15 words
5. Each word MUST be present in the original text

Focus on:
- Academic words (e.g., sophisticated, paradigm, inherent)
- Complex vocabulary (e.g., meticulous, pragmatic, ubiquitous)
- Technical terms
- Literary language

IMPORTANT: Return ONLY valid JSON, no markdown, no backticks.

Format:
{
  "vocabulary": [
    {
      "word": "sophisticated",
      "definition": "Having, revealing, or involving a great deal of worldly experience and knowledge",
      "translation_uz": "murakkab, yuqori darajadagi",
      "translation_ru": "сложный, изощренный",
      "example": "She has sophisticated tastes in literature"
    }
  ]
}

Text:
${content.substring(0, 3000)}`;

  try {
    console.log('🔍 Extracting vocabulary using AI...');
    
    // ✅ Multi-API fallback system
    const response = await callSmartAI(prompt, 2000);

    // Clean response
    let cleanJson = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/^[^{]*/, "")
      .replace(/[^}]*$/, "")
      .trim();

    const data = JSON.parse(cleanJson);
    const vocabulary = data.vocabulary || [];
    
    // Filter words that actually exist in the text
    const filteredVocabulary = vocabulary.filter(vocab => {
      const wordInText = new RegExp(`\\b${escapeRegex(vocab.word)}\\b`, 'gi').test(content);
      if (!wordInText) {
        console.log(`⚠️ Word "${vocab.word}" not found in text, removing...`);
      }
      return wordInText;
    });
    
    console.log(`✅ Vocabulary extracted: ${filteredVocabulary.length}/${vocabulary.length} words validated`);
    
    // Limit to 15 words maximum
    return filteredVocabulary.slice(0, 15);
    
  } catch (error) {
    console.error("❌ AI vocabulary extraction error:", error);
    console.log("🔄 Falling back to manual extraction...");
    
    // Fallback: manual extraction
    return extractVocabularyManually(content);
  }
}
module.exports = { loadArticlesFromPDF };

// ============================================
// 404 HANDLER - ✅ OXIRGA KO'CHIRILDI
// ============================================
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint topilmadi",
    path: req.path,
    availableEndpoints: [
      "GET /",
      "GET /api/test",
      "POST /api/fix-homework",
      "POST /api/check-writing",
      "POST /api/vocabulary",
      "GET /api/motivation",
      "POST /api/article-summary",
      "POST /api/generate-quiz",
      "POST /api/quiz-stats",
      "POST /api/study-assistant",
      "POST /api/audio-to-text",
      "POST /api/speaking-feedback",
    ],
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, async () => {
  console.log(`🚀 ZiyoAI Server (Gemini) ishga tushdi!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? "✅" : "❌"}`);
  console.log(
    `🔑 Deepgram API Key: ${process.env.DEEPGRAM_API_KEY ? "✅" : "❌"}`
  );

  // ✅ PDF ARTICLES NI PRELOAD QILISH
  console.log("\n📚 Loading PDF articles...");
  try {
    const articles = await loadArticlesFromPDF();
    console.log(`✅ Successfully loaded ${articles.length} articles`);
  } catch (error) {
    console.error("❌ Failed to load articles:", error.message);
  }
});

// ============================================
// TEST ENDPOINT - Summary API
// ============================================
app.get('/api/article-summary/test', (req, res) => {
  res.json({
    success: true,
    message: 'Article Summary API is working! ✅',
    endpoint: '/api/article-summary',
    method: 'POST',
    requiredFields: ['article', 'userSummary', 'language', 'articleTitle']
  });
});