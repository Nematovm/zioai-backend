// ZIYOAI SERVER - GEMINI VERSION

// Common Modules
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");

// Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Gemini API call function
async function callGemini(prompt, maxTokens = 4096) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data.candidates[0].content.parts[0].text;
}

// Gemini with image
async function callGeminiWithImage(prompt, base64Image, mediaType) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { maxOutputTokens: 4096 }
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data.candidates[0].content.parts[0].text;
}

// Middleware
app.use(
  cors({
    origin: [
      "https://zioai-frontend.onrender.com",
      "http://localhost:3000",
      "http://127.0.0.1:5500",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(__dirname));

// HELPER FUNCTION - TEXT FORMATTING
function formatAIResponse(text) {
  let html = text;
  let sectionOpen = false;

  html = html.replace(/\*\*(\d+)\.\s*([^*]+)\*\*/g, (match, number, title) => {
    const icons = { 1: "🔍", 2: "✅", 3: "📐", 4: "📝", 5: "💡", 6: "📖", 7: "🚀" };
    let close = sectionOpen ? "</div></div>" : "";
    sectionOpen = true;
    return close + `<div class="ai-section"><div class="ai-heading"><span class="ai-icon">${icons[number] || "📌"}</span><span class="ai-number">${number}</span><span class="ai-title">${title.trim()}</span></div><div class="ai-body">`;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="ai-bold">$1</strong>');
  html = html.replace(/^[-•]\s+(.+)$/gm, '<div class="ai-bullet">$1</div>');
  html = html.replace(/`([^`]+)`/g, '<code class="ai-code">$1</code>');
  html = html.replace(/(\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\d+)/g, '<span class="ai-formula">$1</span>');
  html = html.replace(/\n\n+/g, "<br><br>");
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/^[#>\s]+/gm, "");
  html = html.replace(/##/g, "");
  html = html.replace(/#+\s*$/gm, "");
  html = html.replace(/---|```|`/g, "");

  if (sectionOpen) html += "</div></div>";
  return html;
}

// 1. HOMEWORK FIXER API
app.post("/api/fix-homework", async (req, res) => {
  try {
    const { homework, image, type, language = "uz" } = req.body;

    const prompts = {
      uz: {
        instruction: `Sen professional o'qituvchi va matematika mutaxassisisisan.`,
        sections: `📋 JAVOBINGIZDA QUYIDAGILARNI YOZING:

**1. TEKSHIRISH NATIJASI:**
Vazifa to'g'ri yoki noto'g'ri ekanligini yoz.

**2. TO'G'RI JAVOB:**
To'liq javobni yoz.

**3. FORMULA/QOIDA:**
Qaysi formula ishlatilganini yoz.

**4. QADAM-BA-QADAM YECHIM:**
Har bir qadamni yoz.

**5. NIMA UCHUN SHUNDAY:**
Mantiqiy tushuntirish.

**6. O'XSHASH MISOL:**
Yana bir misol ber.

**7. MASLAHAT:**
Ko'nikma rivojlantirish uchun maslahat.

⚠️ JAVOBNI FAQAT O'ZBEK TILIDA YOZ! 🇺🇿`,
      },
      ru: {
        instruction: `Ты профессиональный преподаватель и эксперт по математике.`,
        sections: `📋 В ОТВЕТЕ УКАЖИ:

**1. РЕЗУЛЬТАТ ПРОВЕРКИ:**
Правильное задание или нет.

**2. ПРАВИЛЬНЫЙ ОТВЕТ:**
Полный ответ.

**3. ФОРМУЛА/ПРАВИЛО:**
Какая формула использовалась.

**4. ПОШАГОВОЕ РЕШЕНИЕ:**
Каждый шаг отдельно.

**5. ПОЧЕМУ ТАК:**
Логическое обоснование.

**6. ПОХОЖИЙ ПРИМЕР:**
Еще один пример.

**7. СОВЕТ:**
Как развить навык.

⚠️ ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ! 🇷🇺`,
      },
      en: {
        instruction: `You are a professional teacher and math expert.`,
        sections: `📋 IN YOUR ANSWER INCLUDE:

**1. CHECK RESULT:**
Is the task correct or incorrect.

**2. CORRECT ANSWER:**
Complete answer.

**3. FORMULA/RULE:**
Which formula was used.

**4. STEP-BY-STEP SOLUTION:**
Each step separately.

**5. WHY IT'S LIKE THIS:**
Logical reasoning.

**6. SIMILAR EXAMPLE:**
Another example.

**7. TIP:**
Advice for skill development.

⚠️ ANSWER ONLY IN ENGLISH! 🇬🇧`,
      },
    };

    const selectedPrompt = prompts[language] || prompts["uz"];
    let rawResponse;

    if (type === "image") {
      const base64Data = image.split(",")[1];
      const mediaType = image.split(";")[0].split(":")[1];
      const prompt = `${selectedPrompt.instruction}\n\nRasmdagi uy vazifani tekshir va batafsil tushuntir.\n\n${selectedPrompt.sections}`;
      rawResponse = await callGeminiWithImage(prompt, base64Data, mediaType);
    } else {
      const prompt = `${selectedPrompt.instruction}\n\n📝 UY VAZIFA:\n${homework}\n\n${selectedPrompt.sections}`;
      rawResponse = await callGemini(prompt);
    }

    const formattedResponse = formatAIResponse(rawResponse);
    res.json({ success: true, correctedHomework: formattedResponse });
  } catch (error) {
    console.error("❌ Homework API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// 2. GRAMMAR CHECKER
app.post("/api/check-grammar", async (req, res) => {
  try {
    const { text, language = "uz" } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Text yuborilmadi", success: false });
    }

    const prompts = {
      uz: `Sen professional grammatika mutaxassisisisan.

MATN:
${text}

JAVOBNI SHUNDAY BER:

**1. XATOLAR:**
Topilgan xatolarni sanab o't.

**2. TUZATILGAN MATN:**
To'liq tuzatilgan matnni yoz.

**3. TUSHUNTIRISHLAR:**
Har bir xatoni nima uchun tuzatganingni tushuntir.

**4. MASLAHATLAR:**
Kelajakda xatolardan qochish uchun maslahat ber.

⚠️ JAVOBNI FAQAT O'ZBEK TILIDA BER! 🇺🇿`,
      ru: `Ты профессиональный эксперт по грамматике.

ТЕКСТ:
${text}

ОТВЕТ ПРЕДСТАВЬ ТАК:

**1. ОШИБКИ:**
Перечисли найденные ошибки.

**2. ИСПРАВЛЕННЫЙ ТЕКСТ:**
Полностью исправленный текст.

**3. ОБЪЯСНЕНИЯ:**
Объясни, почему исправил каждую ошибку.

**4. СОВЕТЫ:**
Советы, как избегать ошибок.

⚠️ ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ! 🇷🇺`,
      en: `You are a professional grammar expert.

TEXT:
${text}

PROVIDE YOUR ANSWER LIKE THIS:

**1. ERRORS:**
List the errors found.

**2. CORRECTED TEXT:**
Fully corrected text.

**3. EXPLANATIONS:**
Explain why you corrected each error.

**4. TIPS:**
Tips to avoid errors.

⚠️ ANSWER ONLY IN ENGLISH! 🇬🇧`,
    };

    const rawResponse = await callGemini(prompts[language] || prompts["uz"], 3096);
    const formattedResponse = formatAIResponse(rawResponse);
    res.json({ success: true, result: formattedResponse });
  } catch (error) {
    console.error("❌ Grammar API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// 3. VOCABULARY BUILDER
app.post("/api/vocabulary", async (req, res) => {
  try {
    const { word, language = "uz" } = req.body;

    if (!word || word.trim() === "") {
      return res.status(400).json({ error: "So'z yuborilmadi", success: false });
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

    const rawResponse = await callGemini(prompts[language] || prompts["uz"], 2048);
    const formattedResponse = formatAIResponse(rawResponse);
    res.json({ success: true, result: formattedResponse, word: word });
  } catch (error) {
    console.error("❌ Vocabulary API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// 4. MOTIVATION QUOTES API
app.get("/api/motivation", async (req, res) => {
  try {
    const quotes = [
      "🌟 Keep pushing forward! Every small step counts.",
      "💪 You're doing great! Stay focused on your goals.",
      "🚀 Believe in yourself! You're capable of amazing things.",
      "✨ Don't give up! Success is just around the corner.",
      "🎯 Stay motivated! Your hard work will pay off.",
    ];
    res.json({ success: true, quote: quotes[Math.floor(Math.random() * quotes.length)] });
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// 5. QUIZ GENERATOR API
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { article, questionCount, difficulty, language = "uz" } = req.body;

    if (!article || article.trim() === "") {
      return res.status(400).json({ error: "Matn yuborilmadi", success: false });
    }

    const difficultyNames = {
      uz: { easy: "oson", medium: "o'rtacha", hard: "qiyin" },
      ru: { easy: "легкий", medium: "средний", hard: "сложный" },
      en: { easy: "easy", medium: "medium", hard: "hard" },
    };

    const prompt = `Sen professional test tuzuvchisissan. Quyidagi matndan ${questionCount} ta ${difficultyNames[language]?.[difficulty] || "o'rtacha"} darajali test savollarini yarat.

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

    let rawResponse = await callGemini(prompt, 4096);
    
    rawResponse = rawResponse
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/^[^{]*/, "")
      .replace(/[^}]*$/, "")
      .trim();

    const quizData = JSON.parse(rawResponse);
    
    const validQuestions = quizData.questions.filter(
      (q) => q.question && Array.isArray(q.options) && q.options.length === 4 &&
        typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < 4
    );

    res.json({ success: true, questions: validQuestions, totalQuestions: validQuestions.length });
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

    let message = "", emoji = "";
    if (percentage >= 90) { message = "Ajoyib! 🎉"; emoji = "🏆"; }
    else if (percentage >= 70) { message = "Yaxshi! 💪"; emoji = "⭐"; }
    else if (percentage >= 50) { message = "Yomon emas! 📚"; emoji = "📖"; }
    else { message = "Mashq qiling! 🎯"; emoji = "💡"; }

    res.json({ success: true, message, emoji, percentage: parseInt(percentage) });
  } catch (error) {
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

// 404 HANDLER
app.use((req, res) => {
  res.status(404).json({ error: "Sahifa topilmadi", path: req.path });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`🚀 ZiyoAI Server (Gemini) ishga tushdi!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? "✅" : "❌"}`);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));