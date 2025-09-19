// File: /api/chat.js

// State untuk mengelola API keys (akan direset pada setiap 'cold start' serverless)
const keyState = {
  keys: [],
  lastUsedIndex: -1,
  cooldowns: new Map(),
};

// Fungsi untuk mendapatkan key berikutnya yang tersedia (Round Robin)
function getNextAvailableKey() {
  if (keyState.keys.length === 0) {
    const keysString = process.env.openrouterKeys || "";
    keyState.keys = keysString.split(',').map(k => k.trim()).filter(Boolean);
  }
  if (keyState.keys.length === 0) return null;

  const now = Date.now();
  const cooldownMs = parseInt(process.env.openrouterKeyCooldownMs, 10) || 60000;

  // Coba cari key yang tidak dalam masa cooldown
  for (let i = 0; i < keyState.keys.length; i++) {
    keyState.lastUsedIndex = (keyState.lastUsedIndex + 1) % keyState.keys.length;
    const key = keyState.keys[keyState.lastUsedIndex];
    const cooldownUntil = keyState.cooldowns.get(key) || 0;

    if (now >= cooldownUntil) {
      keyState.cooldowns.delete(key); // Hapus dari cooldown jika sudah lewat
      return key;
    }
  }

  // Jika semua key sedang cooldown, kembalikan null
  return null;
}

// Fungsi untuk menempatkan key dalam masa cooldown
function setKeyCooldown(key) {
  const cooldownMs = parseInt(process.env.openrouterKeyCooldownMs, 10) || 60000;
  keyState.cooldowns.set(key, Date.now() + cooldownMs);
  console.log(`Key starting with ${key.substring(0, 8)} is on cooldown for ${cooldownMs / 1000}s`);
}

// Fungsi untuk mencoba melakukan panggilan API dengan timeout
async function tryApiCall(model, key, chatHistory, signal) {
  const maxTokens = parseInt(process.env.aiMaxTokens, 10) || 160;
  const temperature = parseFloat(process.env.aiTemperature) || 0.65;
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    signal, // Untuk timeout
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: chatHistory,
      max_tokens: maxTokens,
      temperature: temperature,
    })
  });

  // Jika response adalah 429 (Too Many Requests), 401 (Unauthorized), atau 403 (Forbidden), anggap key bermasalah
  if ([401, 403, 429].includes(response.status)) {
    const keyError = new Error(`Key-related error for model ${model}: Status ${response.status}`);
    keyError.isKeyError = true;
    throw keyError;
  }
  
  if (!response.ok) {
    throw new Error(`API call failed for model ${model}: Status ${response.status}`);
  }

  return response.json();
}

// Handler utama
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { chatHistory } = req.body;
    if (!chatHistory) {
      return res.status(400).json({ error: 'chatHistory is required' });
    }

    const primaryModel = process.env.openrouterPrimary;
    const fallbackModels = JSON.parse(process.env.openrouterFallbacks || "[]");
    const modelsToTry = [primaryModel, ...fallbackModels].filter(Boolean);
    const timeoutMs = parseInt(process.env.openrouterTimeoutMs, 10) || 9000;
    
    let lastError = null;

    for (const model of modelsToTry) {
      const key = getNextAvailableKey();
      if (!key) {
        console.warn("All keys are on cooldown.");
        lastError = new Error("All API keys are currently on cooldown.");
        break; // Hentikan jika tidak ada key yang tersedia
      }

      console.log(`Attempting model: ${model} with key starting with ${key.substring(0,8)}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const data = await tryApiCall(model, key, chatHistory, controller.signal);
        clearTimeout(timeoutId);
        
        const aiResponse = data.choices[0].message.content;
        return res.status(200).json({ reply: aiResponse });

      } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Error with model ${model}:`, error.message);
        lastError = error;

        // Jika error terkait key (misal: rate limit), aktifkan cooldown dan lanjutkan ke model berikutnya
        if (error.isKeyError) {
          setKeyCooldown(key);
        }
        // Lanjutkan loop untuk mencoba model berikutnya
      }
    }

    // Jika semua model gagal
    console.error("All models and keys failed. Last error:", lastError.message);
    return res.status(500).json({ error: "Failed to get a response from AI after trying all options." });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}
