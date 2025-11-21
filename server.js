// ZIYOAI SERVER

// 1. Barcha kerakli modullarni yuklaymiz (BIRINCHI!)
require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");
const cors = require("cors");

// 2. Express app yaratamiz
const app = express();
const PORT = process.env.PORT || 3000;

// 3. Anthropic SDK-ni sozlaymiz
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 4. Middleware-larni sozlaymiz
// ✅ CORS TO'G'RILANDI - "ziyoai" to'g'ri yozildi
app.use(cors({
  origin: [
    'https://zioai-frontend.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ✅ Preflight so'rovlar uchun
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// ============================================
// HELPER FUNCTION - TEXT FORMATTING
// ============================================
function formatAIResponse(text) {
  let html = text;
  let sectionOpen = false;

  html = html.replace(/\*\*(\d+)\.\s*([^*]+)\*\*/g, (match, number, title) => {
    const icons = {
      '1': '🔍', '2': '✅', '3': '📐', '4': '📝',
      '5': '💡', '6': '📖', '7': '🚀'
    };

    let close = sectionOpen ? '</div></div>' : '';
    sectionOpen = true;

    return (
      close +
      `<div class="ai-section">
         <div class="ai-heading">
           <span class="ai-icon">${icons[number] || '📌'}</span>
           <span class="ai-number">${number}</span>
           <span class="ai-title">${title.trim()}</span>
         </div>
         <div class="ai-body">`
    );
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="ai-bold">$1</strong>');
  html = html.replace(/^[-•]\s+(.+)$/gm, '<div class="ai-bullet">$1</div>');
  html = html.replace(/`([^`]+)`/g, '<code class="ai-code">$1</code>');
  html = html.replace(/(\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\d+)/g, '<span class="ai-formula">$1</span>');
  html = html.replace(/\n\n+/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/^[#>\s]+/gm, '');
  html = html.replace(/##/g, '');
  html = html.replace(/#+\s*$/gm, '');
  html = html.replace(/---|```|`/g, '');

  if (sectionOpen) html += '</div></div>';

  return html;
}

// ============================================
// 1. HOMEWORK FIXER API
// ============================================
app.post("/api/fix-homework", async (req, res) => {
  try {
    const { homework, image, type, language = 'uz' } = req.body;

    const prompts = {
      uz: {
        instruction: `Sen professional o'qituvchi va matematika mutaxassisisisan.`,
        sections: `
📋 JAVOBINGIZDA QUYIDAGIlarni YOZING:

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

⚠️ JAVOBNI FAQAT O'ZBEK TILIDA YOZ! 🇺🇿`
      },
      ru: {
        instruction: `Ты профессиональный преподаватель и эксперт по математике.`,
        sections: `
📋 В ОТВЕТЕ УКАЖИ:

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

⚠️ ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ! 🇷🇺`
      },
      en: {
        instruction: `You are a professional teacher and math expert.`,
        sections: `
📋 IN YOUR ANSWER INCLUDE:

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

⚠️ ANSWER ONLY IN ENGLISH! 🇬🇧`
      }
    };

    const selectedPrompt = prompts[language] || prompts['uz'];

    let messageContent;

    if (type === 'image') {
      const base64Data = image.split(',')[1];
      const mediaType = image.split(';')[0].split(':')[1];

      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data,
          },
        },
        {
          type: "text",
          text: `${selectedPrompt.instruction}

Rasmdagi uy vazifani tekshir va batafsil tushuntir.

${selectedPrompt.sections}`,
        },
      ];
    } else {
      messageContent = `${selectedPrompt.instruction}

📝 UY VAZIFA:
${homework}

${selectedPrompt.sections}`;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
    });

    const rawResponse = message.content[0].text;
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      correctedHomework: formattedResponse,
    });

  } catch (error) {
    console.error("❌ Homework API xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// ============================================
// GRAMMAR CHECKER
// ============================================
app.post("/api/check-grammar", async (req, res) => {
  try {
    const { text, language = 'uz' } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({
        error: "Text yuborilmadi",
        success: false,
      });
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

⚠️ ANSWER ONLY IN ENGLISH! 🇬🇧`
    };

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3096,
      messages: [
        {
          role: "user",
          content: prompts[language] || prompts['uz'],
        },
      ],
    });

    const rawResponse = message.content[0].text;
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      result: formattedResponse,
    });

  } catch (error) {
    console.error("❌ Grammar API xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// ============================================
// VOCABULARY BUILDER
// ============================================
app.post("/api/vocabulary", async (req, res) => {
  try {
    const { word, language = 'uz' } = req.body;

    console.log("📚 Vocabulary so'rov:", { word, language });

    if (!word || word.trim() === "") {
      return res.status(400).json({
        error: "So'z yuborilmadi",
        success: false,
      });
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

В ОТВЕТЕ УКAЖИ:

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

⚠️ Answer ONLY in English.`
    };

    const selectedPrompt = prompts[language] || prompts['uz'];

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: selectedPrompt,
        },
      ],
    });

    const rawResponse = message.content[0].text;
    const formattedResponse = formatAIResponse(rawResponse);

    res.json({
      success: true,
      result: formattedResponse,
      word: word
    });

  } catch (error) {
    console.error("❌ Vocabulary API xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// ============================================
// MOTIVATION QUOTES API
// ============================================
app.get("/api/motivation", async (req, res) => {
  try {
    const motivationalQuotes = [
      "🌟 Keep pushing forward! Every small step counts.",
      "💪 You're doing great! Stay focused on your goals.",
      "🚀 Believe in yourself! You're capable of amazing things.",
      "✨ Don't give up! Success is just around the corner.",
      "🎯 Stay motivated! Your hard work will pay off.",
      "🌈 You're stronger than you think! Keep going.",
      "⭐ Dream big! You have the power to achieve it.",
      "🔥 Stay focused! Great things take time.",
      "💡 Learn something new today! Knowledge is power.",
      "🎓 Education is the key! Keep learning and growing.",
      "📚 Reading today, leading tomorrow!",
      "🌟 Your future depends on what you do today!",
      "💫 Small progress is still progress!",
      "🎨 Creativity takes courage! Keep creating.",
      "🏆 Success starts with self-discipline!"
    ];

    const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

    res.json({
      success: true,
      quote: randomQuote,
    });

  } catch (error) {
    console.error("❌ Motivation API xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// ============================================
// QUIZ GENERATOR API
// ============================================
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { article, questionCount, difficulty, language = 'uz' } = req.body;

    console.log("📝 Quiz so'rov:", { 
      articleLength: article?.length, 
      questionCount, 
      difficulty, 
      language 
    });

    if (!article || article.trim() === "") {
      return res.status(400).json({
        error: "Matn yuborilmadi",
        success: false,
      });
    }

    if (!questionCount || questionCount < 1 || questionCount > 20) {
      return res.status(400).json({
        error: "Savollar soni 1 dan 20 gacha bo'lishi kerak",
        success: false,
      });
    }

    const difficultyNames = {
      uz: { easy: "oson", medium: "o'rtacha", hard: "qiyin" },
      ru: { easy: "легкий", medium: "средний", hard: "сложный" },
      en: { easy: "easy", medium: "medium", hard: "hard" }
    };

    const prompts = {
      uz: {
        instruction: `Sen professional test tuzuvchisissan. Quyidagi matndan ${questionCount} ta ${difficultyNames.uz[difficulty] || "o'rtacha"} darajali test savollarini yarating.

📋 QOIDALAR:
- Har bir savol 4 ta variant bilan
- To'g'ri javobni aniq belgilang (0-3 orasida index)
- Har bir savolga qisqa tushuntirish qo'shing
- Savollar matn mazmuniga mos bo'lsin
- Variantlar qisqa va aniq bo'lsin

⚠️ JAVOBNI FAQAT JSON FORMATDA BERING, BOSHQA HECH NARSA YOZMANG!`,
        
        example: `
MISOL:
{
  "questions": [
    {
      "question": "Savol matni?",
      "options": ["Variant A", "Variant B", "Variant C", "Variant D"],
      "correctAnswer": 0,
      "explanation": "Bu to'g'ri javob, chunki..."
    }
  ]
}`
      },
      
      ru: {
        instruction: `Ты профессиональный составитель тестов. Создай ${questionCount} тестовых вопросов уровня ${difficultyNames.ru[difficulty] || "средний"} из следующего текста.

📋 ПРАВИЛА:
- Каждый вопрос с 4 вариантами
- Четко укажи правильный ответ (индекс 0-3)
- Добавь краткое объяснение к каждому вопросу
- Вопросы должны соответствовать содержанию текста
- Варианты должны быть краткими и точными

⚠️ ОТВЕЧАЙ ТОЛЬКО В ФОРМАТЕ JSON, НИЧЕГО БОЛЬШЕ НЕ ПИШИ!`,
        
        example: `
ПРИМЕР:
{
  "questions": [
    {
      "question": "Текст вопроса?",
      "options": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
      "correctAnswer": 0,
      "explanation": "Это правильный ответ, потому что..."
    }
  ]
}`
      },
      
      en: {
        instruction: `You are a professional test creator. Create ${questionCount} ${difficulty || "medium"} level test questions from the following text.

📋 RULES:
- Each question with 4 options
- Clearly indicate the correct answer (index 0-3)
- Add a brief explanation to each question
- Questions should match the text content
- Options should be concise and accurate

⚠️ RESPOND ONLY IN JSON FORMAT, WRITE NOTHING ELSE!`,
        
        example: `
EXAMPLE:
{
  "questions": [
    {
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "This is correct because..."
    }
  ]
}`
      }
    };

    const selectedPrompt = prompts[language] || prompts['uz'];
    
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: `${selectedPrompt.instruction}

📖 MATN:
${article}

${selectedPrompt.example}

⚠️ ESLATMA: Faqat JSON format! Markdown yoki boshqa formatlar kerak emas!`
        },
      ],
    });

    let rawResponse = message.content[0].text;
    console.log("🔍 Claude javobi:", rawResponse.substring(0, 200) + "...");

    rawResponse = rawResponse
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^[^{]*/, '')
      .replace(/[^}]*$/, '')
      .trim();

    let quizData;
    try {
      quizData = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error("❌ JSON parse xatosi:", parseError);
      
      return res.status(500).json({
        error: "Quiz yaratishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        success: false,
        details: parseError.message
      });
    }

    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      return res.status(500).json({
        error: "Quiz formati noto'g'ri",
        success: false,
      });
    }

    const validQuestions = quizData.questions.filter(q => 
      q.question && 
      Array.isArray(q.options) && 
      q.options.length === 4 &&
      typeof q.correctAnswer === 'number' &&
      q.correctAnswer >= 0 && 
      q.correctAnswer < 4 &&
      q.explanation
    );

    if (validQuestions.length === 0) {
      return res.status(500).json({
        error: "Hech qanday to'g'ri savol yaratilmadi",
        success: false,
      });
    }

    console.log(`✅ ${validQuestions.length} ta savol yaratildi`);

    res.json({
      success: true,
      questions: validQuestions,
      totalQuestions: validQuestions.length
    });

  } catch (error) {
    console.error("❌ Quiz API xatosi:", error);
    res.status(500).json({
      error: "Server xatosi: " + error.message,
      success: false,
    });
  }
});

