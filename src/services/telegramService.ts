/**
 * Telegram Bot Accountability Service
 *
 * Uses the Telegram Bot API to send post-wakeup success messages
 * to the user's chat (or a group) for social accountability.
 *
 * SETUP: The user must message the bot ONCE first at t.me/<bot_username>
 * so we can capture their chat_id via /start.
 *
 * The bot token is embedded here for Expo Go compatibility.
 * In production, move this to a backend or use EAS Secrets.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BOT_TOKEN = '8814364854:AAE3HpffTsEX3x6xnl74Fx0Lff6OxOxeTeA';
const CHAT_ID_KEY = '@waky_telegram_chat_id';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Streak milestone labels ───────────────────────────────────────────────
function streakEmoji(streak: number): string {
  if (streak >= 30) return '🏆';
  if (streak >= 14) return '💎';
  if (streak >= 7)  return '🔥';
  if (streak >= 3)  return '⚡';
  return '✅';
}

function buildWakeMessage(streak: number, wakeTime: string, missionsCount: number): string {
  const emoji = streakEmoji(streak);
  const lines = [
    `${emoji} *WAKY: Victor is AWAKE!*`,
    ``,
    `⏰ Wake time: \`${wakeTime}\``,
    `🛡️ Missions completed: *${missionsCount}*`,
    `🔥 Current streak: *${streak} day${streak !== 1 ? 's' : ''}*`,
    ``,
    `Sleep inertia defeated. Day ${streak} locked in. 💪`,
  ];
  return lines.join('\n');
}

/**
 * Save chat_id returned from bot /start handler.
 */
export async function saveChatId(chatId: string): Promise<void> {
  await AsyncStorage.setItem(CHAT_ID_KEY, chatId);
}

/**
 * Get the stored chat_id (undefined if not yet linked).
 */
export async function getSavedChatId(): Promise<string | null> {
  return AsyncStorage.getItem(CHAT_ID_KEY);
}

/**
 * Poll the bot's getUpdates endpoint once to discover the user's chat_id
 * from the latest /start message they sent the bot.
 */
export async function discoverChatId(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/getUpdates?limit=20&allowed_updates=["message"]`, {
      method: 'GET',
    });
    const json = await res.json() as {
      ok: boolean;
      result: Array<{ message?: { chat: { id: number }; text?: string } }>;
    };

    if (!json.ok || !json.result?.length) return null;

    // Find the most recent /start or any message
    for (let i = json.result.length - 1; i >= 0; i--) {
      const msg = json.result[i]?.message;
      if (msg?.chat?.id) {
        const id = String(msg.chat.id);
        await saveChatId(id);
        return id;
      }
    }
    return null;
  } catch (err) {
    console.warn('[Waky Telegram] discoverChatId failed:', err);
    return null;
  }
}

const PENDING_MESSAGES_KEY = '@waky_pending_messages';

/**
 * Send a raw text message to the user's Telegram chat with a 3500ms timeout
 * and automatic offline queue fallback.
 */
export async function sendMessage(text: string, chatId?: string): Promise<boolean> {
  try {
    const id = chatId ?? await getSavedChatId();
    if (!id) {
      console.warn('[Waky Telegram] No chat_id stored. User must message the bot first.');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: id,
        text,
        parse_mode: 'Markdown',
        disable_notification: false,
      }),
    });
    clearTimeout(timeoutId);

    const json = await res.json() as { ok: boolean };
    if (!json.ok) {
      console.warn('[Waky Telegram] sendMessage failed:', json);
      await queueMessage(text, id);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Waky Telegram] Network timeout/offline — queuing for later dispatch:', err);
    await queueMessage(text, chatId);
    return false;
  }
}

/**
 * Queue message to storage for later delivery when internet reconnects
 */
export async function queueMessage(text: string, chatId?: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_MESSAGES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ text, chatId, timestamp: Date.now() });
    await AsyncStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(list));
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Flush all offline queued messages upon reconnection
 */
export async function flushPendingMessages(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_MESSAGES_KEY);
    if (!raw) return 0;
    const list: Array<{ text: string; chatId?: string }> = JSON.parse(raw);
    if (!list.length) return 0;

    let sent = 0;
    const remaining: typeof list = [];
    for (const item of list) {
      const ok = await sendMessage(item.text, item.chatId);
      if (ok) {
        sent++;
      } else {
        remaining.push(item);
      }
    }
    await AsyncStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(remaining));
    return sent;
  } catch {
    return 0;
  }
}

/**
 * Send the standard wakeup accountability message.
 */
export async function sendWakeupSuccess(
  streak: number,
  wakeTime: string,
  missionsCount: number,
  chatId?: string
): Promise<boolean> {
  const msg = buildWakeMessage(streak, wakeTime, missionsCount);
  return sendMessage(msg, chatId);
}

/**
 * Send a public forfeit / partner relapse alert.
 */
export async function sendRelapseAlert(currentTime?: string, chatId?: string): Promise<boolean> {
  const timeStr = currentTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg = [
    '🚨 *WAKY RELAPSE ALERT: Victor went back to sleep!*',
    '',
    `⚠️ *TIME:* ${timeStr}`,
    'The 2-minute anti-relapse grace timer expired with missions uncompleted.',
    '',
    '💥 *CALL OR SHAKE HIM RIGHT NOW TO WAKE HIM UP!* 📢',
  ].join('\n');
  return sendMessage(msg, chatId);
}

/**
 * Get the bot's username (used to show the "Message @bot to link" instruction).
 */
export async function getBotUsername(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/getMe`);
    const json = await res.json() as { ok: boolean; result: { username: string } };
    if (json.ok) return json.result.username;
    return null;
  } catch {
    return null;
  }
}
