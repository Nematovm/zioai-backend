// ZIYOAI SERVER - GEMINI VERSION

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Common Modules
const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require('multer'); // ← FAQAT BU YERDA
// DEEPGRAM SDK
const { createClient } = require("@deepgram/sdk");

// Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Multer configuration (FAQAT BIR MARTA) ← BU YERDA
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

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

// CORS - YANGILANGAN ✅
app.use(
  cors({
    origin: [
      "https://zioai-frontend.onrender.com",
      "http://localhost:3000",
      "http://127.0.0.1:5500",
      "http://127.0.0.1:5501" // ← QO'SHING
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // ← BU MUHIM
  })
);

app.options("*", cors()); // ← Preflight requests uchun

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
// MOTIVATION QUOTES API
app.get("/api/motivation", async (req, res) => {
  try {
    const motivationalQuotes = [
      { quote: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.", author: "Dr. Seuss" },
      { quote: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
      { quote: "A reader lives a thousand lives before he dies. The man who never reads lives only one.", author: "George R.R. Martin" },
      { quote: "The only thing that you absolutely have to know, is the location of the library.", author: "Albert Einstein" },
      { quote: "Education is not the filling of a pail, but the lighting of a fire.", author: "William Butler Yeats" },
      { quote: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
      { quote: "The book you don't read won't help.", author: "Jim Rohn" },
      { quote: "Reading is to the mind what exercise is to the body.", author: "Joseph Addison" },
      { quote: "There is no friend as loyal as a book.", author: "Ernest Hemingway" },
      { quote: "Today a reader, tomorrow a leader.", author: "Margaret Fuller" },
      { quote: "Books are a uniquely portable magic.", author: "Stephen King" },
      { quote: "The man who does not read has no advantage over the man who cannot read.", author: "Mark Twain" },
      { quote: "Knowledge is power.", author: "Francis Bacon" },
      { quote: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
      { quote: "Learning never exhausts the mind.", author: "Leonardo da Vinci" },
      { quote: "Education is the passport to the future.", author: "Malcolm X" },
      { quote: "Once you learn to read, you will be forever free.", author: "Frederick Douglass" },
      { quote: "The beautiful thing about learning is that nobody can take it away from you.", author: "B.B. King" },
      { quote: "Reading is essential for those who seek to rise above the ordinary.", author: "Jim Rohn" },
      { quote: "A book is a dream that you hold in your hand.", author: "Neil Gaiman" },
    ];

    const random = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

    res.json({
      success: true,
      quote: `"${random.quote}"`,
      author: `— ${random.author}`,
    });
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


// ============================================
// STUDY ASSISTANT API
// ============================================
app.post("/api/study-assistant", async (req, res) => {
  try {
    const { mode, content, language = "uz" } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Content yuborilmadi", success: false });
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

⚠️ Answer only in English.`
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

⚠️ Answer only in English.`
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

⚠️ Answer only in English.`
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

⚠️ Answer only in English.`
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

⚠️ Answer only in English.`
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

⚠️ Answer only in English.`
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

⚠️ Answer only in English.`
      }
    };

    if (!prompts[mode]) {
      return res.status(400).json({ error: "Noto'g'ri mode", success: false });
    }

    const selectedPrompt = prompts[mode][language] || prompts[mode]["uz"];
    const rawResponse = await callGemini(selectedPrompt, 4096);
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      result: formattedResponse,
      mode: mode
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


// ============================================
// AUDIO TO TEXT API (Gemini Speech-to-Text)
// ============================================
// app.post("/api/audio-to-text", upload.single('audio'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ 
//         error: "Audio file yuborilmadi", 
//         success: false 
//       });
//     }

//     console.log("📥 Audio file received:", {
//       size: req.file.size,
//       mimetype: req.file.mimetype,
//       originalname: req.file.originalname
//     });

//     // Audio ni base64 ga aylantirish
//     const audioBase64 = req.file.buffer.toString('base64');

//     // Gemini model (audio qo'llab-quvvatlaydigan)
//     const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
//     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

//     // Prompt bilan audio yuborish
//     const prompt = `Please transcribe this audio recording accurately. Only return the transcribed text, nothing else. The audio is in English.`;

//     const result = await model.generateContent([
//       prompt,
//       {
//         inlineData: {
//           mimeType: req.file.mimetype || "audio/webm",
//           data: audioBase64
//         }
//       }
//     ]);

//     const response = await result.response;
//     const transcript = response.text().trim();

//     console.log("✅ Gemini transcript:", transcript);

//     if (!transcript || transcript.length < 10) {
//       throw new Error("Ovoz tanilmadi. Iltimos, aniqroq gapiring va qayta urinib ko'ring.");
//     }

//     res.json({
//       success: true,
//       transcript: transcript
//     });

//   } catch (error) {
//     console.error("❌ Gemini Speech-to-Text xatosi:", error);
    
//     res.json({ 
//       error: error.message || "Audio tahlil qilishda xatolik yuz berdi", 
//       success: false 
//     });
//   }
// });


// ============================================
// AUDIO TO TEXT API - DEEPGRAM ✅ TUZATILGAN
// ============================================
app.post("/api/audio-to-text", upload.single('audio'), async (req, res) => {
  try {
    console.log("📥 Audio request received");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("File:", req.file ? "✅" : "❌");

    if (!req.file) {
      return res.status(400).json({ 
        error: "Audio file yuborilmadi", 
        success: false,
        details: "Multer did not receive file"
      });
    }

    console.log("📥 Audio file received:", {
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      buffer: req.file.buffer ? "✅" : "❌"
    });

    // Deepgram API Key tekshirish
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY .env faylida topilmadi");
    }

    console.log("🔑 Deepgram API Key:", process.env.DEEPGRAM_API_KEY ? "✅" : "❌");

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
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    console.log("✅ Deepgram transcript:", transcript);

    if (!transcript || transcript.trim().length < 10) {
      throw new Error("Ovoz tanilmadi. Iltimos, aniqroq gapiring va qayta urinib ko'ring.");
    }

    res.json({
      success: true,
      transcript: transcript
    });

  } catch (error) {
    console.error("❌ Audio-to-text xatosi:", error);
    
    res.status(500).json({ 
      error: error.message || "Audio tahlil qilishda xatolik yuz berdi", 
      success: false,
      stack: error.stack // ← Debugging uchun
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
      return res.status(400).json({ error: "Transcript yuborilmadi", success: false });
    }

    if (!topic || topic.trim() === "") {
      return res.status(400).json({ error: "Topic yuborilmadi", success: false });
    }

    const prompts = {
      uz: `Sen professional ${examType} speaking examiner san. Quyidagi speaking javobini baholab, batafsil feedback ber:

📝 TOPIC: ${topic}

🎤 FOYDALANUVCHI JAVOBI:
${transcript}

JAVOBDA QUYIDAGILARNI YOZ:

**1. UMUMIY BAHOLASH:**
${examType === 'IELTS' ? 'IELTS Band Score (1-9)' : 'CEFR Ball (0-75) va Level (A1-C2)'}

**2. BATAFSIL BALLAR:**
${examType === 'IELTS' ? `
- Fluency & Coherence: X/9
- Lexical Resource: X/9
- Grammatical Range & Accuracy: X/9
- Pronunciation: X/9
- OVERALL BAND: X/9` : `
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
• 65-75 ball = C1 (Yuqori)`}

**3. KUCHLI TOMONLAR ✅:**
Nima yaxshi qilgan - 3-5 ta punkt.

**4. YAXSHILASH KERAK ⚠️:**
Nima ustida ishlash kerak - 3-5 ta punkt.

**5. XATOLAR TAHLILI ❌:**
Grammatik va leksik xatolar ro'yxati va to'g'ri varianti.

**6. SAMPLE ANSWER 📝:**
Shu topic uchun ${examType === 'IELTS' ? 'Band 8-9' : 'C1-C2'} darajadagi namuna javob.

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
${examType === 'IELTS' ? 'IELTS Band Score (1-9)' : 'CEFR Балл (0-75) и Уровень (A1-C2)'}

**2. ДЕТАЛЬНЫЕ БАЛЛЫ:**
${examType === 'IELTS' ? `
- Fluency & Coherence: X/9
- Lexical Resource: X/9
- Grammatical Range & Accuracy: X/9
- Pronunciation: X/9
- OVERALL BAND: X/9` : `
- Fluency (Беглость): X/15
- Vocabulary (Словарный запас): X/15
- Grammar (Грамматика): X/15
- Pronunciation (Произношение): X/15
- Content (Содержание): X/15
- ОБЩИЙ БАЛЛ: X/75
- УРОВЕНЬ: A1/A2/B1/B2/C1/C2`}

**3. СИЛЬНЫЕ СТОРОНЫ ✅:**
Что хорошо - 3-5 пунктов.

**4. НУЖНО УЛУЧШИТЬ ⚠️:**
Над чем работать - 3-5 пунктов.

**5. АНАЛИЗ ОШИБОК ❌:**
Список грамматических и лексических ошибок с правильными вариантами.

**6. SAMPLE ANSWER 📝:**
Образец ответа уровня ${examType === 'IELTS' ? 'Band 8-9' : 'C1-C2'} для этой темы.

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
${examType === 'IELTS' ? 'IELTS Band Score (1-9)' : 'CEFR Score (0-75) and Level (A1-C2)'}

**2. DETAILED SCORES:**
${examType === 'IELTS' ? `
- Fluency & Coherence: X/9
- Lexical Resource: X/9
- Grammatical Range & Accuracy: X/9
- Pronunciation: X/9
- OVERALL BAND: X/9` : `
- Fluency: X/15
- Vocabulary: X/15
- Grammar: X/15
- Pronunciation: X/15
- Content: X/15
- TOTAL SCORE: X/75
- LEVEL: A1/A2/B1/B2/C1/C2`}

**3. STRENGTHS ✅:**
What was done well - 3-5 points.

**4. AREAS FOR IMPROVEMENT ⚠️:**
What needs work - 3-5 points.

**5. ERROR ANALYSIS ❌:**
List of grammatical and lexical errors with corrections.

**6. SAMPLE ANSWER 📝:**
A ${examType === 'IELTS' ? 'Band 8-9' : 'C1-C2'} level sample answer for this topic.

**7. USEFUL PHRASES 💡:**
10 useful phrases for this topic.

**8. RECOMMENDATIONS 🎯:**
- Do more of: ...
- Do less of: ...
- Stop doing: ...
- Practice by: ...

⚠️ Answer only in English!`
    };

    const selectedPrompt = prompts[language] || prompts["uz"];
    const rawResponse = await callGemini(selectedPrompt, 4096);
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      result: formattedResponse,
      examType: examType
    });

  } catch (error) {
    console.error("❌ Speaking Feedback API xatosi:", error);
    res.status(500).json({ error: error.message, success: false });
  }
});