// ============================================
// QUIZ STATISTICS API
// ============================================
app.post("/api/quiz-stats", async (req, res) => {
  try {
    const { score, totalQuestions, timeSpent, difficulty } = req.body;
    
    const percentage = ((score / totalQuestions) * 100).toFixed(0);
    
    let message = "";
    let emoji = "";
    
    if (percentage >= 90) {
      message = "Ajoyib! Siz a'lo natija ko'rsatdingiz! 🎉";
      emoji = "🏆";
    } else if (percentage >= 70) {
      message = "Yaxshi! Davom eting! 💪";
      emoji = "⭐";
    } else if (percentage >= 50) {
      message = "Yomon emas! Yana mashq qiling! 📚";
      emoji = "📖";
    } else {
      message = "Mashq qilishda davom eting! 🎯";
      emoji = "💡";
    }
    
    res.json({
      success: true,
      message,
      emoji,
      percentage: parseInt(percentage)
    });
    
  } catch (error) {
    console.error("❌ Quiz stats xatosi:", error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// ============================================
// TEST ENDPOINT
// ============================================
app.get("/api/test", (req, res) => {
  res.json({
    status: "OK",
    message: "Server ishlayapti ✅",
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /api/fix-homework",
      "POST /api/check-grammar",
      "POST /api/vocabulary",
      "GET  /api/motivation",
      "POST /api/generate-quiz",
      "POST /api/quiz-stats"
    ]
  });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    error: "Sahifa topilmadi",
    path: req.path,
  });
});

// ============================================
// SERVERNI ISHGA TUSHIRISH
// ============================================
app.listen(PORT, () => {
  console.log("\n🚀 ===================================");
  console.log(`   ZiyoAI Server ishga tushdi!`);
  console.log("=====================================");
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.ANTHROPIC_API_KEY ? "✅ Mavjud" : "❌ Yo'q"}`);
  console.log(`⏰ Vaqt: ${new Date().toLocaleString("uz-UZ")}`);
  console.log(`📊 Endpoints: 7 ta`);
  console.log("=====================================\n");
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on("SIGTERM", () => {
  console.log("👋 Server to'xtatilmoqda...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n👋 Server to'xtatilmoqda...");
  process.exit(0);
});